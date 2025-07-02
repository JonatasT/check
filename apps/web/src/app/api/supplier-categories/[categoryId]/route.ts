// apps/web/src/app/api/supplier-categories/[categoryId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { supplierCategories, suppliers } from '@/lib/db/schema'; // Importar suppliers para verificar FK
import { auth } from '@clerk/nextjs/server'; // Alterado para auth
import { z } from 'zod';
import { eq, count } from 'drizzle-orm';

interface RouteContext {
  params: {
    categoryId: string;
  };
}

const categoryUpdateSchema = z.object({
  name: z.string().min(1, "Nome da categoria é obrigatório").max(100).optional(),
  description: z.string().optional().nullable(),
});

// GET: Buscar uma categoria específica
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const categoryIdNum = parseInt(params.categoryId, 10);
  if (isNaN(categoryIdNum)) {
    return NextResponse.json({ error: 'ID da categoria inválido.' }, { status: 400 });
  }

  try {
    const [category] = await db
      .select()
      .from(supplierCategories)
      .where(eq(supplierCategories.id, categoryIdNum))
      .limit(1);

    if (!category) {
      return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ category }, { status: 200 });
  } catch (error) {
    console.error(`Erro ao buscar categoria ID ${categoryIdNum}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// PUT: Atualizar uma categoria de fornecedor
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()
  // Adicionar verificação de role/permissão aqui (ex: admin)
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const categoryIdNum = parseInt(params.categoryId, 10);
  if (isNaN(categoryIdNum)) {
    return NextResponse.json({ error: 'ID da categoria inválido.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = categoryUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const dataToUpdate = validation.data;

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'Nenhum dado fornecido para atualização.' }, { status: 400 });
    }

    // Se o nome está sendo atualizado, verificar se já existe outra categoria com o novo nome
    if (dataToUpdate.name) {
      const [existingCategory] = await db
        .select()
        .from(supplierCategories)
        .where(eq(supplierCategories.name, dataToUpdate.name))
        .limit(1);
      if (existingCategory && existingCategory.id !== categoryIdNum) {
        return NextResponse.json({ error: 'Já existe uma categoria com este nome.' }, { status: 409 });
      }
    }

    const [updatedCategory] = await db
      .update(supplierCategories)
      .set(dataToUpdate)
      .where(eq(supplierCategories.id, categoryIdNum))
      .returning();

    if (!updatedCategory) {
      return NextResponse.json({ error: 'Categoria não encontrada para atualização.' }, { status: 404 });
    }

    return NextResponse.json({ category: updatedCategory }, { status: 200 });

  } catch (error: any) {
    console.error(`Erro ao atualizar categoria ID ${categoryIdNum}:`, error);
     if (error.message?.includes('Unique constraint failed')) {
        return NextResponse.json({ error: 'Já existe uma categoria com este nome.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// DELETE: Excluir uma categoria de fornecedor
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()
  // Adicionar verificação de role/permissão aqui (ex: admin)
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const categoryIdNum = parseInt(params.categoryId, 10);
  if (isNaN(categoryIdNum)) {
    return NextResponse.json({ error: 'ID da categoria inválido.' }, { status: 400 });
  }

  try {
    // Verificar se a categoria está sendo usada por algum fornecedor
    const [usageCheck] = await db
      .select({ count: count() })
      .from(suppliers)
      .where(eq(suppliers.categoryId, categoryIdNum));

    if (usageCheck.count > 0) {
      return NextResponse.json({ error: 'Categoria não pode ser excluída pois está em uso por um ou mais fornecedores.' }, { status: 400 });
    }

    const [deletedCategory] = await db
      .delete(supplierCategories)
      .where(eq(supplierCategories.id, categoryIdNum))
      .returning();

    if (!deletedCategory) {
      return NextResponse.json({ error: 'Categoria não encontrada para exclusão.' }, { status: 404 });
    }

    return NextResponse.json({ message: `Categoria "${deletedCategory.name}" excluída com sucesso.` }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao excluir categoria ID ${categoryIdNum}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
