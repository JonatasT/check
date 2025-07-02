// apps/web/src/app/(app)/events/page.tsx
import EventsClientPage from '@/components/events/EventsClientPage';
import { Suspense } from 'react';

export const metadata = {
  title: 'Gerenciar Eventos',
};

export default function ManageEventsPage() {
  // TODO: Adicionar verificação de role/permissão aqui para garantir que apenas usuários autorizados acessem.
  // (Ex: apenas organizadores podem ver todos os seus eventos, ou admins podem ver todos os eventos do sistema)
  // A API GET /api/events?view=list já requer login, mas a página em si pode ter lógicas adicionais de UI baseadas em roles.

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Eventos</h1>
        {/* O botão "Novo Evento" será gerenciado dentro do EventsClientPage */}
      </div>
      <Suspense fallback={<div className="text-center py-10">Carregando eventos...</div>}>
        <EventsClientPage />
      </Suspense>
    </div>
  );
}
