import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, computeComparison } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TIMEZONE = "America/Sao_Paulo";

function getLocalDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // "YYYY-MM-DD"
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const now = new Date();
    const todayKey = getLocalDateKey(now);
    const [year, month, day] = todayKey.split("-").map(Number);

    // Início do dia de hoje e de ontem em America/Sao_Paulo (00:00 BRT = 03:00 UTC)
    const todayStart = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    // Janelas de 7 dias e 7 dias anteriores
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Janelas de 30 dias e 30 dias anteriores
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Contexto de plano e ciclo mensal do usuário
    const userContext = await getUserPlanAndUsage(session.id);
    const planMax = userContext?.plan?.maxQRCodes ?? 5;

    const currentMonthStart = userContext?.currentMonthStart ?? new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
    const currentMonthEnd = userContext?.currentMonthEnd ?? new Date(currentMonthStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    const monthDuration = currentMonthEnd.getTime() - currentMonthStart.getTime();
    const previousMonthStart = new Date(currentMonthStart.getTime() - monthDuration);

    const [
      totalQRs,
      activeQRs,
      userQrs,
      recentActivity,
      currentMonthQRs,
      previousMonthQRs,
      currentMonthActiveQRs,
      previousMonthActiveQRs,
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
      prisma.qRCode.count({
        where: { userId: session.id, deletedAt: null, createdAt: { gte: currentMonthStart } },
      }),
      prisma.qRCode.count({
        where: { userId: session.id, deletedAt: null, createdAt: { gte: previousMonthStart, lt: currentMonthStart } },
      }),
      prisma.qRCode.count({
        where: { userId: session.id, status: "ACTIVE", deletedAt: null, createdAt: { gte: currentMonthStart } },
      }),
      prisma.qRCode.count({
        where: { userId: session.id, status: "ACTIVE", deletedAt: null, createdAt: { gte: previousMonthStart, lt: currentMonthStart } },
      }),
    ]);

    const qrIds = userQrs.map((q) => q.id);
    const totalScans = userQrs.reduce((acc, q) => acc + q.scanCount, 0);

    let scansToday = 0;
    let scansYesterday = 0;
    let scans7Days = 0;
    let scansPrev7Days = 0;
    let scans30Days = 0;
    let scansPrev30Days = 0;
    let currentMonthScans = 0;
    let previousMonthScans = 0;

    if (qrIds.length > 0) {
      [
        scansToday,
        scansYesterday,
        scans7Days,
        scansPrev7Days,
        scans30Days,
        scansPrev30Days,
        currentMonthScans,
        previousMonthScans,
      ] = await Promise.all([
        prisma.qRCodeScan.count({
          where: { qrCodeId: { in: qrIds }, timestamp: { gte: todayStart, lte: now } },
        }),
        prisma.qRCodeScan.count({
          where: { qrCodeId: { in: qrIds }, timestamp: { gte: yesterdayStart, lt: todayStart } },
        }),
        prisma.qRCodeScan.count({
          where: { qrCodeId: { in: qrIds }, timestamp: { gte: sevenDaysAgo, lte: now } },
        }),
        prisma.qRCodeScan.count({
          where: { qrCodeId: { in: qrIds }, timestamp: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
        }),
        prisma.qRCodeScan.count({
          where: { qrCodeId: { in: qrIds }, timestamp: { gte: thirtyDaysAgo, lte: now } },
        }),
        prisma.qRCodeScan.count({
          where: { qrCodeId: { in: qrIds }, timestamp: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
        }),
        prisma.qRCodeScan.count({
          where: { qrCodeId: { in: qrIds }, timestamp: { gte: currentMonthStart, lte: now } },
        }),
        prisma.qRCodeScan.count({
          where: { qrCodeId: { in: qrIds }, timestamp: { gte: previousMonthStart, lt: currentMonthStart } },
        }),
      ]);
    }

    const totalQRsComp = computeComparison(currentMonthQRs, previousMonthQRs, "mês anterior");
    const activeQRsComp = computeComparison(currentMonthActiveQRs, previousMonthActiveQRs, "mês anterior");
    const totalScansComp = computeComparison(currentMonthScans, previousMonthScans, "mês anterior");
    const scansTodayComp = computeComparison(scansToday, scansYesterday, "ontem");
    const scans7DaysComp = computeComparison(scans7Days, scansPrev7Days, "semana anterior");
    const scans30DaysComp = computeComparison(scans30Days, scansPrev30Days, "período anterior");

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
          totalQRs: { value: totalQRs, change: totalQRsComp.change, trend: totalQRsComp.trend },
          activeQRs: { value: activeQRs, change: activeQRsComp.change, trend: activeQRsComp.trend },
          totalScans: { value: totalScans, change: totalScansComp.change, trend: totalScansComp.trend },
          scansToday: { value: scansToday, change: scansTodayComp.change, trend: scansTodayComp.trend },
          scans7Days: { value: scans7Days, change: scans7DaysComp.change, trend: scans7DaysComp.trend },
          scans30Days: { value: scans30Days, change: scans30DaysComp.change, trend: scans30DaysComp.trend },
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
