import { prisma } from "../src/lib/db";
import {
  toCents,
  processMercadoPagoNotification,
} from "../src/lib/mercadopago";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

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
    if (detail) console.error(`    ${RED}Detalhe:${RESET} ${detail}`);
  }
}

async function runAmountValidationTests() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   SUÍTE DE TESTES: VALIDAÇÃO MONETÁRIA ESTRETA MERCADO PAGO    ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  // -------------------------------------------------------------------------
  // 1. TESTES UNITÁRIOS DA FUNÇÃO toCents
  // -------------------------------------------------------------------------
  console.log(`${CYAN}--- 1. Testes Unitários de toCents ---${RESET}`);
  assert(toCents(19.90) === 1990, "toCents(19.90) === 1990");
  assert(toCents(19.9) === 1990, "toCents(19.9) === 1990 (normalização correta)");
  assert(toCents(19.89) === 1989, "toCents(19.89) === 1989");
  assert(toCents(19.40) === 1940, "toCents(19.40) === 1940");
  assert(toCents(19.39) === 1939, "toCents(19.39) === 1939");
  assert(toCents(20.00) === 2000, "toCents(20.00) === 2000");
  assert(toCents(0.01) === 1, "toCents(0.01) === 1");
  assert(toCents(0) === 0, "toCents(0) === 0");
  assert(toCents(-19.90) === null, "toCents(-19.90) === null (rejeita negativo)");
  assert(toCents(NaN) === null, "toCents(NaN) === null (rejeita NaN)");
  assert(toCents(Infinity) === null, "toCents(Infinity) === null (rejeita Infinity)");
  assert(toCents(-Infinity) === null, "toCents(-Infinity) === null (rejeita -Infinity)");
  assert(toCents(null) === null, "toCents(null) === null (rejeita null)");
  assert(toCents(undefined) === null, "toCents(undefined) === null (rejeita undefined)");
  assert(toCents("19.90") === 1990, "toCents('19.90') === 1990");
  assert(toCents("19,90") === 1990, "toCents('19,90') === 1990");
  assert(toCents("29.90") === 2990, "toCents('29.90') === 2990");
  assert(toCents("99.00") === 9900, "toCents('99.00') === 9900");
  assert(toCents("199.00") === 19900, "toCents('199.00') === 19900");
  assert(toCents("19.899") === null, "toCents('19.899') === null (rejeita mais de 2 decimais)");
  assert(toCents(19.899) === null, "toCents(19.899) === null (rejeita float com > 2 decimais)");
  assert(toCents("invalid") === null, "toCents('invalid') === null (rejeita formato inválido)");

  // -------------------------------------------------------------------------
  // 2. SETUP DE PLANOS E USUÁRIO DE TESTE
  // -------------------------------------------------------------------------
  console.log(`\n${CYAN}--- 2. Verificação de Preços Server-Side no Banco ---${RESET}`);
  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  assert(Boolean(freePlan && proPlan && bizPlan), "Planos FREE, PRO e BUSINESS existem no banco");
  assert(Number(proPlan?.priceMonth) === 19.9, `Plano PRO mensal no banco é R$ 19,90 (atual: ${proPlan?.priceMonth})`);
  assert(Number(proPlan?.priceYear) === 99, `Plano PRO anual no banco é R$ 99,00 (atual: ${proPlan?.priceYear})`);
  assert(Number(bizPlan?.priceMonth) === 29.9, `Plano BUSINESS mensal no banco é R$ 29,90 (atual: ${bizPlan?.priceMonth})`);
  assert(Number(bizPlan?.priceYear) === 199, `Plano BUSINESS anual no banco é R$ 199,00 (atual: ${bizPlan?.priceYear})`);

  // Cria usuário de teste
  const testUser = await prisma.user.upsert({
    where: { email: "test_amount_validation@qrmaster.local" },
    create: {
      email: "test_amount_validation@qrmaster.local",
      name: "Audit Amount User",
      passwordHash: "dummyhash",
      planId: freePlan!.id,
    },
    update: {
      planId: freePlan!.id,
    },
  });

  // Limpa subscriptions ou claims anteriores do usuário de teste
  await prisma.subscription.deleteMany({ where: { userId: testUser.id } });

  // -------------------------------------------------------------------------
  // 3. MATRIZ DE TESTES OBRIGATÓRIOS (SEÇÃO 6 DO REQUISITO)
  // -------------------------------------------------------------------------
  console.log(`\n${CYAN}--- 3. Matriz de Testes Obrigatórios de Preço ---${RESET}`);

  // Helper para comparar cenários
  function evaluateAmountMatch(plan: any, isYearly: boolean, inputAmount: any): boolean {
    const expectedPrice = isYearly
      ? (Number(plan.priceYear) > 0 ? Number(plan.priceYear) : (plan.name === "PRO" ? 99 : 199))
      : (Number(plan.priceMonth) > 0 ? Number(plan.priceMonth) : (plan.name === "PRO" ? 19.9 : 29.9));

    const expectedCents = toCents(expectedPrice);
    const actualCents = toCents(inputAmount);

    return (
      expectedCents !== null &&
      actualCents !== null &&
      expectedCents > 0 &&
      actualCents === expectedCents
    );
  }

  // PRO mensal R$ 19,90
  assert(evaluateAmountMatch(proPlan, false, 19.90) === true, "PRO mensal: 19.90 -> PASS");
  assert(evaluateAmountMatch(proPlan, false, 19.9) === true, "PRO mensal: 19.9 -> PASS (normalizado)");
  assert(evaluateAmountMatch(proPlan, false, 19.89) === false, "PRO mensal: 19.89 -> REJECT");
  assert(evaluateAmountMatch(proPlan, false, 19.40) === false, "PRO mensal: 19.40 -> REJECT (antiga tolerância eliminada)");
  assert(evaluateAmountMatch(proPlan, false, 19.39) === false, "PRO mensal: 19.39 -> REJECT");
  assert(evaluateAmountMatch(proPlan, false, 20.00) === false, "PRO mensal: 20.00 -> REJECT (valor superior sem regra específica)");
  assert(evaluateAmountMatch(proPlan, false, 0.01) === false, "PRO mensal: 0.01 -> REJECT");
  assert(evaluateAmountMatch(proPlan, false, 0) === false, "PRO mensal: 0 -> REJECT");
  assert(evaluateAmountMatch(proPlan, false, -19.90) === false, "PRO mensal: -19.90 -> REJECT");
  assert(evaluateAmountMatch(proPlan, false, NaN) === false, "PRO mensal: NaN -> REJECT");
  assert(evaluateAmountMatch(proPlan, false, Infinity) === false, "PRO mensal: Infinity -> REJECT");
  assert(evaluateAmountMatch(proPlan, false, null) === false, "PRO mensal: null -> REJECT");
  assert(evaluateAmountMatch(proPlan, false, undefined) === false, "PRO mensal: undefined -> REJECT");

  // BUSINESS mensal R$ 29,90
  assert(evaluateAmountMatch(bizPlan, false, 29.90) === true, "BUSINESS mensal: 29.90 -> PASS");
  assert(evaluateAmountMatch(bizPlan, false, 29.89) === false, "BUSINESS mensal: 29.89 -> REJECT");
  assert(evaluateAmountMatch(bizPlan, false, 29.40) === false, "BUSINESS mensal: 29.40 -> REJECT");
  assert(evaluateAmountMatch(bizPlan, false, 30.00) === false, "BUSINESS mensal: 30.00 -> REJECT");

  // PRO anual R$ 99,00
  assert(evaluateAmountMatch(proPlan, true, 99.00) === true, "PRO anual: 99.00 -> PASS");
  assert(evaluateAmountMatch(proPlan, true, 98.99) === false, "PRO anual: 98.99 -> REJECT");
  assert(evaluateAmountMatch(proPlan, true, 99.01) === false, "PRO anual: 99.01 -> REJECT");

  // BUSINESS anual R$ 199,00
  assert(evaluateAmountMatch(bizPlan, true, 199.00) === true, "BUSINESS anual: 199.00 -> PASS");
  assert(evaluateAmountMatch(bizPlan, true, 198.99) === false, "BUSINESS anual: 198.99 -> REJECT");
  assert(evaluateAmountMatch(bizPlan, true, 199.01) === false, "BUSINESS anual: 199.01 -> REJECT");

  // -------------------------------------------------------------------------
  // 4. TESTE DE WEBHOOK E INTEGRAÇÃO (SEÇÕES 7 E 8)
  // -------------------------------------------------------------------------
  console.log(`\n${CYAN}--- 4. Testes de Webhook e Tentativa de Adulteração ---${RESET}`);

  // 4.1 Simulação de Webhook com status = approved mas transaction_amount = 19.40 (PRO mensal)
  const tamperedPid = `test_tampered_1940_${Date.now()}`;
  const tamperedPayload = {
    id: tamperedPid,
    status: "approved",
    transaction_amount: 19.40,
    external_reference: JSON.stringify({
      userId: testUser.id,
      planId: proPlan!.id,
      planName: "PRO",
      billingCycle: "month",
      // Tentativa de injeção de preço fraudado pelo cliente
      price: 0.01,
      amount: 0.01,
    }),
  };

  const tamperedRes = await processMercadoPagoNotification(tamperedPid, tamperedPayload);
  assert(
    tamperedRes.status === "amount_mismatch",
    "Webhook 19.40 (PRO mensal): Retorna status 'amount_mismatch'",
    JSON.stringify(tamperedRes)
  );

  const userAfterTampered = await prisma.user.findUnique({ where: { id: testUser.id } });
  assert(
    userAfterTampered?.planId === freePlan!.id,
    "Webhook 19.40: Plano do usuário NÃO é alterado (permanece FREE)"
  );

  const subAfterTampered = await prisma.subscription.findUnique({ where: { userId: testUser.id } });
  assert(
    subAfterTampered === null,
    "Webhook 19.40: Nenhuma Subscription ACTIVE foi criada"
  );

  const logAfterTampered = await prisma.activityLog.findFirst({
    where: { userId: testUser.id, action: "SUBSCRIPTION_ACTIVATE", entityId: tamperedPid },
  });
  assert(
    logAfterTampered === null,
    "Webhook 19.40: Nenhum log SUBSCRIPTION_ACTIVATE foi criado"
  );

  const eventAfterTampered = await prisma.webhookEvent.findUnique({
    where: { eventId: `mp_payment_${tamperedPid}` },
  });
  assert(
    eventAfterTampered?.status === "FAILED" && eventAfterTampered?.eventType === "payment.amount_mismatch",
    "Webhook 19.40: WebhookEvent registrado com status FAILED e eventType payment.amount_mismatch"
  );

  // 4.2 Simulação de Webhook com status = approved e transaction_amount = 19.90 (PRO mensal)
  const legitPid = `test_legit_1990_${Date.now()}`;
  const legitPayload = {
    id: legitPid,
    status: "approved",
    transaction_amount: 19.90,
    external_reference: JSON.stringify({
      userId: testUser.id,
      planId: proPlan!.id,
      planName: "PRO",
      billingCycle: "month",
    }),
  };

  const legitRes = await processMercadoPagoNotification(legitPid, legitPayload);
  assert(
    legitRes.status === "approved",
    "Webhook 19.90 (PRO mensal): Retorna status 'approved' e prossegue com ativação",
    JSON.stringify(legitRes)
  );

  const userAfterLegit = await prisma.user.findUnique({ where: { id: testUser.id } });
  assert(
    userAfterLegit?.planId === proPlan!.id,
    "Webhook 19.90: Plano do usuário foi atualizado para PRO com sucesso"
  );

  const subAfterLegit = await prisma.subscription.findUnique({ where: { userId: testUser.id } });
  assert(
    subAfterLegit?.status === "ACTIVE" && subAfterLegit?.planId === proPlan!.id,
    "Webhook 19.90: Subscription ACTIVE criada para o plano PRO"
  );

  const logAfterLegit = await prisma.activityLog.findFirst({
    where: { userId: testUser.id, action: "SUBSCRIPTION_ACTIVATE", entityId: legitPid },
  });
  assert(
    logAfterLegit !== null,
    "Webhook 19.90: ActivityLog SUBSCRIPTION_ACTIVATE criado com sucesso"
  );

  // Limpeza do usuário de teste
  await prisma.subscription.deleteMany({ where: { userId: testUser.id } });
  await prisma.activityLog.deleteMany({ where: { userId: testUser.id } });
  await prisma.webhookEvent.deleteMany({
    where: { eventId: { in: [`mp_payment_${tamperedPid}`, `mp_claim_${tamperedPid}`, `mp_payment_${legitPid}`, `mp_claim_${legitPid}`] } },
  });
  await prisma.user.delete({ where: { id: testUser.id } });

  // -------------------------------------------------------------------------
  // RELATÓRIO FINAL DA SUÍTE
  // -------------------------------------------------------------------------
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}                       RESUMO DOS TESTES                        ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}`);
  console.log(`Total de asserções executadas: ${totalTests}`);
  console.log(`Asserções aprovadas: ${GREEN}${passedTests}${RESET}`);
  console.log(`Asserções com falha: ${failedTests > 0 ? RED : GREEN}${failedTests}${RESET}`);

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log(`\n${GREEN}TODOS OS TESTES DE VALIDAÇÃO DE VALOR PASSARAM COM SUCESSO!${RESET}\n`);
  }
}

runAmountValidationTests()
  .catch((err) => {
    console.error("Erro fatal ao executar testes:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
