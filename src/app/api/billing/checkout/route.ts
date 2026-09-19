import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createBillingCheckoutSession } from "@/lib/stripe";
import { createMercadoPagoPreference, getMercadoPagoConfigAsync } from "@/lib/mercadopago";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json();
    const { planName, billingCycle, gateway } = body;

    if (!planName || !["PRO", "BUSINESS"].includes(planName)) {
      return NextResponse.json(
        { error: "Plano inválido para assinatura. Escolha PRO ou BUSINESS." },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();
    const mpConfig = await getMercadoPagoConfigAsync();
    const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.trim() !== "");

    // 1. Prioriza Mercado Pago se solicitado ou se Stripe não estiver configurado mas MP estiver
    if ((gateway === "mercadopago" || (!hasStripe && mpConfig.isConfigured)) && mpConfig.isConfigured) {
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
