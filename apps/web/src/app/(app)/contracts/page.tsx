// apps/web/src/app/(app)/contracts/page.tsx
import ContractsClientPage from '@/components/contracts/ContractsClientPage';
import { Suspense } from 'react';

export const metadata = {
  title: 'Contratos e Documentos',
};

export default function ContractsPage() {
  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Contratos e Documentos</h1>
        {/* Botão para Adicionar Novo Contrato pode ficar aqui ou dentro do ClientPage */}
      </div>
      <Suspense fallback={<p>Carregando documentos...</p>}>
        {/* @ts-expect-error Async Server Component (se ContractsClientPage precisar de props async) */}
        <ContractsClientPage />
      </Suspense>
    </div>
  );
}
