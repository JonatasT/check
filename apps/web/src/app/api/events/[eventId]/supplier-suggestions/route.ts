// apps/web/src/app/api/events/[eventId]/supplier-suggestions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, supplierCategories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';

interface RouteContext {
  params: {
    eventId: string;
  };
}

interface SuggestionRule {
  eventType: string | string[]; // Pode ser um tipo específico ou um array de tipos
  eventSize: string | string[]; // Pode ser um tamanho específico ou um array de tamanhos
  suggestions: Array<{
    categoryName: string; // Nome da categoria de fornecedor
    suggestedQuantity: number;
    notes?: string;
  }>;
}

// Lógica de Sugestão Hardcoded (Exemplo Inicial)
// Esta estrutura pode ser movida para uma tabela no banco de dados (`suggestion_rules`) para ser gerenciável.
const suggestionRules: SuggestionRule[] = [
  {
    eventType: ['Casamento', 'Festa de 15 Anos'],
    eventSize: ['Grande', 'Médio'],
    suggestions: [
      { categoryName: 'Buffet', suggestedQuantity: 2, notes: 'Considerar um principal e um para sobremesas/café.' },
      { categoryName: 'Decoração', suggestedQuantity: 1, notes: 'Um decorador principal geralmente cobre tudo.' },
      { categoryName: 'Som, Luz e Imagem', suggestedQuantity: 1, notes: 'DJ/Banda + Equipamento de Som + Iluminação Cênica + Telão.' },
      { categoryName: 'Fotografia', suggestedQuantity: 2, notes: 'Principal + Assistente/Segundo Fotógrafo.' },
      { categoryName: 'Cerimonial', suggestedQuantity: 1, notes: 'Equipe de cerimonialistas.' },
    ],
  },
  {
    eventType: 'Casamento',
    eventSize: 'Pequeno',
    suggestions: [
      { categoryName: 'Buffet', suggestedQuantity: 1 },
      { categoryName: 'Decoração', suggestedQuantity: 1 },
      { categoryName: 'Som, Luz e Imagem', suggestedQuantity: 1, notes: 'DJ + Equipamento Básico.' },
      { categoryName: 'Fotografia', suggestedQuantity: 1 },
      { categoryName: 'Cerimonial', suggestedQuantity: 1, notes: 'Pode ser um único cerimonialista experiente.' },
    ],
  },
  {
    eventType: 'Corporativo',
    eventSize: ['Pequeno', 'Médio'],
    suggestions: [
      { categoryName: 'Buffet', suggestedQuantity: 1, notes: 'Coffee break ou coquetel.' },
      { categoryName: 'Audiovisual', suggestedQuantity: 1, notes: 'Projetor, tela, microfones.' },
      { categoryName: 'Recepcionista', suggestedQuantity: 2, notes: 'Para credenciamento e suporte.' },
    ],
  },
   {
    eventType: 'Corporativo',
    eventSize: 'Grande',
    suggestions: [
      { categoryName: 'Buffet', suggestedQuantity: 2, notes: 'Almoço/Jantar + Coffee breaks.' },
      { categoryName: 'Audiovisual', suggestedQuantity: 1, notes: 'Estrutura completa de som, projeção e iluminação.' },
      { categoryName: 'Recepcionista', suggestedQuantity: 4, notes: 'Equipe para grande volume.' },
      { categoryName: 'Segurança', suggestedQuantity: 1, notes: 'Equipe de segurança.' },
    ],
  },
  // Adicionar mais regras conforme necessário
];

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = getAuth(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const eventIdNum = parseInt(params.eventId, 10);
  if (isNaN(eventIdNum)) {
    return NextResponse.json({ error: 'ID do evento inválido.' }, { status: 400 });
  }

  try {
    const [event] = await db
      .select({
        eventType: events.eventType,
        eventSize: events.eventSize,
      })
      .from(events)
      .where(eq(events.id, eventIdNum))
      .limit(1);

    if (!event) {
      return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
    }

    if (!event.eventType || !event.eventSize) {
      return NextResponse.json({
        message: 'Tipo ou tamanho do evento não definidos. Não é possível gerar sugestões.',
        suggestions: []
      }, { status: 200 });
    }

    let foundSuggestions: SuggestionRule['suggestions'] = [];

    for (const rule of suggestionRules) {
      const eventTypeMatch = Array.isArray(rule.eventType)
        ? rule.eventType.includes(event.eventType)
        : rule.eventType === event.eventType;

      const eventSizeMatch = Array.isArray(rule.eventSize)
        ? rule.eventSize.includes(event.eventSize)
        : rule.eventSize === event.eventSize;

      if (eventTypeMatch && eventSizeMatch) {
        foundSuggestions = rule.suggestions;
        break;
      }
    }

    // Se nenhuma regra específica for encontrada, podemos retornar uma lista vazia ou sugestões padrão.
    if (foundSuggestions.length === 0) {
        // Tenta encontrar uma regra mais genérica (ex: qualquer tamanho para o tipo de evento, ou qualquer tipo para o tamanho)
        for (const rule of suggestionRules) {
            const eventTypeMatch = Array.isArray(rule.eventType) ? rule.eventType.includes(event.eventType!) : rule.eventType === event.eventType;
            const eventSizeMatchAny = rule.eventSize === '*' || (Array.isArray(rule.eventSize) && rule.eventSize.includes('*')); // '*' como coringa
            if (eventTypeMatch && eventSizeMatchAny && foundSuggestions.length === 0) {
                foundSuggestions = rule.suggestions;
                break;
            }
        }
         if (foundSuggestions.length === 0) {
            for (const rule of suggestionRules) {
                const eventTypeMatchAny = rule.eventType === '*' || (Array.isArray(rule.eventType) && rule.eventType.includes('*'));
                const eventSizeMatch = Array.isArray(rule.eventSize) ? rule.eventSize.includes(event.eventSize!) : rule.eventSize === event.eventSize;
                 if (eventTypeMatchAny && eventSizeMatch && foundSuggestions.length === 0) {
                    foundSuggestions = rule.suggestions;
                    break;
                }
            }
        }
    }


    return NextResponse.json({ suggestions: foundSuggestions }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao buscar sugestões para o evento ID ${eventIdNum}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
