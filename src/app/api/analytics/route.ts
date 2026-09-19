import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";

const TIMEZONE = "America/Sao_Paulo";

function getLocalDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // "YYYY-MM-DD"
}

function getLocalHour(date: Date): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    hour12: false,
  }).format(date);
  const h = parseInt(hourStr, 10);
  return h === 24 ? 0 : h;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
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

    // Validação anti-IDOR estrita para qrCodeId específico
    if (qrCodeId) {
      const qrOwned = await prisma.qRCode.findFirst({
        where: { id: qrCodeId, userId: session.id, deletedAt: null },
        select: { id: true },
      });
      if (!qrOwned) {
        return NextResponse.json(
          { error: "QR Code não encontrado ou não pertence ao usuário." },
          { status: 404 }
        );
      }
    }

    // Cálculo das janelas de tempo (Período Atual e Período Anterior com duração idêntica)
    const now = new Date();
    let startDate: Date;
    let previousStartDate: Date;
    let daysCount = 30;

    if (period === "today") {
      // Início do dia de hoje no fuso horário local
      const todayKey = getLocalDateKey(now);
      const [year, month, day] = todayKey.split("-").map(Number);
      startDate = new Date(Date.UTC(year, month - 1, day, 3, 0, 0)); // 00:00 BRT = 03:00 UTC
      previousStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
      daysCount = 1;
    } else if (period === "7d") {
      daysCount = 7;
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      previousStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    } else if (period === "30d") {
      daysCount = 30;
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      previousStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    } else if (period === "90d") {
      daysCount = 90;
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      previousStartDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    } else if (period === "12m") {
      daysCount = 365;
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      previousStartDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
    } else {
      daysCount = 30;
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      previousStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    }

    // Filtrar estritamente pelos QR Codes do usuário autenticado (Anti-IDOR)
    const userQrs = await prisma.qRCode.findMany({
      where: {
        userId: session.id,
        deletedAt: null,
        ...(qrCodeId ? { id: qrCodeId } : {}),
      },
      select: { id: true, name: true, type: true, scanCount: true, status: true, lastScanAt: true },
    });

    const qrIds = userQrs.map((q) => q.id);

    // Consulta de scans do período atual e contagem do período anterior
    const [scans, previousScansCount] = await Promise.all([
      qrIds.length > 0
        ? prisma.qRCodeScan.findMany({
            where: {
              qrCodeId: { in: qrIds },
              timestamp: { gte: startDate, lte: now },
            },
            orderBy: { timestamp: "asc" },
          })
        : Promise.resolve([]),
      qrIds.length > 0
        ? prisma.qRCodeScan.count({
            where: {
              qrCodeId: { in: qrIds },
              timestamp: { gte: previousStartDate, lt: startDate },
            },
          })
        : Promise.resolve(0),
    ]);

    // 1. Agrupamento cronológico (Timeline) com garantia de reconciliação total
    const timelineMap = new Map<string, number>();

    if (period === "today") {
      for (let h = 0; h < 24; h++) {
        const hourKey = `${h.toString().padStart(2, "0")}:00`;
        timelineMap.set(hourKey, 0);
      }
      scans.forEach((s) => {
        const h = getLocalHour(new Date(s.timestamp));
        const hourKey = `${h.toString().padStart(2, "0")}:00`;
        timelineMap.set(hourKey, (timelineMap.get(hourKey) || 0) + 1);
      });
    } else {
      // Cria todos os dias do intervalo ordenadamente
      const cur = new Date(startDate);
      while (cur <= now) {
        const key = getLocalDateKey(cur);
        if (!timelineMap.has(key)) {
          timelineMap.set(key, 0);
        }
        cur.setDate(cur.getDate() + 1);
      }
      const todayKey = getLocalDateKey(now);
      if (!timelineMap.has(todayKey)) {
        timelineMap.set(todayKey, 0);
      }

      // Preenche scans garantindo que todo scan seja indexado
      scans.forEach((s) => {
        const key = getLocalDateKey(new Date(s.timestamp));
        if (!timelineMap.has(key)) {
          timelineMap.set(key, 0);
        }
        timelineMap.set(key, (timelineMap.get(key) || 0) + 1);
      });
    }

    const timeline = Array.from(timelineMap.entries()).map(([dateKey, scansCount]) => ({
      date: period === "today" ? dateKey : dateKey.substring(5).replace("-", "/"),
      scans: scansCount,
    }));

    // 2. Métricas do período atual
    const totalScans = scans.length;
    const dailyAverage = Number((totalScans / (daysCount || 1)).toFixed(1));

    let maxDayScans = 0;
    let maxDayDate: string | null = null;

    if (totalScans > 0) {
      if (period === "today") {
        timelineMap.forEach((cnt, hKey) => {
          if (cnt > maxDayScans) {
            maxDayScans = cnt;
            maxDayDate = `às ${hKey}`;
          }
        });
      } else {
        timelineMap.forEach((cnt, dKey) => {
          if (cnt > maxDayScans) {
            maxDayScans = cnt;
            const [y, m, d] = dKey.split("-");
            maxDayDate = `${d}/${m}/${y}`;
          }
        });
      }
    }

    // 3. Cálculo matemático real do comparativo vs período anterior (sem mocks)
    let growthPercentage: number | null = null;
    let growthStatus: "positive" | "negative" | "neutral" | "no_previous_data" = "neutral";
    let growthLabel = "Sem variação (0 acessos)";

    if (previousScansCount > 0) {
      const diff = totalScans - previousScansCount;
      growthPercentage = Number(((diff / previousScansCount) * 100).toFixed(1));
      if (growthPercentage > 0) {
        growthStatus = "positive";
        growthLabel = `+${growthPercentage}% vs período anterior`;
      } else if (growthPercentage < 0) {
        growthStatus = "negative";
        growthLabel = `${growthPercentage}% vs período anterior`;
      } else {
        growthStatus = "neutral";
        growthLabel = "0.0% vs período anterior";
      }
    } else if (totalScans > 0) {
      growthPercentage = null;
      growthStatus = "no_previous_data";
      growthLabel = "Sem dados no período anterior";
    } else {
      growthPercentage = 0;
      growthStatus = "neutral";
      growthLabel = "Sem variação (0 acessos)";
    }

    // 4. Distribuição por Dispositivo (Telemetria Real)
    const deviceCounts: Record<string, number> = {};
    scans.forEach((s) => {
      const dev = s.device || "Outro";
      deviceCounts[dev] = (deviceCounts[dev] || 0) + 1;
    });
    const deviceData = Object.entries(deviceCounts).map(([name, value]) => ({ name, value }));

    // 5. Distribuição por Sistema Operacional (Telemetria Real)
    const osCounts: Record<string, number> = {};
    scans.forEach((s) => {
      const os = s.os || "Outro";
      osCounts[os] = (osCounts[os] || 0) + 1;
    });
    const osData = Object.entries(osCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 6. Distribuição por Navegador (Telemetria Real)
    const browserCounts: Record<string, number> = {};
    scans.forEach((s) => {
      const b = s.browser || "Outro";
      browserCounts[b] = (browserCounts[b] || 0) + 1;
    });
    const browserData = Object.entries(browserCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 7. Mapa de calor de horários (00h às 23h) no fuso local
    const hourlyDistribution = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, "0")}h`,
      scans: 0,
    }));
    scans.forEach((s) => {
      const h = getLocalHour(new Date(s.timestamp));
      if (h >= 0 && h < 24) {
        hourlyDistribution[h].scans += 1;
      }
    });

    // 8. Top QR Codes acessados
    const topQRs = [...userQrs]
      .sort((a, b) => b.scanCount - a.scanCount)
      .slice(0, 5);

    return NextResponse.json({
      metrics: {
        totalScans,
        dailyAverage,
        maxDayScans,
        maxDayDate,
        previousScansCount,
        growthPercentage,
        growthStatus,
        growthLabel,
        // Ausência comprovada de infraestrutura de conversão pós-scan
        conversionRate: null,
        conversionStatus: "not_configured",
        conversionLabel: "Sem metas de conversão configuradas",
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
