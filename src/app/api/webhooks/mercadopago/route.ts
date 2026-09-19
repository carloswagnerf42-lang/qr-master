import { NextRequest, NextResponse } from "next/server";
import { processMercadoPagoNotification } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const queryId = url.searchParams.get("id") || url.searchParams.get("data.id");

    let paymentId: string | number | null = queryId;

    // Tenta extrair do corpo JSON se não estiver na URL
    try {
      const body = await req.json();
      if (body?.data?.id) {
        paymentId = body.data.id;
      } else if (body?.id) {
        paymentId = body.id;
      }
    } catch {
      // Body pode ser vazio em IPN via querystring
    }

    if (!paymentId) {
      // Responde 200 para testes de ping do Mercado Pago
      return NextResponse.json({ received: true, note: "Sem ID de pagamento no payload" }, { status: 200 });
    }

    const result = await processMercadoPagoNotification(paymentId);

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (error: any) {
    console.error("Erro no processamento do webhook Mercado Pago:", error);
    // Retorna 200 com erro logado para evitar retentativas agressivas de webhook se for erro de payload
    return NextResponse.json(
      { error: error?.message || "Erro ao processar webhook Mercado Pago" },
      { status: 200 }
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const topic = url.searchParams.get("topic");
  const id = url.searchParams.get("id");

  if (topic === "payment" && id) {
    try {
      const result = await processMercadoPagoNotification(id);
      return NextResponse.json({ success: true, ...result }, { status: 200 });
    } catch (error: any) {
      console.error("Erro no processamento IPN GET Mercado Pago:", error);
      return NextResponse.json({ error: error?.message }, { status: 200 });
    }
  }

  return NextResponse.json({ status: "Mercado Pago Webhook Endpoint Ativo" }, { status: 200 });
}
