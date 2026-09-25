import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { downloadFileBuffer } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // 1. Controle de Acesso Estrito: Somente o proprietário do arquivo pode baixar
    const file = await prisma.generatedFile.findFirst({
      where: { id: params.id, userId: session.id },
    });

    if (!file) {
      return NextResponse.json({ error: "Arquivo não encontrado ou acesso não autorizado." }, { status: 404 });
    }

    if (!file.storagePath) {
      return NextResponse.json({ error: "Caminho do arquivo não localizado no registro." }, { status: 404 });
    }

    // 2. Busca os bytes do arquivo no Storage de forma autenticada no servidor
    const result = await downloadFileBuffer(file.storagePath);

    if (!result || !result.buffer || result.buffer.length === 0) {
      return NextResponse.json({ error: "Conteúdo do arquivo não localizado no armazenamento." }, { status: 404 });
    }

    // 3. Sanitização defensiva do Content-Disposition contra CRLF, quotes e header injection
    const rawFileName = file.fileName || `export_${file.id}.${file.fileType || "png"}`;
    const safeAsciiName = rawFileName.replace(/[\r\n";]/g, "_").replace(/[^\x20-\x7E]/g, "_");
    const encodedUtf8Name = encodeURIComponent(rawFileName);
    const contentDisposition = `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUtf8Name}`;

    const effectiveMime = file.mimeType || result.mimeType || "application/octet-stream";

    // 4. Retorna os bytes via stream HTTP com headers de segurança
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": effectiveMime,
        "Content-Disposition": contentDisposition,
        "Content-Length": result.contentLength.toString(),
        "Cache-Control": "private, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Erro no download autenticado de arquivo:", error);
    return NextResponse.json({ error: "Erro interno ao processar download." }, { status: 500 });
  }
}
