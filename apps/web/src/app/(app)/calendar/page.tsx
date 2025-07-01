// apps/web/src/app/(app)/calendar/page.tsx
import EventCalendar from '@/components/calendar/EventCalendar'; // Criaremos este componente
import { Suspense } from 'react';

export const metadata = {
  title: 'Calendário de Eventos',
};

// Suposição: (app) é um diretório de grupo de rotas que pode ter um layout compartilhado
// ex: apps/web/src/app/(app)/layout.tsx

export default function CalendarPage() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Calendário de Eventos</h1>
      <Suspense fallback={<p>Carregando calendário...</p>}>
        {/* @ts-expect-error Async Server Component */}
        <EventCalendar />
      </Suspense>
      {/* Adicionaremos aqui a visualização de detalhes do evento e formulário de edição/criação posteriormente */}
    </div>
  );
}
