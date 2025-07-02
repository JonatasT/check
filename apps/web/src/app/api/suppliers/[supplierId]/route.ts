// apps/web/src/app/api/suppliers/[supplierId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { suppliers, supplierCategories, eventSuppliers } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server'; // Alterado para auth
import { z } from 'zod';
import { eq, count, and, ne } from 'drizzle-orm'; // Adicionado ne

interface RouteContext {
  params: {
    supplierId: string;
  };
}

const supplierUpdateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(255).optional(),
  contactPerson: z.string().max(255).optional().nullable(),
  email: z.string().email("Email inválido").optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET: Buscar um fornecedor específico
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const supplierIdNum = parseInt(params.supplierId, 10);
  if (isNaN(supplierIdNum)) {
    return NextResponse.json({ error: 'ID do fornecedor inválido.' }, { status: 400 });
  }

  try {
    const [supplier] = await db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        contactPerson: suppliers.contactPerson,
        email: suppliers.email,
        phone: suppliers.phone,
        notes: suppliers.notes,
        createdAt: suppliers.createdAt,
        updatedAt: suppliers.updatedAt,
        categoryId: suppliers.categoryId,
        categoryName: supplierCategories.name,
      })
      .from(suppliers)
      .leftJoin(supplierCategories, eq(suppliers.categoryId, supplierCategories.id))
      .where(eq(suppliers.id, supplierIdNum))
      .limit(1);

    if (!supplier) {
      return NextResponse.json({ error: 'Fornecedor não encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ supplier }, { status: 200 });
  } catch (error) {
    console.error(`Erro ao buscar fornecedor ID ${supplierIdNum}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// PUT: Atualizar um fornecedor
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()
  // Adicionar verificação de role/permissão se necessário
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const supplierIdNum = parseInt(params.supplierId, 10);
  if (isNaN(supplierIdNum)) {
    return NextResponse.json({ error: 'ID do fornecedor inválido.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = supplierUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const dataToUpdate = validation.data;

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'Nenhum dado fornecido para atualização.' }, { status: 400 });
    }

    // Se email for fornecido e estiver sendo alterado, verificar se já existe em OUTRO fornecedor
    if (dataToUpdate.email) {
      const [existingSupplierByEmail] = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(
          eq(suppliers.email, dataToUpdate.email),
          ne(suppliers.id, supplierIdNum) // Garante que não estamos comparando o fornecedor com ele mesmo
        ))
        .limit(1);

      if (existingSupplierByEmail) {
        return NextResponse.json({ error: 'Este email já está em uso por outro fornecedor.' }, { status: 409 });
      }
    }

    // Verificar se a categoria fornecida existe (se categoryId for fornecido e não for para desassociar)
    if (dataToUpdate.categoryId !== undefined && dataToUpdate.categoryId !== null) {
        const [categoryExists] = await db
            .select({id: supplierCategories.id})
            .from(supplierCategories)
            .where(eq(supplierCategories.id, dataToUpdate.categoryId))
            .limit(1);
        if (!categoryExists) {
            return NextResponse.json({ error: 'Categoria fornecida não existe.' }, { status: 400 });
        }
    }

    // Construir o payload de atualização apenas com os campos fornecidos
    const updatePayload: Partial<typeof suppliers.$inferInsert> = { updatedAt: new Date() };
    if (dataToUpdate.name !== undefined) updatePayload.name = dataToUpdate.name;
    if (dataToUpdate.contactPerson !== undefined) updatePayload.contactPerson = dataToUpdate.contactPerson;
    // Permitir que o email seja definido como null se o schema permitir (e o Zod schema também)
    if (dataToUpdate.email !== undefined) updatePayload.email = dataToUpdate.email;
    if (dataToUpdate.phone !== undefined) updatePayload.phone = dataToUpdate.phone;
    if (dataToUpdate.notes !== undefined) updatePayload.notes = dataToUpdate.notes;
    // Se categoryId for passado como null, ele desassocia. Se for um número, associa. Se undefined, não mexe.
    if (dataToUpdate.categoryId !== undefined) updatePayload.categoryId = dataToUpdate.categoryId;


    const [updatedSupplier] = await db
      .update(suppliers)
      .set(updatePayload)
      .where(eq(suppliers.id, supplierIdNum))
      .returning();

    if (!updatedSupplier) {
      return NextResponse.json({ error: 'Fornecedor não encontrado para atualização.' }, { status: 404 });
    }

    return NextResponse.json({ supplier: updatedSupplier }, { status: 200 });

  } catch (error: any) {
    console.error(`Erro ao atualizar fornecedor ID ${supplierIdNum}:`, error);
    if (error.message?.includes('Unique constraint failed')) {
        return NextResponse.json({ error: 'Já existe um fornecedor com este email.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

// DELETE: Excluir um fornecedor
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = getAuth(request);
  // Adicionar verificação de role/permissão se necessário
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const supplierIdNum = parseInt(params.supplierId, 10);
  if (isNaN(supplierIdNum)) {
    return NextResponse.json({ error: 'ID do fornecedor inválido.' }, { status: 400 });
  }

  try {
    // Verificar se o fornecedor está associado a algum evento na tabela event_suppliers
    const [usageCheck] = await db
      .select({ count: count() })
      .from(eventSuppliers)
      .where(eq(eventSuppliers.supplierId, supplierIdNum));

    if (usageCheck.count > 0) {
      return NextResponse.json({ error: 'Fornecedor não pode ser excluído pois está associado a um ou mais eventos.' }, { status: 400 });
    }

    const [deletedSupplier] = await db
      .delete(suppliers)
      .where(eq(suppliers.id, supplierIdNum))
      .returning();

    if (!deletedSupplier) {
      return NextResponse.json({ error: 'Fornecedor não encontrado para exclusão.' }, { status: 404 });
    }

    return NextResponse.json({ message: `Fornecedor "${deletedSupplier.name}" excluído com sucesso.` }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao excluir fornecedor ID ${supplierIdNum}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
