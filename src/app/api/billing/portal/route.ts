import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createBillingPortalSession } from "@/lib/stripe";
import { getAppUrl } from "@/lib/app-url";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const rateLimit = checkRateLimit(session.id, "portal");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitas requisições ao portal de faturamento. Por favor, aguarde alguns minutos." },
        { status: 429 }
      );
    }

    const appUrl = getAppUrl();
    const returnUrl = `${appUrl}/settings?tab=plan`;

    const { url } = await createBillingPortalSession(session.id, returnUrl);

    return NextResponse.json({ portalUrl: url });
  } catch (error: any) {
    console.error("Erro ao gerar sessão do portal de faturamento:", error);
    return NextResponse.json(
      { error: error?.message || "Falha ao acessar o portal de faturamento." },
      { status: 500 }
    );
  }
}
