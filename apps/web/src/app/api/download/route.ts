// apps/web/src/app/api/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '@clerk/nextjs/server'; // Alterado para auth

// Base directory for uploads, certifique-se que é o mesmo usado no upload
const BASE_UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export async function GET(request: NextRequest) {
  const { userId: clerkUserId } = auth(); // Alterado para auth()

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Não autorizado. Faça login para baixar arquivos.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fileRelativePath = searchParams.get('file'); // ex: /contracts/timestamp-filename.pdf
  const desiredFileName = searchParams.get('filename'); // ex: Contrato Original.pdf

  if (!fileRelativePath) {
    return NextResponse.json({ error: 'Parâmetro "file" é obrigatório.' }, { status: 400 });
  }

  try {
    // Sanitize o caminho para evitar directory traversal
    // path.join irá normalizar, mas é bom ter cuidado extra.
    // O fileRelativePath já deve vir prefixado com o subdiretório correto (ex: /contracts/)
    const safeRelativePath = path.normalize(fileRelativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absoluteFilePath = path.join(BASE_UPLOAD_DIR, safeRelativePath);

    // console.log(`Tentando acessar o arquivo em: ${absoluteFilePath}`);

    // Verificar se o arquivo realmente existe dentro do diretório de uploads esperado
    if (!absoluteFilePath.startsWith(BASE_UPLOAD_DIR)) {
        console.error(`Tentativa de acesso inválida: ${absoluteFilePath} fora de ${BASE_UPLOAD_DIR}`);
        return NextResponse.json({ error: 'Caminho de arquivo inválido.' }, { status: 400 });
    }

    // Verificar se o arquivo existe
    await fs.access(absoluteFilePath);

    const fileBuffer = await fs.readFile(absoluteFilePath);

    const headers = new Headers();
    // Tenta adivinhar o content-type, mas pode ser mais robusto se o fileType estiver no BD e for passado
    // headers.set('Content-Type', 'application/octet-stream'); // Genérico
    // Se você tiver o fileType do banco, use-o:
    // headers.set('Content-Type', contract.fileType || 'application/octet-stream');

    // Para forçar o download, use Content-Disposition
    const finalFileName = desiredFileName || path.basename(absoluteFilePath);
    headers.set('Content-Disposition', `attachment; filename="${finalFileName}"`);
    headers.set('Content-Length', fileBuffer.length.toString());

    return new NextResponse(fileBuffer, { status: 200, headers });

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`Arquivo não encontrado: ${fileRelativePath}`, error);
      return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
    }
    console.error(`Erro ao baixar o arquivo ${fileRelativePath}:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor ao processar o arquivo.' }, { status: 500 });
  }
}
