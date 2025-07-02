// apps/web/src/app/api/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'; // Nossa instância do Drizzle
import { events } from '@/lib/db/schema'; // Schema da tabela de eventos
import { sql, and, gte, lte } from 'drizzle-orm';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc'; // Importar plugin UTC
import timezone from 'dayjs/plugin/timezone'; // Importar plugin timezone

dayjs.extend(utc);
dayjs.extend(timezone);

// Define um fuso horário padrão, ex: 'America/Sao_Paulo' ou o fuso horário do servidor/usuário
// É importante lidar com fusos horários corretamente para eventos.
// Para este exemplo, vamos assumir que as datas no banco estão em UTC ou que o fuso horário do servidor é o desejado.
// Se as datas dos eventos podem ter fusos horários específicos, isso precisaria ser armazenado no BD.
const DEFAULT_TIMEZONE = 'America/Sao_Paulo'; // Ou dayjs.tz.guess() para o fuso do sistema

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month'); // Espera-se 1-12
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
  organizerId: z.number().int().positive().optional().nullable(), // Se o organizador for um user do nosso BD
  // clerkOrganizerId: z.string().optional().nullable(), // Se o organizador for o clerkId direto
  eventType: z.string().max(100).optional().nullable(),
  eventSize: z.string().max(50).optional().nullable(),
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

    const { name, description, date, location, eventType, eventSize } = validation.data;

    // TODO: Decidir se organizerId será o ID da tabela users ou o clerkUserId.
    // Por agora, vamos assumir que o schema 'events' tem um campo organizerId que pode ser o clerkUserId.
    // Se 'events.organizerId' for uma FK para 'users.id' serial, precisaria buscar o users.id a partir do clerkUserId.
    // Para simplificar, vamos assumir que 'events.organizerId' pode armazenar o clerkUserId diretamente
    // e que o schema foi definido com 'organizerId: varchar(...)' ou similar, ou que é FK para users.clerkId.
    // A definição atual do schema é: organizerId: integer('organizer_id').references(() => users.id)
    // Isso significa que precisamos do ID numérico da tabela 'users'.
    // Por ora, vou deixar o organizerId como opcional e não o preencherei automaticamente pelo clerkUserId
    // para não complicar sem ter a UI de criação de evento que permitiria associar um organizador (user).
    // Se a intenção é que o criador seja o organizador, precisaremos buscar o users.id correspondente ao clerkUserId.

    const eventDate = new Date(date);

    const newEventData = {
      name,
      description: description || undefined,
      date: eventDate,
      location: location || undefined,
      organizerId: clerkUserId ? undefined : undefined, // Placeholder: Implementar busca de users.id a partir de clerkUserId se necessário
      eventType: eventType || undefined,
      eventSize: eventSize || undefined,
      // Se o schema events.organizerId é para o clerkUserId diretamente:
      // organizerId: clerkUserId
    };

    // @ts-ignore Drizzle pode reclamar de undefineds opcionais, mas funciona
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
