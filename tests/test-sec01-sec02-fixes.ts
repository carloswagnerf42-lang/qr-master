import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import {
  processMercadoPagoNotification,
  isEventIdUniqueConstraintError,
} from "../src/lib/mercadopago";
import { getOrCreateStripeCustomer } from "../src/lib/stripe";
import { GET as getSubscription } from "../src/app/api/billing/subscription/route";
import { POST as openPortal } from "../src/app/api/billing/portal/route";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

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

async function run() {
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy_key_for_testing";

  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}   SUÍTE DE TESTES DE REGRESSÃO: CORREÇÃO SEC-01 & SEC-02               ${RESET}`);
  console.log(`${CYAN}========================================================================\n${RESET}`);

  const testSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  // Obter planos necessários
  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  if (!freePlan || !proPlan || !bizPlan) {
    throw new Error("Planos essenciais (FREE, PRO, BUSINESS) não encontrados no banco.");
  }

  // Criar usuários isolados para os testes
  const userA = await prisma.user.create({
    data: {
      name: "Test User A SEC01",
      email: `test_user_a_${testSuffix}@example.com`,
      role: "USER",
      planId: freePlan.id,
    },
  });

  const userB = await prisma.user.create({
    data: {
      name: "Test User B SEC01",
      email: `test_user_b_${testSuffix}@example.com`,
      role: "USER",
      planId: freePlan.id,
    },
  });

  const userStripe = await prisma.user.create({
    data: {
      name: "Test User Stripe SEC02",
      email: `test_user_stripe_${testSuffix}@example.com`,
      role: "USER",
      planId: proPlan.id,
    },
  });

  const sharedPayerId = "998877665";
  const pidA = `mp_test_sec01_a_${testSuffix}`;
  const pidB = `mp_test_sec01_b_${testSuffix}`;
  const pidConc = `mp_test_sec01_conc_${testSuffix}`;

  try {
    // =========================================================================
    // CASO A: Usuário A paga PRO via Mercado Pago com payerId X
    // =========================================================================
    console.log(`${YELLOW}▶ CASO A: Usuário A paga PRO via Mercado Pago com payerId X${RESET}`);
    {
      const payloadA = {
        id: pidA,
        status: "approved",
        transaction_amount: 19.90,
        payer: { id: sharedPayerId },
        external_reference: JSON.stringify({
          userId: userA.id,
          planId: proPlan.id,
          planName: "PRO",
          billingCycle: "month",
        }),
      };

      const resA = await processMercadoPagoNotification(pidA, payloadA);
      assert(resA.status === "approved", "CASO A: Webhook retorna status 'approved' para Usuário A");

      const userAfterA = await prisma.user.findUnique({ where: { id: userA.id } });
      assert(userAfterA?.planId === proPlan.id, "CASO A: Usuário A promovido para o plano PRO");

      const subAfterA = await prisma.subscription.findUnique({ where: { userId: userA.id } });
      assert(
        subAfterA?.status === "ACTIVE" &&
        subAfterA?.gateway === "mercadopago" &&
        subAfterA?.gatewaySubscriptionId === pidA &&
        subAfterA?.gatewayCustomerId === null,
        "CASO A: Assinatura ACTIVE criada com gatewayCustomerId: null (sem poluir com payerId)"
      );
    }

    // =========================================================================
    // CASO B: Usuário B paga BUSINESS via Mercado Pago usando o MESMO payerId X
    // =========================================================================
    console.log(`\n${YELLOW}▶ CASO B: Usuário B paga BUSINESS usando o MESMO payerId X (Zero colisão de constraint)${RESET}`);
    {
      const payloadB = {
        id: pidB,
        status: "approved",
        transaction_amount: 29.90,
        payer: { id: sharedPayerId }, // Mesmo ID de pagador do Mercado Pago
        external_reference: JSON.stringify({
          userId: userB.id,
          planId: bizPlan.id,
          planName: "BUSINESS",
          billingCycle: "month",
        }),
      };

      const resB = await processMercadoPagoNotification(pidB, payloadB);
      assert(resB.status === "approved", "CASO B: Webhook retorna status 'approved' para Usuário B (sem erro P2002)");

      const userAfterB = await prisma.user.findUnique({ where: { id: userB.id } });
      assert(userAfterB?.planId === bizPlan.id, "CASO B: Usuário B promovido para o plano BUSINESS");

      const subAfterB = await prisma.subscription.findUnique({ where: { userId: userB.id } });
      assert(
        subAfterB?.status === "ACTIVE" &&
        subAfterB?.gateway === "mercadopago" &&
        subAfterB?.gatewaySubscriptionId === pidB &&
        subAfterB?.gatewayCustomerId === null,
        "CASO B: Assinatura Usuário B criada com ACTIVE e gatewayCustomerId: null com o mesmo payer"
      );
    }

    // =========================================================================
    // CASO C: Webhook do mesmo paymentId chega duas vezes sequencialmente
    // =========================================================================
    console.log(`\n${YELLOW}▶ CASO C: Webhook duplicado sequencial (Idempotência)${RESET}`);
    {
      const payloadA = {
        id: pidA,
        status: "approved",
        transaction_amount: 19.90,
        payer: { id: sharedPayerId },
        external_reference: JSON.stringify({
          userId: userA.id,
          planId: proPlan.id,
          planName: "PRO",
          billingCycle: "month",
        }),
      };

      const resDup = await processMercadoPagoNotification(pidA, payloadA);
      assert(
        resDup.status === "already_processed",
        "CASO C: Segunda chamada do mesmo paymentId retorna 'already_processed'"
      );

      const logsCount = await prisma.activityLog.count({
        where: { userId: userA.id, action: "SUBSCRIPTION_ACTIVATE", entityId: pidA },
      });
      assert(logsCount === 1, "CASO C: Exatamente 1 registro de SUBSCRIPTION_ACTIVATE gerado no banco");
    }

    // =========================================================================
    // CASO D: Dois webhooks iguais chegam concorrentemente
    // =========================================================================
    console.log(`\n${YELLOW}▶ CASO D: Webhooks concorrentes para o mesmo paymentId${RESET}`);
    {
      const payloadConc = {
        id: pidConc,
        status: "approved",
        transaction_amount: 19.90,
        payer: { id: sharedPayerId },
        external_reference: JSON.stringify({
          userId: userA.id,
          planId: proPlan.id,
          planName: "PRO",
          billingCycle: "month",
        }),
      };

      const [res1, res2] = await Promise.all([
        processMercadoPagoNotification(pidConc, payloadConc),
        processMercadoPagoNotification(pidConc, payloadConc),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert(
        statuses[0] === "already_processed" && statuses[1] === "approved",
        "CASO D: Um webhook ativa (approved) e o concorrente é bloqueado como already_processed",
        JSON.stringify(statuses)
      );

      const concLogs = await prisma.activityLog.count({
        where: { userId: userA.id, action: "SUBSCRIPTION_ACTIVATE", entityId: pidConc },
      });
      assert(concLogs === 1, "CASO D: Apenas 1 ativação registrada no banco sob concorrência simultânea");
    }

    // =========================================================================
    // CASO E: Usuário Mercado Pago consulta subscription (hasCustomerPortal)
    // =========================================================================
    console.log(`\n${YELLOW}▶ CASO E: Consulta de assinatura Mercado Pago (hasCustomerPortal === false)${RESET}`);
    {
      const tokenA = signToken({
        id: userA.id,
        name: userA.name,
        email: userA.email,
        role: userA.role,
      });

      const reqA = new NextRequest("http://localhost/api/billing/subscription", {
        headers: {
          cookie: `qrmaster_session=${tokenA}`,
        },
      });

      const subResA = await getSubscription(reqA);
      assert(subResA.status === 200, "CASO E: Rota GET /api/billing/subscription responde HTTP 200");

      const dataA = await subResA.json();
      assert(
        dataA.subscription?.hasCustomerPortal === false,
        "CASO E: hasCustomerPortal é false para assinante Mercado Pago com gatewayCustomerId nulo",
        JSON.stringify(dataA.subscription)
      );

      // Simular também assinante com dado histórico no banco (onde gatewayCustomerId tinha o ID do payer)
      await prisma.subscription.update({
        where: { userId: userA.id },
        data: { gatewayCustomerId: "historical_mp_payer_123" },
      });

      const subResHistorical = await getSubscription(reqA);
      const dataHistorical = await subResHistorical.json();
      assert(
        dataHistorical.subscription?.hasCustomerPortal === false,
        "CASO E: hasCustomerPortal continua false mesmo com dado histórico numérico pois gateway é mercadopago"
      );
    }

    // =========================================================================
    // CASO F: Usuário Mercado Pago chama diretamente POST /api/billing/portal
    // =========================================================================
    console.log(`\n${YELLOW}▶ CASO F: Chamada direta a POST /api/billing/portal por assinante Mercado Pago${RESET}`);
    {
      const tokenA = signToken({
        id: userA.id,
        name: userA.name,
        email: userA.email,
        role: userA.role,
      });

      const portalReqA = new NextRequest("http://localhost/api/billing/portal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `qrmaster_session=${tokenA}`,
        },
      });

      const portalResA = await openPortal(portalReqA);
      assert(
        portalResA.status === 400,
        "CASO F: POST /api/billing/portal retorna status 400 controlado (nunca 500)"
      );

      const portalDataA = await portalResA.json();
      assert(
        typeof portalDataA.error === "string" &&
        portalDataA.error.includes("Mercado Pago"),
        "CASO F: Retorna mensagem informativa indicando que o portal Stripe não é para assinaturas MP",
        portalDataA.error
      );
    }

    // =========================================================================
    // CASO G: Usuário Stripe legítimo
    // =========================================================================
    console.log(`\n${YELLOW}▶ CASO G: Usuário Stripe legítimo${RESET}`);
    {
      // Criar assinatura com gateway = stripe
      await prisma.subscription.create({
        data: {
          userId: userStripe.id,
          planId: proPlan.id,
          gateway: "stripe",
          gatewayCustomerId: `cus_test_stripe_${testSuffix}`,
          gatewaySubscriptionId: `sub_test_stripe_${testSuffix}`,
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
        },
      });

      const tokenStripe = signToken({
        id: userStripe.id,
        name: userStripe.name,
        email: userStripe.email,
        role: userStripe.role,
      });

      const reqStripe = new NextRequest("http://localhost/api/billing/subscription", {
        headers: {
          cookie: `qrmaster_session=${tokenStripe}`,
        },
      });

      const subResStripe = await getSubscription(reqStripe);
      const dataStripe = await subResStripe.json();
      assert(
        dataStripe.subscription?.hasCustomerPortal === true,
        "CASO G: hasCustomerPortal é true para assinante Stripe com gatewayCustomerId válido"
      );

      // Testar se getOrCreateStripeCustomer respeita gateway === 'stripe'
      const existingCusId = await getOrCreateStripeCustomer(
        userStripe.id,
        userStripe.email,
        userStripe.name
      );
      assert(
        existingCusId === `cus_test_stripe_${testSuffix}`,
        "CASO G: getOrCreateStripeCustomer recupera customerId do Stripe com sucesso"
      );

      // E para o Usuário A (Mercado Pago), getOrCreateStripeCustomer NÃO deve reaproveitar dados do MP
      const subA = await prisma.subscription.findUnique({ where: { userId: userA.id } });
      assert(
        subA?.gateway === "mercadopago",
        "CASO G: Gateway do Usuário A permanece devidamente identificado como mercadopago"
      );

      // 1. Verificação comportamental: STRIPE_SECRET_KEY ausente -> HTTP 503
      const origStripeKey = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;

      const portalReqNoKey = new NextRequest("http://localhost/api/billing/portal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `qrmaster_session=${tokenStripe}`,
        },
      });
      const portalResNoKey = await openPortal(portalReqNoKey);
      assert(
        portalResNoKey.status === 503,
        "CASO G: Retorna HTTP 503 quando STRIPE_SECRET_KEY está ausente no ambiente"
      );

      // 2. Verificação comportamental: Erro inesperado na Stripe -> HTTP 500 seguro
      process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_500_test";
      const portalReqStripeErr = new NextRequest("http://localhost/api/billing/portal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `qrmaster_session=${tokenStripe}`,
        },
      });
      const portalResStripeErr = await openPortal(portalReqStripeErr);
      assert(
        portalResStripeErr.status === 500,
        "CASO G: Falha inesperada na chamada da Stripe retorna HTTP 500 genérico"
      );
      const portalDataStripeErr = await portalResStripeErr.json();
      assert(
        portalDataStripeErr.error === "Falha ao acessar o portal de faturamento.",
        "CASO G: Resposta de erro 500 é genérica e não expõe detalhes internos sensíveis"
      );

      // Restaura o ambiente
      if (origStripeKey) {
        process.env.STRIPE_SECRET_KEY = origStripeKey;
      } else {
        delete process.env.STRIPE_SECRET_KEY;
      }
    }

    // =========================================================================
    // CASO H: Validação estrita de erro P2002 (isEventIdUniqueConstraintError)
    // =========================================================================
    console.log(`\n${YELLOW}▶ CASO H: Tratamento estrito de erro Prisma P2002${RESET}`);
    {
      // 1. Erro P2002 genuíno de eventId
      const eventIdErr1 = {
        code: "P2002",
        meta: { target: ["eventId"] },
        message: "Unique constraint failed on the fields: (`eventId`)",
      };
      assert(
        isEventIdUniqueConstraintError(eventIdErr1) === true,
        "CASO H: isEventIdUniqueConstraintError identifica target: ['eventId'] como duplicata"
      );

      // 2. Erro P2002 em string constraint name
      const eventIdErr2 = {
        code: "P2002",
        meta: { target: "WebhookEvent_eventId_key" },
        message: "Unique constraint failed on the constraint: `WebhookEvent_eventId_key`",
      };
      assert(
        isEventIdUniqueConstraintError(eventIdErr2) === true,
        "CASO H: isEventIdUniqueConstraintError identifica constraint WebhookEvent_eventId_key"
      );

      // 3. Erro P2002 em gatewayCustomerId NÃO DEVE ser classificado como eventId duplicado
      const customerIdErr = {
        code: "P2002",
        meta: { target: ["gatewayCustomerId"] },
        message: "Unique constraint failed on the fields: (`gatewayCustomerId`)",
      };
      assert(
        isEventIdUniqueConstraintError(customerIdErr) === false,
        "CASO H: Erro P2002 em gatewayCustomerId é rejeitado como duplicata (não mascara falha)"
      );

      // 4. Erro P2002 em userId NÃO DEVE ser classificado como duplicata
      const userIdErr = {
        code: "P2002",
        meta: { target: ["userId"] },
        message: "Unique constraint failed on the fields: (`userId`)",
      };
      assert(
        isEventIdUniqueConstraintError(userIdErr) === false,
        "CASO H: Erro P2002 em userId é rejeitado como duplicata"
      );

      // 5. Erro P2002 em email NÃO DEVE ser classificado como duplicata
      const emailErr = {
        code: "P2002",
        meta: { target: ["email"] },
        message: "Unique constraint failed on the fields: (`email`)",
      };
      assert(
        isEventIdUniqueConstraintError(emailErr) === false,
        "CASO H: Erro P2002 em email é rejeitado como duplicata"
      );

      // 6. Outro código de erro (P2003) NÃO DEVE ser classificado como duplicata
      const p2003Err = {
        code: "P2003",
        meta: { field_name: "planId" },
        message: "Foreign key constraint failed on the field",
      };
      assert(
        isEventIdUniqueConstraintError(p2003Err) === false,
        "CASO H: Erro com outro código (P2003) retorna false"
      );

      // 7. Objeto vazio ou null
      assert(isEventIdUniqueConstraintError(null) === false, "CASO H: null retorna false");
      assert(isEventIdUniqueConstraintError({}) === false, "CASO H: {} retorna false");
    }

  } finally {
    // Limpeza rigorosa e idempotente dos dados de teste
    console.log(`\n${CYAN}--- Limpeza de Dados de Teste ---${RESET}`);
    await prisma.subscription.deleteMany({
      where: { userId: { in: [userA.id, userB.id, userStripe.id] } },
    });
    await prisma.activityLog.deleteMany({
      where: { userId: { in: [userA.id, userB.id, userStripe.id] } },
    });
    await prisma.webhookEvent.deleteMany({
      where: {
        eventId: {
          in: [
            `mp_payment_${pidA}`,
            `mp_claim_${pidA}`,
            `mp_payment_${pidB}`,
            `mp_claim_${pidB}`,
            `mp_payment_${pidConc}`,
            `mp_claim_${pidConc}`,
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id, userStripe.id] } },
    });
    console.log(`  ${GREEN}✓ Dados de teste removidos com sucesso.${RESET}`);
  }

  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}   RESULTADO FINAL: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS (${failedTests} FALHAS)   ${RESET}`);
  console.log(`${CYAN}========================================================================\n${RESET}`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Erro fatal na execução da suíte de testes:", err);
  process.exit(1);
});
