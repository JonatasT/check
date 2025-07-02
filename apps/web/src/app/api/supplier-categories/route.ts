// apps/web/src/app/api/supplier-categories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { supplierCategories } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server'; // Alterado para auth
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';

const categorySchema = z.object({
  name: z.string().min(1, "Nome da categoria é obrigatório").max(100),
  description: z.string().optional().nullable(),
});

// GET: Listar todas as categorias de fornecedores
export async function GET(request: NextRequest) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()
  if (!clerkUserId) { // Apenas usuários logados podem ver, ajuste se necessário
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const categories = await db
      .select()
      .from(supplierCategories)
      .orderBy(asc(supplierCategories.name));
    return NextResponse.json({ categories }, { status: 200 });
  } catch (error) {
    console.error('Erro ao buscar categorias de fornecedores:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// POST: Criar uma nova categoria de fornecedor
export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()
  // Idealmente, apenas administradores ou usuários com permissão específica podem criar categorias.
  // Adicionar verificação de role/permissão aqui. Por ora, qualquer usuário logado pode.
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = categorySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const { name, description } = validation.data;

    // Verificar se já existe uma categoria com o mesmo nome
    const [existingCategory] = await db.select().from(supplierCategories).where(eq(supplierCategories.name, name)).limit(1);
    if (existingCategory) {
        return NextResponse.json({ error: 'Já existe uma categoria com este nome.' }, { status: 409 }); // Conflict
    }

    const [newCategory] = await db
      .insert(supplierCategories)
      .values({
        name,
        description: description || undefined,
      })
      .returning();

    return NextResponse.json({ category: newCategory }, { status: 201 });

  } catch (error: any) {
    console.error('Erro ao criar categoria de fornecedor:', error);
    if (error.message?.includes('Unique constraint failed')) { // Tratamento específico para Drizzle/SQLite ou similar
        return NextResponse.json({ error: 'Já existe uma categoria com este nome.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// Nota: PUT e DELETE para categorias individuais seriam em [categoryId]/route.ts
