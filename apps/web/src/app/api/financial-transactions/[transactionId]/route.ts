// apps/web/src/app/api/financial-transactions/[transactionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { financialTransactions, events } from '@/lib/db/schema';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

interface RouteContext {
  params: {
    transactionId: string;
  };
}

// Schema de validação para ATUALIZAR transações (campos são opcionais na atualização)
const updateTransactionSchema = z.object({
  eventId: z.number().int().positive().optional(), // EventId não deve mudar, mas incluído por completude se necessário
  contractId: z.number().int().positive().optional().nullable(),
  description: z.string().min(1, "Descrição é obrigatória").optional(),
  type: z.enum(['income', 'expense']).optional(),
  amount: z.number().int().positive("O valor deve ser um inteiro positivo (centavos)").optional(), // Em centavos
  transactionDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Data da transação inválida",
  }).optional(),
  notes: z.string().optional().nullable(),
});


// PUT: Atualizar uma transação financeira existente
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = getAuth(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const transactionId = parseInt(params.transactionId, 10);
  if (isNaN(transactionId)) {
    return NextResponse.json({ error: 'ID da transação inválido.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = updateTransactionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const dataToUpdate = validation.data;

    // Verificar se há dados para atualizar
    if (Object.keys(dataToUpdate).length === 0) {
        return NextResponse.json({ error: 'Nenhum dado fornecido para atualização.' }, { status: 400 });
    }

    // Buscar a transação original para verificar permissões e eventId
    const [originalTransaction] = await db
      .select({ createdByUserId: financialTransactions.createdByUserId, eventId: financialTransactions.eventId })
      .from(financialTransactions)
      .where(eq(financialTransactions.id, transactionId))
      .limit(1);

    if (!originalTransaction) {
      return NextResponse.json({ error: 'Transação não encontrada.' }, { status: 404 });
    }

    // Lógica de permissão: apenas quem criou pode editar, ou o organizador do evento.
    // (Esta é uma simplificação, ajuste conforme necessário)
    const [eventDetails] = await db.select({ organizerId: events.organizerId }).from(events).where(eq(events.id, originalTransaction.eventId)).limit(1);

    if (originalTransaction.createdByUserId !== clerkUserId && eventDetails?.organizerId !== clerkUserId) {
        return NextResponse.json({ error: 'Permissão negada para editar esta transação.' }, { status: 403 });
    }

    // Prepara os dados para atualização, convertendo amount e date se presentes
    const updatePayload: Partial<typeof financialTransactions.$inferInsert> = {};
    if (dataToUpdate.description) updatePayload.description = dataToUpdate.description;
    if (dataToUpdate.type) updatePayload.type = dataToUpdate.type;
    if (dataToUpdate.amount) updatePayload.amount = dataToUpdate.amount; // Já deve estar em centavos
    if (dataToUpdate.transactionDate) updatePayload.transactionDate = new Date(dataToUpdate.transactionDate);
    if (dataToUpdate.notes !== undefined) updatePayload.notes = dataToUpdate.notes; // Permite definir como null
    if (dataToUpdate.contractId !== undefined) updatePayload.contractId = dataToUpdate.contractId;

    // Não permitir alteração de eventId por esta rota para manter a integridade.
    // Se eventId precisar mudar, talvez seja melhor excluir e criar uma nova.

    updatePayload.updatedAt = new Date();

    const [updatedTransaction] = await db
      .update(financialTransactions)
      .set(updatePayload)
      .where(eq(financialTransactions.id, transactionId))
      .returning();

    return NextResponse.json({ transaction: updatedTransaction }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao atualizar transação ID ${transactionId}:`, error);
    // @ts-ignore
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro interno do servidor: ${errorMessage}` }, { status: 500 });
  }
}


// DELETE: Excluir uma transação financeira
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = getAuth(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const transactionId = parseInt(params.transactionId, 10);
  if (isNaN(transactionId)) {
    return NextResponse.json({ error: 'ID da transação inválido.' }, { status: 400 });
  }

  try {
    // Buscar a transação original para verificar permissões
    const [transactionToDelete] = await db
      .select({ createdByUserId: financialTransactions.createdByUserId, eventId: financialTransactions.eventId, description: financialTransactions.description })
      .from(financialTransactions)
      .where(eq(financialTransactions.id, transactionId))
      .limit(1);

    if (!transactionToDelete) {
      return NextResponse.json({ error: 'Transação não encontrada.' }, { status: 404 });
    }

    // Lógica de permissão (similar ao PUT)
    const [eventDetails] = await db.select({ organizerId: events.organizerId }).from(events).where(eq(events.id, transactionToDelete.eventId)).limit(1);

    if (transactionToDelete.createdByUserId !== clerkUserId && eventDetails?.organizerId !== clerkUserId) {
        return NextResponse.json({ error: 'Permissão negada para excluir esta transação.' }, { status: 403 });
    }

    await db.delete(financialTransactions).where(eq(financialTransactions.id, transactionId));

    return NextResponse.json({ message: `Transação "${transactionToDelete.description}" excluída com sucesso.` }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao excluir transação ID ${transactionId}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
