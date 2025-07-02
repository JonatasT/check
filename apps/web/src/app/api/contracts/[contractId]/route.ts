// apps/web/src/app/api/contracts/[contractId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contracts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '@clerk/nextjs/server';

const BASE_UPLOAD_DIR = path.join(process.cwd(), 'uploads');

interface RouteContext {
  params: {
    contractId: string; // Alterado de id para contractId
  };
}

// DELETE: Excluir um contrato/documento
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { userId: clerkUserId } = auth();

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado. Faça login para excluir contratos.' }, { status: 401 });
  }

  const contractIdNum = parseInt(params.contractId, 10); // Alterado de params.id para params.contractId

  if (isNaN(contractIdNum)) {
    return NextResponse.json({ error: 'ID do contrato inválido.' }, { status: 400 });
  }

  try {
    // 1. Buscar o registro do contrato no banco para obter o caminho do arquivo
    //    e verificar se o usuário logado tem permissão para excluir (ex: é o uploader)
    const [contractToDelete] = await db
      .select({
        id: contracts.id,
        filePath: contracts.filePath,
        uploadedByUserId: contracts.uploadedByUserId,
      })
      .from(contracts)
      .where(eq(contracts.id, contractIdNum))
      .limit(1);

    if (!contractToDelete) {
      return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 });
    }

    // Verificação de permissão: Somente o usuário que fez o upload pode excluir.
    // Adapte esta lógica se houver outros papéis (ex: admin de evento, admin global).
    if (contractToDelete.uploadedByUserId !== clerkUserId) {
      return NextResponse.json({ error: 'Permissão negada. Você não pode excluir este contrato.' }, { status: 403 });
    }

    // 2. Excluir o arquivo físico do sistema de arquivos
    if (contractToDelete.filePath) {
      const absoluteFilePath = path.join(BASE_UPLOAD_DIR, contractToDelete.filePath);
      try {
        // Verificar se o arquivo realmente existe dentro do diretório de uploads esperado
        if (!absoluteFilePath.startsWith(BASE_UPLOAD_DIR)) {
            console.error(`Tentativa de exclusão de arquivo inválida: ${absoluteFilePath} fora de ${BASE_UPLOAD_DIR}`);
            // Não necessariamente um erro fatal para o DB, mas logar.
        } else {
            await fs.unlink(absoluteFilePath);
            console.log(`Arquivo físico excluído: ${absoluteFilePath}`);
        }
      } catch (fileError: any) {
        // Se o arquivo não existir (ENOENT), podemos prosseguir para excluir do DB.
        // Outros erros podem ser mais problemáticos.
        if (fileError.code !== 'ENOENT') {
          console.error(`Erro ao excluir arquivo físico ${absoluteFilePath}:`, fileError);
          // Você pode decidir se quer parar a operação aqui ou apenas logar e continuar
          // return NextResponse.json({ error: 'Erro ao excluir arquivo físico.' }, { status: 500 });
        } else {
          console.warn(`Arquivo físico não encontrado para exclusão (ENOENT): ${absoluteFilePath}. Prosseguindo com a exclusão do registro no DB.`);
        }
      }
    }

    // 3. Excluir o registro do contrato do banco de dados
    await db.delete(contracts).where(eq(contracts.id, contractIdNum));

    return NextResponse.json({ message: 'Contrato excluído com sucesso.' }, { status: 200 });

  } catch (error) {
    console.error(`Erro ao excluir contrato ID ${contractIdNum}:`, error);
    // @ts-ignore
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro interno do servidor: ${errorMessage}` }, { status: 500 });
  }
}

// TODO: Implementar PUT /api/contracts/[contractId] para atualizar metadados do contrato (ex: título, status)
// O arquivo em si geralmente não é "atualizado", mas sim substituído (novo upload e deleção do antigo).
