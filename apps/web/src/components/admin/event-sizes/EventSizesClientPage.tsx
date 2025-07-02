// apps/web/src/components/admin/event-sizes/EventSizesClientPage.tsx
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

interface EventSize {
  id: number;
  name: string;
  description: string | null;
  minAttendees: number | null;
  maxAttendees: number | null;
  createdAt: string; // ISO String
  updatedAt: string; // ISO String
}

interface EventSizeFormData {
  name: string;
  description?: string;
  minAttendees?: number | string; // string para input, number para envio
  maxAttendees?: number | string; // string para input, number para envio
}

const initialFormData: EventSizeFormData = {
  name: '',
  description: '',
  minAttendees: '',
  maxAttendees: '',
};

export default function EventSizesClientPage() {
  const [eventSizes, setEventSizes] = useState<EventSize[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventSize, setEditingEventSize] = useState<EventSize | null>(null);
  const [formData, setFormData] = useState<EventSizeFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchEventSizes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/event-sizes');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao buscar tamanhos de evento');
      }
      const data = await response.json();
      setEventSizes(data.eventSizes || []);
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Erro ao buscar dados", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchEventSizes();
  }, [fetchEventSizes]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
        ...prev,
        [name]: (name === 'minAttendees' || name === 'maxAttendees')
                 ? (value === '' ? '' : parseInt(value, 10)) // Permite campo vazio, converte para int
                 : value
    }));
  };

  const handleOpenModal = (eventSize?: EventSize) => {
    if (eventSize) {
      setEditingEventSize(eventSize);
      setFormData({
        name: eventSize.name,
        description: eventSize.description || '',
        minAttendees: eventSize.minAttendees === null ? '' : eventSize.minAttendees,
        maxAttendees: eventSize.maxAttendees === null ? '' : eventSize.maxAttendees,
      });
    } else {
      setEditingEventSize(null);
      setFormData(initialFormData);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload: any = {
        name: formData.name,
        description: formData.description || null,
    };
    if (formData.minAttendees !== '' && formData.minAttendees !== null && !isNaN(Number(formData.minAttendees))) {
        payload.minAttendees = Number(formData.minAttendees);
    } else if (formData.minAttendees === '') {
        payload.minAttendees = null;
    }
    if (formData.maxAttendees !== '' && formData.maxAttendees !== null && !isNaN(Number(formData.maxAttendees))) {
        payload.maxAttendees = Number(formData.maxAttendees);
    } else if (formData.maxAttendees === '') {
        payload.maxAttendees = null;
    }

    if (payload.minAttendees != null && payload.maxAttendees != null && payload.maxAttendees < payload.minAttendees) {
        toast({ title: "Erro de Validação", description: "Número máximo de participantes deve ser maior ou igual ao mínimo.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }


    const url = editingEventSize ? `/api/event-sizes/${editingEventSize.id}` : '/api/event-sizes';
    const method = editingEventSize ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || responseData.details?.fieldErrors?.maxAttendees?.[0] || `Falha ao ${editingEventSize ? 'atualizar' : 'criar'} tamanho de evento.`);
      }
      toast({ title: `Tamanho de Evento ${editingEventSize ? 'Atualizado' : 'Criado'}!`, description: responseData.eventSize.name });
      setIsModalOpen(false);
      fetchEventSizes();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (eventSizeId: number, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o tamanho de evento "${name}"? Se estiver em uso, não poderá ser excluído.`)) return;
    try {
      const response = await fetch(`/api/event-sizes/${eventSizeId}`, { method: 'DELETE' });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || "Falha ao excluir tamanho de evento.");
      }
      toast({ title: "Tamanho de Evento Excluído", description: `"${name}" foi excluído.` });
      fetchEventSizes();
    } catch (err: any) {
      toast({ title: "Erro ao Excluir", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <p className="text-center py-10">Carregando tamanhos de evento...</p>;
  if (error && eventSizes.length === 0) return <p className="text-center py-10 text-red-500">Erro ao carregar dados: {error}</p>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleOpenModal()}>
          <PlusCircleIcon className="mr-2 h-4 w-4" /> Adicionar Novo Tamanho
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Min. Participantes</TableHead>
              <TableHead>Max. Participantes</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventSizes.length > 0 ? (
              eventSizes.map((size) => (
                <TableRow key={size.id}>
                  <TableCell className="font-medium">{size.name}</TableCell>
                  <TableCell>{size.description || 'N/A'}</TableCell>
                  <TableCell>{size.minAttendees === null ? 'N/A' : size.minAttendees}</TableCell>
                  <TableCell>{size.maxAttendees === null ? 'N/A' : size.maxAttendees}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="icon" onClick={() => handleOpenModal(size)} title="Editar">
                      <EditIcon className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(size.id, size.name)} title="Excluir">
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center">Nenhum tamanho de evento encontrado.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal para Adicionar/Editar Tamanho de Evento */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEventSize ? 'Editar' : 'Adicionar Novo'} Tamanho de Evento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div>
              <Label htmlFor="name-size">Nome</Label>
              <Input id="name-size" name="name" value={formData.name} onChange={handleInputChange} required />
            </div>
            <div>
              <Label htmlFor="description-size">Descrição</Label>
              <Textarea id="description-size" name="description" value={formData.description || ''} onChange={handleInputChange} />
            </div>
            <div>
              <Label htmlFor="minAttendees-size">Mín. Participantes</Label>
              <Input id="minAttendees-size" name="minAttendees" type="number" value={formData.minAttendees === null ? '' : formData.minAttendees} onChange={handleInputChange} placeholder="Opcional" />
            </div>
            <div>
              <Label htmlFor="maxAttendees-size">Máx. Participantes</Label>
              <Input id="maxAttendees-size" name="maxAttendees" type="number" value={formData.maxAttendees === null ? '' : formData.maxAttendees} onChange={handleInputChange} placeholder="Opcional" />
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (editingEventSize ? 'Salvando...' : 'Adicionando...') : (editingEventSize ? 'Salvar Alterações' : 'Adicionar Tamanho')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
