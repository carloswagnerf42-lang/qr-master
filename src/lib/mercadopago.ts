import { prisma } from "./db";
import { getAppUrl } from "./app-url";

export interface MercadoPagoConfig {
  isConfigured: boolean;
  accessToken: string;
  publicKey: string;
  webhookSecret?: string;
}

export function getMercadoPagoConfig(): MercadoPagoConfig {
  const accessToken =
    process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || "";
  const publicKey =
    process.env.NEXT_PUBLIC_MP_PUBLIC_KEY || process.env.MERCADOPAGO_PUBLIC_KEY || "";
  const webhookSecret =
    process.env.MP_WEBHOOK_SECRET || process.env.MERCADOPAGO_WEBHOOK_SECRET || "";

  return {
    isConfigured: Boolean(accessToken && accessToken.trim().length > 10),
    accessToken: accessToken.trim(),
    publicKey: publicKey.trim(),
    webhookSecret: webhookSecret.trim(),
  };
}

export interface CreateMPPreferenceParams {
  userId: string;
  userEmail: string;
  userName: string;
  planName: "PRO" | "BUSINESS";
  successUrl?: string;
  cancelUrl?: string;
}

export interface CreateMPPixParams {
  userId: string;
  userEmail: string;
  userName: string;
  planName: "PRO" | "BUSINESS";
}

/**
 * Cria preferência de pagamento no Mercado Pago (Checkout Pro com Pix, Cartão de Crédito e Boleto)
 */
export async function createMercadoPagoPreference(params: CreateMPPreferenceParams) {
  const { userId, userEmail, userName, planName, successUrl, cancelUrl } = params;
  const config = getMercadoPagoConfig();

  if (!config.isConfigured) {
    throw new Error(
      "Mercado Pago não configurado. Adicione a variável MP_ACCESS_TOKEN nas configurações do ambiente."
    );
  }

  // Busca o plano no banco para obter valor oficial dinâmico
  const plan = await prisma.plan.findUnique({ where: { name: planName } });
  if (!plan) {
    throw new Error(`Plano ${planName} não encontrado no sistema.`);
  }

  const price = Number(plan.priceMonth) || (planName === "PRO" ? 39.9 : 99.9);
  const baseUrl = getAppUrl();
  const finalSuccessUrl = successUrl || `${baseUrl}/settings?payment=success&gateway=mercadopago`;
  const finalCancelUrl = cancelUrl || `${baseUrl}/settings?payment=canceled&gateway=mercadopago`;
  const notificationUrl = `${baseUrl}/api/webhooks/mercadopago`;

  const payload = {
    items: [
      {
        id: plan.id,
        title: `QR MASTER - ${plan.displayName} (Mensal)`,
        description: `Acesso completo ao plano ${plan.displayName} na plataforma QR MASTER SaaS`,
        quantity: 1,
        unit_price: price,
        currency_id: "BRL",
      },
    ],
    payer: {
      name: userName,
      email: userEmail,
    },
    back_urls: {
      success: finalSuccessUrl,
      pending: finalSuccessUrl,
      failure: finalCancelUrl,
    },
    auto_return: "approved",
    external_reference: JSON.stringify({
      userId,
      planId: plan.id,
      planName: plan.name,
    }),
    notification_url: notificationUrl,
    statement_descriptor: "QR MASTER",
    payment_methods: {
      excluded_payment_types: [],
      installments: 1,
    },
  };

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error("Erro na API de preferências do Mercado Pago:", errBody);
    throw new Error(`Falha ao gerar checkout Mercado Pago: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    preferenceId: data.id,
    initPoint: data.init_point,
    sandboxInitPoint: data.sandbox_init_point,
    price,
    planName: plan.displayName,
  };
}

/**
 * Cria cobrança instantânea via Pix direto com QR Code e Copia-e-Cola
 */
export async function createMercadoPagoPixPayment(params: CreateMPPixParams) {
  const { userId, userEmail, userName, planName } = params;
  const config = getMercadoPagoConfig();

  if (!config.isConfigured) {
    throw new Error("Mercado Pago não configurado. Configure MP_ACCESS_TOKEN.");
  }

  const plan = await prisma.plan.findUnique({ where: { name: planName } });
  if (!plan) {
    throw new Error(`Plano ${planName} não encontrado.`);
  }

  const price = Number(plan.priceMonth) || (planName === "PRO" ? 39.9 : 99.9);
  const baseUrl = getAppUrl();
  const notificationUrl = `${baseUrl}/api/webhooks/mercadopago`;

  const payload = {
    transaction_amount: price,
    description: `QR MASTER - ${plan.displayName}`,
    payment_method_id: "pix",
    payer: {
      email: userEmail,
      first_name: userName.split(" ")[0] || "Cliente",
      last_name: userName.split(" ").slice(1).join(" ") || "QR MASTER",
    },
    external_reference: JSON.stringify({
      userId,
      planId: plan.id,
      planName: plan.name,
    }),
    notification_url: notificationUrl,
  };

  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `pix_${userId}_${planName}_${Date.now()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error("Erro na criação de Pix Mercado Pago:", errBody);
    throw new Error(`Falha ao gerar Pix Mercado Pago: ${response.statusText}`);
  }

  const data = await response.json();
  const pointOfInteraction = data.point_of_interaction?.transaction_data;

  return {
    paymentId: data.id,
    status: data.status,
    qrCodeText: pointOfInteraction?.qr_code || "",
    qrCodeBase64: pointOfInteraction?.qr_code_base64 || "",
    ticketUrl: pointOfInteraction?.ticket_url || "",
    price,
    planName: plan.displayName,
  };
}

/**
 * Processa notificação webhook do Mercado Pago com idempotência garantida
 */
export async function processMercadoPagoNotification(paymentId: string | number) {
  const config = getMercadoPagoConfig();
  if (!config.isConfigured) {
    throw new Error("Mercado Pago não configurado.");
  }

  const eventKey = `mp_payment_${paymentId}`;

  // 1. Verificação de idempotência estrita
  const existingEvent = await prisma.webhookEvent.findUnique({
    where: {
      eventId: eventKey,
    },
  });

  if (existingEvent && existingEvent.status === "PROCESSED") {
    return { status: "already_processed", eventId: eventKey };
  }

  // 2. Consulta o pagamento na API do Mercado Pago
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Não foi possível consultar pagamento ${paymentId} no Mercado Pago`);
  }

  const payment = await response.json();

  // Registra o evento de webhook
  await prisma.webhookEvent.upsert({
    where: {
      eventId: eventKey,
    },
    create: {
      gateway: "mercadopago",
      eventId: eventKey,
      eventType: `payment.${payment.status}`,
      status: "PROCESSING",
      payload: JSON.stringify(payment),
    },
    update: {
      eventType: `payment.${payment.status}`,
      payload: JSON.stringify(payment),
    },
  });

  // Se o pagamento foi aprovado, ativa o plano do usuário
  if (payment.status === "approved") {
    let metadata: { userId?: string; planId?: string; planName?: string } = {};

    try {
      if (payment.external_reference) {
        metadata = JSON.parse(payment.external_reference);
      }
    } catch {
      console.warn("External reference não é um JSON válido:", payment.external_reference);
    }

    const userId = metadata.userId;
    const planName = metadata.planName;

    if (userId) {
      let targetPlan = null;
      if (metadata.planId) {
        targetPlan = await prisma.plan.findUnique({ where: { id: metadata.planId } });
      }
      if (!targetPlan && planName) {
        targetPlan = await prisma.plan.findUnique({ where: { name: planName } });
      }
      if (!targetPlan) {
        targetPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
      }

      if (targetPlan) {
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 dias

        // Atualiza usuário
        await prisma.user.update({
          where: { id: userId },
          data: { planId: targetPlan.id },
        });

        // Upsert de assinatura ativa
        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            planId: targetPlan.id,
            gateway: "mercadopago",
            gatewayCustomerId: String(payment.payer?.id || ""),
            gatewaySubscriptionId: String(payment.id),
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          update: {
            planId: targetPlan.id,
            gateway: "mercadopago",
            gatewaySubscriptionId: String(payment.id),
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });

        // Log de atividade
        await prisma.activityLog.create({
          data: {
            userId,
            action: "SUBSCRIPTION_ACTIVATE",
            description: `Assinatura ativada via Mercado Pago (${targetPlan.displayName}) - Pagamento #${payment.id}`,
          },
        });
      }
    }

    // Marca webhook como processado
    await prisma.webhookEvent.update({
      where: {
        eventId: eventKey,
      },
      data: { status: "PROCESSED" },
    });

    return { status: "approved", paymentId, userId };
  }

  return { status: payment.status, paymentId };
}
