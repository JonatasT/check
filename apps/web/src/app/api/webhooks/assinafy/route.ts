// apps/web/src/app/api/webhooks/assinafy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contracts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// TODO: Implementar verificação de assinatura do webhook para segurança, se fornecido pelo Assinafy.
// const ASSINAFY_WEBHOOK_SECRET = process.env.ASSINAFY_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  console.log("Assinafy Webhook: Recebida uma nova requisição.");

  try {
    const payload = await request.json();
    console.log("Assinafy Webhook Payload:", JSON.stringify(payload, null, 2));

    // =====================================================================================
    // ATENÇÃO: A lógica abaixo é um PLACEHOLDER e precisa ser adaptada
    // com base na estrutura REAL do payload do webhook do Assinafy.
    // Verifique a documentação do Assinafy para os campos corretos.
    // =====================================================================================

    // Exemplo de como você poderia extrair dados (AJUSTE CONFORME NECESSÁRIO)
    const eventType = payload.event?.type || payload.event_type || payload.type; // Tente adivinhar o campo do tipo de evento
    const documentData = payload.data?.document || payload.document || payload.data; // Tente adivinhar onde estão os dados do documento

    if (!eventType || !documentData) {
      console.error("Assinafy Webhook: Tipo de evento ou dados do documento não encontrados no payload.");
      return NextResponse.json({ error: 'Payload inválido ou desconhecido.' }, { status: 400 });
    }

    const assinafyDocumentId = documentData.id || documentData.document_id; // ID do documento no Assinafy

    if (!assinafyDocumentId) {
      console.error("Assinafy Webhook: ID do documento do Assinafy não encontrado no payload.");
      return NextResponse.json({ error: 'ID do documento do Assinafy ausente.' }, { status: 400 });
    }

    // Buscar o contrato em nosso banco de dados
    const [contractToUpdate] = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.assinafyDocumentId, assinafyDocumentId))
      .limit(1);

    if (!contractToUpdate) {
      console.warn(`Assinafy Webhook: Contrato com assinafyDocumentId ${assinafyDocumentId} não encontrado em nosso BD.`);
      // Retornar 200 para o Assinafy para evitar reenvios, mas logar o aviso.
      return NextResponse.json({ message: 'Contrato não encontrado, mas webhook recebido.' }, { status: 200 });
    }

    let newAssinafyStatus: string | undefined = undefined;
    let newOurStatus: string | undefined = undefined;
    let assinafyCertificatedUrl: string | undefined = undefined;

    // Mapear eventos do Assinafy para nossos status (EXEMPLO - AJUSTE!)
    switch (eventType) {
      case 'document_signed': // Supondo que este é um evento quando UM signatário assina
      case 'signer_signed_document':
        newAssinafyStatus = 'pending_signature'; // Pode ainda estar pendente de outros
        newOurStatus = 'pending_assinaturas';
        // Se o payload indicar que TODAS as assinaturas foram coletadas, mude para 'certificating' ou 'document_ready'
        // Verifique se o payload do Assinafy indica se o processo foi concluído.
        // Ex: if (documentData.status === 'completed' || documentData.all_signed === true) {
        //   newAssinafyStatus = 'certificated'; // ou 'certificating'
        //   newOurStatus = 'signed';
        //   assinafyCertificatedUrl = documentData.artifacts?.certificated || documentData.download_links?.certificated;
        // }
        console.log(`Assinafy Webhook: Documento ${assinafyDocumentId} assinado por um signatário (ou status similar).`);
        break;

      case 'document_ready': // Supondo que este é o evento quando TODAS as assinaturas foram feitas e o doc está pronto/certificado
      case 'process_completed':
      case 'document_certificated':
        newAssinafyStatus = 'certificated';
        newOurStatus = 'signed';
        assinafyCertificatedUrl = documentData.artifacts?.certificated || documentData.download_url_certificated || documentData.url_certificated;
        console.log(`Assinafy Webhook: Documento ${assinafyDocumentId} certificado/pronto. URL: ${assinafyCertificatedUrl}`);
        break;

      case 'document_rejected':
      case 'signer_rejected_document':
        newAssinafyStatus = 'rejected_by_signer';
        newOurStatus = 'rejected';
        console.log(`Assinafy Webhook: Documento ${assinafyDocumentId} rejeitado.`);
        break;

      case 'document_expired':
        newAssinafyStatus = 'expired';
        newOurStatus = 'expired';
        console.log(`Assinafy Webhook: Documento ${assinafyDocumentId} expirado.`);
        break;

      // Adicione outros casos conforme a documentação do Assinafy (ex: 'document_cancelled', 'failed', etc.)
      default:
        console.warn(`Assinafy Webhook: Evento não tratado '${eventType}' para o documento ${assinafyDocumentId}.`);
        // Retornar 200 para não ficar recebendo reenvios de eventos não mapeados.
        return NextResponse.json({ message: 'Evento não mapeado recebido.' }, { status: 200 });
    }

    // Atualizar o contrato no nosso banco de dados
    const updateData: Partial<typeof contracts.$inferInsert> = { updatedAt: new Date() };
    if (newAssinafyStatus) updateData.assinafyStatus = newAssinafyStatus;
    if (newOurStatus) updateData.status = newOurStatus;
    if (assinafyCertificatedUrl) updateData.assinafyCertificatedUrl = assinafyCertificatedUrl;

    if (Object.keys(updateData).length > 1) { // Se houver algo além de updatedAt para atualizar
      await db
        .update(contracts)
        .set(updateData)
        .where(eq(contracts.id, contractToUpdate.id));
      console.log(`Assinafy Webhook: Contrato ID ${contractToUpdate.id} atualizado com base no evento '${eventType}'.`);
    }

    return NextResponse.json({ message: 'Webhook recebido e processado com sucesso.' }, { status: 200 });

  } catch (error: any) {
    console.error('Assinafy Webhook - Erro ao processar requisição:', error);
    return NextResponse.json({ error: `Erro interno do servidor: ${error.message}` }, { status: 500 });
  }
}
