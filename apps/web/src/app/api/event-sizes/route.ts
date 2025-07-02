// apps/web/src/app/api/event-sizes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eventSizes } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';

const eventSizeSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(50),
  description: z.string().optional().nullable(),
  minAttendees: z.number().int().positive().optional().nullable(),
  maxAttendees: z.number().int().positive().optional().nullable(),
}).refine(data => {
  if (data.minAttendees != null && data.maxAttendees != null) {
    return data.maxAttendees >= data.minAttendees;
  }
  return true;
}, {
  message: "Número máximo de participantes deve ser maior ou igual ao mínimo.",
  path: ["maxAttendees"], // Atribuir erro ao campo maxAttendees
});

// GET: Listar todos os tamanhos de evento
export async function GET(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const allEventSizes = await db
      .select()
      .from(eventSizes)
      .orderBy(asc(eventSizes.name)); // Ou ordernar por minAttendees, por exemplo
    return NextResponse.json({ eventSizes: allEventSizes }, { status: 200 });
  } catch (error) {
    console.error('Erro ao buscar tamanhos de evento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// POST: Criar um novo tamanho de evento
export async function POST(request: NextRequest) {
  const { userId } = auth();
  // Adicionar verificação de role de admin aqui, se necessário
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = eventSizeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const { name, description, minAttendees, maxAttendees } = validation.data;

    const [existingSize] = await db.select().from(eventSizes).where(eq(eventSizes.name, name)).limit(1);
    if (existingSize) {
      return NextResponse.json({ error: 'Um tamanho de evento com este nome já existe.' }, { status: 409 });
    }

    const [newEventSize] = await db
      .insert(eventSizes)
      .values({
        name,
        description: description || undefined,
        minAttendees: minAttendees || undefined,
        maxAttendees: maxAttendees || undefined,
      })
      .returning();

    return NextResponse.json({ eventSize: newEventSize }, { status: 201 });

  } catch (error: any) {
    console.error('Erro ao criar tamanho de evento:', error);
    if (error.code === '23505' || error.message?.includes('UNIQUE constraint failed')) {
        return NextResponse.json({ error: 'Um tamanho de evento com este nome já existe.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
