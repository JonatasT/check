// apps/web/src/app/api/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'; // Nossa instância do Drizzle
import { events, users } from '@/lib/db/schema'; // Schema da tabela de eventos e users
import { sql, and, gte, lte, desc, eq } from 'drizzle-orm';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { auth } from '@clerk/nextjs/server'; // Importar auth da v5
import { z } from 'zod';

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

// Schema para filtros GET (opcional, mas bom para validação se os filtros ficarem complexos)
const getEventsSchema = z.object({
  month: z.string().optional().refine(val => !val || /^\d+$/.test(val), { message: "Mês deve ser um número"}),
  year: z.string().optional().refine(val => !val || /^\d+$/.test(val), { message: "Ano deve ser um número"}),
  page: z.string().optional().refine(val => !val || /^\d+$/.test(val), { message: "Página deve ser um número"}),
  limit: z.string().optional().refine(val => !val || /^\d+$/.test(val), { message: "Limite deve ser um número"}),
  sortBy: z.string().optional(), // Adicionar enum se quiser restringir
  sortOrder: z.enum(['asc', 'desc']).optional(),
  // Adicionar outros filtros como eventType, eventSize, searchTerm se necessário para listagem de gerenciamento
  view: z.enum(['calendar', 'list']).optional().default('calendar'), // Para diferenciar a chamada do calendário da de uma lista
  searchTerm: z.string().optional(),
  eventType: z.string().optional(),
  eventSize: z.string().optional(),
});


export async function GET(request: NextRequest) {
  const { userId: clerkUserId } = auth(); // Usar auth() da v5
  // Não vamos impor autenticação para GET /api/events por enquanto,
  // pois o calendário pode ser público ou mostrar eventos diferentes para usuários logados/não logados.
  // A proteção de rotas específicas de gerenciamento (como a futura página /events) será feita no middleware.

  const { searchParams } = new URL(request.url);

  const parseResult = getEventsSchema.safeParse(Object.fromEntries(searchParams));

  if (!parseResult.success) {
    // Para 'calendar' view, falhas de params não essenciais podem ser ignoradas.
    // Para 'list' view, pode ser mais estrito, mas por ora, logamos e prosseguimos.
    console.warn("Parâmetros de busca inválidos para GET /api/events:", parseResult.error.flatten());
    // Retornar erro se a view for 'list' e os params essenciais de paginação estiverem errados?
    // Por ora, deixaremos a lógica de view tratar.
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
    eventType: eventTypeFilter,
    eventSize: eventSizeFilter
  } = parseResult.success ? parseResult.data : {
    view: searchParams.get('view') || 'calendar',
    month: searchParams.get('month'),
    year: searchParams.get('year'),
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
    sortBy: searchParams.get('sortBy'),
    sortOrder: searchParams.get('sortOrder') as 'asc' | 'desc' | undefined,
    searchTerm: searchParams.get('searchTerm'),
    eventType: searchParams.get('eventType'),
    eventSize: searchParams.get('eventSize'),
  };


  // Lógica específica para a visualização de CALENDÁRIO
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

      // Para o calendário, geralmente queremos todos os eventos do mês, independentemente do organizador,
      // a menos que haja uma regra de negócio para mostrar apenas eventos do usuário logado.
      // Se for esse o caso, o filtro `eq(events.organizerId, clerkUserId)` precisaria ser adicionado,
      // e a rota deveria ser protegida se `clerkUserId` for nulo.
      // Por ora, o calendário mostra todos os eventos do período.
      const currentEvents = await db
        .select() // Seleciona todas as colunas de 'events'
        .from(events)
        .where(
          and(
            gte(events.date, startDate.toDate()),
            lte(events.date, endDate.toDate())
          )
        )
        .orderBy(events.date);

      return NextResponse.json({ events: currentEvents }, { status: 200 });

    } catch (error) {
      console.error('Erro ao buscar eventos para o calendário:', error);
      return NextResponse.json({ error: 'Erro interno do servidor ao buscar eventos para o calendário' }, { status: 500 });
    }
  }

  // Lógica para visualização de LISTA (para a página /events de gerenciamento)
  if (view === 'list') {
    // Para a view de lista, a autenticação é obrigatória.
    if (!clerkUserId) {
        return NextResponse.json({ error: 'Não autorizado para listar eventos.' }, { status: 401 });
    }

    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? parseInt(limitStr, 10) : 10;
    const sortField = sortBy || 'date';
    const sortDirection = sortOrder || 'desc';
    const offset = (page - 1) * limit;

    const conditions = [];
    // Por padrão, usuários logados veem apenas seus eventos. Uma role de admin poderia ver todos.
    // Para isso, precisaríamos buscar o users.id correspondente ao clerkUserId.
    // const user = await db.query.users.findFirst({ where: eq(users.clerkId, clerkUserId) });
    // if (user) conditions.push(eq(events.organizerId, user.id));
    // else conditions.push(sql`false`); // Se não encontrar usuário, não mostrar nada (ou tratar erro)
    // Por simplicidade e consistência com POST, vamos assumir que organizerId pode ser o clerkId por enquanto
    // ou que a lógica de permissão será mais elaborada (ex: admin vê tudo).
    // Para este exemplo, vamos permitir que o usuário logado veja todos os eventos na lista.
    // Em um cenário real, filtrar por `events.organizerId` (após mapear clerkUserId para users.id) seria comum.

    if (searchTerm) {
        conditions.push(ilike(events.name, `%${searchTerm}%`));
    }
    if (eventTypeFilter) {
        conditions.push(eq(events.eventType, eventTypeFilter));
    }
    if (eventSizeFilter) {
        conditions.push(eq(events.eventSize, eventSizeFilter));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    try {
      const paginatedEvents = await db
        .select({
          id: events.id,
          name: events.name,
          date: events.date,
          location: events.location,
          eventType: events.eventType,
          eventSize: events.eventSize,
          organizerName: users.name
        })
        .from(events)
        .leftJoin(users, eq(events.organizerId, users.id)) // Assume events.organizerId é FK para users.id
        .where(whereClause)
        .orderBy(
            sortDirection === 'desc'
            ? desc(events[sortField as keyof typeof events.$inferSelect] || events.date)
            : asc(events[sortField as keyof typeof events.$inferSelect] || events.date)
        )
        .limit(limit)
        .offset(offset);

      const totalEventsResult = await db.select({count: sql<number>`count(*)`}).from(events).where(whereClause);
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

  // Se 'view' não for 'calendar' nem 'list', ou se os parâmetros não forem válidos para nenhuma view
  return NextResponse.json({ error: 'Tipo de visualização inválida ou parâmetros ausentes.' }, { status: 400 });
}


// Schema para criação de evento
const createEventSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  const year = searchParams.get('year');

  if (!month || !year) {
    return NextResponse.json({ error: 'Parâmetros month e year são obrigatórios' }, { status: 400 });
  }

  const monthNumber = parseInt(month, 10);
  const yearNumber = parseInt(year, 10);

  if (isNaN(monthNumber) || isNaN(yearNumber) || monthNumber < 1 || monthNumber > 12) {
    return NextResponse.json({ error: 'Parâmetros month e year inválidos' }, { status: 400 });
  }

  try {
    // Construir o início e o fim do mês no fuso horário especificado, depois converter para UTC se o BD estiver em UTC.
    // Ou, se o banco armazena datas como 'timestamp without time zone' e você quer interpretar isso no fuso local.
    // Drizzle e `pg` geralmente lidam bem com objetos Date do JS, que são internamente UTC.
    // Se seu campo `date` no schema é `timestamp` (que é `timestamptz` no Postgres), ele armazena em UTC.
    // Se for `timestamp without time zone`, você precisa ser cuidadoso. Assumindo `timestamptz` (timestamp com fuso).

    const startDate = dayjs.tz(`${yearNumber}-${monthNumber}-01`, DEFAULT_TIMEZONE).startOf('month');
    const endDate = startDate.endOf('month');

    // console.log(`Buscando eventos entre: ${startDate.toISOString()} e ${endDate.toISOString()}`);
    // console.log(`StartDate (local): ${startDate.format()}, EndDate (local): ${endDate.format()}`);

    const currentEvents = await db
      .select()
      .from(events)
      .where(
        and(
          gte(events.date, startDate.toDate()), // .toDate() converte para objeto Date JS (UTC)
          lte(events.date, endDate.toDate())
        )
      )
      .orderBy(events.date); // Ordenar por data

    return NextResponse.json({ events: currentEvents }, { status: 200 });

  } catch (error) {
    console.error('Erro ao buscar eventos:', error);
    // Em um erro real, você pode querer verificar o tipo do erro
    // instanceof Error ? error.message : 'Erro desconhecido'
    return NextResponse.json({ error: 'Erro interno do servidor ao buscar eventos' }, { status: 500 });
  }
}

import { getAuth } from '@clerk/nextjs/server'; // Importar getAuth
import { z } from 'zod'; // Importar Zod

// Schema para criação de evento
const createEventSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional().nullable(),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Data inválida" }),
  location: z.string().optional().nullable(),
  // organizerId não é mais enviado pelo cliente, será determinado pelo clerkUserId
  eventTypeId: z.number().int().positive().optional().nullable(),
  eventSizeId: z.number().int().positive().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = getAuth(request); // Obter o ID do usuário logado
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado. Faça login para criar eventos.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = createEventSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const { name, description, date, location, eventTypeId, eventSizeId } = validation.data;

    // Buscar ou criar o usuário na tabela 'users' local com base no clerkUserId
    let userRecord = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
    });

    if (!userRecord) {
      // Placeholder para criação de usuário - Idealmente, obter nome/email do Clerk
      console.warn(`Criando usuário placeholder para clerkId: ${clerkUserId}`);
      [userRecord] = await db.insert(users).values({
        clerkId: clerkUserId,
        email: `${clerkUserId}@placeholder.com`, // Necessário um email real
        name: 'Usuário Clerk', // Nome placeholder
      }).returning();
    }

    if (!userRecord || !userRecord.id) {
        return NextResponse.json({ error: 'Falha ao identificar ou criar organizador do evento.' }, { status: 500 });
    }

    const eventDate = new Date(date);

    const newEventData = {
      name,
      description: description || undefined,
      date: eventDate,
      location: location || undefined,
      organizerId: userRecord.id, // Usar o ID serial da tabela 'users'
      eventTypeId: eventTypeId || undefined,
      eventSizeId: eventSizeId || undefined,
    };

    const [newEvent] = await db.insert(events).values(newEventData).returning();

    return NextResponse.json({ event: newEvent }, { status: 201 });

  } catch (error) {
    console.error('Erro ao criar evento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor ao criar evento' }, { status: 500 });
  }
}

// TODO: Implementar PUT (para editar) e DELETE para eventos.
// Para PUT: /api/events/[id]
// Para DELETE: /api/events/[id]
// Isso exigiria uma estrutura de rota dinâmica [id]/route.ts ou checagem do método e ID no body/params aqui.
// Por simplicidade, mantendo GET e POST nesta rota por enquanto.
