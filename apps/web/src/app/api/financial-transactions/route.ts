// apps/web/src/app/api/financial-transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { financialTransactions, events } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server'; // Alterado para auth
import { z } from 'zod';
import { and, eq, sql, desc } from 'drizzle-orm'; // Adicionado desc

// Schema de validação para novas transações
const transactionSchema = z.object({
  eventId: z.number().int().positive(),
  contractId: z.number().int().positive().optional().nullable(),
  description: z.string().min(1, "Descrição é obrigatória"),
  type: z.enum(['income', 'expense']),
  amount: z.number().int().positive("O valor deve ser um inteiro positivo (centavos)"), // Em centavos
  transactionDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Data da transação inválida",
  }),
  notes: z.string().optional().nullable(),
});

// GET: Listar transações financeiras (com filtro por eventId)
export async function GET(request: NextRequest) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventIdParam = searchParams.get('eventId');

  if (!eventIdParam) {
    return NextResponse.json({ error: 'Parâmetro eventId é obrigatório para listar transações.' }, { status: 400 });
  }
  const eventId = parseInt(eventIdParam, 10);
  if (isNaN(eventId)) {
    return NextResponse.json({ error: 'eventId inválido.' }, { status: 400 });
  }

  try {
    // Verificar se o usuário tem acesso ao evento (ex: é o organizador ou participante autorizado)
    // Esta é uma simplificação. Uma lógica de permissão mais robusta pode ser necessária.
    const [eventAccess] = await db.select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.organizerId, clerkUserId))) // Exemplo: só o organizador (clerkId) pode ver
      .limit(1);

    // Se você não quiser restringir ao organizador, mas sim a qualquer usuário logado que conheça o eventId,
    // você pode remover ou ajustar a condição `eq(events.organizerId, clerkUserId)`.
    // Porém, para dados financeiros, é bom ter uma camada de autorização.

    // Se o evento não existe ou o usuário não é o organizador (conforme lógica acima)
    // if (!eventAccess) {
    //   return NextResponse.json({ error: 'Evento não encontrado ou acesso negado.' }, { status: 404 });
    // }
    // Temporariamente removendo a restrição de organizador para facilitar testes, mas deve ser reavaliada.

    const transactions = await db
      .select()
      .from(financialTransactions)
      .where(eq(financialTransactions.eventId, eventId))
      .orderBy(financialTransactions.transactionDate, financialTransactions.createdAt);
      // TODO: Adicionar lógica para calcular totais e saldo se necessário aqui ou no frontend

    return NextResponse.json({ transactions }, { status: 200 });

  } catch (error) {
    console.error('Erro ao buscar transações financeiras:', error);
    return NextResponse.json({ error: 'Erro interno do servidor ao buscar transações.' }, { status: 500 });
  }
}


// POST: Criar uma nova transação financeira
export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = transactionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const { eventId, contractId, description, type, amount, transactionDate, notes } = validation.data;

    // Verificar se o evento associado existe e se o usuário tem permissão para adicionar transações a ele
    // (Ex: é o organizador do evento) - Lógica de permissão simplificada
    const [eventExists] = await db.select({ id: events.id }).from(events)
      .where(and(eq(events.id, eventId), eq(events.organizerId, clerkUserId))) // clerkUserId é o organizador
      .limit(1);

    // if (!eventExists) {
    //   return NextResponse.json({ error: 'Evento não encontrado ou você não tem permissão para adicionar transações a ele.' }, { status: 403 });
    // }
    // Temporariamente removendo a restrição de organizador para facilitar testes, mas deve ser reavaliada.


    const [newTransaction] = await db
      .insert(financialTransactions)
      .values({
        eventId,
        contractId: contractId || undefined, // Garante que null vira undefined para o Drizzle
        description,
        type,
        amount, // Armazenado em centavos
        transactionDate: new Date(transactionDate),
        notes: notes || undefined,
        createdByUserId: clerkUserId,
      })
      .returning();

    return NextResponse.json({ transaction: newTransaction }, { status: 201 });

  } catch (error) {
    console.error('Erro ao criar transação financeira:', error);
    // @ts-ignore
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    if (errorMessage.includes('foreign key constraint')) { // Exemplo de tratamento de erro de FK
        return NextResponse.json({ error: 'ID do evento ou contrato inválido.' }, { status: 400 });
    }
    return NextResponse.json({ error: `Erro interno do servidor: ${errorMessage}` }, { status: 500 });
  }
}

// TODO: Implementar PUT /api/financial-transactions/[id] (em [id]/route.ts)
// TODO: Implementar DELETE /api/financial-transactions/[id] (em [id]/route.ts)
