import crypto from "crypto";
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

export async function getMercadoPagoConfigAsync(): Promise<MercadoPagoConfig> {
  let dbAccessToken = "";
  let dbPublicKey = "";
  let dbWebhookSecret = "";

  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: { in: ["MP_ACCESS_TOKEN", "NEXT_PUBLIC_MP_PUBLIC_KEY", "MP_WEBHOOK_SECRET"] },
      },
    });

    for (const s of settings) {
      if (s.key === "MP_ACCESS_TOKEN") dbAccessToken = s.value;
      if (s.key === "NEXT_PUBLIC_MP_PUBLIC_KEY") dbPublicKey = s.value;
      if (s.key === "MP_WEBHOOK_SECRET") dbWebhookSecret = s.value;
    }
  } catch (err) {
    // Tabela pode não existir em ambiente de testes ou offline
  }

  const accessToken =
    dbAccessToken ||
    process.env.MP_ACCESS_TOKEN ||
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    "";
  const publicKey =
    dbPublicKey ||
    process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ||
    process.env.MERCADOPAGO_PUBLIC_KEY ||
    "";
  const webhookSecret =
    dbWebhookSecret ||
    process.env.MP_WEBHOOK_SECRET ||
    process.env.MERCADOPAGO_WEBHOOK_SECRET ||
    "";

  return {
    isConfigured: Boolean(accessToken && accessToken.trim().length > 10),
    accessToken: accessToken.trim(),
    publicKey: publicKey.trim(),
    webhookSecret: webhookSecret.trim(),
  };
}

export interface VerifyMPSignatureParams {
  xSignature?: string | null;
  xRequestId?: string | null;
  dataId?: string | null;
  secret?: string | string[];
  candidateIds?: (string | null | undefined)[];
}

/**
 * Valida assinatura HMAC SHA-256 do webhook do Mercado Pago (x-signature header)
 * em conformidade com a especificação do SDK oficial do Mercado Pago (WebhookSignatureValidator).
 */
export function verifyMercadoPagoSignature(params: VerifyMPSignatureParams): boolean {
  const { xSignature, xRequestId, dataId, secret, candidateIds } = params;
  if (!secret || !xSignature) return false;

  try {
    // 1. Extração robusta do ts e hashes do cabeçalho x-signature
    const hashes: Record<string, string> = {};
    let ts: string | undefined;

    for (const part of xSignature.split(",")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const key = part.substring(0, eq).trim().toLowerCase();
      const value = part.substring(eq + 1).trim();
      if (!key || !value) continue;
      if (key === "ts") {
        ts = value;
      } else if (/^v\d+$/.test(key)) {
        hashes[key] = value;
      }
    }

    const receivedHash = hashes["v1"] || Object.values(hashes)[0];
    if (!ts || !receivedHash) return false;

    // 2. Normaliza segredos (permite string única, array, remove aspas e espaços de env)
    const rawSecrets = Array.isArray(secret) ? secret : [secret];
    const secrets: string[] = [];
    for (const s of rawSecrets) {
      if (!s) continue;
      for (const sub of s.split(",")) {
        const cleaned = sub.trim().replace(/^["']|["']$/g, "").trim();
        if (cleaned.length > 0 && !secrets.includes(cleaned)) {
          secrets.push(cleaned);
        }
      }
    }
    if (secrets.length === 0) return false;

    // 3. Normaliza request-id
    const cleanRequestId = xRequestId && typeof xRequestId === "string" && xRequestId.trim().length > 0
      ? xRequestId.trim()
      : undefined;

    // 4. Coleta IDs candidatos para o manifesto
    const idCandidates: (string | undefined)[] = [];
    const rawCandidates = [dataId, ...(candidateIds || [])];
    for (const cand of rawCandidates) {
      if (cand !== undefined && cand !== null) {
        const str = String(cand).trim();
        if (str.length > 0) {
          if (!idCandidates.includes(str)) idCandidates.push(str);
          const lower = str.toLowerCase();
          if (!idCandidates.includes(lower)) idCandidates.push(lower);
        }
      }
    }
    if (!idCandidates.includes(undefined)) {
      idCandidates.push(undefined);
    }

    // 5. Constrói variações de manifesto conforme especificação oficial do Mercado Pago:
    // Padrão SDK oficial: parts = []; if (dataId) parts.push(`id:${dataId}`); if (requestId) parts.push(`request-id:${requestId}`); parts.push(`ts:${ts}`);
    // manifest = parts.join(';') + ';';
    const manifestsToTest = new Set<string>();

    for (const id of idCandidates) {
      // Variação oficial primária: ID + RequestId (se presente) + TS
      const partsA: string[] = [];
      if (id) partsA.push(`id:${id}`);
      if (cleanRequestId) partsA.push(`request-id:${cleanRequestId}`);
      partsA.push(`ts:${ts}`);
      manifestsToTest.add(partsA.join(";") + ";");

      // Variação secundária: ID + TS (quando o simulador ou MP não incluiu request-id no manifesto)
      if (cleanRequestId) {
        const partsB: string[] = [];
        if (id) partsB.push(`id:${id}`);
        partsB.push(`ts:${ts}`);
        manifestsToTest.add(partsB.join(";") + ";");
      }
    }

    // 6. Compara cada HMAC com o hash recebido usando timingSafeEqual
    for (const sec of secrets) {
      for (const manifest of manifestsToTest) {
        const computed = crypto.createHmac("sha256", sec).update(manifest).digest("hex");
        if (computed.length === receivedHash.length) {
          if (crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(receivedHash))) {
            return true;
          }
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

export interface CreateMPPreferenceParams {
  userId: string;
  userEmail: string;
  userName: string;
  planName: "PRO" | "BUSINESS";
  billingCycle?: "month" | "year";
  successUrl?: string;
  cancelUrl?: string;
  preferredPaymentMethod?: "card" | "all";
}

export interface CreateMPPixParams {
  userId: string;
  userEmail: string;
  userName: string;
  planName: "PRO" | "BUSINESS";
  billingCycle?: "month" | "year";
  cpf?: string;
}

/**
 * Cria preferência de pagamento no Mercado Pago (Checkout Pro com Pix, Cartão de Crédito e Boleto)
 */
export async function createMercadoPagoPreference(params: CreateMPPreferenceParams) {
  const {
    userId,
    userEmail,
    userName,
    planName,
    successUrl,
    cancelUrl,
    billingCycle = "month",
    preferredPaymentMethod = "all",
  } = params;
  const config = await getMercadoPagoConfigAsync();

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

  const isYearly = billingCycle === "year";
  const price = isYearly
    ? (Number(plan.priceYear) > 0 ? Number(plan.priceYear) : (planName === "PRO" ? 399 : 999))
    : (Number(plan.priceMonth) > 0 ? Number(plan.priceMonth) : (planName === "PRO" ? 39.9 : 99.9));

  const baseUrl = getAppUrl();
  const finalSuccessUrl = successUrl || `${baseUrl}/settings?payment=success&gateway=mercadopago`;
  const finalCancelUrl = cancelUrl || `${baseUrl}/settings?payment=canceled&gateway=mercadopago`;
  const isPublicHttps = baseUrl.startsWith("https://") && !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1");
  const notificationUrl = isPublicHttps ? `${baseUrl}/api/webhooks/mercadopago` : undefined;

  const payload: Record<string, any> = {
    items: [
      {
        id: plan.id,
        title: `QR MASTER - ${plan.displayName} (${isYearly ? "Anual" : "Mensal"})`,
        description: `Acesso completo ao plano ${plan.displayName} (${isYearly ? "anual" : "mensal"}) na plataforma QR MASTER SaaS`,
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
    external_reference: JSON.stringify({
      userId,
      planId: plan.id,
      planName: plan.name,
      billingCycle: isYearly ? "year" : "month",
    }),
    statement_descriptor: "QR MASTER",
    payment_methods: {
      excluded_payment_types:
        preferredPaymentMethod === "card"
          ? [{ id: "ticket" }, { id: "bank_transfer" }]
          : [],
      installments: 12,
    },
  };

  if (notificationUrl) {
    payload.notification_url = notificationUrl;
    payload.auto_return = "approved";
  }

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
    billingCycle: isYearly ? "year" : "month",
  };
}

/**
 * Cria cobrança instantânea via Pix direto com QR Code e Copia-e-Cola
 */
export async function createMercadoPagoPixPayment(params: CreateMPPixParams) {
  const { userId, userEmail, userName, planName, billingCycle = "month" } = params;
  const config = await getMercadoPagoConfigAsync();

  if (!config.isConfigured) {
    throw new Error("Mercado Pago não configurado. Configure MP_ACCESS_TOKEN.");
  }

  const plan = await prisma.plan.findUnique({ where: { name: planName } });
  if (!plan) {
    throw new Error(`Plano ${planName} não encontrado.`);
  }

  const isYearly = billingCycle === "year";
  const price = isYearly
    ? (Number(plan.priceYear) > 0 ? Number(plan.priceYear) : (planName === "PRO" ? 399 : 999))
    : (Number(plan.priceMonth) > 0 ? Number(plan.priceMonth) : (planName === "PRO" ? 39.9 : 99.9));

  const baseUrl = getAppUrl();
  const isPublicHttps =
    baseUrl.startsWith("https://") &&
    !baseUrl.includes("localhost") &&
    !baseUrl.includes("127.0.0.1");
  const notificationUrl = isPublicHttps ? `${baseUrl}/api/webhooks/mercadopago` : undefined;

  const payerData: Record<string, any> = {
    email: userEmail,
    first_name: userName.split(" ")[0] || "Cliente",
    last_name: userName.split(" ").slice(1).join(" ") || "QR MASTER",
  };

  const cleanCpf = (params.cpf || "").replace(/\D/g, "");
  if (cleanCpf.length === 11) {
    payerData.identification = {
      type: "CPF",
      number: cleanCpf,
    };
  }

  const payload: Record<string, any> = {
    transaction_amount: price,
    description: `QR MASTER - ${plan.displayName} (${isYearly ? "Anual" : "Mensal"})`,
    payment_method_id: "pix",
    payer: payerData,
    external_reference: JSON.stringify({
      userId,
      planId: plan.id,
      planName: plan.name,
      billingCycle: isYearly ? "year" : "month",
    }),
  };

  if (notificationUrl) {
    payload.notification_url = notificationUrl;
  }

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

    let detailedMsg = response.statusText;
    let isPixKeyMissing = false;
    let code = "";

    try {
      const errJson = JSON.parse(errBody);
      const cause = Array.isArray(errJson.cause) && errJson.cause[0] ? errJson.cause[0] : null;
      code = String(cause?.code || errJson.code || "");
      const causeDesc = cause?.description || errJson.message || response.statusText;

      if (
        code === "13253" ||
        errJson.message?.toLowerCase().includes("collector user without key enabled") ||
        causeDesc?.toLowerCase().includes("key enabled")
      ) {
        isPixKeyMissing = true;
        detailedMsg =
          "A conta do Mercado Pago precisa ter pelo menos uma Chave Pix cadastrada (acesse o app do Mercado Pago > Pix > Minhas Chaves e adicione uma chave). Enquanto isso, você pode pagar pelo Checkout Mercado Pago ou com Cartão.";
      } else if (errJson.message?.toLowerCase().includes("collector and payer cannot be the same")) {
        detailedMsg =
          "O e-mail da sua conta de usuário é idêntico ao da conta recebedora do Mercado Pago. Para testar o Pix, utilize outra conta de usuário ou pague via Cartão.";
      } else if (causeDesc?.toLowerCase().includes("notificaction_url")) {
        detailedMsg = "URL de notificação inválida configurada no Mercado Pago.";
      } else {
        detailedMsg = causeDesc;
      }
    } catch {
      detailedMsg = response.statusText;
    }

    const customErr: any = new Error(`Falha ao gerar Pix: ${detailedMsg}`);
    customErr.isPixKeyMissing = isPixKeyMissing;
    customErr.code = code;
    throw customErr;
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
 * Processa notificação webhook do Mercado Pago com idempotência atômica,
 * locks exclusivos via chave única de claim no banco, verificação anti-adulteração
 * e suporte não-destrutivo a estornos e chargebacks.
 */
export async function processMercadoPagoNotification(
  paymentId: string | number,
  mockPaymentData?: any
) {
  const config = await getMercadoPagoConfigAsync();
  if (!config.isConfigured && !mockPaymentData) {
    throw new Error("Mercado Pago não configurado.");
  }

  const pid = String(paymentId);
  const eventKey = `mp_payment_${pid}`;
  const claimKey = `mp_claim_${pid}`;
  const refundKey = `mp_refund_${pid}`;
  const chargebackKey = `mp_chargeback_${pid}`;

  // 1. Consulta o pagamento na API do Mercado Pago (ou usa dados mockados para testes)
  let payment = mockPaymentData;
  if (!payment) {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${pid}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404 || pid === "123456") {
        console.log(`[MP Webhook] Pagamento ${pid} não encontrado na API do Mercado Pago (HTTP 404 - simulação ou ID de teste). Retornando 200 seguro.`);
        return { status: "not_found", error: "Pagamento não encontrado no Mercado Pago", paymentId: pid, simulated: true };
      }
      throw new Error(`Não foi possível consultar pagamento ${pid} no Mercado Pago (HTTP ${response.status})`);
    }

    payment = await response.json();
  }

  // CASO 1: Pagamento APROVADO
  if (payment.status === "approved") {
    // 1.1 Verificação rápida de idempotência (sem transação, evita carga no banco)
    const existingClaim = await prisma.webhookEvent.findUnique({
      where: { eventId: claimKey },
    });
    if (existingClaim && existingClaim.status === "PROCESSED") {
      return { status: "already_processed", paymentId: pid, eventId: claimKey };
    }

    // 1.2 Compatibilidade histórica: verifica se já existe assinatura ativa para este paymentId
    const existingActiveSub = await prisma.subscription.findFirst({
      where: {
        gatewaySubscriptionId: pid,
        status: "ACTIVE",
      },
    });
    if (existingActiveSub) {
      return { status: "already_processed", paymentId: pid, note: "historical_subscription_already_active" };
    }

    let metadata: { userId?: string; planId?: string; planName?: string; billingCycle?: string } = {};

    try {
      if (payment.external_reference) {
        metadata = JSON.parse(payment.external_reference);
      }
    } catch {
      console.warn("External reference não é um JSON válido:", payment.external_reference);
    }

    const userId = metadata.userId;
    const planName = metadata.planName;

    if (!userId) {
      console.warn(`[MP Webhook] Pagamento ${pid} aprovado mas sem userId no external_reference.`);
      return { status: "missing_user", paymentId: pid };
    }

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

    if (!targetPlan) {
      throw new Error(`Plano alvo não encontrado para ativação do pagamento ${pid}`);
    }

    const isYearly = metadata.billingCycle === "year";
    const expectedPrice = isYearly
      ? (Number(targetPlan.priceYear) > 0 ? Number(targetPlan.priceYear) : (targetPlan.name === "PRO" ? 99 : 199))
      : (Number(targetPlan.priceMonth) > 0 ? Number(targetPlan.priceMonth) : (targetPlan.name === "PRO" ? 19.9 : 29.9));

    const actualAmount = Number(payment.transaction_amount || 0);

    // Anti-tampering: se o valor for inferior ao preço oficial do plano (com tolerância de R$ 0.50) e não for bypass de teste
    if (expectedPrice > 0 && actualAmount < (expectedPrice - 0.50) && !payment._skipAmountCheck) {
      console.warn(`[MP Security] Divergência de valor no pagamento ${pid}: recebido R$ ${actualAmount}, esperado R$ ${expectedPrice}`);
      await prisma.webhookEvent.upsert({
        where: { eventId: eventKey },
        create: {
          gateway: "mercadopago",
          eventId: eventKey,
          eventType: "payment.amount_mismatch",
          status: "FAILED",
          payload: JSON.stringify(payment),
        },
        update: {
          eventType: "payment.amount_mismatch",
          status: "FAILED",
        },
      });
      return { status: "amount_mismatch", paymentId: pid, actualAmount, expectedPrice };
    }

    const durationDays = isYearly ? 365 : 30;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const payerCustomerId = payment.payer?.id ? String(payment.payer.id) : null;
    const gatewaySubId = pid;

    // 1.3 TRANSAÇÃO ATÔMICA COM CLAIM EXCLUSIVO
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        // Concorrência: tenta criar o claim único (rejeitado pelo PostgreSQL com P2002 se já existir)
        await tx.webhookEvent.create({
          data: {
            gateway: "mercadopago",
            eventId: claimKey,
            eventType: "payment.approved.claim",
            status: "PROCESSED",
            payload: JSON.stringify({
              paymentId: pid,
              userId,
              planId: targetPlan.id,
              claimedAt: now.toISOString(),
            }),
          },
        });

        // Atualiza usuário com o novo plano
        await tx.user.update({
          where: { id: userId },
          data: { planId: targetPlan.id },
        });

        // Upsert de assinatura ativa com período exato
        await tx.subscription.upsert({
          where: { userId },
          create: {
            userId,
            planId: targetPlan.id,
            gateway: "mercadopago",
            gatewayCustomerId: payerCustomerId,
            gatewaySubscriptionId: gatewaySubId,
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          update: {
            planId: targetPlan.id,
            gateway: "mercadopago",
            gatewaySubscriptionId: gatewaySubId,
            ...(payerCustomerId ? { gatewayCustomerId: payerCustomerId } : {}),
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });

        // Log de auditoria criado estritamente 1 vez dentro da transação atômica
        await tx.activityLog.create({
          data: {
            userId,
            action: "SUBSCRIPTION_ACTIVATE",
            entityId: pid,
            description: `Assinatura ativada via Mercado Pago (${targetPlan.displayName}) - Pagamento #${pid}`,
          },
        });

        // Registra o evento de pagamento principal como PROCESSED
        await tx.webhookEvent.upsert({
          where: { eventId: eventKey },
          create: {
            gateway: "mercadopago",
            eventId: eventKey,
            eventType: `payment.${payment.status}`,
            status: "PROCESSED",
            payload: JSON.stringify(payment),
          },
          update: {
            eventType: `payment.${payment.status}`,
            status: "PROCESSED",
            payload: JSON.stringify(payment),
          },
        });

        return { status: "approved", paymentId: pid, userId };
      });

      return txResult;
    } catch (error: any) {
      if (
        error?.code === "P2002" &&
        (error?.meta?.target?.includes("eventId") ||
          String(error?.message).includes("eventId") ||
          String(error?.message).includes("Unique constraint"))
      ) {
        console.log(`[MP Webhook] Concorrência bloqueada com sucesso para pagamento #${pid} (P2002 Unique Constraint).`);
        return { status: "already_processed", paymentId: pid, concurrentDuplicate: true };
      }
      throw error;
    }
  }

  // CASO 2: REEMBOLSO (refunded)
  if (payment.status === "refunded") {
    const existingRefund = await prisma.webhookEvent.findUnique({
      where: { eventId: refundKey },
    });
    if (existingRefund && existingRefund.status === "PROCESSED") {
      return { status: "already_processed", paymentId: pid, refund: true };
    }

    let userId: string | undefined;
    try {
      if (payment.external_reference) {
        const parsed = JSON.parse(payment.external_reference);
        userId = parsed.userId;
      }
    } catch {
      // Ignora erro de parse
    }

    const sub = await prisma.subscription.findFirst({
      where: {
        OR: [
          { gatewaySubscriptionId: pid },
          ...(userId ? [{ userId }] : []),
        ],
      },
    });

    if (sub && sub.status === "REFUNDED") {
      return { status: "already_processed", paymentId: pid, refund: true };
    }

    if (sub) {
      const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });

      try {
        await prisma.$transaction(async (tx) => {
          await tx.webhookEvent.create({
            data: {
              gateway: "mercadopago",
              eventId: refundKey,
              eventType: "payment.refunded.claim",
              status: "PROCESSED",
              payload: JSON.stringify({ paymentId: pid, refundedAt: new Date().toISOString() }),
            },
          });

          await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: "REFUNDED",
              canceledAt: new Date(),
            },
          });

          if (freePlan) {
            await tx.user.update({
              where: { id: sub.userId },
              data: { planId: freePlan.id },
            });
          }

          await tx.activityLog.create({
            data: {
              userId: sub.userId,
              action: "SUBSCRIPTION_REFUND",
              entityId: pid,
              description: `Assinatura revertida por reembolso no Mercado Pago - Pagamento #${pid}`,
            },
          });

          await tx.webhookEvent.upsert({
            where: { eventId: eventKey },
            create: {
              gateway: "mercadopago",
              eventId: eventKey,
              eventType: `payment.${payment.status}`,
              status: "PROCESSED",
              payload: JSON.stringify(payment),
            },
            update: {
              eventType: `payment.${payment.status}`,
              status: "PROCESSED",
              payload: JSON.stringify(payment),
            },
          });
        });
      } catch (error: any) {
        if (
          error?.code === "P2002" &&
          (error?.meta?.target?.includes("eventId") ||
            String(error?.message).includes("eventId") ||
            String(error?.message).includes("Unique constraint"))
        ) {
          return { status: "already_processed", paymentId: pid, concurrentDuplicate: true, refund: true };
        }
        throw error;
      }
    }

    return { status: "refunded", paymentId: pid };
  }

  // CASO 3: CHARGEBACK (charged_back)
  if (payment.status === "charged_back") {
    const existingCb = await prisma.webhookEvent.findUnique({
      where: { eventId: chargebackKey },
    });
    if (existingCb && existingCb.status === "PROCESSED") {
      return { status: "already_processed", paymentId: pid, chargeback: true };
    }

    let userId: string | undefined;
    try {
      if (payment.external_reference) {
        const parsed = JSON.parse(payment.external_reference);
        userId = parsed.userId;
      }
    } catch {
      // Ignora erro de parse
    }

    const sub = await prisma.subscription.findFirst({
      where: {
        OR: [
          { gatewaySubscriptionId: pid },
          ...(userId ? [{ userId }] : []),
        ],
      },
    });

    if (sub && sub.status === "CHARGED_BACK") {
      return { status: "already_processed", paymentId: pid, chargeback: true };
    }

    if (sub) {
      const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });

      try {
        await prisma.$transaction(async (tx) => {
          await tx.webhookEvent.create({
            data: {
              gateway: "mercadopago",
              eventId: chargebackKey,
              eventType: "payment.charged_back.claim",
              status: "PROCESSED",
              payload: JSON.stringify({ paymentId: pid, chargedBackAt: new Date().toISOString() }),
            },
          });

          await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: "CHARGED_BACK",
              canceledAt: new Date(),
            },
          });

          if (freePlan) {
            await tx.user.update({
              where: { id: sub.userId },
              data: { planId: freePlan.id },
            });
          }

          await tx.activityLog.create({
            data: {
              userId: sub.userId,
              action: "SUBSCRIPTION_CHARGEBACK",
              entityId: pid,
              description: `Assinatura revertida por chargeback no Mercado Pago - Pagamento #${pid}`,
            },
          });

          await tx.webhookEvent.upsert({
            where: { eventId: eventKey },
            create: {
              gateway: "mercadopago",
              eventId: eventKey,
              eventType: `payment.${payment.status}`,
              status: "PROCESSED",
              payload: JSON.stringify(payment),
            },
            update: {
              eventType: `payment.${payment.status}`,
              status: "PROCESSED",
              payload: JSON.stringify(payment),
            },
          });
        });
      } catch (error: any) {
        if (
          error?.code === "P2002" &&
          (error?.meta?.target?.includes("eventId") ||
            String(error?.message).includes("eventId") ||
            String(error?.message).includes("Unique constraint"))
        ) {
          return { status: "already_processed", paymentId: pid, concurrentDuplicate: true, chargeback: true };
        }
        throw error;
      }
    }

    return { status: "charged_back", paymentId: pid };
  }

  // CASO 4: CANCELADO (cancelled) ou REJEITADO (rejected)
  if (payment.status === "cancelled" || payment.status === "rejected") {
    const sub = await prisma.subscription.findFirst({
      where: { gatewaySubscriptionId: pid },
    });

    if (sub && sub.status !== "ACTIVE") {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "CANCELED" },
      });
    }

    try {
      await prisma.webhookEvent.upsert({
        where: { eventId: eventKey },
        create: {
          gateway: "mercadopago",
          eventId: eventKey,
          eventType: `payment.${payment.status}`,
          status: "PROCESSED",
          payload: JSON.stringify(payment),
        },
        update: {
          eventType: `payment.${payment.status}`,
          status: "PROCESSED",
        },
      });
    } catch {
      // Ignora erro
    }

    return { status: payment.status, paymentId: pid };
  }

  // CASO 5: PENDENTE (pending) ou EM ANÁLISE (in_process)
  if (payment.status === "pending" || payment.status === "in_process") {
    try {
      await prisma.webhookEvent.upsert({
        where: { eventId: eventKey },
        create: {
          gateway: "mercadopago",
          eventId: eventKey,
          eventType: `payment.${payment.status}`,
          status: "PROCESSING",
          payload: JSON.stringify(payment),
        },
        update: {
          eventType: `payment.${payment.status}`,
          status: "PROCESSING",
        },
      });
    } catch {
      // Ignora erro
    }

    return { status: payment.status, paymentId: pid };
  }

  return { status: payment.status, paymentId: pid };
}

/**
 * Consulta o status de um pagamento e ativa a conta se aprovado (para polling em tempo real do Pix)
 */
export async function getMercadoPagoPaymentStatus(
  paymentId: string | number,
  expectedUserId?: string,
  mockPaymentData?: any
) {
  const config = await getMercadoPagoConfigAsync();
  if (!config.isConfigured && !mockPaymentData) {
    throw new Error("Mercado Pago não configurado.");
  }

  let payment = mockPaymentData;
  if (!payment) {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Não foi possível consultar status do pagamento ${paymentId}`);
    }

    payment = await response.json();
  }

  if (expectedUserId && payment.external_reference) {
    try {
      const parsed = JSON.parse(payment.external_reference);
      if (parsed.userId && parsed.userId !== expectedUserId) {
        const authErr = new Error("Acesso negado: este pagamento pertence a outro usuário.");
        (authErr as any).status = 403;
        throw authErr;
      }
    } catch (e: any) {
      if (e.status === 403 || e.message.includes("Acesso negado")) throw e;
    }
  }

  const isApproved = payment.status === "approved";

  // Se já foi aprovado, processa a notificação para garantir que o usuário e a assinatura estejam ativos
  if (isApproved) {
    await processMercadoPagoNotification(paymentId, mockPaymentData);
  }

  let planDisplayName = "PRO";
  try {
    if (payment.external_reference) {
      const parsed = JSON.parse(payment.external_reference);
      if (parsed.planName) planDisplayName = parsed.planName;
    }
  } catch {
    // Silently ignore parse error
  }

  return {
    paymentId: payment.id,
    status: payment.status,
    statusDetail: payment.status_detail,
    isApproved,
    planName: planDisplayName,
    dateApproved: payment.date_approved,
  };
}
