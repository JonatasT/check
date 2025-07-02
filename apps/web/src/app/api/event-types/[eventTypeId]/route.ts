// apps/web/src/app/api/event-types/[eventTypeId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eventTypes, events } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { eq, count, and, ne } from 'drizzle-orm';

interface RouteContext {
  params: {
    eventTypeId: string;
  };
}

const eventTypeUpdateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100).optional(),
  description: z.string().optional().nullable(),
});

// GET: Buscar um tipo de evento específico
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const id = parseInt(params.eventTypeId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID do tipo de evento inválido.' }, { status: 400 });
  }

  try {
    const [eventType] = await db
      .select()
      .from(eventTypes)
      .where(eq(eventTypes.id, id))
      .limit(1);

    if (!eventType) {
      return NextResponse.json({ error: 'Tipo de evento não encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ eventType }, { status: 200 });
  } catch (error) {
    console.error(`Erro ao buscar tipo de evento ID ${id}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// PUT: Atualizar um tipo de evento
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { userId } = auth();
  // Adicionar verificação de role/permissão aqui (ex: admin)
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const id = parseInt(params.eventTypeId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID do tipo de evento inválido.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = eventTypeUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const dataToUpdate = validation.data;

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'Nenhum dado fornecido para atualização.' }, { status: 400 });
    }

    if (dataToUpdate.name) {
      const [existingType] = await db
        .select()
        .from(eventTypes)
        .where(and(eq(eventTypes.name, dataToUpdate.name), ne(eventTypes.id, id)))
        .limit(1);
      if (existingType) {
        return NextResponse.json({ error: 'Já existe um tipo de evento com este nome.' }, { status: 409 });
      }
    }

    const finalPayload: Partial<typeof eventTypes.$inferInsert> = { updatedAt: new Date() };
    if(dataToUpdate.name !== undefined) finalPayload.name = dataToUpdate.name;
    if(dataToUpdate.description !== undefined) finalPayload.description = dataToUpdate.description;


    const [updatedEventType] = await db
      .update(eventTypes)
      .set(finalPayload)
      .where(eq(eventTypes.id, id))
      .returning();

    if (!updatedEventType) {
      return NextResponse.json({ error: 'Tipo de evento não encontrado para atualização.' }, { status: 404 });
    }

    return NextResponse.json({ eventType: updatedEventType }, { status: 200 });

  } catch (error: any) {
    console.error(`Erro ao atualizar tipo de evento ID ${id}:`, error);
    if (error.code === '23505' || error.message?.includes('UNIQUE constraint failed')) {
        return NextResponse.json({ error: 'Já existe um tipo de evento com este nome.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// DELETE: Excluir um tipo de evento
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { userId } = auth();
  // Adicionar verificação de role/permissão aqui (ex: admin)
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const id = parseInt(params.eventTypeId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID do tipo de evento inválido.' }, { status: 400 });
  }

  try {
    // Verificar se o tipo de evento está sendo usado por algum evento
    const [usageCheck] = await db
      .select({ count: count() })
      .from(events)
      .where(eq(events.eventTypeId, id));

    if (usageCheck.count > 0) {
      return NextResponse.json({ error: 'Este tipo de evento não pode ser excluído pois está em uso.' }, { status: 400 });
    }

    const [deletedEventType] = await db
      .delete(eventTypes)
      .where(eq(eventTypes.id, id))
      .returning();

    if (!deletedEventType) {
      return NextResponse.json({ error: 'Tipo de evento não encontrado para exclusão.' }, { status: 404 });
    }

    return NextResponse.json({ message: `Tipo de evento "${deletedEventType.name}" excluído com sucesso.` }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao excluir tipo de evento ID ${id}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
