// apps/web/src/app/(app)/admin/event-sizes/page.tsx
import EventSizesClientPage from '@/components/admin/event-sizes/EventSizesClientPage';
import { Suspense } from 'react';

export const metadata = {
  title: 'Gerenciar Tamanhos de Evento',
};

export default function ManageEventSizesPage() {
  // TODO: Adicionar verificação de role/permissão de administrador aqui
  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Gerenciar Tamanhos de Evento</h1>
      </div>
      <Suspense fallback={<div className="text-center py-10">Carregando tamanhos de evento...</div>}>
        <EventSizesClientPage />
      </Suspense>
    </div>
  );
}
