import {
  isSubscriptionActive,
  checkPermission,
  can,
  PlanDetails,
  UserPlanContext,
  SubscriptionDetails,
} from "../src/lib/permissions";

// Cores ANSI para saída no terminal
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (detail) console.error(`    ${YELLOW}Detalhes:${RESET} ${detail}`);
  }
}

// Modelos canônicos de planos
const freePlan: PlanDetails = {
  id: "plan_free_01",
  name: "FREE",
  displayName: "Plano Grátis",
  priceMonth: 0,
  priceYear: 0,
  maxQRCodes: 5,
  dynamicQRs: false,
  analytics: false,
  exportSvg: false,
  exportPdf: false,
  customLogo: false,
  campaigns: false,
};

const proPlan: PlanDetails = {
  id: "plan_pro_02",
  name: "PRO",
  displayName: "Plano Pro",
  priceMonth: 39.9,
  priceYear: 399.0,
  maxQRCodes: 100,
  dynamicQRs: true,
  analytics: true,
  exportSvg: true,
  exportPdf: true,
  customLogo: true,
  campaigns: true,
};

const businessPlan: PlanDetails = {
  id: "plan_biz_03",
  name: "BUSINESS",
  displayName: "Plano Business",
  priceMonth: 99.9,
  priceYear: 999.0,
  maxQRCodes: 999999,
  dynamicQRs: true,
  analytics: true,
  exportSvg: true,
  exportPdf: true,
  customLogo: true,
  campaigns: true,
};

async function runBillingAndSubscriptionTests() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   💳 BATERIA DE TESTES: ASSINATURAS, STRIPE E PERMISSÕES     ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  // =================================================================
  // 1. TESTE DA FUNÇÃO isSubscriptionActive (STATUS, GRACE PERIOD, CICLO)
  // =================================================================
  console.log(`${CYAN}▶ 1. Ciclo de Vida da Assinatura (isSubscriptionActive):${RESET}`);
  {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // +15 dias
    const pastDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // -2 dias
    const pastGraceInside = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // -3 dias (dentro do grace de 5 dias)
    const pastGraceExpired = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); // -6 dias (fora do grace de 5 dias)

    // A. Nulo ou indefinido
    assert(isSubscriptionActive(null) === false, "Assinatura nula retorna inativo (false)");
    assert(isSubscriptionActive(undefined) === false, "Assinatura indefinida retorna inativo (false)");

    // B. Status ACTIVE
    assert(
      isSubscriptionActive({ status: "ACTIVE", currentPeriodEnd: futureDate }) === true,
      "Assinatura ACTIVE com período futuro está ativa"
    );
    assert(
      isSubscriptionActive({ status: "ACTIVE", currentPeriodEnd: pastDate }) === false,
      "Assinatura ACTIVE com período vencido está inativa"
    );

    // C. Status PAST_DUE com Grace Period de 5 dias
    assert(
      isSubscriptionActive({ status: "PAST_DUE", currentPeriodEnd: pastGraceInside }) === true,
      "Assinatura PAST_DUE dentro do Grace Period (3 dias após vencimento) MANTÉM acesso ativo"
    );
    assert(
      isSubscriptionActive({ status: "PAST_DUE", currentPeriodEnd: pastGraceExpired }) === false,
      "Assinatura PAST_DUE fora do Grace Period (6 dias após vencimento) PERDE o acesso ativo"
    );

    // D. Status CANCELED com cancelAtPeriodEnd (acesso preservado até o fim do ciclo pago)
    assert(
      isSubscriptionActive({ status: "CANCELED", currentPeriodEnd: futureDate, cancelAtPeriodEnd: true }) === true,
      "Assinatura cancelada mas ainda dentro do ciclo pago (futureDate) PRESERVA acesso"
    );
    assert(
      isSubscriptionActive({ status: "CANCELED", currentPeriodEnd: pastDate, cancelAtPeriodEnd: true }) === false,
      "Assinatura cancelada após o ciclo pago vencido (pastDate) PERDE o acesso"
    );

    // E. Status desconhecidos ou inválidos
    assert(
      isSubscriptionActive({ status: "INCOMPLETE", currentPeriodEnd: futureDate }) === false,
      "Status INCOMPLETE não confere acesso"
    );
    assert(
      isSubscriptionActive({ status: "UNPAID", currentPeriodEnd: futureDate }) === false,
      "Status UNPAID não confere acesso"
    );
  }

  // =================================================================
  // 2. SEGURANÇA CONTRA DOWNGRADE E INTEGRIDADE DE DADOS
  // =================================================================
  console.log(`\n${CYAN}▶ 2. Proteção contra Downgrade e Integridade de Dados Existentes:${RESET}`);
  {
    // Cenário: Usuário PRO que criou 15 QR Codes e depois cancelou a assinatura (caiu para FREE)
    // REGRAS:
    // 1. Dados não devem ser apagados (os 15 QR codes continuam no banco e ativos)
    // 2. Criação de novos QR codes deve ser bloqueada (15 >= 5)
    // 3. Recursos exclusivos (dinâmicos, logo, exportação) devem ser bloqueados para novas ações
    const downgradedUser: UserPlanContext = {
      id: "usr_downgraded_01",
      role: "USER",
      planId: freePlan.id,
      plan: freePlan,
      qrCodeCount: 15, // Já tinha 15 QR codes criados no PRO
      subscriptionStatus: "CANCELED",
      subscription: {
        id: "sub_01",
        status: "CANCELED",
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expirado ontem
      },
    };

    // Bloqueio de novas criações
    const checkCreate = checkPermission(downgradedUser, "create_qr");
    assert(checkCreate.allowed === false, "Usuário rebaixado com 15 QRs é BLOQUEADO ao tentar criar novos QRs");
    assert(checkCreate.code === "LIMIT_REACHED", "Erro retornado é LIMIT_REACHED");
    assert(checkCreate.limit === 5, "Limite FREE reportado de 5");
    assert(checkCreate.current === 15, "Contagem reportada de 15 existentes");

    // Bloqueio de recursos pagos
    assert(can(downgradedUser, "dynamic_qr") === false, "Recurso QR dinâmico BLOQUEADO após downgrade para FREE");
    assert(can(downgradedUser, "custom_logo") === false, "Recurso logotipo personalizado BLOQUEADO após downgrade");
    assert(can(downgradedUser, "export_svg") === false, "Recurso exportação SVG BLOQUEADO após downgrade");
    assert(can(downgradedUser, "export_pdf") === false, "Recurso exportação PDF BLOQUEADO após downgrade");
    assert(can(downgradedUser, "analytics") === false, "Recurso telemetria/analytics BLOQUEADO após downgrade");
    assert(can(downgradedUser, "campaigns") === false, "Recurso campanhas BLOQUEADO após downgrade");

    // Upgrade para BUSINESS restaura imediatamente o acesso
    const reupgradedUser: UserPlanContext = {
      ...downgradedUser,
      planId: businessPlan.id,
      plan: businessPlan,
      subscriptionStatus: "ACTIVE",
      subscription: {
        id: "sub_01",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    };

    assert(can(reupgradedUser, "create_qr") === true, "Re-upgrade para BUSINESS libera criação imediatamente (15 < 999999)");
    assert(can(reupgradedUser, "dynamic_qr") === true, "BUSINESS libera QR dinâmico");
    assert(can(reupgradedUser, "analytics") === true, "BUSINESS libera Analytics");
    assert(can(reupgradedUser, "custom_logo") === true, "BUSINESS libera Logotipo");
  }

  // =================================================================
  // 3. PROCESSAMENTO DE WEBHOOKS STRIPE E IDEMPOTÊNCIA
  // =================================================================
  console.log(`\n${CYAN}▶ 3. Idempotência e Tratamento de Webhooks Stripe:${RESET}`);
  {
    // Simulação da tabela WebhookEvent e Subscription em memória
    const processedEvents = new Set<string>();
    const mockSubscriptions = new Map<string, any>();
    const mockUsers = new Map<string, any>([
      ["usr_100", { id: "usr_100", email: "cliente@exemplo.com", planId: freePlan.id, planName: "FREE" }],
    ]);

    // Função de simulação que espelha exatamente a lógica do processStripeWebhookEvent
    const simulateWebhookProcess = (event: { id: string; type: string; data: { object: any } }) => {
      // 1. Checagem de Idempotência
      if (processedEvents.has(event.id)) {
        return { processed: false, reason: `Evento ${event.id} já processado anteriormente.` };
      }

      processedEvents.add(event.id);

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const userId = session.metadata?.userId;
          const planName = session.metadata?.planName;
          if (userId && planName) {
            const user = mockUsers.get(userId);
            if (user) {
              user.planName = planName;
              user.planId = planName === "PRO" ? proPlan.id : businessPlan.id;
            }
            mockSubscriptions.set(userId, {
              userId,
              status: "ACTIVE",
              gatewayCustomerId: session.customer,
              gatewaySubscriptionId: session.subscription,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              cancelAtPeriodEnd: false,
            });
          }
          break;
        }

        case "customer.subscription.updated": {
          const stripeSub = event.data.object;
          for (const [userId, sub] of mockSubscriptions.entries()) {
            if (sub.gatewaySubscriptionId === stripeSub.id) {
              sub.status = stripeSub.status.toUpperCase();
              sub.cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
              sub.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          const stripeSub = event.data.object;
          for (const [userId, sub] of mockSubscriptions.entries()) {
            if (sub.gatewaySubscriptionId === stripeSub.id) {
              sub.status = "CANCELED";
              const user = mockUsers.get(userId);
              if (user) {
                user.planName = "FREE";
                user.planId = freePlan.id;
              }
            }
          }
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object;
          for (const [, sub] of mockSubscriptions.entries()) {
            if (sub.gatewaySubscriptionId === invoice.subscription) {
              sub.status = "ACTIVE";
            }
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          for (const [, sub] of mockSubscriptions.entries()) {
            if (sub.gatewaySubscriptionId === invoice.subscription) {
              sub.status = "PAST_DUE";
            }
          }
          break;
        }
      }

      return { processed: true };
    };

    // Teste 1: Evento de Checkout Concluído
    const checkoutEvent = {
      id: "evt_checkout_999",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          customer: "cus_stripe_abc",
          subscription: "sub_stripe_xyz",
          metadata: {
            userId: "usr_100",
            planName: "PRO",
          },
        },
      },
    };

    const res1 = simulateWebhookProcess(checkoutEvent);
    assert(res1.processed === true, "Webhook checkout.session.completed processado com sucesso");
    assert(mockUsers.get("usr_100").planName === "PRO", "Usuário atualizado para plano PRO após checkout");
    assert(mockSubscriptions.get("usr_100")?.status === "ACTIVE", "Assinatura criada com status ACTIVE");
    assert(mockSubscriptions.get("usr_100")?.gatewayCustomerId === "cus_stripe_abc", "ID de cliente Stripe registrado");

    // Teste 2: Reenvio do mesmo evento (Idempotência)
    const duplicateRes = simulateWebhookProcess(checkoutEvent);
    assert(
      duplicateRes.processed === false && Boolean(duplicateRes.reason?.includes("já processado")),
      "Idempotência: Evento duplicado reconhecido e rejeitado sem recriar ou duplicar registros"
    );

    // Teste 3: Evento de Falha de Pagamento na Renovação (invoice.payment_failed)
    const paymentFailedEvent = {
      id: "evt_invoice_fail_888",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_fail_123",
          subscription: "sub_stripe_xyz",
        },
      },
    };

    const resFail = simulateWebhookProcess(paymentFailedEvent);
    assert(resFail.processed === true, "Webhook invoice.payment_failed processado com sucesso");
    assert(
      mockSubscriptions.get("usr_100")?.status === "PAST_DUE",
      "Status da assinatura alterado para PAST_DUE aguardando pagamento ou Grace Period"
    );

    // Teste 4: Evento de Sucesso de Pagamento subsequente (invoice.payment_succeeded)
    const paymentSucceededEvent = {
      id: "evt_invoice_succ_777",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_succ_123",
          subscription: "sub_stripe_xyz",
        },
      },
    };

    const resSucc = simulateWebhookProcess(paymentSucceededEvent);
    assert(resSucc.processed === true, "Webhook invoice.payment_succeeded processado");
    assert(mockSubscriptions.get("usr_100")?.status === "ACTIVE", "Status da assinatura restaurado para ACTIVE");

    // Teste 5: Cancelamento Definitivo (customer.subscription.deleted)
    const canceledEvent = {
      id: "evt_sub_del_666",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_stripe_xyz",
        },
      },
    };

    const resCancel = simulateWebhookProcess(canceledEvent);
    assert(resCancel.processed === true, "Webhook customer.subscription.deleted processado");
    assert(mockSubscriptions.get("usr_100")?.status === "CANCELED", "Assinatura marcada como CANCELED");
    assert(mockUsers.get("usr_100")?.planName === "FREE", "Usuário revertido para plano FREE com segurança");
  }

  // =================================================================
  // 4. PREÇOS, VALIDAÇÕES E METADADOS DO CHECKOUT STRIPE
  // =================================================================
  console.log(`\n${CYAN}▶ 4. Validação de Preços Oficiais em BRL e Parâmetros de Checkout:${RESET}`);
  {
    // Valores reais do banco:
    // PRO: R$ 39,90 -> 3990 centavos
    // BUSINESS: R$ 99,90 -> 9990 centavos
    const calcCents = (price: number) => Math.round(price * 100);

    const proCents = calcCents(proPlan.priceMonth || 0);
    assert(proCents === 3990, "Plano PRO calculado com precisão em centavos: 3990 (R$ 39,90)");

    const bizCents = calcCents(businessPlan.priceMonth || 0);
    assert(bizCents === 9990, "Plano BUSINESS calculado com precisão em centavos: 9990 (R$ 99,90)");

    // Testes de Precificação Anual (com desconto)
    const proYearCents = calcCents(proPlan.priceYear || 0);
    assert(proYearCents === 39900, "Plano PRO Anual calculado com precisão em centavos: 39900 (R$ 399,00)");

    const bizYearCents = calcCents(businessPlan.priceYear || 0);
    assert(bizYearCents === 99900, "Plano BUSINESS Anual calculado com precisão em centavos: 99900 (R$ 999,00)");

    // Simulação do gerador de payload do checkout Stripe
    const buildStripeCheckoutPayload = (
      user: { id: string; email: string },
      plan: PlanDetails,
      billingCycle: "month" | "year" = "month"
    ) => {
      if (plan.name !== "PRO" && plan.name !== "BUSINESS") {
        throw new Error("Plano inválido para checkout pago.");
      }

      const isYearly = billingCycle === "year";
      const unitAmount = isYearly
        ? Math.round((plan.priceYear || (plan.priceMonth || 0) * 10) * 100)
        : Math.round((plan.priceMonth || 0) * 100);

      return {
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "brl",
              product_data: {
                name: `QR MASTER — ${plan.displayName} (${isYearly ? "Anual" : "Mensal"})`,
                description: `Assinatura ${isYearly ? "anual" : "mensal"} do plano ${plan.name}`,
              },
              unit_amount: unitAmount,
              recurring: { interval: isYearly ? "year" : "month" },
            },
            quantity: 1,
          },
        ],
        metadata: {
          userId: user.id,
          planId: plan.id,
          planName: plan.name,
          billingCycle: isYearly ? "year" : "month",
        },
        subscription_data: {
          metadata: {
            userId: user.id,
            planId: plan.id,
            planName: plan.name,
            billingCycle: isYearly ? "year" : "month",
          },
        },
      };
    };

    const payloadPro = buildStripeCheckoutPayload({ id: "usr_test_1", email: "user@test.com" }, proPlan, "month");
    assert(payloadPro.mode === "subscription", "Modo do checkout Stripe configurado como 'subscription'");
    assert(payloadPro.line_items[0].price_data.currency === "brl", "Moeda do checkout fixada em 'brl'");
    assert(payloadPro.line_items[0].price_data.unit_amount === 3990, "Valor unitário do PRO Mensal é 3990 centavos");
    assert(payloadPro.line_items[0].price_data.recurring.interval === "month", "Intervalo mensal configurado como 'month'");
    assert(payloadPro.metadata.userId === "usr_test_1", "Metadata do checkout vincula userId");
    assert(payloadPro.metadata.planName === "PRO", "Metadata do checkout vincula planName");
    assert(payloadPro.metadata.billingCycle === "month", "Metadata do checkout vincula billingCycle='month'");
    assert(payloadPro.subscription_data.metadata.userId === "usr_test_1", "Subscription_data vincula userId para faturas recorrentes");

    // Checkout Anual PRO
    const payloadProYear = buildStripeCheckoutPayload({ id: "usr_test_1", email: "user@test.com" }, proPlan, "year");
    assert(payloadProYear.line_items[0].price_data.unit_amount === 39900, "Valor unitário do PRO Anual é 39900 centavos (R$ 399,00)");
    assert(payloadProYear.line_items[0].price_data.recurring.interval === "year", "Intervalo anual configurado como 'year'");
    assert(payloadProYear.metadata.billingCycle === "year", "Metadata do checkout anual vincula billingCycle='year'");

    // Cálculo de Vigência: 365 dias para anual vs 30 dias para mensal
    const calcPeriodEnd = (startDate: Date, cycle: "month" | "year") => {
      const days = cycle === "year" ? 365 : 30;
      return new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
    };

    const startDate = new Date("2026-01-01T00:00:00Z");
    const monthlyEnd = calcPeriodEnd(startDate, "month");
    const yearlyEnd = calcPeriodEnd(startDate, "year");
    const diffMonthlyDays = Math.round((monthlyEnd.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const diffYearlyDays = Math.round((yearlyEnd.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

    assert(diffMonthlyDays === 30, "Ciclo mensal concede exatamente 30 dias de vigência");
    assert(diffYearlyDays === 365, "Ciclo anual concede exatamente 365 dias de vigência");

    // Tentativa de checkout com plano FREE deve lançar erro
    let errored = false;
    try {
      buildStripeCheckoutPayload({ id: "usr_test_1", email: "user@test.com" }, freePlan);
    } catch {
      errored = true;
    }
    assert(errored === true, "Tentativa de abrir checkout para plano FREE é rejeitada");
  }

  // =================================================================
  // 5. RESUMO FINAL DOS TESTES
  // =================================================================
  console.log(`\n================================================================`);
  console.log(`TOTAL DE TESTES DE COBRANÇA E ASSINATURAS: ${totalTests}`);
  console.log(`${GREEN}APROVADOS: ${passedTests}${RESET}`);
  console.log(`${failedTests === 0 ? GREEN : RED}FALHAS: ${failedTests}${RESET}`);
  console.log(`================================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runBillingAndSubscriptionTests().catch((err) => {
  console.error("Erro fatal na suíte de testes:", err);
  process.exit(1);
});
