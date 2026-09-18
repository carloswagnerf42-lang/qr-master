import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import fs from "fs";
import path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
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

    // 2. Se a URL já for externa (ex: Supabase Storage CDN ou Cloud Storage)
    if (file.downloadUrl.startsWith("http://") || file.downloadUrl.startsWith("https://")) {
      return NextResponse.redirect(file.downloadUrl);
    }

    // 3. Se for arquivo no mirror local (dev/fallback)
    let fullFilePath = "";
    if (file.storagePath && file.storagePath.startsWith("users/")) {
      fullFilePath = path.join(process.cwd(), "public", "uploads", "storage", file.storagePath);
    } else if (file.storagePath) {
      fullFilePath = file.storagePath;
    }

    if (fullFilePath && fs.existsSync(fullFilePath)) {
      const fileBuffer = fs.readFileSync(fullFilePath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
          "Content-Length": fileBuffer.length.toString(),
        },
      });
    }

    // Fallback se arquivo físico tiver sido migrado para downloadUrl relativo
    if (file.downloadUrl.startsWith("/")) {
      return NextResponse.redirect(new URL(file.downloadUrl, req.url));
    }

    return NextResponse.json({ error: "Conteúdo do arquivo não localizado no armazenamento." }, { status: 404 });
  } catch (error) {
    console.error("Erro no download autenticado de arquivo:", error);
    return NextResponse.json({ error: "Erro interno ao processar download." }, { status: 500 });
  }
}
