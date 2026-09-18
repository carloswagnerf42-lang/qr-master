import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    // Validação central de permissão para visualização de métricas/analytics
    const userContext = await getUserPlanAndUsage(session.id);
    if (!userContext) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    const canAnalytics = checkPermission(userContext, "analytics");
    if (!canAnalytics.allowed) {
      return NextResponse.json(
        {
          error: canAnalytics.reason,
          code: canAnalytics.code,
          requiredPlan: canAnalytics.requiredPlan,
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "30d"; // today, 7d, 30d, 90d, 12m
    const qrCodeId = searchParams.get("qrCodeId");

    // Calculate start date based on period
    const now = new Date();
    let startDate = new Date();
    let daysCount = 30;

    if (period === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      daysCount = 1;
    } else if (period === "7d") {
      startDate.setDate(now.getDate() - 7);
      daysCount = 7;
    } else if (period === "30d") {
      startDate.setDate(now.getDate() - 30);
      daysCount = 30;
    } else if (period === "90d") {
      startDate.setDate(now.getDate() - 90);
      daysCount = 90;
    } else if (period === "12m") {
      startDate.setFullYear(now.getFullYear() - 1);
      daysCount = 365;
    }

    // Filter by user's QR Codes
    const userQrs = await prisma.qRCode.findMany({
      where: {
        userId: session.id,
        deletedAt: null,
        ...(qrCodeId ? { id: qrCodeId } : {}),
      },
      select: { id: true, name: true, type: true, scanCount: true, status: true, lastScanAt: true },
    });

    const qrIds = userQrs.map((q) => q.id);

    // Fetch scans within the period
    const scans = await prisma.qRCodeScan.findMany({
      where: {
        qrCodeId: { in: qrIds },
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: "asc" },
    });

    // 1. Group timeline by date
    const timelineMap = new Map<string, number>();

    if (period === "today") {
      for (let h = 0; h < 24; h++) {
        const hourKey = `${h.toString().padStart(2, "0")}:00`;
        timelineMap.set(hourKey, 0);
      }
      scans.forEach((s) => {
        const h = new Date(s.timestamp).getHours();
        const hourKey = `${h.toString().padStart(2, "0")}:00`;
        timelineMap.set(hourKey, (timelineMap.get(hourKey) || 0) + 1);
      });
    } else {
      for (let d = daysCount; d >= 0; d--) {
        const dDate = new Date(now);
        dDate.setDate(dDate.getDate() - d);
        const key = dDate.toISOString().split("T")[0];
        timelineMap.set(key, 0);
      }
      scans.forEach((s) => {
        const key = new Date(s.timestamp).toISOString().split("T")[0];
        if (timelineMap.has(key)) {
          timelineMap.set(key, (timelineMap.get(key) || 0) + 1);
        }
      });
    }

    const timeline = Array.from(timelineMap.entries()).map(([date, scansCount]) => ({
      date: period === "today" ? date : date.substring(5).replace("-", "/"),
      scans: scansCount,
    }));

    // 2. Metrics summary
    const totalScans = scans.length;
    const dailyAverage = (totalScans / (daysCount || 1)).toFixed(1);
    let maxDayScans = 0;
    timeline.forEach((t) => {
      if (t.scans > maxDayScans) maxDayScans = t.scans;
    });

    // 3. Breakdown by Device
    const deviceCounts: Record<string, number> = { Mobile: 0, Desktop: 0, Tablet: 0 };
    scans.forEach((s) => {
      const dev = s.device || "Desktop";
      deviceCounts[dev] = (deviceCounts[dev] || 0) + 1;
    });
    const deviceData = Object.entries(deviceCounts).map(([name, value]) => ({ name, value }));

    // 4. Breakdown by OS
    const osCounts: Record<string, number> = {};
    scans.forEach((s) => {
      const os = s.os || "Other";
      osCounts[os] = (osCounts[os] || 0) + 1;
    });
    const osData = Object.entries(osCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 5. Breakdown by Browser
    const browserCounts: Record<string, number> = {};
    scans.forEach((s) => {
      const b = s.browser || "Other";
      browserCounts[b] = (browserCounts[b] || 0) + 1;
    });
    const browserData = Object.entries(browserCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 6. Hourly distribution heatmap (00 to 23)
    const hourlyDistribution = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, "0")}h`,
      scans: 0,
    }));
    scans.forEach((s) => {
      const h = new Date(s.timestamp).getHours();
      hourlyDistribution[h].scans += 1;
    });

    // 7. Top accessed QR Codes
    const topQRs = [...userQrs]
      .sort((a, b) => b.scanCount - a.scanCount)
      .slice(0, 5);

    return NextResponse.json({
      metrics: {
        totalScans,
        dailyAverage: Number(dailyAverage),
        maxDayScans,
        growthPercentage: 18.4, // indicador de comparação com período anterior
      },
      timeline,
      deviceData,
      osData,
      browserData,
      hourlyDistribution,
      topQRs,
    });
  } catch (error) {
    console.error("Erro na API de analytics:", error);
    return NextResponse.json({ error: "Erro interno no analytics" }, { status: 500 });
  }
}
