// apps/web/src/app/api/contracts/[id]/send-to-assinafy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contracts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { promises as fs } from 'fs';
import path from 'path';
import { getAuth } from '@clerk/nextjs/server';
import FormData from 'form-data'; // Para construir o corpo multipart/form-data
import fetch from 'node-fetch'; // Para fazer a requisição HTTP, pois o fetch nativo do Next.js pode ter nuances com FormData em Route Handlers

const BASE_UPLOAD_DIR = path.join(process.cwd(), 'uploads'); // Onde nossos arquivos estão localmente

interface RouteContext {
  params: {
    id: string; // Nosso ID interno do contrato
  };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = getAuth(request);

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const contractId = parseInt(params.id, 10);
  if (isNaN(contractId)) {
    return NextResponse.json({ error: 'ID do contrato inválido.' }, { status: 400 });
  }

  // Obter credenciais do Assinafy das variáveis de ambiente
  const assinafyApiKey = process.env.ASSINAFY_API_KEY;
  const assinafyAccountId = process.env.ASSINAFY_ACCOUNT_ID;
  const assinafyApiBaseUrl = process.env.ASSINAFY_API_BASE_URL;

  if (!assinafyApiKey || !assinafyAccountId || !assinafyApiBaseUrl) {
    console.error('Credenciais do Assinafy não configuradas no .env');
    return NextResponse.json({ error: 'Configuração do provedor de assinatura incompleta.' }, { status: 500 });
  }

  try {
    // 1. Buscar o contrato no nosso banco de dados
    const [contractDetails] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, contractId))
      .limit(1);

    if (!contractDetails) {
      return NextResponse.json({ error: 'Contrato não encontrado em nosso sistema.' }, { status: 404 });
    }

    // Verificar se o usuário logado tem permissão (ex: é o uploader) - Adapte conforme necessário
    if (contractDetails.uploadedByUserId !== clerkUserId) {
      return NextResponse.json({ error: 'Permissão negada para enviar este contrato.' }, { status: 403 });
    }

    if (contractDetails.assinafyDocumentId) {
      return NextResponse.json({ error: 'Este contrato já foi enviado para o Assinafy.' }, { status: 409 }); // Conflict
    }

    if (!contractDetails.filePath) {
        return NextResponse.json({ error: 'Caminho do arquivo não encontrado para este contrato.' }, { status: 400 });
    }

    // 2. Ler o arquivo do nosso sistema de arquivos
    const absoluteFilePath = path.join(BASE_UPLOAD_DIR, contractDetails.filePath);
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(absoluteFilePath);
    } catch (e) {
      console.error(`Erro ao ler arquivo local ${absoluteFilePath}:`, e);
      return NextResponse.json({ error: 'Falha ao ler o arquivo do contrato localmente.' }, { status: 500 });
    }

    // 3. Montar o FormData para a API do Assinafy
    const formData = new FormData();
    formData.append('file', fileBuffer, contractDetails.fileName); // Passa o buffer e o nome original do arquivo

    // 4. Fazer a requisição para a API do Assinafy
    const assinafyUploadUrl = `${assinafyApiBaseUrl}/accounts/${assinafyAccountId}/documents`;

    let assinafyResponse;
    try {
      assinafyResponse = await fetch(assinafyUploadUrl, {
        method: 'POST',
        headers: {
          'X-Api-Key': assinafyApiKey,
          ...formData.getHeaders(), // Importante para multipart/form-data
        },
        body: formData,
      });
    } catch (fetchError) {
        console.error('Erro na chamada fetch para Assinafy:', fetchError);
        return NextResponse.json({ error: 'Erro de comunicação com o Assinafy.'}, { status: 502 }); // Bad Gateway
    }

    const assinafyData = await assinafyResponse.json();

    if (!assinafyResponse.ok || assinafyData.status !== 200) {
      console.error('Erro na resposta da API Assinafy:', assinafyResponse.status, assinafyData);
      return NextResponse.json(
        { error: `Falha ao enviar documento para Assinafy: ${assinafyData.message || assinafyResponse.statusText}` },
        { status: assinafyResponse.status }
      );
    }

    // 5. Atualizar nosso banco de dados com os dados do Assinafy
    const { id: newAssinafyDocumentId, status: newAssinafyStatus, artifacts } = assinafyData.data;
    const assinafyOriginalUrl = artifacts?.original;

    await db
      .update(contracts)
      .set({
        assinafyDocumentId: newAssinafyDocumentId,
        assinafyStatus: newAssinafyStatus, // ex: "uploaded" ou "metadata_ready"
        assinafyOriginalUrl: assinafyOriginalUrl,
        status: 'pending_signature_setup', // Novo status interno indicando que está no Assinafy, aguardando configuração de signatários
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, contractId));

    return NextResponse.json({
      message: 'Documento enviado com sucesso para o Assinafy!',
      assinafyDocumentId: newAssinafyDocumentId,
      assinafyStatus: newAssinafyStatus,
      ourContractStatus: 'pending_signature_setup'
    }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao processar envio para Assinafy do contrato ID ${contractId}:`, error);
    // @ts-ignore
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro interno do servidor: ${errorMessage}` }, { status: 500 });
  }
}
