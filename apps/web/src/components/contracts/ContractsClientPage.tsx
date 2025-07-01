// apps/web/src/components/contracts/ContractsClientPage.tsx
'use client';

import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { FileTextIcon, UploadIcon, DownloadIcon, Trash2Icon, PlusCircleIcon, SendIcon, Loader2 } from 'lucide-react'; // Adicionado SendIcon e Loader2
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"; // Assumindo Dialog de shadcn/ui

interface Contract {
  id: number;
  title: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  filePath: string;
  eventId: number | null;
  uploadedByUserId: string | null;
  status: string | null; // Nosso status interno
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assinafyDocumentId?: string | null; // ID do documento no Assinafy
  assinafyStatus?: string | null;     // Status do documento no Assinafy
}

export default function ContractsClientPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Estados para o formulário de upload
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [sendingToAssinafy, setSendingToAssinafy] = useState<Record<number, boolean>>({});

  // Estados para o Modal de Signatários Assinafy
  const [isSignersModalOpen, setIsSignersModalOpen] = useState(false);
  const [currentContractForSigners, setCurrentContractForSigners] = useState<Contract | null>(null);
  const [signers, setSigners] = useState<{ fullName: string; email: string }[]>([{ fullName: '', email: '' }]);
  const [isRequestingSignatures, setIsRequestingSignatures] = useState(false);


  const fetchContracts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/contracts');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Falha ao buscar contratos: ${response.statusText}`);
      }
      const data = await response.json();
      setContracts(data.contracts || []);
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "Erro ao buscar documentos",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file || !title) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, selecione um arquivo e forneça um título.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    if (eventId) {
      formData.append('eventId', eventId);
    }

    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        body: formData,
      });

      setIsUploading(false);
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || `Falha no upload: ${response.statusText}`);
      }

      toast({
        title: "Upload bem-sucedido!",
        description: `"${responseData.contract.title}" foi enviado.`,
      });
      setFile(null);
      setTitle('');
      setEventId('');
      setIsUploadModalOpen(false); // Fecha o modal
      fetchContracts(); // Atualiza a lista de contratos
    } catch (err: any) {
      setIsUploading(false);
      toast({
        title: "Erro no Upload",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDownload = (filePath: string, fileName: string) => {
    // Esta é uma forma simples de iniciar um download para arquivos servidos publicamente
    // ou se a API /api/contracts/[id]/download for configurada para servir o arquivo.
    // Por agora, vamos assumir que filePath é um URL acessível ou que construiremos essa rota.
    // Exemplo: window.open(`/api/contracts/download?path=${encodeURIComponent(filePath)}`, '_blank');
    // Por enquanto, apenas logamos. Uma rota de download dedicada é necessária para arquivos privados.
    console.log(`Tentando baixar: ${filePath}`);
    toast({
      title: "Download",
      description: `Funcionalidade de download para "${fileName}" pendente de implementação da rota de serviço de arquivo.`,
    });
    // Para testar com arquivos em /public:
    // window.open(filePath, '_blank');
    // Se o filePath for algo como /uploads/contracts/file.pdf e a pasta uploads for servida estaticamente.
    // No Next.js, a pasta `public` é servida estaticamente. `uploads` não é por padrão.
    // Precisaremos de uma rota como `/api/download?file=${filePath}`
     window.open(`/api/download?file=${encodeURIComponent(filePath)}&filename=${encodeURIComponent(fileName)}`, '_blank');

  };

  const handleDelete = async (contractId: number, contractTitle: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o contrato "${contractTitle}"? Esta ação não pode ser desfeita e também tentará remover o arquivo do sistema se já enviado para assinatura (Assinafy).`)) {
      return;
    }
    try {
      const response = await fetch(`/api/contracts/${contractId}`, { method: 'DELETE' });
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || `Falha ao excluir: ${response.statusText}`);
      }
      toast({
        title: "Contrato Excluído",
        description: `"${contractTitle}" foi excluído com sucesso do nosso sistema.`,
      });
      fetchContracts(); // Atualiza a lista
    } catch (err: any) {
      toast({
        title: "Erro ao Excluir",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleSendToAssinafy = async (contractId: number, contractTitle: string) => {
    setSendingToAssinafy(prev => ({ ...prev, [contractId]: true }));
    try {
      const response = await fetch(`/api/contracts/${contractId}/send-to-assinafy`, { method: 'POST' });
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || `Falha ao enviar para Assinafy: ${response.statusText}`);
      }
      toast({
        title: "Enviado para Assinafy",
        description: `"${contractTitle}" foi enviado para o Assinafy. ID: ${responseData.assinafyDocumentId}`,
      });
      fetchContracts(); // Atualiza a lista para refletir o novo status e ID do Assinafy
    } catch (err: any) {
      toast({
        title: "Erro ao Enviar para Assinafy",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSendingToAssinafy(prev => ({ ...prev, [contractId]: false }));
    }
  };


  if (isLoading) return <p>Carregando documentos...</p>;
  // Erro já é tratado pelo toast, mas pode querer mostrar uma mensagem maior aqui também.
  // if (error) return <p className="text-red-500">Erro ao carregar documentos: {error}</p>;


  const getContractDisplayStatus = (contract: Contract): string => {
    // Prioriza o status do Assinafy se disponível e relevante
    if (contract.assinafyDocumentId) {
      if (contract.assinafyStatus === 'certificated') return 'Concluído (Assinado via Assinafy)';
      if (contract.assinafyStatus === 'pending_signature') return 'Aguardando Assinaturas (Assinafy)';
      if (contract.assinafyStatus === 'rejected_by_signer') return 'Rejeitado pelo Signatário (Assinafy)';
      if (contract.assinafyStatus === 'failed') return 'Falha no Processo (Assinafy)';
      if (contract.assinafyStatus === 'uploaded' || contract.assinafyStatus === 'metadata_ready') return 'Pronto para Coleta de Assinaturas (Assinafy)';
      // Outros status do Assinafy podem ser mapeados aqui
      if (contract.assinafyStatus) return `Assinafy: ${contract.assinafyStatus}`;
    }
    // Fallback para o status interno do nosso sistema
    if (contract.status === 'uploaded') return 'Aguardando Envio para Assinatura';
    if (contract.status === 'pending_signature_setup') return 'Pronto para Coleta de Assinaturas (Assinafy)';
    if (contract.status === 'error_sending_to_provider') return 'Erro ao Enviar para Assinafy';

    return contract.status || 'N/A';
  };

  const handleAddSigner = () => {
    setSigners([...signers, { fullName: '', email: '' }]);
  };

  const handleRemoveSigner = (index: number) => {
    const newSigners = signers.filter((_, i) => i !== index);
    setSigners(newSigners);
  };

  const handleSignerChange = (index: number, field: 'fullName' | 'email', value: string) => {
    const newSigners = signers.map((signer, i) =>
      i === index ? { ...signer, [field]: value } : signer
    );
    setSigners(newSigners);
  };

  const openSignersModal = (contract: Contract) => {
    setCurrentContractForSigners(contract);
    setSigners([{ fullName: '', email: '' }]); // Reset para um signatário em branco
    setIsSignersModalOpen(true);
  };

  const handleRequestSignaturesSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentContractForSigners || !currentContractForSigners.assinafyDocumentId) {
      toast({ title: "Erro", description: "Contrato não selecionado ou não enviado ao Assinafy.", variant: "destructive" });
      return;
    }
    if (signers.some(s => !s.fullName.trim() || !s.email.trim())) {
      toast({ title: "Campos incompletos", description: "Nome completo e email são obrigatórios para todos os signatários.", variant: "destructive" });
      return;
    }

    setIsRequestingSignatures(true);
    try {
      const response = await fetch(`/api/contracts/${currentContractForSigners.id}/request-signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signers }),
      });
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || "Falha ao solicitar assinaturas.");
      }
      toast({ title: "Assinaturas Solicitadas!", description: `Convites enviados para ${signers.length} signatário(s).` });
      setIsSignersModalOpen(false);
      fetchContracts(); // Atualiza a lista
    } catch (err: any) {
      toast({ title: "Erro ao Solicitar Assinaturas", description: err.message, variant: "destructive" });
    } finally {
      setIsRequestingSignatures(false);
    }
  };


  return (
    <div>
      <div className="mb-6 flex justify-end">
        <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <UploadIcon className="mr-2 h-4 w-4" /> Adicionar Documento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Upload de Novo Documento</DialogTitle>
              <DialogDescription>
                Selecione um arquivo e forneça um título. O ID do evento é opcional.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUploadSubmit} className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="title-upload" className="text-right">
                  Título
                </Label>
                <Input
                  id="title-upload"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="col-span-3"
                  placeholder="Ex: Contrato de Prestação de Serviço"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="file-upload" className="text-right">
                  Arquivo
                </Label>
                <Input
                  id="file-upload"
                  type="file"
                  onChange={handleFileChange}
                  className="col-span-3"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="eventId-upload" className="text-right">
                  ID do Evento
                </Label>
                <Input
                  id="eventId-upload"
                  type="text" // Pode ser number, mas text é mais flexível para input
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="col-span-3"
                  placeholder="(Opcional)"
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline">Cancelar</Button>
                </DialogClose>
                <Button type="submit" disabled={isUploading}>
                  {isUploading ? 'Enviando...' : 'Enviar Arquivo'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-red-500 mb-4">Erro: {error}</p>}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Nome do Arquivo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Status</TableHead> {/* Este será o status combinado/interpretado */}
              <TableHead>Data de Upload</TableHead>
              <TableHead className="text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.length > 0 ? (
              contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell><FileTextIcon className="h-5 w-5 text-gray-500" /></TableCell>
                  <TableCell className="font-medium">{contract.title}</TableCell>
                  <TableCell>{contract.fileName}</TableCell>
                  <TableCell>{contract.fileType || 'N/A'}</TableCell>
                  <TableCell>{contract.fileSize ? `${(contract.fileSize / 1024).toFixed(2)} KB` : 'N/A'}</TableCell>
                  <TableCell>{getContractDisplayStatus(contract)}</TableCell>
                  <TableCell>{new Date(contract.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell className="text-center space-x-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDownload(contract.filePath, contract.fileName)}
                      title="Download do Arquivo Original"
                    >
                      <DownloadIcon className="h-4 w-4" />
                    </Button>

                    {!contract.assinafyDocumentId && (contract.status === 'uploaded' || contract.status === 'error_sending_to_provider') && (
                       <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleSendToAssinafy(contract.id, contract.title)}
                        disabled={sendingToAssinafy[contract.id]}
                        title="Enviar para Assinafy para Assinatura Digital"
                      >
                        {sendingToAssinafy[contract.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
                      </Button>
                    )}

                    {contract.assinafyDocumentId &&
                     (contract.assinafyStatus === 'uploaded' || contract.assinafyStatus === 'metadata_ready' || contract.status === 'pending_signature_setup') && // Permite configurar se enviado mas não iniciado
                     !['pending_signature', 'certificated', 'rejected_by_signer', 'failed', 'certificating'].includes(contract.assinafyStatus || '') &&
                     (
                       <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openSignersModal(contract)}
                        title="Configurar Signatários e Iniciar Assinatura (Assinafy)"
                      >
                        <PlusCircleIcon className="h-4 w-4" />
                      </Button>
                    )}
                     {/* Botão para baixar assinado do Assinafy (se já assinado) */}
                    {contract.assinafyDocumentId && contract.assinafyStatus === 'certificated' && (
                       <Button
                        variant="default" // Destacado
                        size="icon"
                        onClick={() => {
                           toast({ title: "Info", description: `Download do certificado pendente. URL: ${contract.assinafyCertificatedUrl || 'Não disponível'}` });
                          // TODO: Implementar download do Assinafy Certificated URL se ele for direto,
                          // ou chamar uma API nossa que faça o download seguro do Assinafy e sirva para o usuário.
                          // Ex: window.open(contract.assinafyCertificatedUrl, '_blank'); // Se for URL pública direta
                        }}
                        title="Baixar Documento Assinado (Assinafy)"
                      >
                        <DownloadIcon className="h-4 w-4" /> {/* Pode usar um ícone de "check" ou "verified" aqui */}
                      </Button>
                    )}


                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDelete(contract.id, contract.title)}
                      title="Excluir"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  Nenhum documento encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
