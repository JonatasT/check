// apps/web/src/app/api/events/[eventId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, users, financialTransactions, eventSuppliers, suppliers, eventTypes, eventSizes } from '@/lib/db/schema'; // Adicionado eventTypes, eventSizes
import { eq, sql, desc, and } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

interface RouteContext {
  params: {
    eventId: string;
  };
}

// GET: Buscar detalhes de um evento específico
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const eventIdNum = parseInt(params.eventId, 10);

  if (isNaN(eventIdNum)) {
    return NextResponse.json({ error: 'ID do evento inválido.' }, { status: 400 });
  }

  try {
    const eventDetailsResult = await db
      .select({
        id: events.id,
        name: events.name,
        description: events.description,
        date: events.date,
        location: events.location,
        organizerId: events.organizerId,
        organizerClerkId: users.clerkId,
        organizerName: users.name,
        eventTypeId: events.eventTypeId,
        eventTypeName: eventTypes.name,
        eventSizeId: events.eventSizeId,
        eventSizeName: eventSizes.name,
        createdAt: events.createdAt,
        updatedAt: events.updatedAt,
      })
      .from(events)
      .leftJoin(users, eq(events.organizerId, users.id))
      .leftJoin(eventTypes, eq(events.eventTypeId, eventTypes.id))
      .leftJoin(eventSizes, eq(events.eventSizeId, eventSizes.id))
      .where(eq(events.id, eventIdNum))
      .limit(1);

    if (!eventDetailsResult.length) {
      return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
    }

    const event = eventDetailsResult[0];

    // Lógica de permissão (exemplo):
    // if (event.organizerClerkId !== clerkUserId && !userIsAdmin(clerkUserId)) { // Supondo uma função userIsAdmin
    //   return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    // }

    // Buscar transações financeiras para este evento
    const relatedFinancialTransactions = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.eventId, eventIdNum))
        .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.createdAt)); // Ordenar mais recentes primeiro

    // Calcular o saldo
    let balance = 0;
    let totalIncome = 0;
    let totalExpenses = 0;

    relatedFinancialTransactions.forEach(tx => {
      if (tx.type === 'income') {
        balance += tx.amount;
        totalIncome += tx.amount;
      } else if (tx.type === 'expense') {
        balance -= tx.amount;
        totalExpenses += tx.amount;
      }
    });

    // Buscar fornecedores associados a este evento
    const associatedSuppliers = await db
      .select({
        eventSupplierId: eventSuppliers.id,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        supplierEmail: suppliers.email,
        supplierPhone: suppliers.phone,
        supplierContactPerson: suppliers.contactPerson,
        roleInEvent: eventSuppliers.roleInEvent,
        contractDetails: eventSuppliers.contractDetails,
        associatedAt: eventSuppliers.createdAt,
      })
      .from(eventSuppliers)
      .innerJoin(suppliers, eq(eventSuppliers.supplierId, suppliers.id))
      .where(eq(eventSuppliers.eventId, eventIdNum))
      .orderBy(desc(eventSuppliers.createdAt));

    return NextResponse.json({
        event: event, // event já contém organizerName e organizerClerkId do join, e os novos eventType/eventSize
        financials: {
            transactions: relatedFinancialTransactions,
            balance,
            totalIncome,
            totalExpenses
        },
        associatedSuppliers
    }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao buscar detalhes do evento ${params.eventId}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// Schema para atualização de evento (todos os campos são opcionais)
// import { z } from 'zod'; // Zod já foi importado no topo do arquivo
const updateEventSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").optional(),
  description: z.string().nullable().optional(),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Data inválida" }).optional(),
  location: z.string().nullable().optional(),
  // organizerId não deve ser alterado por esta rota geralmente, a menos que haja uma funcionalidade específica para transferir evento.
  eventType: z.string().max(100).nullable().optional(),
  eventSize: z.string().max(50).nullable().optional(),
});


// PUT: Atualizar um evento existente
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = getAuth(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const eventIdNum = parseInt(params.eventId, 10);
  if (isNaN(eventIdNum)) {
    return NextResponse.json({ error: 'ID do evento inválido.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = updateEventSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const dataToUpdate = validation.data;

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'Nenhum dado fornecido para atualização.' }, { status: 400 });
    }

    // Verificar se o evento existe e se o usuário tem permissão para atualizá-lo
    // (Ex: é o organizador do evento)
    const [eventToUpdate] = await db
      .select({ organizerId: events.organizerId, organizerClerkId: users.clerkId }) // Pegar clerkId do organizador via users.id
      .from(events)
      .leftJoin(users, eq(events.organizerId, users.id))
      .where(eq(events.id, eventIdNum))
      .limit(1);

    if (!eventToUpdate) {
      return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
    }

    // Lógica de permissão: apenas o organizador pode editar.
    // Ajuste se houver outros papéis com permissão.
    // if (eventToUpdate.organizerClerkId !== clerkUserId) {
    //   return NextResponse.json({ error: 'Permissão negada para editar este evento.' }, { status: 403 });
    // } // Reativar em produção

    // Preparar o payload para atualização
    const updatePayload: Partial<typeof events.$inferInsert> = { updatedAt: new Date() };
    if (dataToUpdate.name !== undefined) updatePayload.name = dataToUpdate.name;
    if (dataToUpdate.description !== undefined) updatePayload.description = dataToUpdate.description;
    if (dataToUpdate.date !== undefined) updatePayload.date = new Date(dataToUpdate.date);
    if (dataToUpdate.location !== undefined) updatePayload.location = dataToUpdate.location;
    if (dataToUpdate.eventType !== undefined) updatePayload.eventType = dataToUpdate.eventType;
    if (dataToUpdate.eventSize !== undefined) updatePayload.eventSize = dataToUpdate.eventSize;


    const [updatedEvent] = await db
      .update(events)
      .set(updatePayload)
      .where(eq(events.id, eventIdNum))
      .returning();

    return NextResponse.json({ event: updatedEvent }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao atualizar evento ID ${eventIdNum}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// DELETE: Excluir um evento
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const eventIdNum = parseInt(params.eventId, 10);
  if (isNaN(eventIdNum)) {
    return NextResponse.json({ error: 'ID do evento inválido.' }, { status: 400 });
  }

  try {
    // Verificar se o evento existe e se o usuário tem permissão para excluí-lo
    const [eventToDelete] = await db
      .select({ organizerId: events.organizerId, organizerClerkId: users.clerkId })
      .from(events)
      .leftJoin(users, eq(events.organizerId, users.id))
      .where(eq(events.id, eventIdNum))
      .limit(1);

    if (!eventToDelete) {
      return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
    }

    // Lógica de permissão: apenas o organizador pode excluir.
    // Ajuste se houver outros papéis com permissão (ex: admin do sistema).
    // if (eventToDelete.organizerClerkId !== clerkUserId) {
    //   return NextResponse.json({ error: 'Permissão negada para excluir este evento.' }, { status: 403 });
    // } // Reativar em produção

    // Antes de excluir o evento, considerar o que fazer com dados relacionados:
    // 1. Transações Financeiras (financial_transactions): Excluir em cascata ou impedir se existirem?
    //    Por simplicidade, vamos impedir se houver transações.
    // 2. Contratos (contracts): Se eventId não for nullable, precisaria tratar. Atualmente é nullable.
    //    Poderia desassociar (setar eventId para null) ou impedir. Vamos impedir se houver contratos ligados.
    // 3. Associações de Fornecedores (event_suppliers): Excluir em cascata.

    const [financialCheck] = await db.select({ count: sql<number>`count(*)` }).from(financialTransactions).where(eq(financialTransactions.eventId, eventIdNum));
    if (financialCheck.count > 0) {
      return NextResponse.json({ error: 'Não é possível excluir o evento pois existem transações financeiras associadas. Remova-as primeiro.' }, { status: 400 });
    }

    const [contractCheck] = await db.select({ count: sql<number>`count(*)` }).from(contracts).where(eq(contracts.eventId, eventIdNum));
    if (contractCheck.count > 0) {
        return NextResponse.json({ error: 'Não é possível excluir o evento pois existem contratos associados. Remova-os ou desassocie-os primeiro.' }, { status: 400 });
    }

    // Excluir associações de fornecedores (event_suppliers)
    await db.delete(eventSuppliers).where(eq(eventSuppliers.eventId, eventIdNum));

    // Excluir o evento
    const [deletedEvent] = await db
      .delete(events)
      .where(eq(events.id, eventIdNum))
      .returning();

    if (!deletedEvent) {
      // Isso não deveria acontecer se a busca inicial encontrou
      return NextResponse.json({ error: 'Falha ao excluir evento (não encontrado após verificação).' }, { status: 404 });
    }

    return NextResponse.json({ message: `Evento "${deletedEvent.name}" excluído com sucesso.` }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao excluir evento ID ${eventIdNum}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor ao excluir evento.' }, { status: 500 });
  }
}
