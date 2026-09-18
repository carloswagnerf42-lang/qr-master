import { NextRequest, NextResponse } from "next/server";
import { verifyStripeWebhookSignature, processStripeWebhookEvent } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Assinatura do webhook ausente (stripe-signature)." },
      { status: 400 }
    );
  }

  try {
    const rawBody = await req.text();

    // 1. Validação Criptográfica de Autenticidade (HMAC-SHA256)
    const event = verifyStripeWebhookSignature(rawBody, signature);

    // 2. Processamento Idempotente do Evento (previne duplicidade)
    const result = await processStripeWebhookEvent(event);

    return NextResponse.json({
      received: true,
      processed: result.processed,
      eventId: event.id,
      reason: result.reason,
    });
  } catch (error: any) {
    console.error("Erro no processamento do webhook da Stripe:", error?.message);
    return NextResponse.json(
      { error: `Webhook error: ${error?.message || "Assinatura inválida ou falha interna."}` },
      { status: 400 }
    );
  }
}
