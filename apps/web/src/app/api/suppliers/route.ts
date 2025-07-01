// apps/web/src/app/api/suppliers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { suppliers, supplierCategories } from '@/lib/db/schema';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { asc, desc, eq, ilike, or, and } from 'drizzle-orm';

const supplierSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(255),
  contactPerson: z.string().max(255).optional().nullable(),
  email: z.string().email("Email inválido").optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET: Listar todos os fornecedores (com filtros e paginação)
export async function GET(request: NextRequest) {
  const { userId: clerkUserId } = getAuth(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const searchTerm = searchParams.get('search');
  const categoryIdFilter = searchParams.get('categoryId');
  const sortBy = searchParams.get('sortBy') || 'name'; // 'name', 'category', 'createdAt'
  const sortOrder = searchParams.get('sortOrder') || 'asc'; // 'asc', 'desc'

  const offset = (page - 1) * limit;

  try {
    let queryFilters = [];
    if (searchTerm) {
      queryFilters.push(
        or(
          ilike(suppliers.name, `%${searchTerm}%`),
          ilike(suppliers.contactPerson, `%${searchTerm}%`),
          ilike(suppliers.email, `%${searchTerm}%`),
          ilike(supplierCategories.name, `%${searchTerm}%`) // Busca também no nome da categoria
        )
      );
    }
    if (categoryIdFilter) {
      const catId = parseInt(categoryIdFilter, 10);
      if (!isNaN(catId)) {
        queryFilters.push(eq(suppliers.categoryId, catId));
      }
    }

    const whereClause = queryFilters.length > 0 ? and(...queryFilters) : undefined;

    const result = await db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        contactPerson: suppliers.contactPerson,
        email: suppliers.email,
        phone: suppliers.phone,
        notes: suppliers.notes,
        createdAt: suppliers.createdAt,
        categoryName: supplierCategories.name, // Nome da categoria para exibição
        categoryId: suppliers.categoryId,
      })
      .from(suppliers)
      .leftJoin(supplierCategories, eq(suppliers.categoryId, supplierCategories.id))
      .where(whereClause)
      .orderBy(
        sortOrder === 'desc'
          ? desc(sortBy === 'category' ? supplierCategories.name : suppliers[sortBy as keyof typeof suppliers.$inferSelect] || suppliers.name)
          : asc(sortBy === 'category' ? supplierCategories.name : suppliers[sortBy as keyof typeof suppliers.$inferSelect] || suppliers.name)
      )
      .limit(limit)
      .offset(offset);

    // Contar o total de registros para paginação (considerando filtros)
    const totalCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(suppliers)
        .leftJoin(supplierCategories, eq(suppliers.categoryId, supplierCategories.id)) // Precisa do join para filtro de categoria
        .where(whereClause);

    const totalCount = totalCountResult[0].count;

    return NextResponse.json({
        suppliers: result,
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
    }, { status: 200 });

  } catch (error) {
    console.error('Erro ao buscar fornecedores:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}


// POST: Criar um novo fornecedor
export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = getAuth(request);
  // Adicionar verificação de role/permissão se necessário
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = supplierSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const { name, contactPerson, email, phone, categoryId, notes } = validation.data;

    // Se email for fornecido, verificar se já existe
    if (email) {
        const [existingSupplierByEmail] = await db.select().from(suppliers).where(eq(suppliers.email, email)).limit(1);
        if (existingSupplierByEmail) {
            return NextResponse.json({ error: 'Já existe um fornecedor com este email.' }, { status: 409 });
        }
    }
    // Verificar se a categoria fornecida existe (se categoryId for fornecido)
    if (categoryId) {
        const [categoryExists] = await db.select().from(supplierCategories).where(eq(supplierCategories.id, categoryId)).limit(1);
        if (!categoryExists) {
            return NextResponse.json({ error: 'Categoria fornecida não existe.' }, { status: 400 });
        }
    }

    const [newSupplier] = await db
      .insert(suppliers)
      .values({
        name,
        contactPerson: contactPerson || undefined,
        email: email || undefined,
        phone: phone || undefined,
        categoryId: categoryId || undefined,
        notes: notes || undefined,
        // createdByUserId: clerkUserId, // Adicionar se tiver um campo para quem criou
      })
      .returning();

    return NextResponse.json({ supplier: newSupplier }, { status: 201 });

  } catch (error: any) {
    console.error('Erro ao criar fornecedor:', error);
    if (error.message?.includes('Unique constraint failed')) {
        // Drizzle pode não dar o nome do campo, mas geralmente é o email
        return NextResponse.json({ error: 'Já existe um fornecedor com este email.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
