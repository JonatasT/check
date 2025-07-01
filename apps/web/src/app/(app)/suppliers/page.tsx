// apps/web/src/app/(app)/suppliers/page.tsx
import SuppliersClientPage from '@/components/suppliers/SuppliersClientPage'; // Criaremos este
import { Suspense } from 'react';

export const metadata = {
  title: 'Fornecedores e Parceiros',
};

// Esta página servirá como o container principal para o gerenciamento de fornecedores.
// A lógica de busca, listagem, e modais de CRUD ficará no SuppliersClientPage.
export default function SuppliersPage() {
  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Fornecedores e Parceiros</h1>
        {/* O botão de "Adicionar Novo Fornecedor" provavelmente estará dentro do ClientPage */}
      </div>
      <Suspense fallback={<div className="text-center py-10">Carregando fornecedores...</div>}>
        <SuppliersClientPage />
      </Suspense>
    </div>
  );
}
