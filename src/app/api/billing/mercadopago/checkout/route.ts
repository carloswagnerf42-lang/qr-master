import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createMercadoPagoPreference,
  createMercadoPagoPixPayment,
  getMercadoPagoConfig,
} from "@/lib/mercadopago";
import { getAppUrl } from "@/lib/app-url";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const config = getMercadoPagoConfig();
    if (!config.isConfigured) {
      return NextResponse.json(
        {
          error:
            "O gateway Mercado Pago ainda não está configurado neste ambiente. Solicite ao administrador a inclusão de MP_ACCESS_TOKEN.",
          configured: false,
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { planName, paymentMethod = "checkout", billingCycle = "month" } = body;

    if (!planName || !["PRO", "BUSINESS"].includes(planName)) {
      return NextResponse.json(
        { error: "Plano inválido para assinatura. Escolha PRO ou BUSINESS." },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();
    const successUrl = `${appUrl}/settings?tab=plan&payment=success&gateway=mercadopago`;
    const cancelUrl = `${appUrl}/settings?tab=plan&payment=canceled&gateway=mercadopago`;

    // 1. Pagamento direto via Pix
    if (paymentMethod === "pix") {
      const pixData = await createMercadoPagoPixPayment({
        userId: session.id,
        userEmail: session.email,
        userName: session.name || "Cliente QR MASTER",
        planName: planName as "PRO" | "BUSINESS",
        billingCycle: billingCycle === "year" ? "year" : "month",
      });

      return NextResponse.json({
        success: true,
        type: "pix",
        ...pixData,
      });
    }

    // 2. Checkout Pro (Pix, Cartão de Crédito, Boleto, etc.)
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
      success: true,
      type: "checkout",
      checkoutUrl: preference.initPoint,
      sandboxUrl: preference.sandboxInitPoint,
      price: preference.price,
      planName: preference.planName,
    });
  } catch (error: any) {
    console.error("Erro no checkout Mercado Pago:", error);
    return NextResponse.json(
      { error: error?.message || "Falha ao processar checkout no Mercado Pago." },
      { status: 500 }
    );
  }
}
