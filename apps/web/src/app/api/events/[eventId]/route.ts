// apps/web/src/app/api/events/[eventId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, users, financialTransactions } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';

interface RouteContext {
  params: {
    eventId: string;
  };
}

// GET: Buscar detalhes de um evento específico
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = getAuth(request);

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const eventIdNum = parseInt(params.eventId, 10);

  if (isNaN(eventIdNum)) {
    return NextResponse.json({ error: 'ID do evento inválido.' }, { status: 400 });
  }

  try {
    // Buscar o evento e o nome do organizador
    // Usando queryRaw para um join simples ou múltiplas queries se mais complexo com Drizzle
    // Ou buscar apenas o evento e popular o organizador no frontend se necessário separadamente.

    const eventDetails = await db
      .select({
        id: events.id,
        name: events.name,
        description: events.description,
        date: events.date,
        location: events.location,
        organizerId: events.organizerId, // Este é o FK para users.id
        organizerClerkId: users.clerkId, // Pegando o clerkId do organizador via join
        organizerName: users.name,       // Pegando o nome do organizador via join
        eventType: events.eventType,
        eventSize: events.eventSize,
      })
      .from(events)
      .leftJoin(users, eq(events.organizerId, users.id)) // Join com users para pegar nome/clerkId do organizador
      .where(eq(events.id, eventIdNum))
      .limit(1);

    if (!eventDetails.length) {
      return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
    }

    const event = eventDetails[0];

    // Lógica de permissão: verificar se o usuário logado pode ver este evento.
    // Exemplo: apenas o organizador. Adapte conforme necessário.
    // if (event.organizerClerkId !== clerkUserId) {
    //   return NextResponse.json({ error: 'Acesso negado a este evento.' }, { status: 403 });
    // }
    // Temporariamente, qualquer usuário logado pode ver para facilitar o desenvolvimento.

    // Os campos organizerName e organizerClerkId já vêm do select com join.
    // Não é necessário buscar o nome do organizador separadamente se o join for feito corretamente.
    // A query original tinha uma suposição sobre organizerId ser o clerk_id, o que não é o caso
    // se events.organizerId referencia users.id (serial). O join resolve isso.

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

import { z } from 'zod'; // Importar Zod

// Schema para atualização de evento (todos os campos são opcionais)
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


// TODO: Implementar DELETE /api/events/[eventId] para excluir o evento (e suas entidades relacionadas como transações, associações de fornecedores, etc.)
