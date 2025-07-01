// apps/web/src/app/api/suppliers/[supplierId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { suppliers, supplierCategories, eventSuppliers } from '@/lib/db/schema';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { eq, count, and } from 'drizzle-orm';

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
  const { userId: clerkUserId } = getAuth(request);
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
    const body = await request.json();
    const validation = supplierUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const dataToUpdate = validation.data;

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'Nenhum dado fornecido para atualização.' }, { status: 400 });
    }

    // Se email for fornecido e estiver sendo alterado, verificar se já existe
    if (dataToUpdate.email) {
      const [existingSupplierByEmail] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.email, dataToUpdate.email), eq(suppliers.id, supplierIdNum))) // Correção: ne(suppliers.id, supplierIdNum)
        .limit(1);

      // Correção da lógica:
      // Deve buscar por email E id diferente do atual
      const [conflictingSupplier] = await db
        .select({id: suppliers.id})
        .from(suppliers)
        .where(and(eq(suppliers.email, dataToUpdate.email), eq(suppliers.id, supplierIdNum) ? undefined : eq(suppliers.id, suppliers.id) /*dummy to ensure AND*/ )) // this is wrong
        .limit(1);

      // Lógica correta para checar conflito de email:
      const [emailConflict] = await db.select({id: suppliers.id})
                                   .from(suppliers)
                                   .where(and(eq(suppliers.email, dataToUpdate.email), eq(suppliers.id, supplierIdNum) ? undefined : eq(suppliers.id, suppliers.id))) // Ainda incorreto
                                   .limit(1);

      // Lógica correta para checar conflito de e-mail:
      if (dataToUpdate.email) {
        const conflictingSuppliers = await db
            .select({ id: suppliers.id })
            .from(suppliers)
            .where(eq(suppliers.email, dataToUpdate.email));

        // Se encontrou algum fornecedor com o mesmo email, e este não é o próprio fornecedor sendo atualizado
        if (conflictingSuppliers.length > 0 && conflictingSuppliers.some(s => s.id !== supplierIdNum)) {
             return NextResponse.json({ error: 'Este email já está em uso por outro fornecedor.' }, { status: 409 });
        }
      }
    }
     // Verificar se a categoria fornecida existe (se categoryId for fornecido e diferente de null)
    if (dataToUpdate.categoryId !== undefined && dataToUpdate.categoryId !== null) { // Checa se foi passado, incluindo null para desassociar
        if (dataToUpdate.categoryId !== null) { // Apenas checa se não for para desassociar
            const [categoryExists] = await db.select().from(supplierCategories).where(eq(supplierCategories.id, dataToUpdate.categoryId)).limit(1);
            if (!categoryExists) {
                return NextResponse.json({ error: 'Categoria fornecida não existe.' }, { status: 400 });
            }
        }
    }

    // Se categoryId for explicitamente null, ele será definido como null. Se não for fornecido, não será alterado.
    const payloadForDb: any = { ...dataToUpdate, updatedAt: new Date() };
    if (dataToUpdate.categoryId === null) {
        payloadForDb.categoryId = null;
    } else if (dataToUpdate.categoryId !== undefined) {
        payloadForDb.categoryId = dataToUpdate.categoryId;
    }
    // Remover categoryId do payload se não foi intencionalmente alterado para null ou um novo valor.
    // Esta lógica está um pouco confusa, Drizzle lida com `undefined` em `set` não alterando o campo.
    // O ideal é construir o objeto `set` apenas com os campos que realmente mudaram.

    const finalPayload: Partial<typeof suppliers.$inferInsert> = { updatedAt: new Date() };
    if (dataToUpdate.name !== undefined) finalPayload.name = dataToUpdate.name;
    if (dataToUpdate.contactPerson !== undefined) finalPayload.contactPerson = dataToUpdate.contactPerson;
    if (dataToUpdate.email !== undefined) finalPayload.email = dataToUpdate.email;
    if (dataToUpdate.phone !== undefined) finalPayload.phone = dataToUpdate.phone;
    if (dataToUpdate.notes !== undefined) finalPayload.notes = dataToUpdate.notes;
    if (dataToUpdate.categoryId !== undefined) finalPayload.categoryId = dataToUpdate.categoryId; // Permite setar para null


    const [updatedSupplier] = await db
      .update(suppliers)
      .set(finalPayload)
      .where(eq(suppliers.id, supplierIdNum))
      .returning();

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
