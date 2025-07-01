// apps/web/src/app/api/event-suppliers/[eventSupplierId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eventSuppliers, events } from '@/lib/db/schema'; // Precisa de 'events' para checar o organizador
import { getAuth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';

interface EventSupplierDeleteRouteContext {
  params: {
    eventSupplierId: string; // ID da tabela de junção event_suppliers
  };
}

// DELETE: Desassociar um fornecedor de um evento (remove a entrada da tabela event_suppliers)
export async function DELETE(request: NextRequest, { params }: EventSupplierDeleteRouteContext) {
  const { userId: clerkUserId } = getAuth(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const eventSupplierIdNum = parseInt(params.eventSupplierId, 10);
  if (isNaN(eventSupplierIdNum)) {
    return NextResponse.json({ error: 'ID da associação evento-fornecedor inválido.' }, { status: 400 });
  }

  try {
    // 1. Buscar a associação para verificar permissões (ex: se o usuário é organizador do evento)
    const [association] = await db
      .select({
        eventId: eventSuppliers.eventId,
        // Se precisar do organizerId para checagem de permissão, precisaria de um JOIN com events
        // ou fazer uma segunda query. Vamos fazer um join.
        eventOrganizerId: events.organizerId
      })
      .from(eventSuppliers)
      .leftJoin(events, eq(eventSuppliers.eventId, events.id))
      .where(eq(eventSuppliers.id, eventSupplierIdNum))
      .limit(1);

    if (!association) {
      return NextResponse.json({ error: 'Associação entre evento e fornecedor não encontrada.' }, { status: 404 });
    }

    // Lógica de permissão: Apenas o organizador do evento pode desassociar fornecedores.
    // Adapte conforme necessário.
    // if (association.eventOrganizerId !== clerkUserId) {
    //   return NextResponse.json({ error: 'Permissão negada para modificar este evento.' }, { status: 403 });
    // } // Reativar em produção


    // 2. Excluir a associação
    const [deletedAssociation] = await db
      .delete(eventSuppliers)
      .where(eq(eventSuppliers.id, eventSupplierIdNum))
      .returning(); // Retorna o objeto deletado

    if (!deletedAssociation) {
      // Isso não deveria acontecer se a busca anterior encontrou, mas é uma segurança.
      return NextResponse.json({ error: 'Falha ao encontrar associação para exclusão (pós-verificação).' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Fornecedor desassociado do evento com sucesso.' }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao desassociar fornecedor (eventSupplierId: ${eventSupplierIdNum}):`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
