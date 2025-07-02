// apps/web/src/components/events/EventDetailsClientPage.tsx
'use client';

import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Adicionado Tabs
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircleIcon, EditIcon, Trash2Icon, DollarSignIcon, UsersIcon, LinkIcon } from 'lucide-react'; // Adicionado UsersIcon, LinkIcon
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br'; // Para formatação de data
dayjs.locale('pt-br');

interface EventData {
  id: number;
  name: string;
  description: string | null;
  date: string; // ISO string
  location: string | null;
  organizerName?: string | null;
  eventType?: string | null; // Adicionado
  eventSize?: string | null;   // Adicionado
}

interface FinancialTransaction {
  id: number;
  eventId: number;
  contractId: number | null;
  description: string;
  type: 'income' | 'expense';
  amount: number; // Em centavos
  transactionDate: string; // ISO string
  notes: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

interface FinancialSummary {
  transactions: FinancialTransaction[];
  balance: number; // Em centavos
  totalIncome: number; // Em centavos
  totalExpenses: number; // Em centavos
}

interface FullEventDetails {
  event: EventData;
  financials: FinancialSummary;
  associatedSuppliers: EventSupplier[]; // Adicionado
}

interface EventSupplier { // Novo tipo para fornecedores associados
  eventSupplierId: number; // ID da tabela event_suppliers
  supplierId: number;
  supplierName: string | null;
  supplierEmail: string | null;
  supplierPhone: string | null;
  supplierContactPerson: string | null;
  roleInEvent: string | null;
  contractDetails: string | null;
  associatedAt: string; // ISO String
}

interface BaseSupplierInfo { // Para popular o select/combobox
  id: number;
  name: string;
}

interface EventDetailsClientPageProps {
  eventId: string;
}

// Função para formatar valor em centavos para string BRL
const formatCurrency = (amountInCents: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amountInCents / 100);
};

export default function EventDetailsClientPage({ eventId }: EventDetailsClientPageProps) {
  const [eventDetails, setEventDetails] = useState<FullEventDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Estados para o formulário de transação
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isEditingTransaction, setIsEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [transactionDescription, setTransactionDescription] = useState('');
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('expense');
  const [transactionAmount, setTransactionAmount] = useState(''); // String para input, converteremos para centavos
  const [transactionDate, setTransactionDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [transactionNotes, setTransactionNotes] = useState('');
  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);

  // Estados para modal de adicionar fornecedor ao evento
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
  const [availableSuppliers, setAvailableSuppliers] = useState<BaseSupplierInfo[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [supplierRoleInEvent, setSupplierRoleInEvent] = useState('');
  const [supplierContractDetails, setSupplierContractDetails] = useState('');
  const [isAddingSupplierToEvent, setIsAddingSupplierToEvent] = useState(false);

  // Estado para sugestões de fornecedores
  const [supplierSuggestions, setSupplierSuggestions] = useState<SupplierSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);


  const fetchEventDetails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 404) {
          setError('Evento não encontrado.');
        } else {
          throw new Error(errorData.error || `Falha ao buscar detalhes do evento: ${response.statusText}`);
        }
        return;
      }
      const data: FullEventDetails = await response.json();
      setEventDetails(data);
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Erro ao buscar dados", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchEventDetails();
      // A busca de sugestões agora é disparada pelo useEffect abaixo, quando eventDetails é populado/atualizado.
    }
  }, [eventId, fetchEventDetails]);

  // useEffect para buscar sugestões quando eventType ou eventSize do evento carregado mudarem
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (eventDetails?.event?.eventType && eventDetails?.event?.eventSize) {
        setIsLoadingSuggestions(true);
        try {
          const response = await fetch(`/api/events/${eventId}/supplier-suggestions`);
          if (!response.ok) {
            // Não tratar como erro fatal se não houver sugestões ou falhar a busca
            console.warn('Falha ao buscar sugestões de fornecedores:', response.statusText);
            setSupplierSuggestions([]); // Limpa sugestões em caso de falha na API
            return;
          }
          const data = await response.json();
          setSupplierSuggestions(data.suggestions || []);
        } catch (err) {
          console.warn('Erro de rede ou parsing ao buscar sugestões de fornecedores:', err);
          setSupplierSuggestions([]); // Limpa sugestões em caso de erro de fetch
        } finally {
          setIsLoadingSuggestions(false);
        }
      } else {
        // Se eventType ou eventSize não estiverem definidos no evento carregado, limpa as sugestões.
        setSupplierSuggestions([]);
      }
    };

    if (eventDetails && eventDetails.event) { // Só busca sugestões se os detalhes do evento já foram carregados
        fetchSuggestions();
    }
  }, [eventId, eventDetails]); // Depende de eventDetails para ter eventType e eventSize


  const fetchAvailableSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers?limit=1000');
      if (!response.ok) throw new Error('Falha ao buscar fornecedores disponíveis');
      const data = await response.json();
      setAvailableSuppliers(data.suppliers.map((s: any) => ({ id: s.id, name: s.name })) || []);
    } catch (err: any) {
      toast({ title: "Erro ao buscar fornecedores", description: err.message, variant: "destructive" });
      setAvailableSuppliers([]);
    }
  };

  const handleOpenTransactionModal = (transaction?: FinancialTransaction) => {
    if (transaction) {
      setIsEditingTransaction(transaction);
      setTransactionDescription(transaction.description);
      setTransactionType(transaction.type);
      setTransactionAmount((transaction.amount / 100).toFixed(2)); // Convert centavos para string R$ 0,00
      setTransactionDate(dayjs(transaction.transactionDate).format('YYYY-MM-DD'));
      setTransactionNotes(transaction.notes || '');
    } else {
      setIsEditingTransaction(null);
      setTransactionDescription('');
      setTransactionType('expense');
      setTransactionAmount('');
      setTransactionDate(dayjs().format('YYYY-MM-DD'));
      setTransactionNotes('');
    }
    setIsTransactionModalOpen(true);
  };

  const handleTransactionSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmittingTransaction(true);

    const amountInCents = Math.round(parseFloat(transactionAmount.replace(',', '.')) * 100);
    if (isNaN(amountInCents) || amountInCents <= 0) {
        toast({ title: "Valor inválido", description: "Por favor, insira um valor positivo.", variant: "destructive"});
        setIsSubmittingTransaction(false);
        return;
    }

    const payload = {
      eventId: parseInt(eventId),
      description: transactionDescription,
      type: transactionType,
      amount: amountInCents,
      transactionDate: transactionDate,
      notes: transactionNotes,
    };

    const url = isEditingTransaction
        ? `/api/financial-transactions/${isEditingTransaction.id}`
        : '/api/financial-transactions';
    const method = isEditingTransaction ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.error || `Falha ao ${isEditingTransaction ? 'atualizar' : 'criar'} transação.`);
        }
        toast({ title: `Transação ${isEditingTransaction ? 'atualizada' : 'criada'}!`, description: responseData.transaction.description });
        setIsTransactionModalOpen(false);
        fetchEventDetails(); // Re-fetch para atualizar lista e sumário
    } catch (err: any) {
        toast({ title: "Erro na Transação", description: err.message, variant: "destructive" });
    } finally {
        setIsSubmittingTransaction(false);
    }
  };

  const handleDeleteTransaction = async (transactionId: number, description: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir a transação "${description}"?`)) return;

    try {
        const response = await fetch(`/api/financial-transactions/${transactionId}`, { method: 'DELETE' });
        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.error || "Falha ao excluir transação.");
        }
        toast({ title: "Transação Excluída", description: `"${description}" foi excluída.` });
        fetchEventDetails();
    } catch (err: any) {
        toast({ title: "Erro ao Excluir", description: err.message, variant: "destructive" });
    }
  };

  const handleOpenAddSupplierModal = () => {
    setSelectedSupplierId('');
    setSupplierRoleInEvent('');
    setSupplierContractDetails('');
    fetchAvailableSuppliers(); // Carrega os fornecedores para o select
    setIsAddSupplierModalOpen(true);
  };

  const handleAddSupplierToEventSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedSupplierId) {
        toast({title: "Seleção Necessária", description: "Por favor, selecione um fornecedor.", variant: "destructive"});
        return;
    }
    setIsAddingSupplierToEvent(true);
    try {
        const response = await fetch(`/api/events/${eventId}/suppliers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json'},
            body: JSON.stringify({
                supplierId: parseInt(selectedSupplierId),
                roleInEvent: supplierRoleInEvent,
                contractDetails: supplierContractDetails,
            }),
        });
        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.error || "Falha ao associar fornecedor ao evento.");
        }
        toast({title: "Fornecedor Associado!", description: "O fornecedor foi adicionado ao evento."});
        setIsAddSupplierModalOpen(false);
        fetchEventDetails(); // Re-fetch para atualizar a lista de fornecedores do evento
    } catch (err: any) {
        toast({title: "Erro ao Associar", description: err.message, variant: "destructive"});
    } finally {
        setIsAddingSupplierToEvent(false);
    }
  };

  const handleRemoveSupplierFromEvent = async (eventSupplierId: number, supplierName: string | null) => {
    if (!window.confirm(`Tem certeza que deseja desassociar o fornecedor "${supplierName || 'ID: '+ eventSupplierId}" deste evento?`)) return; // Corrigido supplierId para eventSupplierId
    try {
        const response = await fetch(`/api/event-suppliers/${eventSupplierId}`, {method: 'DELETE'});
        const responseData = await response.json();
        if(!response.ok) {
            throw new Error(responseData.error || "Falha ao desassociar fornecedor.");
        }
        toast({title: "Fornecedor Desassociado", description: `"${supplierName}" foi removido do evento.`});
        fetchEventDetails();
    } catch (err: any) {
        toast({title: "Erro ao Desassociar", description: err.message, variant: "destructive"});
    }
  };


  if (isLoading) return <div className="text-center py-10">Carregando...</div>;
  if (error) return <div className="text-center py-10 text-red-500">Erro: {error}</div>;
  if (!eventDetails) return <div className="text-center py-10">Evento não encontrado.</div>;

  const { event, financials, associatedSuppliers } = eventDetails;

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-3xl">{event.name}</CardTitle>
          {event.description && <CardDescription>{event.description}</CardDescription>}
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div><span className="font-semibold">Data:</span> {dayjs(event.date).locale('pt-br').format('DD/MM/YYYY HH:mm')}</div>
          <div><span className="font-semibold">Local:</span> {event.location || 'N/A'}</div>
          <div><span className="font-semibold">Organizador:</span> {event.organizerName || 'N/A'}</div>
          <div><span className="font-semibold">Tipo de Evento:</span> {event.eventType || 'N/A'}</div>
          <div><span className="font-semibold">Tamanho Estimado:</span> {event.eventSize || 'N/A'}</div>
        </CardContent>
      </Card>

      <Tabs defaultValue="financials" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-2 mb-4"> {/* Ajustado para 2 colunas */}
          <TabsTrigger value="financials"><DollarSignIcon className="inline-block mr-2 h-4 w-4" />Finanças</TabsTrigger>
          <TabsTrigger value="suppliers"><UsersIcon className="inline-block mr-2 h-4 w-4" />Fornecedores</TabsTrigger>
        </TabsList>

        <TabsContent value="financials">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Gestão Financeira do Evento</CardTitle>
                <CardDescription>Acompanhe as receitas e despesas do evento.</CardDescription>
              </div>
              <Dialog open={isTransactionModalOpen} onOpenChange={setIsTransactionModalOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => handleOpenTransactionModal()}>
                    <PlusCircleIcon className="mr-2 h-4 w-4" /> Adicionar Transação
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[480px]">
                  <DialogHeader>
                    <DialogTitle>{isEditingTransaction ? 'Editar' : 'Adicionar Nova'} Transação</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleTransactionSubmit} className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="tx-description" className="text-right">Descrição</Label>
                      <Input id="tx-description" value={transactionDescription} onChange={e => setTransactionDescription(e.target.value)} className="col-span-3" required />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="tx-type" className="text-right">Tipo</Label>
                      <select id="tx-type" value={transactionType} onChange={e => setTransactionType(e.target.value as 'income' | 'expense')} className="col-span-3 border rounded-md p-2">
                        <option value="expense">Despesa</option>
                        <option value="income">Receita</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="tx-amount" className="text-right">Valor (R$)</Label>
                      <Input id="tx-amount" type="text" value={transactionAmount} onChange={e => setTransactionAmount(e.target.value)} placeholder="Ex: 100,50" className="col-span-3" required />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="tx-date" className="text-right">Data</Label>
                      <Input id="tx-date" type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} className="col-span-3" required />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="tx-notes" className="text-right">Notas</Label>
                      <Textarea id="tx-notes" value={transactionNotes} onChange={e => setTransactionNotes(e.target.value)} className="col-span-3" />
                    </div>
                    <DialogFooter>
                      <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                      <Button type="submit" disabled={isSubmittingTransaction}>
                        {isSubmittingTransaction ? (isEditingTransaction ? 'Salvando...' : 'Adicionando...') : (isEditingTransaction ? 'Salvar Alterações' : 'Adicionar Transação')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 mb-6 text-center">
                <div className="p-4 bg-green-100 rounded-lg">
                  <p className="text-sm text-green-700 font-medium">Total Receitas</p>
                  <p className="text-2xl font-bold text-green-800">{formatCurrency(financials.totalIncome)}</p>
                </div>
                <div className="p-4 bg-red-100 rounded-lg">
                  <p className="text-sm text-red-700 font-medium">Total Despesas</p>
                  <p className="text-2xl font-bold text-red-800">{formatCurrency(financials.totalExpenses)}</p>
                </div>
                <div className={`p-4 rounded-lg ${financials.balance >= 0 ? 'bg-blue-100' : 'bg-orange-100'}`}>
                  <p className={`text-sm font-medium ${financials.balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>Saldo Atual</p>
                  <p className={`text-2xl font-bold ${financials.balance >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>{formatCurrency(financials.balance)}</p>
                </div>
              </div>

              <h4 className="text-lg font-semibold mb-2">Histórico de Transações</h4>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financials.transactions.length > 0 ? (
                      financials.transactions.map(tx => (
                        <TableRow key={tx.id}>
                          <TableCell>{dayjs(tx.transactionDate).format('DD/MM/YYYY')}</TableCell>
                          <TableCell>{tx.description}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 text-xs rounded-full ${tx.type === 'income' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                              {tx.type === 'income' ? 'Receita' : 'Despesa'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(tx.amount)}</TableCell>
                          <TableCell className="text-center space-x-1">
                            <Button variant="outline" size="icon" onClick={() => handleOpenTransactionModal(tx)} title="Editar">
                              <EditIcon className="h-4 w-4" />
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => handleDeleteTransaction(tx.id, tx.description)} title="Excluir">
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">Nenhuma transação registrada para este evento.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Fornecedores do Evento</CardTitle>
                        <CardDescription>Gerencie os fornecedores e parceiros associados a este evento.</CardDescription>
                    </div>
                    <Dialog open={isAddSupplierModalOpen} onOpenChange={setIsAddSupplierModalOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={handleOpenAddSupplierModal}><LinkIcon className="mr-2 h-4 w-4" /> Associar Fornecedor</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg"> {/* Aumentar um pouco o modal */}
                            <DialogHeader>
                                <DialogTitle>Associar Fornecedor ao Evento</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleAddSupplierToEventSubmit} className="grid gap-4 py-4">
                                <div>
                                    <Label htmlFor="supplier-select">Fornecedor</Label>
                                    <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId} required>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione um fornecedor..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableSuppliers.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum fornecedor disponível ou carregando...</p>}
                                            {availableSuppliers.map(sup => (
                                                <SelectItem key={sup.id} value={sup.id.toString()}>{sup.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="supplier-role">Função no Evento</Label>
                                    <Input id="supplier-role" value={supplierRoleInEvent} onChange={e => setSupplierRoleInEvent(e.target.value)} placeholder="Ex: Buffet, Fotógrafo Principal" />
                                </div>
                                <div>
                                    <Label htmlFor="supplier-contract-details">Detalhes do Contrato/Observações</Label>
                                    <Textarea id="supplier-contract-details" value={supplierContractDetails} onChange={e => setSupplierContractDetails(e.target.value)} />
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild><Button variant="outline" type="button">Cancelar</Button></DialogClose>
                                    <Button type="submit" disabled={isAddingSupplierToEvent}>
                                        {isAddingSupplierToEvent ? "Associando..." : "Associar Fornecedor"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    {/* Seção de Sugestões */}
                    {isLoadingSuggestions && <p className="text-sm text-muted-foreground mb-4">Carregando sugestões...</p>}
                    {!isLoadingSuggestions && supplierSuggestions && supplierSuggestions.length > 0 && (
                        <div className="mb-6 p-4 border rounded-lg bg-blue-50 border-blue-200">
                            <h5 className="text-md font-semibold mb-2 text-blue-700">Sugestões de Fornecedores:</h5>
                            <ul className="list-disc pl-5 space-y-1 text-sm">
                                {supplierSuggestions.map((suggestion, index) => (
                                    <li key={index}>
                                        <span className="font-medium">{suggestion.categoryName}:</span> {suggestion.suggestedQuantity}
                                        {suggestion.notes && <span className="text-xs text-gray-600 italic ml-1">({suggestion.notes})</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {!isLoadingSuggestions && eventDetails?.event && (!eventDetails.event.eventType || !eventDetails.event.eventSize) && (
                         <p className="text-sm text-muted-foreground mb-4">Defina o Tipo e Tamanho do evento para ver sugestões de fornecedores.</p>
                    )}
                     {!isLoadingSuggestions && eventDetails?.event && eventDetails.event.eventType && eventDetails.event.eventSize && supplierSuggestions.length === 0 && (
                         <p className="text-sm text-muted-foreground mb-4">Nenhuma sugestão específica encontrada para este tipo/tamanho de evento.</p>
                    )}

                    <h4 className="text-md font-semibold mb-3">Fornecedores Associados:</h4>
                    {associatedSuppliers && associatedSuppliers.length > 0 ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Contato</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Função no Evento</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {associatedSuppliers.map(as => (
                                        <TableRow key={as.eventSupplierId}>
                                            <TableCell className="font-medium">{as.supplierName}</TableCell>
                                            <TableCell>{as.supplierContactPerson || as.supplierPhone || 'N/A'}</TableCell>
                                            <TableCell>{as.supplierEmail || 'N/A'}</TableCell>
                                            <TableCell>{as.roleInEvent || 'N/A'}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="destructive" size="icon" onClick={() => handleRemoveSupplierFromEvent(as.eventSupplierId, as.supplierName)} title="Desassociar Fornecedor">
                                                    <Trash2Icon className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Nenhum fornecedor associado a este evento ainda.</p>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
