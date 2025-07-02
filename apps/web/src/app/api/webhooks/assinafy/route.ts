// apps/web/src/app/api/webhooks/assinafy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contracts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

import crypto from 'crypto';

// TODO: Armazenar este segredo de forma segura nas variáveis de ambiente.
// const ASSINAFY_WEBHOOK_SECRET = process.env.ASSINAFY_WEBHOOK_SECRET;

// Interfaces para tipar o payload esperado do Assinafy (AJUSTAR CONFORME DOCUMENTAÇÃO REAL)
interface AssinafyWebhookPayload {
  event?: string; // Ex: "document_status_changed", "signature_completed"
  event_type?: string; // Alternativa comum para nome do campo
  type?: string; // Outra alternativa
  data?: AssinafyDocumentDataContainer;
  document?: AssinafyDocumentData; // Se os dados do documento vierem na raiz
  // Adicionar outros campos que o Assinafy possa enviar no nível raiz do payload
}

interface AssinafyDocumentDataContainer {
  document?: AssinafyDocumentData;
  // Outros possíveis containers de dados
}

interface AssinafyDocumentData {
  id?: string; // ID do documento no Assinafy
  document_id?: string; // Alternativa para ID do documento
  status?: string; // Status do documento no Assinafy (ex: "pending_signature", "certificated", "rejected")
  current_status?: string; // Alternativa
  artifacts?: {
    original?: string;
    certificated?: string; // URL para o documento certificado/assinado
    // Outros artefatos
  };
  download_urls?: { // Alternativa comum para artefatos
    original?: string;
    certificated?: string;
  };
  // Adicionar outros campos relevantes do documento (signatários, datas, etc.)
}


export async function POST(request: NextRequest) {
  const webhookTimestamp = request.headers.get('X-Assinafy-Timestamp'); // Exemplo de header de timestamp
  const webhookSignature = request.headers.get('X-Assinafy-Signature'); // Exemplo de header de assinatura

  // Log Raw Body para depuração inicial de assinatura, se necessário
  // const rawBody = await request.text(); // Ler como texto primeiro para verificação de assinatura
  // console.log("Assinafy Webhook: Raw Body:", rawBody);
  // request.json() não poderá ser chamado depois de request.text() ou request.arrayBuffer()
  // Para verificar assinatura, você precisaria do corpo raw (texto ou buffer)

  // TODO: Implementar verificação de assinatura do webhook
  // if (ASSINAFY_WEBHOOK_SECRET && webhookSignature && webhookTimestamp) {
  //   const signedPayload = webhookTimestamp + '.' + rawBody; // Ou como o Assinafy especificar
  //   const expectedSignature = crypto
  //     .createHmac('sha256', ASSINAFY_WEBHOOK_SECRET)
  //     .update(signedPayload)
  //     .digest('hex');
  //   if (!crypto.timingSafeEqual(Buffer.from(webhookSignature), Buffer.from(expectedSignature))) {
  //     console.warn('Assinafy Webhook: Assinatura inválida.');
  //     return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 403 });
  //   }
  //   console.log("Assinafy Webhook: Assinatura verificada com sucesso.");
  // } else {
  //   console.warn("Assinafy Webhook: Verificação de assinatura não configurada ou headers ausentes.");
  //   // Em produção, você pode querer rejeitar webhooks não assinados se um segredo estiver configurado.
  // }

  let payload: AssinafyWebhookPayload;
  try {
    // Se já leu como rawBody, precisa fazer JSON.parse(rawBody)
    payload = await request.json();
    console.log("Assinafy Webhook: Payload Recebido:", JSON.stringify(payload, null, 2));
  } catch (e) {
    console.error("Assinafy Webhook: Erro ao fazer parse do JSON do payload.", e);
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  // Extração mais robusta do tipo de evento e dados do documento
  const eventType = payload.event || payload.event_type || payload.type;
  const documentDataContainer = payload.data || payload; // Se 'document' estiver na raiz ou dentro de 'data'
  const documentInfo = documentDataContainer?.document || (documentDataContainer as AssinafyDocumentData); // Ajuste conforme a estrutura real

  if (!eventType || !documentInfo) {
    console.error("Assinafy Webhook: 'eventType' ou 'documentInfo' não encontrados no payload normalizado.");
    return NextResponse.json({ error: 'Estrutura de payload desconhecida ou incompleta.' }, { status: 400 });
  }

  const assinafyDocumentId = documentInfo.id || documentInfo.document_id;
  const assinafyCurrentStatus = documentInfo.status || documentInfo.current_status;

  if (!assinafyDocumentId) {
    console.error("Assinafy Webhook: ID do documento do Assinafy não encontrado no payload do documento.");
    return NextResponse.json({ error: 'ID do documento do Assinafy ausente nos dados do documento.' }, { status: 400 });
  }

  try {
    const [contractToUpdate] = await db
      .select({ id: contracts.id, currentAssinafyStatus: contracts.assinafyStatus })
      .from(contracts)
      .where(eq(contracts.assinafyDocumentId, assinafyDocumentId))
      .limit(1);

    if (!contractToUpdate) {
      console.warn(`Assinafy Webhook: Contrato com assinafyDocumentId ${assinafyDocumentId} não encontrado em nosso BD. Evento: ${eventType}`);
      return NextResponse.json({ message: 'Contrato não encontrado, webhook ignorado.' }, { status: 200 });
    }

    // Prepara os dados para atualização
    const updateData: Partial<typeof contracts.$inferInsert> = { updatedAt: new Date() };

    if (assinafyCurrentStatus) {
        updateData.assinafyStatus = assinafyCurrentStatus;
    }

    // Mapeamento de evento para status interno e URL do certificado
    // ESTE MAPEAMENTO É UM EXEMPLO E PRECISA SER VALIDADO COM OS EVENTOS REAIS DO ASSINAFY
    switch (eventType.toLowerCase()) {
      case 'document_viewed_by_signer': // Se houver tal evento
        // Apenas atualiza o assinafyStatus se ele for diferente e mais recente
        if (assinafyCurrentStatus && contractToUpdate.currentAssinafyStatus !== assinafyCurrentStatus) {
             updateData.assinafyStatus = assinafyCurrentStatus; // Ex: 'viewed'
        }
        console.log(`Assinafy Webhook: Documento ${assinafyDocumentId} visualizado. Status Assinafy: ${assinafyCurrentStatus}`);
        break;

      case 'signer_signed_document': // Um signatário assinou
      case 'document_signed': // Pode ser sinônimo ou evento diferente
        updateData.assinafyStatus = assinafyCurrentStatus || 'pending_signature'; // O status do payload pode já ser 'pending_signature' ou 'partially_signed'
        updateData.status = 'pending_assinaturas'; // Nosso status interno
        console.log(`Assinafy Webhook: Documento ${assinafyDocumentId} assinado por um signatário. Status Assinafy: ${assinafyCurrentStatus}`);
        break;

      case 'document_ready':
      case 'process_completed':
      case 'document_certificated': // Documento finalizado e certificado
        updateData.assinafyStatus = assinafyCurrentStatus || 'certificated';
        updateData.status = 'signed'; // Nosso status interno para finalizado
        updateData.signedAt = new Date(); // Marcar data da assinatura/conclusão
        const certUrl = documentInfo.artifacts?.certificated || documentInfo.download_urls?.certificated;
        if (certUrl) {
          updateData.assinafyCertificatedUrl = certUrl;
        }
        console.log(`Assinafy Webhook: Documento ${assinafyDocumentId} concluído/certificado. URL: ${certUrl}`);
        break;

      case 'document_rejected':
      case 'signer_rejected_document': // Um signatário rejeitou
        updateData.assinafyStatus = assinafyCurrentStatus || 'rejected_by_signer';
        updateData.status = 'rejected';
        console.log(`Assinafy Webhook: Documento ${assinafyDocumentId} rejeitado. Status Assinafy: ${assinafyCurrentStatus}`);
        break;

      case 'document_expired':
        updateData.assinafyStatus = assinafyCurrentStatus || 'expired';
        updateData.status = 'expired';
        console.log(`Assinafy Webhook: Documento ${assinafyDocumentId} expirado. Status Assinafy: ${assinafyCurrentStatus}`);
        break;

      case 'document_cancelled': // Se o processo foi cancelado pelo remetente no Assinafy
      case 'rejected_by_user': // Nome alternativo
        updateData.assinafyStatus = assinafyCurrentStatus || 'cancelled';
        updateData.status = 'cancelled';
        console.log(`Assinafy Webhook: Processo do documento ${assinafyDocumentId} cancelado. Status Assinafy: ${assinafyCurrentStatus}`);
        break;

      case 'document_processing_failed': // Se houve falha no processamento pelo Assinafy
      case 'failed':
        updateData.assinafyStatus = assinafyCurrentStatus || 'failed';
        updateData.status = 'error_signature_provider'; // Nosso status interno
        console.log(`Assinafy Webhook: Falha no processamento do documento ${assinafyDocumentId}. Status Assinafy: ${assinafyCurrentStatus}`);
        break;

      default:
        console.warn(`Assinafy Webhook: Evento não explicitamente tratado '${eventType}' para o documento ${assinafyDocumentId}. Status Assinafy no payload: ${assinafyCurrentStatus}. Verifique se um update de status genérico é necessário.`);
        // Se o status do Assinafy no payload for válido e diferente do atual, atualizamos.
        if (assinafyCurrentStatus && assinafyCurrentStatus !== contractToUpdate.currentAssinafyStatus) {
            // Não mudar nosso status interno 'status' a menos que o evento seja especificamente mapeado para isso.
        } else {
            // Nenhum status novo ou nenhuma mudança, não faz update desnecessário
            return NextResponse.json({ message: 'Evento recebido, sem alteração de status necessária ou evento não mapeado para alteração de status interno.' }, { status: 200 });
        }
    }

    if (Object.keys(updateData).length > 1) {
      await db
        .update(contracts)
        .set(updateData)
        .where(eq(contracts.id, contractToUpdate.id));
      console.log(`Assinafy Webhook: Contrato ID ${contractToUpdate.id} (Assinafy ID: ${assinafyDocumentId}) atualizado devido ao evento '${eventType}'. Novo status Assinafy: ${updateData.assinafyStatus}, Novo status interno: ${updateData.status}`);
    } else {
      console.log(`Assinafy Webhook: Evento '${eventType}' para o contrato ID ${contractToUpdate.id} não resultou em alterações de dados.`);
    }

    return NextResponse.json({ message: 'Webhook processado.' }, { status: 200 });

  } catch (error: any) {
    console.error('Assinafy Webhook - Erro CRÍTICO ao processar requisição:', error);
    // É importante retornar 500 aqui para que o Assinafy saiba que algo deu errado e possa tentar reenviar.
    return NextResponse.json({ error: `Erro interno do servidor: ${error.message}` }, { status: 500 });
  }
}
