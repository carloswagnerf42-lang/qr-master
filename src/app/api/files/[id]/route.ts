import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { deleteUserGeneratedFile, FileNotFoundError } from "@/lib/file-service";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(req);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const file = await prisma.generatedFile.findFirst({
      where: { id: params.id, userId: session.id },
    });

    if (!file) {
      return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    }

    await deleteUserGeneratedFile({
      fileId: params.id,
      userId: session.id,
    });

    return NextResponse.json({ success: true, message: "Arquivo removido com sucesso." });
  } catch (error: any) {
    if (error?.status === 404 || error instanceof FileNotFoundError) {
      return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    }
    console.error("Erro ao excluir arquivo:", error);
    return NextResponse.json({ error: "Erro interno ao excluir arquivo." }, { status: 500 });
  }
}
