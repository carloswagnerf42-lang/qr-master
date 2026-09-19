import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createBillingCheckoutSession } from "@/lib/stripe";
import { getAppUrl } from "@/lib/app-url";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json();
    const { planName, billingCycle } = body;

    if (!planName || !["PRO", "BUSINESS"].includes(planName)) {
      return NextResponse.json(
        { error: "Plano inválido para assinatura. Escolha PRO ou BUSINESS." },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();
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

    return NextResponse.json({ checkoutUrl: url });
  } catch (error: any) {
    console.error("Erro ao criar sessão de checkout:", error);
    return NextResponse.json(
      { error: error?.message || "Falha ao iniciar processo de pagamento." },
      { status: 500 }
    );
  }
}
