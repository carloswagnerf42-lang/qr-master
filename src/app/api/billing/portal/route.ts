import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createBillingPortalSession } from "@/lib/stripe";
import { getAppUrl } from "@/lib/app-url";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(session.id, "portal");
    if (!rateLimit.allowed) {
      return createRateLimitResponse("portal", rateLimit.retryAfter, rateLimit.resetAt);
    }

    // Defesa server-side: checa gateway e customerId antes de qualquer chamada à Stripe
    const sub = await prisma.subscription.findUnique({
      where: { userId: session.id },
    });

    if (!sub) {
      return NextResponse.json(
        { error: "Nenhuma assinatura localizada para esta conta." },
        { status: 404 }
      );
    }

    if (sub.gateway !== "stripe") {
      return NextResponse.json(
        {
          error: "O portal de autoatendimento Stripe está disponível apenas para assinaturas contratadas via Stripe. Para planos Mercado Pago, gerencie sua assinatura pelas opções do Mercado Pago.",
          gateway: sub.gateway,
        },
        { status: 400 }
      );
    }

    if (!sub.gatewayCustomerId || typeof sub.gatewayCustomerId !== "string" || !sub.gatewayCustomerId.trim()) {
      return NextResponse.json(
        { error: "Identificador de cliente Stripe não localizado para esta conta." },
        { status: 400 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Gateway Stripe não configurado neste ambiente." },
        { status: 503 }
      );
    }

    const appUrl = getAppUrl();
    const returnUrl = `${appUrl}/settings?tab=plan`;

    const { url } = await createBillingPortalSession(session.id, returnUrl);

    return NextResponse.json({ portalUrl: url });
  } catch (error: any) {
    console.error("Erro ao gerar sessão do portal de faturamento:", error);
    return NextResponse.json(
      { error: "Falha ao acessar o portal de faturamento." },
      { status: 500 }
    );
  }
}
