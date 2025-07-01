// apps/web/src/app/api/events/[eventId]/suppliers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eventSuppliers, suppliers, events } from '@/lib/db/schema';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';

interface EventSuppliersRouteContext {
  params: {
    eventId: string;
  };
}

const addEventSupplierSchema = z.object({
  supplierId: z.number().int().positive("ID do Fornecedor inválido"),
  roleInEvent: z.string().max(255).optional().nullable(),
  contractDetails: z.string().optional().nullable(),
});

// GET: Listar fornecedores de um evento específico
export async function GET(request: NextRequest, { params }: EventSuppliersRouteContext) {
  const { userId: clerkUserId } = getAuth(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const eventIdNum = parseInt(params.eventId, 10);
  if (isNaN(eventIdNum)) {
    return NextResponse.json({ error: 'ID do Evento inválido.' }, { status: 400 });
  }

  try {
    // Adicionar verificação de permissão se o usuário pode ver os fornecedores deste evento
    const [eventExists] = await db.select({id: events.id}).from(events).where(eq(events.id, eventIdNum)).limit(1);
    if (!eventExists) {
        return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
    }
    // Exemplo: if (eventExists.organizerId !== clerkUserId && !userIsAdmin) return noAccess();


    const associatedSuppliers = await db
      .select({
        eventSupplierId: eventSuppliers.id, // ID da relação event_suppliers
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

    return NextResponse.json({ suppliers: associatedSuppliers }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao buscar fornecedores para o evento ID ${eventIdNum}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}


// POST: Associar um fornecedor a um evento
export async function POST(request: NextRequest, { params }: EventSuppliersRouteContext) {
  const { userId: clerkUserId } = getAuth(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const eventIdNum = parseInt(params.eventId, 10);
  if (isNaN(eventIdNum)) {
    return NextResponse.json({ error: 'ID do Evento inválido.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = addEventSupplierSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const { supplierId, roleInEvent, contractDetails } = validation.data;

    // Verificar se o evento e o fornecedor existem
    const [eventExists] = await db.select({id: events.id, organizerId: events.organizerId}).from(events).where(eq(events.id, eventIdNum)).limit(1);
    if (!eventExists) {
      return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
    }
    // Lógica de permissão: Apenas o organizador do evento pode adicionar fornecedores
    // if (eventExists.organizerId !== clerkUserId) {
    //     return NextResponse.json({ error: 'Permissão negada para modificar este evento.' }, { status: 403 });
    // } // Reativar em produção

    const [supplierExists] = await db.select({id: suppliers.id}).from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
    if (!supplierExists) {
      return NextResponse.json({ error: 'Fornecedor não encontrado.' }, { status: 404 });
    }

    // Verificar se a associação já existe
    const [existingAssociation] = await db
      .select()
      .from(eventSuppliers)
      .where(and(eq(eventSuppliers.eventId, eventIdNum), eq(eventSuppliers.supplierId, supplierId)))
      .limit(1);

    if (existingAssociation) {
      return NextResponse.json({ error: 'Este fornecedor já está associado a este evento.' }, { status: 409 }); // Conflict
    }

    const [newEventSupplier] = await db
      .insert(eventSuppliers)
      .values({
        eventId: eventIdNum,
        supplierId,
        roleInEvent: roleInEvent || undefined,
        contractDetails: contractDetails || undefined,
        // Se precisar registrar quem fez a associação: addedByUserId: clerkUserId
      })
      .returning();

    return NextResponse.json({ eventSupplier: newEventSupplier }, { status: 201 });

  } catch (error: any) {
    console.error(`Erro ao associar fornecedor ao evento ID ${eventIdNum}:`, error);
     if (error.code === '23505') { // Código de erro do PostgreSQL para unique_violation
        return NextResponse.json({ error: 'Este fornecedor já está associado a este evento (verificação duplicada).' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// DELETE para desassociar um fornecedor seria em /api/event-suppliers/[eventSupplierId]/route.ts
// Onde [eventSupplierId] é o ID da tabela event_suppliers.
