import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createBillingCheckoutSession } from "@/lib/stripe";
import {
  createMercadoPagoPreference,
  createMercadoPagoPixPayment,
  getMercadoPagoConfigAsync,
} from "@/lib/mercadopago";
import { getAppUrl } from "@/lib/app-url";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // Rate Limiting financeiro por usuário
    const rateLimit = await checkRateLimit(session.id, "checkout");
    if (!rateLimit.allowed) {
      return createRateLimitResponse("checkout", rateLimit.retryAfter, rateLimit.resetAt);
    }

    const body = await req.json();
    const { planName, billingCycle, gateway, paymentMethod, cpf } = body;

    if (!planName || !["PRO", "BUSINESS"].includes(planName)) {
      return NextResponse.json(
        { error: "Plano inválido para assinatura. Escolha PRO ou BUSINESS." },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();
    const mpConfig = await getMercadoPagoConfigAsync();
    const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.trim() !== "");

    // 0. Pagamento direto via Pix
    if (paymentMethod === "pix") {
      if (!mpConfig.isConfigured) {
        return NextResponse.json(
          {
            error:
              "O gateway Mercado Pago não está configurado para pagamentos Pix. Adicione o Access Token no Painel de Admin.",
            configured: false,
          },
          { status: 503 }
        );
      }

      try {
        const pixData = await createMercadoPagoPixPayment({
          userId: session.id,
          userEmail: session.email,
          userName: session.name || "Cliente QR MASTER",
          planName: planName as "PRO" | "BUSINESS",
          billingCycle: billingCycle === "year" ? "year" : "month",
          cpf,
        });

        return NextResponse.json({
          success: true,
          type: "pix",
          ...pixData,
        });
      } catch (pixErr: any) {
        return NextResponse.json(
          {
            error: pixErr.message || "Falha ao gerar Pix Mercado Pago.",
            code: pixErr.code || undefined,
            isPixKeyMissing: Boolean(pixErr.isPixKeyMissing),
            canFallbackToCheckoutPro: true,
          },
          { status: 400 }
        );
      }
    }

    // 1. Prioriza Mercado Pago se solicitado ou se Stripe não estiver configurado (a menos que stripe tenha sido expressamente solicitado)
    if (gateway !== "stripe" && (gateway === "mercadopago" || paymentMethod === "card" || !hasStripe) && mpConfig.isConfigured) {
      const successUrl = `${appUrl}/settings?tab=plan&payment=success&gateway=mercadopago`;
      const cancelUrl = `${appUrl}/settings?tab=plan&payment=canceled&gateway=mercadopago`;

      const preference = await createMercadoPagoPreference({
        userId: session.id,
        userEmail: session.email,
        userName: session.name || "Cliente QR MASTER",
        planName: planName as "PRO" | "BUSINESS",
        billingCycle: billingCycle === "year" ? "year" : "month",
        successUrl,
        cancelUrl,
        preferredPaymentMethod: paymentMethod === "card" ? "card" : "all",
      });

      return NextResponse.json({
        checkoutUrl: preference.initPoint,
        gateway: "mercadopago",
        preferenceId: preference.preferenceId,
      });
    }

    // 2. Se Stripe estiver configurado
    if (hasStripe && gateway !== "mercadopago") {
      const successUrl = `${appUrl}/settings?tab=plan&status=success`;
      const cancelUrl = `${appUrl}/settings?tab=plan&status=canceled`;

      const { url } = await createBillingCheckoutSession({
        userId: session.id,
        userEmail: session.email,
        userName: session.name || "Cliente QR MASTER",
        planName: planName as "PRO" | "BUSINESS",
        billingCycle: billingCycle === "year" ? "year" : "month",
        successUrl,
        cancelUrl,
      });

      return NextResponse.json({ checkoutUrl: url, gateway: "stripe" });
    }

    // 3. Nenhum gateway configurado ainda
    return NextResponse.json(
      {
        error:
          "Os gateways de pagamento (Mercado Pago / Stripe) aguardam a inclusão das credenciais no painel de variáveis da Vercel (MP_ACCESS_TOKEN ou STRIPE_SECRET_KEY). Para assinar agora mesmo, entre em contato com o suporte ou administrador.",
        configured: false,
      },
      { status: 503 }
    );
  } catch (error: any) {
    console.error("Erro ao criar sessão de checkout:", error);
    return NextResponse.json(
      { error: error?.message || "Falha ao iniciar processo de pagamento." },
      { status: 500 }
    );
  }
}
