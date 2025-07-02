// apps/web/src/app/api/contracts/[contractId]/request-signatures/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contracts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server'; // Alterado para auth
import { z } from 'zod';
import fetch from 'node-fetch';

interface RouteContext {
  params: {
    contractId: string; // Nosso ID interno do contrato
  };
}

const signerSchema = z.object({
  fullName: z.string().min(1, "Nome completo é obrigatório."),
  email: z.string().email("Email inválido."),
});

const requestSignaturesSchema = z.object({
  signers: z.array(signerSchema).min(1, "Pelo menos um signatário é necessário."),
  // Poderíamos adicionar outros campos como 'message' ou 'expires_at' para o Assinafy aqui
});

interface AssinafySigner {
  id: string;
  full_name: string;
  email: string;
}

interface AssinafyError {
    status: number;
    message: string;
    data?: any;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const ourContractId = parseInt(params.contractId, 10);
  if (isNaN(ourContractId)) {
    return NextResponse.json({ error: 'ID do contrato inválido.' }, { status: 400 });
  }

  // Obter credenciais do Assinafy
  const assinafyApiKey = process.env.ASSINAFY_API_KEY;
  const assinafyAccountId = process.env.ASSINAFY_ACCOUNT_ID;
  const assinafyApiBaseUrl = process.env.ASSINAFY_API_BASE_URL;

  if (!assinafyApiKey || !assinafyAccountId || !assinafyApiBaseUrl) {
    console.error('Credenciais do Assinafy não configuradas.');
    return NextResponse.json({ error: 'Configuração do provedor de assinatura incompleta.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const validation = requestSignaturesSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Dados de signatários inválidos.', details: validation.error.flatten() }, { status: 400 });
    }
    const { signers: providedSigners } = validation.data;

    // 1. Buscar nosso contrato para obter assinafyDocumentId e verificar permissões
    const [contractDetails] = await db
      .select({
        id: contracts.id,
        assinafyDocumentId: contracts.assinafyDocumentId,
        uploadedByUserId: contracts.uploadedByUserId
      })
      .from(contracts)
      .where(eq(contracts.id, ourContractId))
      .limit(1);

    if (!contractDetails) {
      return NextResponse.json({ error: 'Contrato não encontrado em nosso sistema.' }, { status: 404 });
    }
    if (contractDetails.uploadedByUserId !== clerkUserId) { // Lógica de permissão básica
        return NextResponse.json({ error: 'Permissão negada para este contrato.' }, { status: 403 });
    }
    if (!contractDetails.assinafyDocumentId) {
      return NextResponse.json({ error: 'Contrato ainda não foi enviado para o Assinafy.' }, { status: 400 });
    }

    const assinafySignerIds: string[] = [];

    // 2. Para cada signatário, verificar/criar no Assinafy
    for (const signer of providedSigners) {
      let assinafySignerId: string | null = null;

      // Opcional: Tentar buscar signatário existente no Assinafy pelo email
      // (A API do Assinafy na documentação fornecida não mostra um filtro direto por email na listagem, apenas um 'search' genérico)
      // Por simplicidade, vamos tentar criar. Se o Assinafy tratar duplicidade de email, ótimo.
      // Se não, uma gestão mais avançada de signatários (armazenando localmente o mapeamento) seria necessária para evitar duplicatas.

      const createSignerUrl = `${assinafyApiBaseUrl}/accounts/${assinafyAccountId}/signers`;
      try {
        const signerResponse = await fetch(createSignerUrl, {
          method: 'POST',
          headers: {
            'X-Api-Key': assinafyApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ full_name: signer.fullName, email: signer.email }),
        });

        const signerData = await signerResponse.json() as { data?: AssinafySigner, status?: number, message?: string };

        if (!signerResponse.ok || signerData.status !== 200 || !signerData.data?.id) {
          // Se o erro for por e-mail já existente, idealmente a API retornaria o ID existente ou um erro específico.
          // A documentação não é clara sobre isso. Se falhar, logamos e continuamos (ou paramos).
          console.warn(`Falha ao criar/obter signatário ${signer.email} no Assinafy. Status: ${signerData.status}, Msg: ${signerData.message}`);
          // Poderíamos tentar buscar aqui se o erro indicar duplicidade.
          // Por ora, se não conseguirmos criar, vamos pular este signatário ou retornar erro.
          // Para este exemplo, vamos retornar um erro geral se um signatário falhar.
          throw new Error(`Falha ao processar signatário ${signer.email}: ${signerData.message || signerResponse.statusText}`);
        }
        assinafySignerId = signerData.data.id;
        assinafySignerIds.push(assinafySignerId);
      } catch (e: any) {
        console.error(`Erro ao criar signatário ${signer.email} no Assinafy:`, e);
        throw new Error(`Erro de comunicação ao criar signatário ${signer.email} no Assinafy.`);
      }
    }

    if (assinafySignerIds.length !== providedSigners.length) {
        return NextResponse.json({ error: 'Nem todos os signatários puderam ser processados no Assinafy.' }, { status: 500 });
    }

    // 3. Criar o "Assignment" (solicitação de assinatura) no Assinafy
    const createAssignmentUrl = `${assinafyApiBaseUrl}/documents/${contractDetails.assinafyDocumentId}/assignments`;
    const assignmentPayload = {
      method: "virtual", // Conforme documentação para assinatura simples
      signerIds: assinafySignerIds,
      // message: "Mensagem opcional para os signatários",
      // expires_at: "YYYY-MM-DDTHH:MM:SSZ" // Opcional
    };

    const assignmentResponse = await fetch(createAssignmentUrl, {
        method: 'POST',
        headers: {
          'X-Api-Key': assinafyApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assignmentPayload),
    });

    const assignmentData = await assignmentResponse.json() as { data?: { id: string }, status?: number, message?: string };

    if (!assignmentResponse.ok || assignmentData.status !== 200 || !assignmentData.data?.id) {
      console.error('Falha ao criar assignment no Assinafy:', assignmentResponse.status, assignmentData);
      throw new Error(`Falha ao solicitar assinaturas no Assinafy: ${assignmentData.message || assignmentResponse.statusText}`);
    }

    const assinafySignatureRequestId = assignmentData.data.id;

    // 4. Atualizar nosso contrato no BD
    await db
      .update(contracts)
      .set({
        assinafyStatus: 'pending_signature', // Ou o status que a API do Assinafy indicar como inicial para assignments
        status: 'pending_assinaturas', // Nosso status interno
        assinafySignatureRequestId: assinafySignatureRequestId,
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, ourContractId));

    return NextResponse.json({
        message: 'Solicitação de assinaturas enviada com sucesso via Assinafy!',
        assinafySignatureRequestId,
        ourContractStatus: 'pending_assinaturas'
    }, { status: 200 });

  } catch (error: any) {
    console.error(`Erro ao solicitar assinaturas para o contrato ID ${ourContractId}:`, error);
    return NextResponse.json({ error: error.message || 'Erro interno do servidor.' }, { status: 500 });
  }
}
