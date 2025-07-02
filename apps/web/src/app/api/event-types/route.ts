// apps/web/src/app/api/event-types/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eventTypes } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';

const eventTypeSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100),
  description: z.string().optional().nullable(),
});

// GET: Listar todos os tipos de evento
export async function GET(request: NextRequest) {
  const { userId } = auth();
  // A listagem de tipos de evento pode ser pública ou restrita.
  // Por enquanto, vamos permitir para usuários logados.
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const allEventTypes = await db
      .select()
      .from(eventTypes)
      .orderBy(asc(eventTypes.name));
    return NextResponse.json({ eventTypes: allEventTypes }, { status: 200 });
  } catch (error) {
    console.error('Erro ao buscar tipos de evento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// POST: Criar um novo tipo de evento
export async function POST(request: NextRequest) {
  const { userId, has } = auth(); // Usar `has` para verificar permissões/roles se necessário
  // Idealmente, apenas administradores podem criar tipos de evento.
  // Exemplo: if (!has || !has({permission: "org:settings:manage"})) {
  if (!userId) { // Por enquanto, apenas usuários logados
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  // Adicionar verificação de role de admin aqui se implementado no Clerk e sincronizado
  // const user = await clerkClient.users.getUser(userId);
  // if (user.publicMetadata?.role !== 'admin') {
  //   return NextResponse.json({ error: 'Apenas administradores podem criar tipos de evento.' }, { status: 403 });
  // }


  try {
    const body = await request.json();
    const validation = eventTypeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const { name, description } = validation.data;

    const [existingType] = await db.select().from(eventTypes).where(eq(eventTypes.name, name)).limit(1);
    if (existingType) {
      return NextResponse.json({ error: 'Um tipo de evento com este nome já existe.' }, { status: 409 });
    }

    const [newEventType] = await db
      .insert(eventTypes)
      .values({
        name,
        description: description || undefined,
      })
      .returning();

    return NextResponse.json({ eventType: newEventType }, { status: 201 });

  } catch (error: any) {
    console.error('Erro ao criar tipo de evento:', error);
    if (error.code === '23505' || error.message?.includes('UNIQUE constraint failed')) { // Checagem para PostgreSQL e SQLite
        return NextResponse.json({ error: 'Um tipo de evento com este nome já existe.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
