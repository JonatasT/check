// apps/web/src/app/api/event-sizes/[eventSizeId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eventSizes, events } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { eq, count, and, ne } from 'drizzle-orm';

interface RouteContext {
  params: {
    eventSizeId: string;
  };
}

const eventSizeUpdateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(50).optional(),
  description: z.string().optional().nullable(),
  minAttendees: z.number().int().positive().optional().nullable(),
  maxAttendees: z.number().int().positive().optional().nullable(),
}).refine(data => {
  // Validação min/max só se ambos forem fornecidos e um deles estiver sendo alterado
  // Ou se um for fornecido e o outro já existir no BD (requereria buscar o valor atual)
  // Para simplificar, se maxAttendees for fornecido, minAttendees (novo ou existente) deve ser menor ou igual.
  // E vice-versa. Esta validação é mais complexa no update parcial.
  // A validação mais simples é garantir que se ambos são fornecidos, max >= min.
  if (data.minAttendees != null && data.maxAttendees != null) {
    return data.maxAttendees >= data.minAttendees;
  }
  return true;
}, {
  message: "Número máximo de participantes deve ser maior ou igual ao mínimo.",
  path: ["maxAttendees"],
});


// GET: Buscar um tamanho de evento específico
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const id = parseInt(params.eventSizeId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID do tamanho de evento inválido.' }, { status: 400 });
  }

  try {
    const [eventSize] = await db
      .select()
      .from(eventSizes)
      .where(eq(eventSizes.id, id))
      .limit(1);

    if (!eventSize) {
      return NextResponse.json({ error: 'Tamanho de evento não encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ eventSize }, { status: 200 });
  } catch (error) {
    console.error(`Erro ao buscar tamanho de evento ID ${id}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// PUT: Atualizar um tamanho de evento
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { userId } = auth();
  // Adicionar verificação de role/permissão aqui (ex: admin)
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const id = parseInt(params.eventSizeId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID do tamanho de evento inválido.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = eventSizeUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const dataToUpdate = validation.data;

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'Nenhum dado fornecido para atualização.' }, { status: 400 });
    }

    if (dataToUpdate.name) {
      const [existingSize] = await db
        .select()
        .from(eventSizes)
        .where(and(eq(eventSizes.name, dataToUpdate.name), ne(eventSizes.id, id)))
        .limit(1);
      if (existingSize) {
        return NextResponse.json({ error: 'Já existe um tamanho de evento com este nome.' }, { status: 409 });
      }
    }

    const finalPayload: Partial<typeof eventSizes.$inferInsert> = { updatedAt: new Date() };
    if(dataToUpdate.name !== undefined) finalPayload.name = dataToUpdate.name;
    if(dataToUpdate.description !== undefined) finalPayload.description = dataToUpdate.description;
    if(dataToUpdate.minAttendees !== undefined) finalPayload.minAttendees = dataToUpdate.minAttendees;
    if(dataToUpdate.maxAttendees !== undefined) finalPayload.maxAttendees = dataToUpdate.maxAttendees;

    const [updatedEventSize] = await db
      .update(eventSizes)
      .set(finalPayload)
      .where(eq(eventSizes.id, id))
      .returning();

    if (!updatedEventSize) {
      return NextResponse.json({ error: 'Tamanho de evento não encontrado para atualização.' }, { status: 404 });
    }

    return NextResponse.json({ eventSize: updatedEventSize }, { status: 200 });

  } catch (error: any) {
    console.error(`Erro ao atualizar tamanho de evento ID ${id}:`, error);
    if (error.code === '23505' || error.message?.includes('UNIQUE constraint failed')) {
        return NextResponse.json({ error: 'Já existe um tamanho de evento com este nome.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// DELETE: Excluir um tamanho de evento
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { userId } = auth();
  // Adicionar verificação de role/permissão aqui (ex: admin)
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const id = parseInt(params.eventSizeId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID do tamanho de evento inválido.' }, { status: 400 });
  }

  try {
    // Verificar se o tamanho de evento está sendo usado por algum evento
    const [usageCheck] = await db
      .select({ count: count() })
      .from(events)
      .where(eq(events.eventSizeId, id));

    if (usageCheck.count > 0) {
      return NextResponse.json({ error: 'Este tamanho de evento não pode ser excluído pois está em uso.' }, { status: 400 });
    }

    const [deletedEventSize] = await db
      .delete(eventSizes)
      .where(eq(eventSizes.id, id))
      .returning();

    if (!deletedEventSize) {
      return NextResponse.json({ error: 'Tamanho de evento não encontrado para exclusão.' }, { status: 404 });
    }

    return NextResponse.json({ message: `Tamanho de evento "${deletedEventSize.name}" excluído com sucesso.` }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao excluir tamanho de evento ID ${id}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
