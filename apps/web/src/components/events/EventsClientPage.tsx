// apps/web/src/components/events/EventsClientPage.tsx
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
} from "@/components/ui/select";
import { useToast } from '@/components/ui/use-toast';
import { PlusCircleIcon, EditIcon, Trash2Icon, ChevronsLeftRightIcon, SearchIcon, ExternalLinkIcon } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { useDebounce } from '@/hooks/useDebounce';
import Link from 'next/link';

dayjs.locale('pt-br');

interface EventListItem {
  id: number;
  name: string;
  date: string; // ISO string
  location: string | null;
  eventType: string | null; // Nome do tipo de evento
  eventTypeId: number | null;
  eventSize: string | null; // Nome do tamanho do evento
  eventSizeId: number | null;
  organizerName: string | null;
  // Adicionar mais campos conforme necessário para a lista
}

interface EventType {
  id: number;
  name: string;
}

interface EventSize {
  id: number;
  name: string;
}

interface EventFormData {
  name: string;
  description?: string;
  date?: string; // Formato YYYY-MM-DDTHH:mm
  location?: string;
  eventTypeId?: number | null;
  eventSizeId?: number | null;
}

const initialEventFormData: EventFormData = {
  name: '',
  description: '',
  date: dayjs().format('YYYY-MM-DDTHH:mm'),
  location: '',
  eventTypeId: null,
  eventSizeId: null,
};

export default function EventsClientPage() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [eventSizes, setEventSizes] = useState<EventSize[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Estados para o formulário de CRUD de Evento
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventListItem | null>(null);
  const [eventFormData, setEventFormData] = useState<EventFormData>(initialEventFormData);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  // Estados para filtros e paginação
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [filterEventTypeId, setFilterEventTypeId] = useState<string>('');
  const [filterEventSizeId, setFilterEventSizeId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 10;
  const [sortBy, setSortBy] = useState('date'); // Default sort por data
  const [sortOrder, setSortOrder] = useState('desc'); // Default mais recente primeiro

  const fetchEventClassifications = async () => {
    try {
      const [typesRes, sizesRes] = await Promise.all([
        fetch('/api/event-types'),
        fetch('/api/event-sizes'),
      ]);
      if (!typesRes.ok) throw new Error('Falha ao buscar tipos de evento');
      const typesData = await typesRes.json();
      setEventTypes(typesData.eventTypes || []);

      if (!sizesRes.ok) throw new Error('Falha ao buscar tamanhos de evento');
      const sizesData = await sizesRes.json();
      setEventSizes(sizesData.eventSizes || []);

    } catch (err: any) {
      toast({ title: "Erro ao buscar classificações", description: err.message, variant: "destructive" });
    }
  };

  const fetchEventsList = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({
        view: 'list',
        page: currentPage.toString(),
        limit: limit.toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
    });
    if (debouncedSearchTerm) params.append('searchTerm', debouncedSearchTerm);
    if (filterEventTypeId) params.append('eventTypeId', filterEventTypeId);
    if (filterEventSizeId) params.append('eventSizeId', filterEventSizeId);

    try {
      const response = await fetch(`/api/events?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao buscar eventos');
      }
      const data = await response.json();
      setEvents(data.events || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
    } catch (err: any) {
      setError(err.message);
      // toast({ title: "Erro ao buscar eventos", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, filterEventTypeId, filterEventSizeId, sortBy, sortOrder, limit]);

  useEffect(() => {
    fetchEventClassifications();
  }, []);

  useEffect(() => {
    fetchEventsList();
  }, [fetchEventsList]);


  const handleEventFormInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEventFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEventFormSelectChange = (name: 'eventTypeId' | 'eventSizeId', value: string) => {
    setEventFormData(prev => ({ ...prev, [name]: value ? parseInt(value) : null }));
  };

  const handleOpenEventModal = async (event?: EventListItem) => {
    if (categories.length === 0 || eventSizes.length === 0) {
        await fetchEventClassifications(); // Garante que temos os tipos e tamanhos para o form
    }
    if (event) {
      setEditingEvent(event);
      // Para edição, buscar detalhes completos do evento se a lista não tiver todos os campos (ex: description)
      // Por ora, vamos assumir que a lista tem o suficiente ou que a API PUT não exige todos os campos.
      // Se `event.date` for uma string ISO, converter para o formato do input datetime-local.
      const formattedDate = event.date ? dayjs(event.date).format('YYYY-MM-DDTHH:mm') : dayjs().format('YYYY-MM-DDTHH:mm');
      setEventFormData({
        name: event.name,
        description: event.description || '', // Assumindo que description pode não vir na lista, mas viria do GET /api/events/[id]
        date: formattedDate,
        location: event.location || '',
        eventTypeId: event.eventTypeId,
        eventSizeId: event.eventSizeId,
      });
    } else {
      setEditingEvent(null);
      setEventFormData(initialEventFormData);
    }
    setIsEventModalOpen(true);
  };

  const handleEventSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmittingEvent(true);

    const payload = {
        ...eventFormData,
        date: eventFormData.date ? new Date(eventFormData.date).toISOString() : undefined,
        eventTypeId: eventFormData.eventTypeId ? Number(eventFormData.eventTypeId) : null,
        eventSizeId: eventFormData.eventSizeId ? Number(eventFormData.eventSizeId) : null,
    };

    const url = editingEvent ? `/api/events/${editingEvent.id}` : '/api/events';
    const method = editingEvent ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || responseData.details?.fieldErrors || `Falha ao ${editingEvent ? 'atualizar' : 'criar'} evento.`);
      }
      toast({ title: `Evento ${editingEvent ? 'Atualizado' : 'Criado'}!`, description: responseData.event.name });
      setIsEventModalOpen(false);
      fetchEventsList();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const handleEventDelete = async (eventId: number, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o evento "${name}"? Esta ação é irreversível e pode afetar dados relacionados, como transações financeiras e contratos associados (se não removidos previamente).`)) return;

    try {
      const response = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
      const responseData = await response.json(); // Tenta ler o JSON mesmo em caso de erro para pegar a mensagem
      if (!response.ok) {
        throw new Error(responseData.error || `Falha ao excluir evento: ${response.statusText}`);
      }
      toast({ title: "Evento Excluído", description: `"${name}" foi excluído com sucesso.` });
      fetchEventsList(); // Atualiza a lista de eventos
    } catch (err: any) {
      toast({ title: "Erro ao Excluir Evento", description: err.message, variant: "destructive" });
    }
  };

  const SortableHeader = ({ label, columnKey }: { label: string; columnKey: string }) => (
    <TableHead onClick={() => handleSort(columnKey)} className="cursor-pointer hover:bg-muted/50">
      {label} <ChevronsLeftRightIcon className={`inline ml-1 h-3 w-3 ${sortBy === columnKey ? 'opacity-100' : 'opacity-30'}`} />
    </TableHead>
  );


  if (isLoading && events.length === 0) return <p className="text-center py-10">Carregando eventos...</p>;
  if (error && events.length === 0) return <p className="text-center py-10 text-red-500">Erro ao carregar eventos: {error}</p>;

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex flex-grow gap-2 w-full md:w-auto">
            <Input
                type="text"
                placeholder="Buscar por nome do evento..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1);}}
                className="max-w-xs"
            />
            <Select value={filterEventTypeId} onValueChange={(value) => { setFilterEventTypeId(value === 'all' ? '' : value); setCurrentPage(1); }}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Tipo de Evento" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os Tipos</SelectItem>
                    {eventTypes.map(et => <SelectItem key={et.id} value={et.id.toString()}>{et.name}</SelectItem>)}
                </SelectContent>
            </Select>
            <Select value={filterEventSizeId} onValueChange={(value) => { setFilterEventSizeId(value === 'all' ? '' : value); setCurrentPage(1); }}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Tamanho do Evento" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os Tamanhos</SelectItem>
                    {eventSizes.map(es => <SelectItem key={es.id} value={es.id.toString()}>{es.name}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
        <Button onClick={() => handleOpenEventModal()} className="w-full md:w-auto mt-2 md:mt-0">
          <PlusCircleIcon className="mr-2 h-4 w-4" /> Novo Evento
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader label="Nome do Evento" columnKey="name" />
              <SortableHeader label="Data" columnKey="date" />
              <TableHead>Local</TableHead>
              <SortableHeader label="Tipo" columnKey="eventType" />
              <SortableHeader label="Tamanho" columnKey="eventSize" />
              <TableHead>Organizador</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && events.length === 0 && <TableRow><TableCell colSpan={7} className="text-center">Carregando...</TableCell></TableRow>}
            {!isLoading && events.length > 0 ? (
              events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium">{event.name}</TableCell>
                  <TableCell>{dayjs(event.date).format('DD/MM/YYYY HH:mm')}</TableCell>
                  <TableCell>{event.location || 'N/A'}</TableCell>
                  <TableCell>{event.eventType || 'N/A'}</TableCell>
                  <TableCell>{event.eventSize || 'N/A'}</TableCell>
                  <TableCell>{event.organizerName || 'N/A'}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Link href={`/events/${event.id}`} passHref>
                      <Button variant="outline" size="icon" title="Ver Detalhes">
                        <SearchIcon className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button variant="outline" size="icon" onClick={() => handleOpenEventModal(event)} title="Editar">
                      <EditIcon className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleEventDelete(event.id, event.name)} title="Excluir">
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              !isLoading && <TableRow><TableCell colSpan={7} className="text-center">Nenhum evento encontrado.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between space-x-2 py-4">
            <div className="text-sm text-muted-foreground">
                Total de {totalCount} evento(s). Página {currentPage} de {totalPages}.
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
      )}

      {/* Modal para Adicionar/Editar Evento */}
      <Dialog open={isEventModalOpen} onOpenChange={setIsEventModalOpen}>
        <DialogContent className="sm:max-w-lg"> {/* Aumentado para lg para mais espaço */}
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Editar Evento' : 'Criar Novo Evento'}</DialogTitle>
            <DialogDescription>
              {editingEvent ? 'Modifique os detalhes do seu evento.' : 'Preencha os detalhes para criar um novo evento.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEventSubmit} className="grid gap-4 py-4">
            <div>
              <Label htmlFor="event-name">Nome do Evento</Label>
              <Input id="event-name" name="name" value={eventFormData.name} onChange={handleEventFormInputChange} required />
            </div>
            <div>
              <Label htmlFor="event-description">Descrição</Label>
              <Textarea id="event-description" name="description" value={eventFormData.description || ''} onChange={handleEventFormInputChange} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="event-date">Data e Hora</Label>
                    <Input id="event-date" name="date" type="datetime-local" value={eventFormData.date} onChange={handleEventFormInputChange} required />
                </div>
                <div>
                    <Label htmlFor="event-location">Local</Label>
                    <Input id="event-location" name="location" value={eventFormData.location || ''} onChange={handleEventFormInputChange} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="event-typeId">Tipo de Evento</Label>
                    <Select
                        value={eventFormData.eventTypeId?.toString() || ""}
                        onValueChange={(value) => handleEventFormSelectChange('eventTypeId', value)}
                    >
                        <SelectTrigger id="event-typeId">
                            <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">Nenhum</SelectItem>
                            {eventTypes.map(type => (
                                <SelectItem key={type.id} value={type.id.toString()}>{type.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label htmlFor="event-sizeId">Tamanho Estimado</Label>
                     <Select
                        value={eventFormData.eventSizeId?.toString() || ""}
                        onValueChange={(value) => handleEventFormSelectChange('eventSizeId', value)}
                    >
                        <SelectTrigger id="event-sizeId">
                            <SelectValue placeholder="Selecione o tamanho" />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="">Nenhum</SelectItem>
                            {eventSizes.map(size => (
                                <SelectItem key={size.id} value={size.id.toString()}>{size.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <DialogFooter className="mt-4">
              <DialogClose asChild><Button type="button" variant="outline" onClick={() => setIsEventModalOpen(false)}>Cancelar</Button></DialogClose>
              <Button type="submit" disabled={isSubmittingEvent}>
                {isSubmittingEvent ? (editingEvent ? 'Salvando...' : 'Criando...') : (editingEvent ? 'Salvar Alterações' : 'Criar Evento')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Definição do hook useDebounce (pode ser movido para um arquivo separado)
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
