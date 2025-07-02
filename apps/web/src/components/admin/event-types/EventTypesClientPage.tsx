// apps/web/src/components/admin/event-types/EventTypesClientPage.tsx
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
import { useToast } from '@/components/ui/use-toast';
import { PlusCircleIcon, EditIcon, Trash2Icon } from 'lucide-react';
import dayjs from 'dayjs';

interface EventType {
  id: number;
  name: string;
  description: string | null;
  createdAt: string; // ISO String
  updatedAt: string; // ISO String
}

interface EventTypeFormData {
  name: string;
  description?: string;
}

const initialFormData: EventTypeFormData = {
  name: '',
  description: '',
};

export default function EventTypesClientPage() {
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventType, setEditingEventType] = useState<EventType | null>(null);
  const [formData, setFormData] = useState<EventTypeFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchEventTypes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/event-types');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao buscar tipos de evento');
      }
      const data = await response.json();
      setEventTypes(data.eventTypes || []);
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Erro ao buscar dados", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchEventTypes();
  }, [fetchEventTypes]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleOpenModal = (eventType?: EventType) => {
    if (eventType) {
      setEditingEventType(eventType);
      setFormData({
        name: eventType.name,
        description: eventType.description || '',
      });
    } else {
      setEditingEventType(null);
      setFormData(initialFormData);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const url = editingEventType ? `/api/event-types/${editingEventType.id}` : '/api/event-types';
    const method = editingEventType ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || `Falha ao ${editingEventType ? 'atualizar' : 'criar'} tipo de evento.`);
      }
      toast({ title: `Tipo de Evento ${editingEventType ? 'Atualizado' : 'Criado'}!`, description: responseData.eventType.name });
      setIsModalOpen(false);
      fetchEventTypes();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (eventTypeId: number, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o tipo de evento "${name}"? Se estiver em uso por algum evento, não poderá ser excluído.`)) return;
    try {
      const response = await fetch(`/api/event-types/${eventTypeId}`, { method: 'DELETE' });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || "Falha ao excluir tipo de evento.");
      }
      toast({ title: "Tipo de Evento Excluído", description: `"${name}" foi excluído.` });
      fetchEventTypes();
    } catch (err: any) {
      toast({ title: "Erro ao Excluir", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <p className="text-center py-10">Carregando tipos de evento...</p>;
  if (error && eventTypes.length === 0) return <p className="text-center py-10 text-red-500">Erro ao carregar dados: {error}</p>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleOpenModal()}>
          <PlusCircleIcon className="mr-2 h-4 w-4" /> Adicionar Novo Tipo
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventTypes.length > 0 ? (
              eventTypes.map((type) => (
                <TableRow key={type.id}>
                  <TableCell className="font-medium">{type.name}</TableCell>
                  <TableCell>{type.description || 'N/A'}</TableCell>
                  <TableCell>{dayjs(type.createdAt).format('DD/MM/YYYY')}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="icon" onClick={() => handleOpenModal(type)} title="Editar">
                      <EditIcon className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(type.id, type.name)} title="Excluir">
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center">Nenhum tipo de evento encontrado.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal para Adicionar/Editar Tipo de Evento */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEventType ? 'Editar' : 'Adicionar Novo'} Tipo de Evento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleInputChange} required />
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" name="description" value={formData.description || ''} onChange={handleInputChange} />
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (editingEventType ? 'Salvando...' : 'Adicionando...') : (editingEventType ? 'Salvar Alterações' : 'Adicionar Tipo')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
