import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.success) return auth.errorResponse;
    const admin = auth.admin;

    let deletedCount = {
      users: 0,
      qrCodes: 0,
      scans: 0,
      campaigns: 0,
    };

    // 1. Localiza usuário demo carlos@qrmaster.com se ainda existir
    const demoUser = await prisma.user.findUnique({
      where: { email: "carlos@qrmaster.com" },
    });

    if (demoUser) {
      const userQrs = await prisma.qRCode.findMany({
        where: { userId: demoUser.id },
        select: { id: true },
      });
      const qrIds = userQrs.map((q) => q.id);

      if (qrIds.length > 0) {
        const dScans = await prisma.qRCodeScan.deleteMany({
          where: { qrCodeId: { in: qrIds } },
        });
        deletedCount.scans += dScans.count;
      }

      const dQrs = await prisma.qRCode.deleteMany({ where: { userId: demoUser.id } });
      deletedCount.qrCodes += dQrs.count;

      const dCamp = await prisma.campaign.deleteMany({ where: { userId: demoUser.id } });
      deletedCount.campaigns += dCamp.count;

      await prisma.category.deleteMany({ where: { userId: demoUser.id } });
      await prisma.userSettings.deleteMany({ where: { userId: demoUser.id } });
      await prisma.activityLog.deleteMany({ where: { userId: demoUser.id } });
      await prisma.subscription.deleteMany({ where: { userId: demoUser.id } });
      await prisma.user.delete({ where: { id: demoUser.id } });
      deletedCount.users += 1;
    }

    // 2. Limpa QRs marcados com [DEMO DATA]
    const otherDemoQrs = await prisma.qRCode.findMany({
      where: { name: { contains: "[DEMO DATA]" } },
      select: { id: true },
    });
    if (otherDemoQrs.length > 0) {
      const ids = otherDemoQrs.map((q) => q.id);
      const dScans = await prisma.qRCodeScan.deleteMany({
        where: { qrCodeId: { in: ids } },
      });
      deletedCount.scans += dScans.count;
      const dQrs = await prisma.qRCode.deleteMany({ where: { id: { in: ids } } });
      deletedCount.qrCodes += dQrs.count;
    }

    // 3. Limpa campanhas com [DEMO DATA]
    const otherDemoCamps = await prisma.campaign.deleteMany({
      where: { name: { contains: "[DEMO DATA]" } },
    });
    deletedCount.campaigns += otherDemoCamps.count;

    await logAdminAction({
      adminId: admin.id,
      action: "MAINTENANCE_CLEAN_DEMO",
      description: `Limpeza de dados demo executada: ${deletedCount.users} usuário(s), ${deletedCount.qrCodes} QR(s), ${deletedCount.scans} scan(s), ${deletedCount.campaigns} campanha(s)`,
    });

    return NextResponse.json({
      success: true,
      message: "Limpeza de dados demo executada com sucesso.",
      deletedCount,
    });
  } catch (error) {
    console.error("Erro na limpeza de dados demo:", error);
    return NextResponse.json(
      { error: "Falha ao executar limpeza de dados demo." },
      { status: 500 }
    );
  }
}
