import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const [
      totalQRs,
      activeQRs,
      userQrs,
      recentActivity,
    ] = await Promise.all([
      prisma.qRCode.count({ where: { userId: session.id, deletedAt: null } }),
      prisma.qRCode.count({ where: { userId: session.id, status: "ACTIVE", deletedAt: null } }),
      prisma.qRCode.findMany({
        where: { userId: session.id, deletedAt: null },
        select: { id: true, name: true, type: true, scanCount: true, status: true, lastScanAt: true, isDynamic: true, shortCode: true },
        orderBy: { scanCount: "desc" },
      }),
      prisma.activityLog.findMany({
        where: { userId: session.id },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

    const qrIds = userQrs.map((q) => q.id);

    // Scan counts over periods
    const [scansToday, scans7Days, scans30Days, totalScans] = await Promise.all([
      prisma.qRCodeScan.count({
        where: { qrCodeId: { in: qrIds }, timestamp: { gte: todayStart } },
      }),
      prisma.qRCodeScan.count({
        where: { qrCodeId: { in: qrIds }, timestamp: { gte: sevenDaysAgo } },
      }),
      prisma.qRCodeScan.count({
        where: { qrCodeId: { in: qrIds }, timestamp: { gte: thirtyDaysAgo } },
      }),
      userQrs.reduce((acc, q) => acc + q.scanCount, 0),
    ]);

    const userContext = await getUserPlanAndUsage(session.id);
    const planMax = userContext?.plan?.maxQRCodes ?? 5;

    return NextResponse.json(
      {
        userName: session.name,
        plan: {
          name: userContext?.plan?.name || "FREE",
          displayName: userContext?.plan?.displayName || "Plano Grátis",
          maxQRCodes: planMax,
          usedQRCodes: userContext?.qrCodeCount ?? 0,
          totalQRCodes: totalQRs,
          remainingQRCodes: Math.max(0, planMax - (userContext?.qrCodeCount ?? 0)),
          isYearly: Boolean(userContext?.isYearly),
          currentMonthStart: userContext?.currentMonthStart || null,
          currentMonthEnd: userContext?.currentMonthEnd || null,
        },
        cards: {
          totalQRs: { value: totalQRs, change: "+2 este mês", trend: "up" },
          activeQRs: { value: activeQRs, change: `${Math.round((activeQRs / (totalQRs || 1)) * 100)}% ativos`, trend: "up" },
          totalScans: { value: totalScans, change: "+14.2% vs mês anterior", trend: "up" },
          scansToday: { value: scansToday, change: "+8% vs ontem", trend: "up" },
          scans7Days: { value: scans7Days, change: "+19.5% vs semana anterior", trend: "up" },
          scans30Days: { value: scans30Days, change: "+24.8% vs período anterior", trend: "up" },
        },
        topQRs: userQrs.slice(0, 5),
        recentActivity,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("Erro na API do dashboard:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
