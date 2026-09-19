import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, isSubscriptionActive } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const [userContext, availablePlans] = await Promise.all([
      getUserPlanAndUsage(session.id),
      prisma.plan.findMany({
        orderBy: { priceMonth: "asc" },
        select: {
          id: true,
          name: true,
          displayName: true,
          priceMonth: true,
          priceYear: true,
          maxQRCodes: true,
          dynamicQRs: true,
          analytics: true,
          exportSvg: true,
          exportPdf: true,
          customLogo: true,
          campaigns: true,
        },
      }),
    ]);

    if (!userContext) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const sub = userContext.subscription;
    const isActive = isSubscriptionActive(sub);

    return NextResponse.json({
      plan: userContext.plan,
      availablePlans,
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            gateway: sub.gateway,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            canceledAt: sub.canceledAt,
            isActive,
            hasCustomerPortal: Boolean(sub.gatewayCustomerId),
          }
        : null,
      usage: {
        qrCodes: userContext.qrCodeCount,
        maxQRCodes: userContext.plan?.maxQRCodes || 5,
        remainingQRCodes: Math.max(0, (userContext.plan?.maxQRCodes || 5) - userContext.qrCodeCount),
      },
    });
  } catch (error: any) {
    console.error("Erro ao obter detalhes da assinatura:", error);
    return NextResponse.json(
      { error: "Falha ao consultar assinatura." },
      { status: 500 }
    );
  }
}
