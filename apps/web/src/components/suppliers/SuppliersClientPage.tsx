// apps/web/src/components/suppliers/SuppliersClientPage.tsx
'use client';

import React, { useState, useEffect, FormEvent, ChangeEvent, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Shadcn Select
import { useToast } from '@/components/ui/use-toast';
import { PlusCircleIcon, EditIcon, Trash2Icon, SearchIcon, ChevronsLeftRightIcon } from 'lucide-react';
import dayjs from 'dayjs';
import { useDebounce } from '@/hooks/useDebounce'; // Um hook customizado para debounce (precisará ser criado)

interface Supplier {
  id: number;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string; // ISO String
  categoryId: number | null;
  categoryName: string | null; // Nome da categoria vindo do join
}

interface SupplierCategory {
  id: number;
  name: string;
}

interface SupplierFormData {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  categoryId?: number | null;
  notes?: string;
}

const initialFormData: SupplierFormData = {
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  categoryId: null,
  notes: '',
};

export default function SuppliersClientPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Estados para o formulário de CRUD
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados para filtros e paginação
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500); // Hook useDebounce a ser criado
  const [filterCategoryId, setFilterCategoryId] = useState<string>(''); // string para o Select
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 10; // Itens por página
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');


  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/supplier-categories');
      if (!response.ok) throw new Error('Falha ao buscar categorias');
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (err: any) {
      toast({ title: "Erro ao buscar categorias", description: err.message, variant: "destructive" });
    }
  };

  const fetchSuppliers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
    });
    if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);
    if (filterCategoryId) params.append('categoryId', filterCategoryId);

    try {
      const response = await fetch(`/api/suppliers?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao buscar fornecedores');
      }
      const data = await response.json();
      setSuppliers(data.suppliers || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
    } catch (err: any) {
      setError(err.message);
      // toast({ title: "Erro ao buscar fornecedores", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, filterCategoryId, sortBy, sortOrder, limit]);

  useEffect(() => {
    fetchCategories();
    fetchSuppliers();
  }, [fetchSuppliers]); // fetchSuppliers já inclui as dependências de filtro/paginaçã


  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (value: string) => { // Para o Select de categoria no formulário
    setFormData(prev => ({ ...prev, categoryId: value ? parseInt(value) : null }));
  };

  const handleFilterCategoryChange = (value: string) => {
    setFilterCategoryId(value === 'all' ? '' : value);
    setCurrentPage(1); // Reset page on filter change
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  }

  const handleOpenModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name,
        contactPerson: supplier.contactPerson || '',
        email: supplier.email || '',
        phone: supplier.phone || '',
        categoryId: supplier.categoryId,
        notes: supplier.notes || '',
      });
    } else {
      setEditingSupplier(null);
      setFormData(initialFormData);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validação simples de email (Zod já faz no backend, mas bom ter no client)
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
        toast({ title: "Email inválido", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }

    const payload = {
        ...formData,
        categoryId: formData.categoryId ? Number(formData.categoryId) : null,
    };

    const url = editingSupplier ? `/api/suppliers/${editingSupplier.id}` : '/api/suppliers';
    const method = editingSupplier ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || `Falha ao ${editingSupplier ? 'atualizar' : 'criar'} fornecedor.`);
      }
      toast({ title: `Fornecedor ${editingSupplier ? 'atualizado' : 'criado'}!`, description: responseData.supplier.name });
      setIsModalOpen(false);
      fetchSuppliers(); // Re-fetch
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (supplierId: number, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o fornecedor "${name}"?`)) return;
    try {
      const response = await fetch(`/api/suppliers/${supplierId}`, { method: 'DELETE' });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || "Falha ao excluir fornecedor.");
      }
      toast({ title: "Fornecedor Excluído", description: `"${name}" foi excluído.` });
      fetchSuppliers();
    } catch (err: any) {
      toast({ title: "Erro ao Excluir", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex-grow w-full md:w-auto">
            <Input
                type="text"
                placeholder="Buscar por nome, contato, email, categoria..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1);}}
                className="max-w-sm"
            />
        </div>
        <div className="flex-grow w-full md:w-auto md:ml-4">
            <Select value={filterCategoryId} onValueChange={handleFilterCategoryChange}>
                <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Filtrar por Categoria" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todas as Categorias</SelectItem>
                    {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <Button onClick={() => handleOpenModal()} className="w-full md:w-auto">
          <PlusCircleIcon className="mr-2 h-4 w-4" /> Adicionar Fornecedor
        </Button>
      </div>

      {isLoading && <p>Carregando...</p>}
      {error && <p className="text-red-500">Erro: {error}</p>}

      {!isLoading && !error && (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleSort('name')} className="cursor-pointer hover:bg-muted/50">
                    Nome <ChevronsLeftRightIcon className={`inline ml-1 h-3 w-3 ${sortBy === 'name' ? 'opacity-100' : 'opacity-30'}`} />
                  </TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead onClick={() => handleSort('category')} className="cursor-pointer hover:bg-muted/50">
                    Categoria <ChevronsLeftRightIcon className={`inline ml-1 h-3 w-3 ${sortBy === 'category' ? 'opacity-100' : 'opacity-30'}`} />
                  </TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length > 0 ? (
                  suppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell>{supplier.contactPerson || 'N/A'}</TableCell>
                      <TableCell>{supplier.email || 'N/A'}</TableCell>
                      <TableCell>{supplier.phone || 'N/A'}</TableCell>
                      <TableCell>{supplier.categoryName || 'Sem Categoria'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="icon" onClick={() => handleOpenModal(supplier)} title="Editar">
                          <EditIcon className="h-4 w-4" />
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => handleDelete(supplier.id, supplier.name)} title="Excluir">
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">Nenhum fornecedor encontrado.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Paginação */}
          <div className="flex items-center justify-between space-x-2 py-4">
            <div className="text-sm text-muted-foreground">
                Total de {totalCount} fornecedor(es). Página {currentPage} de {totalPages}.
            </div>
            <div className="space-x-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                >
                    Anterior
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                >
                    Próxima
                </Button>
            </div>
          </div>
        </>
      )}

      {/* Modal para Adicionar/Editar Fornecedor */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? 'Editar' : 'Adicionar Novo'} Fornecedor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div>
              <Label htmlFor="name">Nome do Fornecedor</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleInputChange} required />
            </div>
            <div>
              <Label htmlFor="contactPerson">Pessoa de Contato</Label>
              <Input id="contactPerson" name="contactPerson" value={formData.contactPerson} onChange={handleInputChange} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} />
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" name="phone" value={formData.phone} onChange={handleInputChange} />
            </div>
            <div>
              <Label htmlFor="categoryId">Categoria</Label>
              <Select
                value={formData.categoryId?.toString() || ""}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem Categoria</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" value={formData.notes} onChange={handleInputChange} />
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (editingSupplier ? 'Salvando...' : 'Adicionando...') : (editingSupplier ? 'Salvar Alterações' : 'Adicionar Fornecedor')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Hook useDebounce (precisa ser criado em separado, ex: apps/web/src/hooks/useDebounce.ts)
// export function useDebounce<T>(value: T, delay: number): T {
//   const [debouncedValue, setDebouncedValue] = useState<T>(value);
//   useEffect(() => {
//     const handler = setTimeout(() => {
//       setDebouncedValue(value);
//     }, delay);
//     return () => {
//       clearTimeout(handler);
//     };
//   }, [value, delay]);
//   return debouncedValue;
// }
