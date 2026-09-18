import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { id } = await req.json();

    const qr = await prisma.qRCode.findFirst({
      where: { id, userId: session.id },
    });

    if (!qr) return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });

    await prisma.qRCode.update({
      where: { id },
      data: { deletedAt: null },
    });

    await prisma.activityLog.create({
      data: {
        userId: session.id,
        action: "RESTORE_QR",
        entityId: qr.id,
        description: `QR Code "${qr.name}" foi restaurado da lixeira.`,
      },
    });

    return NextResponse.json({ success: true, message: "QR Code restaurado com sucesso." });
  } catch (error) {
    console.error("Erro ao restaurar:", error);
    return NextResponse.json({ error: "Erro ao restaurar QR Code" }, { status: 500 });
  }
}
