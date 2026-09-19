import { NextRequest, NextResponse } from "next/server";
import {
  processMercadoPagoNotification,
  getMercadoPagoConfigAsync,
  verifyMercadoPagoSignature,
} from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let topic = url.searchParams.get("topic") || url.searchParams.get("type") || "payment";
    let entityId = url.searchParams.get("id") || url.searchParams.get("data.id");

    // Tenta extrair do corpo JSON se enviado via webhook v1/v2
    try {
      const body = await req.json();
      if (body?.topic) topic = body.topic;
      if (body?.type) topic = body.type;
      if (body?.action?.startsWith("merchant_order")) topic = "merchant_order";
      if (body?.action?.startsWith("payment")) topic = "payment";

      if (body?.data?.id) {
        entityId = body.data.id;
      } else if (body?.id) {
        entityId = body.id;
      } else if (typeof body?.resource === "string") {
        const parts = body.resource.split("/");
        entityId = parts[parts.length - 1];
        if (body.resource.includes("merchant_orders")) topic = "merchant_order";
        if (body.resource.includes("payments")) topic = "payment";
      }
    } catch {
      // Body pode ser vazio em IPN via querystring
    }

    if (!entityId) {
      // Responde 200 para testes de ping do Mercado Pago
      return NextResponse.json({ received: true, note: "Webhook recebido sem ID específico" }, { status: 200 });
    }

    const config = await getMercadoPagoConfigAsync();

    // Verificação de assinatura HMAC SHA-256 quando webhookSecret estiver configurado
    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");
    if (config.webhookSecret && xSignature) {
      const isValid = verifyMercadoPagoSignature({
        xSignature,
        xRequestId,
        dataId: String(entityId),
        secret: config.webhookSecret,
      });
      if (!isValid) {
        console.warn("[MP Webhook] Assinatura x-signature inválida rejeitada.");
        return NextResponse.json({ error: "Assinatura do webhook inválida" }, { status: 401 });
      }
    }

    // Caso 1: Notificação de Merchant Order (Checkout Pro)
    if (topic === "merchant_order" || topic === "order") {
      const config = await getMercadoPagoConfigAsync();
      if (config.isConfigured) {
        try {
          const orderRes = await fetch(`https://api.mercadopago.com/merchant_orders/${entityId}`, {
            headers: { Authorization: `Bearer ${config.accessToken}` },
          });
          if (orderRes.ok) {
            const orderData = await orderRes.json();
            if (Array.isArray(orderData.payments)) {
              for (const p of orderData.payments) {
                if (p.id) {
                  await processMercadoPagoNotification(p.id);
                }
              }
            }
          }
        } catch (orderErr) {
          console.error("Erro ao consultar merchant_order:", orderErr);
        }
      }
      return NextResponse.json({ success: true, type: "merchant_order", id: entityId }, { status: 200 });
    }

    // Caso 2: Notificação de Pagamento (Pix ou Cartão)
    const result = await processMercadoPagoNotification(entityId);
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
