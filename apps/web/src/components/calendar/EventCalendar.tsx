// apps/web/src/components/calendar/EventCalendar.tsx
'use client'; // Este será um client component para interatividade

import React, { useState, useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br'; // Importar locale pt-br
import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button'; // Assumindo que temos um componente Button
import { cn } from '@/lib/utils'; // Utilitário para classnames (comum em projetos com Tailwind)

// Configurar dayjs para usar o locale pt-br globalmente
dayjs.locale('pt-br');

interface Event {
  id: number;
  name: string;
  date: string | Date; // Pode ser string ISO ou objeto Date
  // Adicionar mais propriedades do evento conforme necessário
}

// Props para o componente EventCalendar
interface EventCalendarProps {
  // initialEvents podem ser passados se pré-carregados por um Server Component, mas vamos focar no fetch client-side por agora.
}

// Função para buscar eventos atualizada para usar a API route
async function fetchEventsForMonth(month: number, year: number): Promise<Event[]> {
  // month no dayjs é 0-indexed (0 para Janeiro, 11 para Dezembro)
  // nossa API espera month como 1-indexed (1 para Janeiro, 12 para Dezembro)
  const apiUrl = `/api/events?month=${month + 1}&year=${year}`;
  console.log(`Buscando eventos de: ${apiUrl}`);
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      const errorData = await response.text();
      console.error("Falha ao buscar eventos:", response.status, errorData);
      return [];
    }
    const data = await response.json();
    // Transforma as datas string em objetos Date ou dayjs para consistência, se necessário
    return (data.events || []).map((event: Event) => ({
      ...event,
      date: dayjs(event.date).toDate(), // Garante que a data seja um objeto Date
    }));
  } catch (error) {
    console.error("Erro de rede ou parsing ao buscar eventos:", error);
    return [];
  }
}


export default function EventCalendar({}: EventCalendarProps) { // Removido initialEvents por enquanto
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);
  const [events, setEvents] = useState<Event[]>([]); // Inicia vazio, será populado pelo fetch
  const [isLoading, setIsLoading] = useState(false);

  const firstDayOfMonth = currentDate.startOf('month');
  const lastDayOfMonth = currentDate.endOf('month');
  const daysInMonth = currentDate.daysInMonth();
  const startingDayOfWeek = firstDayOfMonth.day(); // 0 (Dom) - 6 (Sáb)

  useEffect(() => {
    const loadEvents = async () => {
      setIsLoading(true);
      const fetchedEvents = await fetchEventsForMonth(currentDate.month(), currentDate.year());
      setEvents(fetchedEvents);
      setIsLoading(false);
    };
    loadEvents();
  }, [currentDate]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach(event => {
      const eventDateStr = dayjs(event.date).format('YYYY-MM-DD');
      if (!map.has(eventDateStr)) {
        map.set(eventDateStr, []);
      }
      map.get(eventDateStr)?.push(event);
    });
    return map;
  }, [events]);


  const handlePrevMonth = () => {
    setCurrentDate(currentDate.subtract(1, 'month'));
  };

  const handleNextMonth = () => {
    setCurrentDate(currentDate.add(1, 'month'));
  };

  const handleDateClick = (day: number) => {
    const clickedDate = currentDate.date(day);
    setSelectedDate(clickedDate);
    console.log('Data selecionada:', clickedDate.format('YYYY-MM-DD'));
    // Aqui podemos adicionar lógica para mostrar detalhes do evento ou abrir um modal de criação
  };

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between py-2 px-1">
        <Button variant="outline" size="icon" onClick={handlePrevMonth}>
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold">
          {currentDate.format('MMMM YYYY')}
        </h2>
        <Button variant="outline" size="icon" onClick={handleNextMonth}>
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  const renderDaysOfWeek = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="w-full text-center font-medium text-sm text-muted-foreground">
          {dayjs().day(i).format('ddd')}
        </div>
      );
    }
    return <div className="grid grid-cols-7 gap-px border-b">{days}</div>;
  };

  const renderCells = () => {
    const monthCells = [];
    // Células vazias para o início do mês
    for (let i = 0; i < startingDayOfWeek; i++) {
      monthCells.push(<div key={`empty-${i}`} className="border-r border-b h-24 sm:h-32" />);
    }

    // Células dos dias do mês
    for (let day = 1; day <= daysInMonth; day++) {
      const date = currentDate.date(day);
      const dateStr = date.format('YYYY-MM-DD');
      const dayEvents = eventsByDate.get(dateStr) || [];
      const isToday = date.isSame(dayjs(), 'day');
      const isSelected = selectedDate?.isSame(date, 'day');

      monthCells.push(
        <div
          key={day}
          className={cn(
            "relative border-r border-b p-1.5 h-24 sm:h-32 cursor-pointer hover:bg-accent transition-colors",
            { 'bg-primary/10': isSelected },
            { 'bg-muted/50': !date.isSame(currentDate, 'month') } // Dias de outros meses (não aplicável aqui ainda)
          )}
          onClick={() => handleDateClick(day)}
        >
          <span
            className={cn(
              "absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-sm",
              { "bg-primary text-primary-foreground": isToday },
              { "font-semibold": isSelected }
            )}
          >
            {day}
          </span>
          {/* Renderizar eventos aqui */}
          <div className="mt-6 space-y-0.5 overflow-y-auto max-h-[calc(100%-2rem)]">
            {dayEvents.map(event => (
              <div
                key={event.id}
                className="bg-blue-500 text-white text-xs rounded px-1 py-0.5 truncate"
                title={event.name}
              >
                {event.name}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Preencher o restante da grade se necessário para completar 6 semanas (comum em calendários)
    const totalCells = startingDayOfWeek + daysInMonth;
    const remainingCells = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < remainingCells; i++) {
      monthCells.push(<div key={`empty-end-${i}`} className="border-r border-b h-24 sm:h-32" />);
    }

    // Remover a borda direita da última célula de cada linha e borda inferior da última linha
    // Isso pode ser feito com seletores :nth-child no CSS global ou ajustando as classes aqui.
    // Para simplificar, vamos aplicar a borda em todos e o container do grid pode ter `overflow-hidden` e `border`.

    return <div className="grid grid-cols-7 gap-px bg-border border-l border-t">{monthCells}</div>;
  };


  return (
    <div className="rounded-md border bg-card text-card-foreground shadow">
      {renderHeader()}
      {renderDaysOfWeek()}
      {isLoading ? <div className="p-4 text-center">Carregando eventos...</div> : renderCells()}
      {selectedDate && (
        <div className="p-4 border-t">
          Data Selecionada: {selectedDate.format('DD/MM/YYYY')}
          {/* Aqui mostraremos os detalhes dos eventos da data selecionada */}
          <ul>
            {(eventsByDate.get(selectedDate.format('YYYY-MM-DD')) || []).map(event => (
              <li key={event.id}>{event.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
