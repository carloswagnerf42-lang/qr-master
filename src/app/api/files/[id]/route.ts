import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { deleteFile } from "@/lib/storage";
import fs from "fs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const file = await prisma.generatedFile.findFirst({
      where: { id: params.id, userId: session.id },
    });

    if (!file) {
      return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    }

    // Delete file from Storage (Supabase Storage or structured storage mirror)
    if (file.storagePath) {
      if (file.storagePath.startsWith("users/")) {
        await deleteFile(file.storagePath, session.id);
      } else if (fs.existsSync(file.storagePath)) {
        // Legacy file fallback cleanup
        try {
          fs.unlinkSync(file.storagePath);
        } catch (err) {
          console.warn("Falha ao remover arquivo legado:", err);
        }
      }
    }

    // Delete database record
    await prisma.generatedFile.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: "Arquivo removido com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir arquivo:", error);
    return NextResponse.json({ error: "Erro interno ao excluir arquivo." }, { status: 500 });
  }
}
