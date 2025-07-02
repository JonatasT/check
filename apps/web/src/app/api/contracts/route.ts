// apps/web/src/app/api/contracts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contracts, users } from '@/lib/db/schema'; // users importado
import { eq, and } from 'drizzle-orm'; // and importado
import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '@clerk/nextjs/server'; // Alterado para auth

// Certifique-se de que o diretório de uploads existe
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'contracts');

async function ensureUploadDirExists() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch (error) {
    // Se não existir, cria recursivamente
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    console.log(`Diretório de uploads criado: ${UPLOAD_DIR}`);
  }
}

// GET: Listar contratos
export async function GET(request: NextRequest) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado. Faça login para ver os contratos.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventIdParam = searchParams.get('eventId');

  try {
    // Não é mais necessário buscar userRecord se uploadedByUserId no schema contracts armazena o clerkUserId.
    // Se uploadedByUserId fosse uma FK para users.id serial, aí sim precisaria.
    // Assumindo que contracts.uploadedByUserId armazena o clerkUserId.

    const queryConditions = [eq(contracts.uploadedByUserId, clerkUserId)]; // Sempre filtra pelo usuário logado

    if (eventIdParam) {
      const eventId = parseInt(eventIdParam, 10);
      if (!isNaN(eventId)) {
        queryConditions.push(eq(contracts.eventId, eventId));
      } else {
        // Se eventIdParam for fornecido mas inválido, pode retornar erro ou ignorar o filtro.
        // Por ora, vamos ignorar um eventId inválido se ele for o único filtro adicional.
        // Se fosse um filtro mandatório, deveria retornar 400.
      }
    }

    const allContracts = await db
      .select()
      .from(contracts)
      .where(and(...queryConditions)) // Usa and() para combinar todas as condições
      .orderBy(contracts.createdAt);

    return NextResponse.json({ contracts: allContracts }, { status: 200 });

  } catch (error) {
    console.error('Erro ao buscar contratos:', error);
    return NextResponse.json({ error: 'Erro interno do servidor ao buscar contratos' }, { status: 500 });
  }
}


// POST: Upload de novo contrato/documento
export async function POST(request: NextRequest) {
  await ensureUploadDirExists(); // Garante que o diretório existe

  const { userId: clerkUserId } = getAuth(request);

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado. Faça login para fazer upload.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string | null;
    const eventId = formData.get('eventId') as string | null; // Pode ser string ou null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: 'Título é obrigatório.' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const originalFileName = file.name;
    const fileType = file.type;
    const fileSize = file.size;

    // Crie um nome de arquivo único para evitar sobrescritas (ex: timestamp + nome original)
    const uniqueFileName = `${Date.now()}-${originalFileName.replace(/\s+/g, '_')}`;
    const filePath = path.join(UPLOAD_DIR, uniqueFileName);

    // Salvar o arquivo no sistema de arquivos local
    await fs.writeFile(filePath, fileBuffer);
    console.log(`Arquivo salvo em: ${filePath}`);

    // Salvar metadados no banco de dados
    const newContractData = {
      title,
      fileName: originalFileName,
      fileType,
      fileSize,
      filePath: `/uploads/contracts/${uniqueFileName}`, // Caminho relativo para acesso futuro ou identificador
      uploadedByUserId: clerkUserId, // Armazena o Clerk ID diretamente
      eventId: eventId ? parseInt(eventId, 10) : undefined,
      status: 'uploaded', // Status inicial
    };

    // @ts-ignore // Drizzle pode ter problemas com 'undefined' para campos opcionais, mas deve funcionar
    const [newContract] = await db.insert(contracts).values(newContractData).returning();

    return NextResponse.json({ message: 'Arquivo enviado com sucesso!', contract: newContract }, { status: 201 });

  } catch (error) {
    console.error('Erro ao fazer upload do arquivo:', error);
    // @ts-ignore
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro interno do servidor: ${errorMessage}` }, { status: 500 });
  }
}

// TODO: Implementar DELETE /api/contracts/[id] (em um arquivo [id]/route.ts)
// - Remover o arquivo do sistema de arquivos
// - Remover o registro do banco de dados
// TODO: Implementar GET /api/contracts/[id]/download (em um arquivo [id]/download/route.ts ou similar)
// - Para permitir o download seguro dos arquivos.
