import Stripe from "stripe";
import { prisma } from "./db";

let stripeInstance: Stripe | null = null;

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY não configurada. Configure a chave secreta da Stripe no arquivo de variáveis de ambiente."
    );
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey, {
      apiVersion: "2024-10-28.acacia" as any,
      typescript: true,
    });
  }

  return stripeInstance;
}

export interface CreateCheckoutSessionParams {
  userId: string;
  userEmail: string;
  userName: string;
  planName: "PRO" | "BUSINESS";
  billingCycle?: "month" | "year";
  successUrl: string;
  cancelUrl: string;
}

/**
 * Cria ou recupera o ID do cliente na Stripe associado ao usuário do QR MASTER
 */
export async function getOrCreateStripeCustomer(userId: string, email: string, name: string): Promise<string> {
  const stripe = getStripeClient();

  // Verifica se já existe assinatura gravada com gatewayCustomerId
  const existingSub = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (existingSub?.gatewayCustomerId) {
    return existingSub.gatewayCustomerId;
  }

  // Busca cliente existente por e-mail na Stripe
  const customers = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (customers.data.length > 0) {
    const customerId = customers.data[0].id;
    return customerId;
  }

  // Cria novo cliente
  const newCustomer = await stripe.customers.create({
    email,
    name,
    metadata: {
      userId,
      app: "QR MASTER",
    },
  });

  return newCustomer.id;
}

/**
 * Cria uma sessão de Checkout Stripe para assinatura do plano PRO ou BUSINESS
 */
export async function createBillingCheckoutSession(params: CreateCheckoutSessionParams): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripeClient();
  const { userId, userEmail, userName, planName, successUrl, cancelUrl, billingCycle = "month" } = params;
  const isYearly = billingCycle === "year";

  const targetPlan = await prisma.plan.findUnique({
    where: { name: planName },
  });

  if (!targetPlan) {
    throw new Error(`Plano '${planName}' não encontrado no banco de dados.`);
  }

  const customerId = await getOrCreateStripeCustomer(userId, userEmail, userName);

  // Determina Price ID configurado ou monta line_items com preço dinâmico em centavos
  const priceEnvKey = planName === "PRO" ? process.env.STRIPE_PRICE_ID_PRO : process.env.STRIPE_PRICE_ID_BUSINESS;

  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];

  if (priceEnvKey && priceEnvKey.trim() !== "" && !isYearly) {
    lineItems = [
      {
        price: priceEnvKey.trim(),
        quantity: 1,
      },
    ];
  } else {
    // Se não houver Price ID estático ou se for ciclo anual, calcula o valor correspondente
    const priceInReais = isYearly
      ? (targetPlan.priceYear > 0 ? targetPlan.priceYear : Math.round(targetPlan.priceMonth * 10))
      : targetPlan.priceMonth;
    const unitAmountCents = Math.round(priceInReais * 100);

    lineItems = [
      {
        price_data: {
          currency: "brl",
          product_data: {
            name: `QR MASTER — ${targetPlan.displayName} (${isYearly ? "Anual" : "Mensal"})`,
            description: `Assinatura ${isYearly ? "anual" : "mensal"} do plano ${targetPlan.name} com ${targetPlan.maxQRCodes > 9999 ? "ilimitados" : targetPlan.maxQRCodes} QR Codes e recursos avançados.`,
          },
          unit_amount: unitAmountCents,
          recurring: {
            interval: isYearly ? "year" : "month",
          },
        },
        quantity: 1,
      },
    ];
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer: customerId,
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      planId: targetPlan.id,
      planName: targetPlan.name,
      billingCycle: isYearly ? "year" : "month",
    },
    subscription_data: {
      metadata: {
        userId,
        planId: targetPlan.id,
        planName: targetPlan.name,
        billingCycle: isYearly ? "year" : "month",
      },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Falha ao gerar URL da sessão de checkout Stripe.");
  }

  return {
    url: session.url,
    sessionId: session.id,
  };
}

/**
 * Cria uma sessão do Portal do Cliente da Stripe para gerenciar cartão, upgrade ou cancelamento
 */
export async function createBillingPortalSession(userId: string, returnUrl: string): Promise<{ url: string }> {
  const stripe = getStripeClient();

  const sub = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!sub?.gatewayCustomerId) {
    throw new Error("Nenhum registro de cliente de pagamento localizado para este usuário.");
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.gatewayCustomerId,
    return_url: returnUrl,
  });

  return { url: portal.url };
}

/**
 * Valida a assinatura de um webhook recebido da Stripe
 */
export function verifyStripeWebhookSignature(rawBody: string | Buffer, signature: string): Stripe.Event {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET não configurada.");
  }

  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/**
 * Processador central e idempotente de eventos de webhook da Stripe
 */
export async function processStripeWebhookEvent(event: Stripe.Event): Promise<{ processed: boolean; reason?: string }> {
  // 1. Idempotência: Checa se o evento já foi processado anteriormente
  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { eventId: event.id },
  });

  if (existingEvent) {
    return { processed: false, reason: `Evento ${event.id} já processado anteriormente.` };
  }

  // 2. Grava o evento bruto para rastreabilidade e auditoria com proteção de corrida
  try {
    await prisma.webhookEvent.create({
      data: {
        gateway: "stripe",
        eventId: event.id,
        eventType: event.type,
        status: "PROCESSING",
        payload: JSON.stringify(event),
      },
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      return { processed: false, reason: `Evento ${event.id} duplicado concorrentemente.` };
    }
    throw err;
  }

  try {
    switch (event.type) {
      // -------------------------------------------------------------
      // 1. CHECKOUT CONCLUÍDO (Ativação inicial da assinatura)
      // -------------------------------------------------------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const planName = session.metadata?.planName;

        if (!userId || !planName) {
          break;
        }

        const plan = await prisma.plan.findUnique({
          where: { name: planName },
        });

        if (!plan) break;

        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

        // Se houver ID de assinatura, busca o período vigente na Stripe
        const isYearlyPlan = session.metadata?.billingCycle === "year";
        const fallbackDays = isYearlyPlan ? 365 : 30;
        let periodStart = new Date();
        let periodEnd = new Date(Date.now() + fallbackDays * 24 * 60 * 60 * 1000);

        if (subscriptionId && process.env.STRIPE_SECRET_KEY) {
          try {
            const stripe = getStripeClient();
            const subObj = (await stripe.subscriptions.retrieve(subscriptionId)) as any;
            if (subObj?.current_period_start && subObj?.current_period_end) {
              periodStart = new Date(subObj.current_period_start * 1000);
              periodEnd = new Date(subObj.current_period_end * 1000);
            }
          } catch {
            // Preserva as datas calculadas por fallback caso a API da Stripe esteja indisponível
          }
        }

        await prisma.$transaction([
          prisma.user.update({
            where: { id: userId },
            data: { planId: plan.id },
          }),
          prisma.subscription.upsert({
            where: { userId },
            create: {
              userId,
              planId: plan.id,
              status: "ACTIVE",
              gateway: "stripe",
              gatewayCustomerId: customerId,
              gatewaySubscriptionId: subscriptionId,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
            update: {
              planId: plan.id,
              status: "ACTIVE",
              gateway: "stripe",
              gatewayCustomerId: customerId,
              gatewaySubscriptionId: subscriptionId,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
              canceledAt: null,
            },
          }),
          prisma.activityLog.create({
            data: {
              userId,
              action: "SUBSCRIPTION_ACTIVATED",
              description: `Assinatura do plano ${plan.name} ativada com sucesso via Stripe.`,
            },
          }),
        ]);
        break;
      }

      // -------------------------------------------------------------
      // 2. ASSINATURA ATUALIZADA (Renovação, Upgrade, Downgrade, Cancelamento)
      // -------------------------------------------------------------
      case "customer.subscription.updated": {
        const stripeSub = event.data.object as Stripe.Subscription;
        const subscriptionId = stripeSub.id;
        const status = stripeSub.status.toUpperCase(); // active, past_due, canceled, etc.
        const cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
        const periodStart = new Date(((stripeSub as any).current_period_start || Math.floor(Date.now() / 1000)) * 1000);
        const periodEnd = new Date(((stripeSub as any).current_period_end || Math.floor(Date.now() / 1000) + 30 * 86400) * 1000);

        // Localiza a assinatura existente pelo gatewaySubscriptionId
        const localSub = await prisma.subscription.findFirst({
          where: { gatewaySubscriptionId: subscriptionId },
          include: { user: true },
        });

        if (localSub) {
          // Detecta se houve alteração de plano (Upgrade ou Downgrade via Portal/Stripe)
          let targetPlanId = localSub.planId;
          const metaPlanName = stripeSub.metadata?.planName || stripeSub.metadata?.plan;
          const metaPlanId = stripeSub.metadata?.planId;
          const priceId = stripeSub.items?.data?.[0]?.price?.id;

          if (metaPlanId) {
            const p = await prisma.plan.findUnique({ where: { id: metaPlanId } });
            if (p) targetPlanId = p.id;
          } else if (metaPlanName) {
            const p = await prisma.plan.findUnique({ where: { name: metaPlanName.toUpperCase() } });
            if (p) targetPlanId = p.id;
          } else if (priceId) {
            if (process.env.STRIPE_PRICE_ID_BUSINESS && priceId === process.env.STRIPE_PRICE_ID_BUSINESS) {
              const p = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });
              if (p) targetPlanId = p.id;
            } else if (process.env.STRIPE_PRICE_ID_PRO && priceId === process.env.STRIPE_PRICE_ID_PRO) {
              const p = await prisma.plan.findUnique({ where: { name: "PRO" } });
              if (p) targetPlanId = p.id;
            }
          }

          const isPlanChanged = targetPlanId !== localSub.planId;

          await prisma.$transaction([
            prisma.subscription.update({
              where: { id: localSub.id },
              data: {
                planId: targetPlanId,
                status,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd,
                canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
              },
            }),
            ...(isPlanChanged
              ? [
                  prisma.user.update({
                    where: { id: localSub.userId },
                    data: { planId: targetPlanId },
                  }),
                  prisma.activityLog.create({
                    data: {
                      userId: localSub.userId,
                      action: "SUBSCRIPTION_PLAN_CHANGED",
                      description: `Plano da assinatura sincronizado com o Stripe para o plano ID ${targetPlanId}.`,
                    },
                  }),
                ]
              : []),
          ]);
        }
        break;
      }

      // -------------------------------------------------------------
      // 3. ASSINATURA CANCELADA DEFINITIVAMENTE (Fim do ciclo pago)
      // -------------------------------------------------------------
      case "customer.subscription.deleted": {
        const stripeSub = event.data.object as Stripe.Subscription;
        const subscriptionId = stripeSub.id;

        const localSub = await prisma.subscription.findFirst({
          where: { gatewaySubscriptionId: subscriptionId },
        });

        if (localSub) {
          const freePlan = await prisma.plan.findUnique({
            where: { name: "FREE" },
          });

          await prisma.$transaction([
            prisma.subscription.update({
              where: { id: localSub.id },
              data: {
                status: "CANCELED",
                canceledAt: new Date(),
              },
            }),
            prisma.user.update({
              where: { id: localSub.userId },
              data: { planId: freePlan?.id },
            }),
            prisma.activityLog.create({
              data: {
                userId: localSub.userId,
                action: "SUBSCRIPTION_CANCELED",
                description: "Assinatura encerrada. Conta revertida para o plano FREE.",
              },
            }),
          ]);
        }
        break;
      }

      // -------------------------------------------------------------
      // 4. FATURA PAGA COM SUCESSO (Renovação periódica mensal)
      // -------------------------------------------------------------
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;

        if (subscriptionId) {
          const localSub = await prisma.subscription.findFirst({
            where: { gatewaySubscriptionId: subscriptionId },
          });

          if (localSub) {
            await prisma.subscription.update({
              where: { id: localSub.id },
              data: {
                status: "ACTIVE",
              },
            });
          }
        }
        break;
      }

      // -------------------------------------------------------------
      // 5. FALHA NO PAGAMENTO DA FATURA (Entra em PAST_DUE / Grace Period)
      // -------------------------------------------------------------
      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;

        if (subscriptionId) {
          const localSub = await prisma.subscription.findFirst({
            where: { gatewaySubscriptionId: subscriptionId },
          });

          if (localSub) {
            await prisma.subscription.update({
              where: { id: localSub.id },
              data: {
                status: "PAST_DUE",
              },
            });

            await prisma.activityLog.create({
              data: {
                userId: localSub.userId,
                action: "PAYMENT_FAILED",
                description: "Falha na renovação da assinatura. Período de tolerância (Grace Period) iniciado.",
              },
            });
          }
        }
        break;
      }

      default:
        break;
    }

    // Marca evento como processado com sucesso
    await prisma.webhookEvent.update({
      where: { eventId: event.id },
      data: { status: "PROCESSED" },
    });

    return { processed: true };
  } catch (error: any) {
    // Registra falha no evento se possível
    try {
      await prisma.webhookEvent.update({
        where: { eventId: event.id },
        data: {
          status: "FAILED",
          errorMessage: error?.message || "Erro desconhecido ao processar evento.",
        },
      });
    } catch {
      // Silenciosamente preserva o erro original
    }
    throw error;
  }
}
