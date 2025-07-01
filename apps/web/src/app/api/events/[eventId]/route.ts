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
        organizerId: events.organizerId,
        // Para pegar o nome do organizador, precisaríamos de um join ou uma segunda query.
        // Exemplo com subquery (pode não ser o mais performático para todos os casos, mas funciona):
        // organizerName: sql<string>`(SELECT ${users.name} FROM ${users} WHERE ${users.id} = ${events.organizerId})`.as('organizer_name')
        // Ou, se organizerId no evento armazena o clerkId diretamente (e não o users.id serial):
        organizerClerkId: events.organizerId, // Supondo que events.organizerId é o clerk_id
      })
      .from(events)
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

    // Opcional: Buscar o nome do organizador se events.organizerId for o clerkId
    let organizerName: string | null = null;
    if (event.organizerClerkId) {
        const [organizerUser] = await db.select({name: users.name}).from(users).where(eq(users.clerkId, event.organizerClerkId)).limit(1);
        if (organizerUser) {
            organizerName = organizerUser.name;
        }
    }

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
        event: { ...event, organizerName },
        financials: {
            transactions: relatedFinancialTransactions,
            balance,
            totalIncome,
            totalExpenses
        },
        associatedSuppliers // Incluindo os fornecedores associados
    }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao buscar detalhes do evento ${params.eventId}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// TODO: Implementar PUT /api/events/[eventId] para atualizar o evento
// TODO: Implementar DELETE /api/events/[eventId] para excluir o evento (e suas entidades relacionadas como transações, associações de fornecedores, etc.)
