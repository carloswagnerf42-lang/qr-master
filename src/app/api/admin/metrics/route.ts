import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.success) return auth.errorResponse;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsers30d,
      newUsers7d,
      totalQRs,
      activeQRs,
      inactiveQRs,
      qrs30d,
      totalScans,
      scans30d,
      totalCampaigns,
      plansWithCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.qRCode.count({ where: { deletedAt: null } }),
      prisma.qRCode.count({ where: { status: "ACTIVE", deletedAt: null } }),
      prisma.qRCode.count({ where: { status: "INACTIVE", deletedAt: null } }),
      prisma.qRCode.count({ where: { createdAt: { gte: thirtyDaysAgo }, deletedAt: null } }),
      prisma.qRCodeScan.count(),
      prisma.qRCodeScan.count({ where: { timestamp: { gte: thirtyDaysAgo } } }),
      prisma.campaign.count(),
      prisma.plan.findMany({
        select: {
          id: true,
          name: true,
          displayName: true,
          priceMonth: true,
          priceYear: true,
          _count: { select: { users: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      metrics: {
        users: {
          total: totalUsers,
          newLast30Days: newUsers30d,
          newLast7Days: newUsers7d,
          planDistribution: plansWithCount.map((p) => ({
            id: p.id,
            name: p.name,
            displayName: p.displayName,
            priceMonth: p.priceMonth,
            priceYear: p.priceYear,
            userCount: p._count.users,
          })),
        },
        qrcodes: {
          total: totalQRs,
          active: activeQRs,
          inactive: inactiveQRs,
          createdLast30Days: qrs30d,
        },
        scans: {
          total: totalScans,
          last30Days: scans30d,
        },
        campaigns: {
          total: totalCampaigns,
        },
      },
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Erro ao buscar métricas administrativas:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao coletar métricas do SaaS." },
      { status: 500 }
    );
  }
}
