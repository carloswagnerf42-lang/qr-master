import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { restoreUserQRCode, QRCodeNotFoundError } from "@/lib/qr-service";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { id } = await req.json();

    const qr = await prisma.qRCode.findFirst({
      where: { id, userId: session.id },
    });

    if (!qr) return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });

    const restored = await restoreUserQRCode({
      qrId: id,
      userId: session.id,
    });

    await prisma.activityLog.create({
      data: {
        userId: session.id,
        action: "RESTORE_QR",
        entityId: restored.id,
        description: `QR Code "${restored.name}" foi restaurado da lixeira.`,
      },
    });

    return NextResponse.json({ success: true, message: "QR Code restaurado com sucesso." });
  } catch (error: any) {
    if (error?.status === 404 || error instanceof QRCodeNotFoundError) {
      return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });
    }
    console.error("Erro ao restaurar:", error);
    return NextResponse.json({ error: "Erro ao restaurar QR Code" }, { status: 500 });
  }
}
