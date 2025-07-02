// apps/web/src/app/api/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, users, eventTypes, eventSizes } from '@/lib/db/schema'; // Adicionado eventTypes e eventSizes
import { sql, and, gte, lte, desc, eq, ilike, asc } from 'drizzle-orm'; // Adicionado ilike, asc
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

// Schema para filtros GET
const getEventsSchema = z.object({
  month: z.string().optional().refine(val => !val || /^\d+$/.test(val), { message: "Mês deve ser um número"}),
  year: z.string().optional().refine(val => !val || /^\d+$/.test(val), { message: "Ano deve ser um número"}),
  page: z.string().optional().refine(val => !val || /^\d+$/.test(val), { message: "Página deve ser um número"}),
  limit: z.string().optional().refine(val => !val || /^\d+$/.test(val), { message: "Limite deve ser um número"}),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  view: z.enum(['calendar', 'list']).optional().default('calendar'),
  searchTerm: z.string().optional(),
  eventTypeId: z.string().optional().refine(val => !val || /^\d+$/.test(val), {message: "ID do Tipo de Evento deve ser numérico"}), // Mudado para eventTypeId
  eventSizeId: z.string().optional().refine(val => !val || /^\d+$/.test(val), {message: "ID do Tamanho do Evento deve ser numérico"}), // Mudado para eventSizeId
});


export async function GET(request: NextRequest) {
  const { userId: clerkUserId } = auth();

  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams);
  const parseResult = getEventsSchema.safeParse(rawParams);

  if (!parseResult.success) {
    // Se a view for 'list', erros de validação são mais críticos.
    if (rawParams.view === 'list') {
        console.error("Erro de validação dos parâmetros para GET /api/events (view=list):", parseResult.error.flatten());
        return NextResponse.json({ error: 'Parâmetros de busca inválidos.', details: parseResult.error.flatten() }, { status: 400 });
    }
    // Para outras views (como calendar), podemos ser mais permissivos e tentar usar defaults.
    console.warn("Parâmetros de busca inválidos para GET /api/events:", parseResult.error.flatten());
  }

  const {
    month: monthStr,
    year: yearStr,
    view,
    page: pageStr,
    limit: limitStr,
    sortBy,
    sortOrder,
    searchTerm,
    eventTypeId: eventTypeIdFilterStr, // Renomeado para clareza
    eventSizeId: eventSizeIdFilterStr  // Renomeado para clareza
  } = parseResult.success ? parseResult.data : {
    view: searchParams.get('view') || 'calendar',
    month: searchParams.get('month'),
    year: searchParams.get('year'),
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
    sortBy: searchParams.get('sortBy'),
    sortOrder: searchParams.get('sortOrder') as 'asc' | 'desc' | undefined,
    searchTerm: searchParams.get('searchTerm'),
    eventTypeId: searchParams.get('eventTypeId'),
    eventSizeId: searchParams.get('eventSizeId'),
  };

  if (view === 'calendar') {
    if (!monthStr || !yearStr) {
      return NextResponse.json({ error: 'Parâmetros month e year são obrigatórios para a visualização de calendário' }, { status: 400 });
    }
    const monthNumber = parseInt(monthStr, 10);
    const yearNumber = parseInt(yearStr, 10);
    if (isNaN(monthNumber) || isNaN(yearNumber) || monthNumber < 1 || monthNumber > 12) {
      return NextResponse.json({ error: 'Parâmetros month e year inválidos para calendário' }, { status: 400 });
    }

    try {
      const startDate = dayjs.tz(`${yearNumber}-${monthNumber}-01`, DEFAULT_TIMEZONE).startOf('month');
      const endDate = startDate.endOf('month');

      const query = db
        .select({
            id: events.id,
            name: events.name,
            date: events.date,
            // Adicionar outros campos necessários para o calendário
        })
        .from(events)
        .where(
          and(
            gte(events.date, startDate.toDate()),
            lte(events.date, endDate.toDate())
            // Adicionar filtro por organizerId se clerkUserId estiver presente e for necessário
            // clerkUserId ? eq(events.organizerId, await getLocalUserId(clerkUserId)) : undefined
          )
        )
        .orderBy(events.date);

      const currentEvents = await query;
      return NextResponse.json({ events: currentEvents }, { status: 200 });

    } catch (error) {
      console.error('Erro ao buscar eventos para o calendário:', error);
      return NextResponse.json({ error: 'Erro interno do servidor ao buscar eventos para o calendário' }, { status: 500 });
    }
  }

  if (view === 'list') {
    if (!clerkUserId) { // Listagem de gerenciamento requer login
        return NextResponse.json({ error: 'Não autorizado para listar eventos.' }, { status: 401 });
    }

    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? parseInt(limitStr, 10) : 10;
    const sortField = sortBy || 'date';
    const sortDirection = sortOrder || 'desc';
    const offset = (page - 1) * limit;

    const conditions = [];
    // TODO: Implementar filtro por organizador (clerkUserId -> users.id) se necessário.
    // Por enquanto, lista todos os eventos para usuários logados.

    if (searchTerm) {
        conditions.push(ilike(events.name, `%${searchTerm}%`));
    }
    if (eventTypeIdFilterStr) {
        const eventTypeId = parseInt(eventTypeIdFilterStr, 10);
        if(!isNaN(eventTypeId)) conditions.push(eq(events.eventTypeId, eventTypeId));
    }
    if (eventSizeIdFilterStr) {
        const eventSizeId = parseInt(eventSizeIdFilterStr, 10);
        if(!isNaN(eventSizeId)) conditions.push(eq(events.eventSizeId, eventSizeId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    try {
      const paginatedEvents = await db
        .select({
          id: events.id,
          name: events.name,
          date: events.date,
          location: events.location,
          eventTypeName: eventTypes.name, // Nome do tipo de evento
          eventTypeId: events.eventTypeId,
          eventSizeName: eventSizes.name,   // Nome do tamanho do evento
          eventSizeId: events.eventSizeId,
          organizerName: users.name
        })
        .from(events)
        .leftJoin(users, eq(events.organizerId, users.id))
        .leftJoin(eventTypes, eq(events.eventTypeId, eventTypes.id))
        .leftJoin(eventSizes, eq(events.eventSizeId, eventSizes.id))
        .where(whereClause)
        .orderBy(
            (sortDirection === 'desc'
              ? desc(sortField === 'eventTypeName' ? eventTypes.name : sortField === 'eventSizeName' ? eventSizes.name : events[sortField as keyof typeof events.$inferSelect] || events.date)
              : asc(sortField === 'eventTypeName' ? eventTypes.name : sortField === 'eventSizeName' ? eventSizes.name : events[sortField as keyof typeof events.$inferSelect] || events.date))
        )
        .limit(limit)
        .offset(offset);

      const totalEventsResult = await db.select({count: sql<number>`count(*)`})
        .from(events)
        .leftJoin(eventTypes, eq(events.eventTypeId, eventTypes.id)) // Join para filtro
        .leftJoin(eventSizes, eq(events.eventSizeId, eventSizes.id))   // Join para filtro
        .where(whereClause);
      const totalCount = totalEventsResult[0].count;

      return NextResponse.json({
        events: paginatedEvents,
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      }, { status: 200 });

    } catch (error) {
      console.error('Erro ao buscar lista de eventos:', error);
      return NextResponse.json({ error: 'Erro interno do servidor ao buscar lista de eventos.' }, { status: 500 });
    }
  }
  return NextResponse.json({ error: 'Tipo de visualização inválida ou parâmetros ausentes.' }, { status: 400 });
}


// Schema para criação de evento
const createEventSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
