import { NextRequest, NextResponse } from "next/server";
import { getSession, verifyPassword, clearSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUserStorageFolder } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const body = await req.json();
    const { password, confirmationText } = body;

    if (!password) {
      return NextResponse.json(
        { error: "A senha atual é obrigatória para confirmar a exclusão da conta." },
        { status: 400 }
      );
    }

    if (confirmationText !== "EXCLUIR") {
      return NextResponse.json(
        { error: "Digite a palavra 'EXCLUIR' exatamente em maiúsculas para confirmar a exclusão definitiva." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, role: true, passwordHash: true, name: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Senha incorreta. Não foi possível validar sua identidade." },
        { status: 400 }
      );
    }

    // Salvaguarda: Impede a exclusão do único administrador da plataforma
    if (user.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return NextResponse.json(
          {
            error:
              "Operação bloqueada: não é permitido excluir o único administrador da plataforma. Promova outro administrador antes de prosseguir.",
          },
          { status: 400 }
        );
      }
    }

    // 1. Limpeza de arquivos físicos e do Supabase Storage
    await deleteUserStorageFolder(session.id);

    // 2. Exclusão ordenada de todas as relações no banco de dados via transação
    await prisma.$transaction(async (tx) => {
      // Scans dos QR Codes
      const userQrs = await tx.qRCode.findMany({
        where: { userId: session.id },
        select: { id: true },
      });
      const qrIds = userQrs.map((q) => q.id);
      if (qrIds.length > 0) {
        await tx.qRCodeScan.deleteMany({ where: { qrCodeId: { in: qrIds } } });
      }

      // Arquivos gerados
      await tx.generatedFile.deleteMany({ where: { userId: session.id } });

      // QR Codes
      await tx.qRCode.deleteMany({ where: { userId: session.id } });

      // Campanhas
      await tx.campaign.deleteMany({ where: { userId: session.id } });

      // Categorias
      await tx.category.deleteMany({ where: { userId: session.id } });

      // MultiLinkPages
      await tx.multiLinkPage.deleteMany({ where: { userId: session.id } });

      // Assinatura
      await tx.subscription.deleteMany({ where: { userId: session.id } });

      // Configurações
      await tx.userSettings.deleteMany({ where: { userId: session.id } });

      // Logs de atividade
      await tx.activityLog.deleteMany({ where: { userId: session.id } });

      // Usuário
      await tx.user.delete({ where: { id: session.id } });
    });

    // 3. Invalidação do cookie de sessão
    clearSessionCookie();

    return NextResponse.json({
      success: true,
      message: "Conta e todos os dados associados foram excluídos com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir conta:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao excluir conta." },
      { status: 500 }
    );
  }
}
