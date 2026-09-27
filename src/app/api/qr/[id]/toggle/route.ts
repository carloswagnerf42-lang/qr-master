import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toggleUserQRCodeStatus, QRCodeNotFoundError } from "@/lib/qr-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { id } = await params;

    const qr = await prisma.qRCode.findFirst({
      where: { id, userId: session.id },
    });

    if (!qr) return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });

    const updated = await toggleUserQRCodeStatus({
      qrId: id,
      userId: session.id,
    });

    return NextResponse.json({ success: true, status: updated.status });
  } catch (error: any) {
    if (error?.status === 404 || error instanceof QRCodeNotFoundError) {
      return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });
    }
    console.error("Erro ao alternar status:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
