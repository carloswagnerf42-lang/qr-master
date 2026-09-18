import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.success) return auth.errorResponse;
    const admin = auth.admin;

    const qrCodeId = params.id;
    if (!qrCodeId) {
      return NextResponse.json({ error: "ID do QR Code não especificado." }, { status: 400 });
    }

    const qr = await prisma.qRCode.findUnique({
      where: { id: qrCodeId },
      include: { user: true },
    });

    if (!qr) {
      return NextResponse.json({ error: "QR Code não encontrado." }, { status: 404 });
    }

    const body = await req.json();
    const { status } = body;

    if (status !== "ACTIVE" && status !== "INACTIVE") {
      return NextResponse.json(
        { error: "Status inválido. Permitido: 'ACTIVE' ou 'INACTIVE'." },
        { status: 400 }
      );
    }

    const updated = await prisma.qRCode.update({
      where: { id: qrCodeId },
      data: { status },
    });

    await logAdminAction({
      adminId: admin.id,
      action: status === "ACTIVE" ? "ADMIN_ACTIVATE_QR" : "ADMIN_DEACTIVATE_QR",
      entityId: qr.id,
      description: `QR Code "${qr.name}" (${qr.id}) do usuário "${qr.user.name}" foi ${status === "ACTIVE" ? "ativado" : "desativado"} pelo Administrador (${admin.name}).`,
    });

    return NextResponse.json({
      success: true,
      message: `QR Code ${status === "ACTIVE" ? "ativado" : "desativado"} com sucesso.`,
      qrCode: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error("Erro ao alterar status de QR Code pelo admin:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao alterar QR Code." },
      { status: 500 }
    );
  }
}
