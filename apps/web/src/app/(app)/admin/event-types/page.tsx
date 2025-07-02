// apps/web/src/app/(app)/admin/event-types/page.tsx
import EventTypesClientPage from '@/components/admin/event-types/EventTypesClientPage'; // Criaremos este
import { Suspense } from 'react';

export const metadata = {
  title: 'Gerenciar Tipos de Evento',
};

// Esta página servirá como o container principal para o gerenciamento de Tipos de Evento.
// A lógica de busca, listagem, e modais de CRUD ficará no EventTypesClientPage.
export default function ManageEventTypesPage() {
  // TODO: Adicionar verificação de role/permissão aqui para garantir que apenas admins acessem.
  // Exemplo:
  // const { has } = auth();
  // if (!has || !has({ permission: "org:settings:manage" })) { // Ou uma permissão/role customizada
  //   return <p>Acesso Negado.</p>;
  // }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Gerenciar Tipos de Evento</h1>
      </div>
      <Suspense fallback={<div className="text-center py-10">Carregando tipos de evento...</div>}>
        <EventTypesClientPage />
      </Suspense>
    </div>
  );
}
