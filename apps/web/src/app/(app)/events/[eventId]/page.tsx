// apps/web/src/app/(app)/events/[eventId]/page.tsx
import { Suspense } from 'react';
import EventDetailsClientPage from '@/components/events/EventDetailsClientPage'; // Criaremos este
import {notFound} from 'next/navigation';

interface EventDetailsPageProps {
  params: {
    eventId: string;
  };
}

// Esta função pode ser usada para gerar metadados dinâmicos se necessário
// export async function generateMetadata({ params }: EventDetailsPageProps) {
//   // Fetch event data para obter o nome do evento para o título
//   // const event = await fetchEventDetails(params.eventId);
//   // if (!event) return { title: 'Evento Não Encontrado' };
//   // return { title: `Detalhes de: ${event.name}` };
//   return { title: 'Detalhes do Evento' };
// }


async function getEventData(eventId: string) {
  // Em um Server Component, podemos chamar a API interna ou diretamente a lógica do banco de dados.
  // Por simplicidade e para reutilizar a lógica da API route (incluindo cálculos financeiros),
  // vamos simular uma chamada à API route. Em produção, considere refatorar a lógica de busca
  // para uma função compartilhada se o overhead da chamada HTTP interna for uma preocupação.

  // NOTA: Chamar sua própria API route de um Server Component requer o host completo.
  // Em desenvolvimento, isso pode ser problemático sem o servidor rodando e exposto corretamente.
  // Uma abordagem mais robusta para Server Components é importar e usar a lógica de serviço/banco de dados diretamente.
  // Por ora, vamos estruturar para que o EventDetailsClientPage faça o fetch no lado do cliente.
  // Ou, passamos o ID para o client component e ele busca.

  // Para este exemplo, vamos assumir que EventDetailsClientPage fará o fetch.
  // Se quiséssemos fazer o fetch aqui (Server Component):
  // const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  // const response = await fetch(`${host}/api/events/${eventId}`, { cache: 'no-store' }); // Adicionar headers de autenticação se necessário
  // if (!response.ok) {
  //   if (response.status === 404) return null;
  //   throw new Error('Falha ao buscar dados do evento');
  // }
  // return response.json();
  return null; // Deixando o client component fazer o fetch
}


export default async function EventDetailsPage({ params }: EventDetailsPageProps) {
  const { eventId } = params;

  if (isNaN(parseInt(eventId))) {
    notFound(); // Se eventId não for um número, retorna 404
  }

  // const initialEventData = await getEventData(eventId);
  // if (!initialEventData && parseInt(eventId)) { // Verifica se é um ID válido mas não encontrou dados
  // notFound();
  // }

  return (
    <div className="container mx-auto py-10">
      <Suspense fallback={<div className="text-center py-10">Carregando detalhes do evento...</div>}>
        {/* Passamos o eventId para o Client Component que fará o fetch dos dados */}
        <EventDetailsClientPage eventId={eventId} />
      </Suspense>
    </div>
  );
}
