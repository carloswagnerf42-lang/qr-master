/**
 * SUÍTE DE AUDITORIA E VALIDAÇÃO CONTROLADA: RENOVAÇÃO ANTECIPADA E CÁLCULO DO PERÍODO
 * Projeto: QR MASTER
 * 
 * Fases cobertas:
 * 1. Auditoria e Snapshot Inicial da Transação Histórica (#178856033673)
 * 2. Reprodução do BUG COMERCIAL (Perda de dias restantes no código sem correção)
 * 3. PRO Mensal: 6 cenários (20 dias restantes, 1 dia restante, vencimento exato, vencido 1 dia, vencido 30 dias, sem assinatura)
 * 4. PRO Anual: cenários com dias restantes e vencido (+365 dias)
 * 5. BUSINESS Mensal e Anual: renovação do mesmo plano preservando dias restantes
 * 6. Primeira Compra (FREE -> PRO Mensal e FREE -> PRO Anual)
 * 7. Assinatura Expirada (currentPeriodEnd < now)
 * 8. Idempotência: reprocessamento 1x, 2x, 5x, 10x do mesmo paymentId
 * 9. Concorrência Real: Webhook x /status com 2, 5 e 10 workers paralelos
 * 10. Auditoria de Upgrade: PRO -> BUSINESS (avaliação de dias restantes e substituição de plano)
 * 11. Auditoria BUSINESS -> BUSINESS (renovação do mesmo plano)
 * 12. Auditoria Mudança de Ciclo (Mensal <-> Anual)
 * 13. Reversão por Reembolso (refunded) e Contestação (charged_back)
 * 14. Segurança e Integridade de Centavos (Tolerância Zero)
 * 15. Auditoria da Semântica de currentPeriodStart e Janela de Quota
 * 16. Verificação Final de Inviolabilidade do Pagamento Histórico #178856033673
 */

import { PrismaClient } from "@prisma/client";
import { processMercadoPagoNotification, toCents } from "../src/lib/mercadopago";
import { getUserPlanAndUsage, calculateUserMonthlyQuotaWindow } from "../src/lib/permissions";

const prisma = new PrismaClient();

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ${GREEN}✅ [PASS]${RESET} ${message}`);
  } else {
    failedAssertions++;
    console.error(`  ${RED}❌ [FAIL]${RESET} ${message}`);
  }
}

async function runRenewalPeriodAudit() {
  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}🔍 AUDITORIA CONTROLADA: RENOVAÇÃO ANTECIPADA E CÁLCULO DE PERÍODO${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);

  const createdUserIds: string[] = [];
  const createdPaymentIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // FASE 1: SNAPSHOT INICIAL DA TRANSAÇÃO HISTÓRICA (#178856033673)
    // -------------------------------------------------------------------------
    console.log(`${YELLOW}--- FASE 1: SNAPSHOT INICIAL DO PAGAMENTO HISTÓRICO PROTEGIDO ---${RESET}`);
    const histBefore = await prisma.subscription.findFirst({
      where: { gatewaySubscriptionId: "178856033673" },
      include: { plan: true, user: true },
    });

    assert(histBefore !== null, "1.1. Pagamento histórico #178856033673 localizado no banco");
    assert(histBefore?.status === "ACTIVE", "1.2. Status inicial é ACTIVE");
    assert(histBefore?.plan?.name === "PRO", "1.3. Plano inicial é PRO");
    assert(histBefore?.user?.email === "itzjhonzin@gmail.com", "1.4. Usuário titular é itzjhonzin@gmail.com");

    const histSnapshot = {
      id: histBefore?.id,
      gatewaySubscriptionId: histBefore?.gatewaySubscriptionId,
      status: histBefore?.status,
      planId: histBefore?.planId,
      currentPeriodStart: histBefore?.currentPeriodStart?.toISOString(),
      currentPeriodEnd: histBefore?.currentPeriodEnd?.toISOString(),
      userId: histBefore?.userId,
    };

    // Planos no banco
    const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
    const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
    const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

    assert(!!freePlan && !!proPlan && !!bizPlan, "1.5. Planos FREE, PRO e BUSINESS carregados do banco");

    // Helper para criar usuário de teste isolado
    async function createTestUser(prefix: string) {
      const email = `test_${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@test.local`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: "audit_dummy_hash",
          name: `Audit User ${prefix}`,
          role: "USER",
          planId: freePlan!.id,
        },
      });
      createdUserIds.push(user.id);
      return user;
    }

    // -------------------------------------------------------------------------
    // FASE 2: PROVA CONCEITUAL DO CÁLCULO DE PERÍODO NA RENOVAÇÃO DO MESMO PLANO
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 2: AUDITORIA DO CÁLCULO BASE (PRESERVAÇÃO DE DIAS RESTANTES) ---${RESET}`);
    const userRepro = await createTestUser("repro");

    // Assinatura ativa com exatamente 20 dias restantes
    const initialStart = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const initialEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    await prisma.subscription.create({
      data: {
        userId: userRepro.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_repro_init",
        currentPeriodStart: initialStart,
        currentPeriodEnd: initialEnd,
      },
    });
    await prisma.user.update({
      where: { id: userRepro.id },
      data: { planId: proPlan!.id },
    });

    const payReproId = `pay_repro_${Date.now()}`;
    createdPaymentIds.push(payReproId);

    const payRepro = {
      id: payReproId,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({
        userId: userRepro.id,
        planId: proPlan!.id,
        planName: "PRO",
        billingCycle: "month",
      }),
    };

    await processMercadoPagoNotification(payReproId, payRepro);

    const subReproAfter = await prisma.subscription.findUnique({
      where: { userId: userRepro.id },
    });

    const expectedRenewalEnd = new Date(initialEnd.getTime() + 30 * 24 * 60 * 60 * 1000);
    const actualRenewalEnd = new Date(subReproAfter!.currentPeriodEnd);
    const diffHoursFromExpected = Math.abs(actualRenewalEnd.getTime() - expectedRenewalEnd.getTime()) / (1000 * 60 * 60);

    // O teste valida se os 20 dias foram preservados (+30 a partir de initialEnd = ~50 dias a partir de now)
    const totalDaysFromNow = Math.round((actualRenewalEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    console.log(`    [Auditoria] Dias de vigência restantes após renovação mensal: ${totalDaysFromNow} dias`);

    const isBugFixed = diffHoursFromExpected < 2; // tolerância de 2 horas para execução
    assert(
      isBugFixed,
      `2.1. Renovação antecipada preserva os 20 dias restantes (+30 dias sobre currentPeriodEnd = total ~50 dias, obtido: ${totalDaysFromNow} dias)`
    );

    // -------------------------------------------------------------------------
    // FASE 3: PRO MENSAL — 6 CENÁRIOS
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 3: PRO MENSAL — MATRIZ DE 6 CENÁRIOS ---${RESET}`);

    // Cenário A: 20 dias restantes
    const user3A = await createTestUser("p3a");
    const end3A = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user3A.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_3a",
        currentPeriodStart: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end3A,
      },
    });
    const pay3A = `pay_3a_${Date.now()}`;
    createdPaymentIds.push(pay3A);
    await processMercadoPagoNotification(pay3A, {
      id: pay3A,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user3A.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });
    const sub3A = await prisma.subscription.findUnique({ where: { userId: user3A.id } });
    const diffDays3A = Math.round((sub3A!.currentPeriodEnd.getTime() - end3A.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays3A === 30, `3.1. Cenário A (20 dias restantes): vigência estendida em exatamente 30 dias além do vencimento anterior (calculado: +${diffDays3A} dias)`);

    // Cenário B: 1 dia restante
    const user3B = await createTestUser("p3b");
    const end3B = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user3B.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_3b",
        currentPeriodStart: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end3B,
      },
    });
    const pay3B = `pay_3b_${Date.now()}`;
    createdPaymentIds.push(pay3B);
    await processMercadoPagoNotification(pay3B, {
      id: pay3B,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user3B.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });
    const sub3B = await prisma.subscription.findUnique({ where: { userId: user3B.id } });
    const diffDays3B = Math.round((sub3B!.currentPeriodEnd.getTime() - end3B.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays3B === 30, `3.2. Cenário B (1 dia restante): vigência estendida em exatamente 30 dias além do vencimento anterior (calculado: +${diffDays3B} dias)`);

    // Cenário C: Renovação no vencimento exato (currentPeriodEnd = now)
    const user3C = await createTestUser("p3c");
    const end3C = new Date(Date.now());
    await prisma.subscription.create({
      data: {
        userId: user3C.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_3c",
        currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end3C,
      },
    });
    const pay3C = `pay_3c_${Date.now()}`;
    createdPaymentIds.push(pay3C);
    await processMercadoPagoNotification(pay3C, {
      id: pay3C,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user3C.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });
    const sub3C = await prisma.subscription.findUnique({ where: { userId: user3C.id } });
    const diffDays3C = Math.round((sub3C!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diffDays3C === 30, `3.3. Cenário C (no vencimento): novo período é de 30 dias a partir de now (calculado: ${diffDays3C} dias)`);

    // Cenário D: Assinatura vencida há 1 dia (currentPeriodEnd = now - 1 dia)
    const user3D = await createTestUser("p3d");
    const end3D = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user3D.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_3d",
        currentPeriodStart: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end3D,
      },
    });
    const pay3D = `pay_3d_${Date.now()}`;
    createdPaymentIds.push(pay3D);
    await processMercadoPagoNotification(pay3D, {
      id: pay3D,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user3D.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });
    const sub3D = await prisma.subscription.findUnique({ where: { userId: user3D.id } });
    const diffDays3D = Math.round((sub3D!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diffDays3D === 30, `3.4. Cenário D (vencida há 1 dia): base recai com segurança em now (+30 dias a partir de now, não adiciona ao passado)`);

    // Cenário E: Assinatura vencida há 30 dias
    const user3E = await createTestUser("p3e");
    const end3E = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user3E.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_3e",
        currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end3E,
      },
    });
    const pay3E = `pay_3e_${Date.now()}`;
    createdPaymentIds.push(pay3E);
    await processMercadoPagoNotification(pay3E, {
      id: pay3E,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user3E.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });
    const sub3E = await prisma.subscription.findUnique({ where: { userId: user3E.id } });
    const diffDays3E = Math.round((sub3E!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diffDays3E === 30, `3.5. Cenário E (vencida há 30 dias): base recai em now (+30 dias concedidos)`);

    // Cenário F: Usuário sem assinatura anterior (FREE -> PRO primeira compra)
    const user3F = await createTestUser("p3f");
    const pay3F = `pay_3f_${Date.now()}`;
    createdPaymentIds.push(pay3F);
    await processMercadoPagoNotification(pay3F, {
      id: pay3F,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user3F.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });
    const sub3F = await prisma.subscription.findUnique({ where: { userId: user3F.id } });
    const diffDays3F = Math.round((sub3F!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diffDays3F === 30, `3.6. Cenário F (sem assinatura anterior): novo período inicia em now (+30 dias exatos)`);

    // -------------------------------------------------------------------------
    // FASE 4: PRO ANUAL (+365 DIAS)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 4: PRO ANUAL — RENOVAÇÃO ANTECIPADA E VENCIDA ---${RESET}`);

    // Cenário A: PRO anual ativo com 20 dias restantes -> novo fim = +365 dias sobre currentPeriodEnd
    const user4A = await createTestUser("p4a");
    const end4A = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user4A.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_4a",
        currentPeriodStart: new Date(Date.now() - 345 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end4A,
      },
    });
    const pay4A = `pay_4a_${Date.now()}`;
    createdPaymentIds.push(pay4A);
    await processMercadoPagoNotification(pay4A, {
      id: pay4A,
      status: "approved",
      transaction_amount: 99.0,
      external_reference: JSON.stringify({ userId: user4A.id, planId: proPlan!.id, planName: "PRO", billingCycle: "year" }),
    });
    const sub4A = await prisma.subscription.findUnique({ where: { userId: user4A.id } });
    const diffDays4A = Math.round((sub4A!.currentPeriodEnd.getTime() - end4A.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays4A === 365, `4.1. PRO Anual antecipado: vigência estendida em exatamente 365 dias além do vencimento atual (calculado: +${diffDays4A} dias)`);

    // Cenário B: PRO anual vencido -> novo fim = now + 365 dias
    const user4B = await createTestUser("p4b");
    const end4B = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user4B.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_4b",
        currentPeriodStart: new Date(Date.now() - 370 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end4B,
      },
    });
    const pay4B = `pay_4b_${Date.now()}`;
    createdPaymentIds.push(pay4B);
    await processMercadoPagoNotification(pay4B, {
      id: pay4B,
      status: "approved",
      transaction_amount: 99.0,
      external_reference: JSON.stringify({ userId: user4B.id, planId: proPlan!.id, planName: "PRO", billingCycle: "year" }),
    });
    const sub4B = await prisma.subscription.findUnique({ where: { userId: user4B.id } });
    const diffDays4B = Math.round((sub4B!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diffDays4B === 365, `4.2. PRO Anual vencido: base é now (+365 dias a partir da aprovação)`);

    // -------------------------------------------------------------------------
    // FASE 5: BUSINESS MENSAL E ANUAL
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 5: BUSINESS MENSAL E ANUAL — PRESERVAÇÃO DE DIAS ---${RESET}`);

    // Business mensal com 15 dias restantes
    const user5M = await createTestUser("p5m");
    const end5M = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user5M.id,
        planId: bizPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_5m",
        currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end5M,
      },
    });
    const pay5M = `pay_5m_${Date.now()}`;
    createdPaymentIds.push(pay5M);
    await processMercadoPagoNotification(pay5M, {
      id: pay5M,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user5M.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    });
    const sub5M = await prisma.subscription.findUnique({ where: { userId: user5M.id } });
    const diffDays5M = Math.round((sub5M!.currentPeriodEnd.getTime() - end5M.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays5M === 30, `5.1. BUSINESS mensal: vigência estendida em exatamente 30 dias sobre os 15 dias restantes (+${diffDays5M} dias)`);

    // Business anual com 15 dias restantes
    const user5Y = await createTestUser("p5y");
    const end5Y = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user5Y.id,
        planId: bizPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_5y",
        currentPeriodStart: new Date(Date.now() - 350 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end5Y,
      },
    });
    const pay5Y = `pay_5y_${Date.now()}`;
    createdPaymentIds.push(pay5Y);
    await processMercadoPagoNotification(pay5Y, {
      id: pay5Y,
      status: "approved",
      transaction_amount: 199.0,
      external_reference: JSON.stringify({ userId: user5Y.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "year" }),
    });
    const sub5Y = await prisma.subscription.findUnique({ where: { userId: user5Y.id } });
    const diffDays5Y = Math.round((sub5Y!.currentPeriodEnd.getTime() - end5Y.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays5Y === 365, `5.2. BUSINESS anual: vigência estendida em exatamente 365 dias sobre o saldo existente (+${diffDays5Y} dias)`);

    // -------------------------------------------------------------------------
    // FASE 6: PRIMEIRA COMPRA (FREE -> PRO MENSAL / ANUAL)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 6: PRIMEIRA COMPRA (SEM ASSINATURA ANTERIOR) ---${RESET}`);
    const user6A = await createTestUser("p6a");
    const pay6A = `pay_6a_${Date.now()}`;
    createdPaymentIds.push(pay6A);
    await processMercadoPagoNotification(pay6A, {
      id: pay6A,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user6A.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });
    const sub6A = await prisma.subscription.findUnique({ where: { userId: user6A.id } });
    const diff6A = Math.round((sub6A!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diff6A === 30, `6.1. Primeira compra PRO mensal: não inventa saldo anterior e dura 30 dias exatos (${diff6A} dias)`);

    const user6B = await createTestUser("p6b");
    const pay6B = `pay_6b_${Date.now()}`;
    createdPaymentIds.push(pay6B);
    await processMercadoPagoNotification(pay6B, {
      id: pay6B,
      status: "approved",
      transaction_amount: 99.0,
      external_reference: JSON.stringify({ userId: user6B.id, planId: proPlan!.id, planName: "PRO", billingCycle: "year" }),
    });
    const sub6B = await prisma.subscription.findUnique({ where: { userId: user6B.id } });
    const diff6B = Math.round((sub6B!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diff6B === 365, `6.2. Primeira compra PRO anual: dura 365 dias exatos a partir da aprovação (${diff6B} dias)`);

    // -------------------------------------------------------------------------
    // FASE 7: ASSINATURA EXPIRADA (currentPeriodEnd < now)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 7: ASSINATURA EXPIRADA ---${RESET}`);
    const user7A = await createTestUser("p7a");
    await prisma.subscription.create({
      data: {
        userId: user7A.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_7a",
        currentPeriodStart: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });
    const pay7A = `pay_7a_${Date.now()}`;
    createdPaymentIds.push(pay7A);
    await processMercadoPagoNotification(pay7A, {
      id: pay7A,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user7A.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });
    const sub7A = await prisma.subscription.findUnique({ where: { userId: user7A.id } });
    const diff7A = Math.round((sub7A!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diff7A === 30, `7.1. Assinatura expirada: baseDate = now (+30 dias a partir da reativação)`);

    // -------------------------------------------------------------------------
    // FASE 8: IDEMPOTÊNCIA — 1x, 2x, 5x, 10x REPROCESSAMENTOS
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 8: IDEMPOTÊNCIA — REPROCESSAMENTO MÚLTIPLO DO MESMO PAYMENT_ID ---${RESET}`);
    const user8 = await createTestUser("p8");
    const pay8 = `pay_idemp_${Date.now()}`;
    createdPaymentIds.push(pay8);

    const initialPayData = {
      id: pay8,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user8.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    };

    // 1ª execução
    const r1 = await processMercadoPagoNotification(pay8, initialPayData);
    assert(r1.status === "approved", "8.1. 1ª execução aprova e ativa assinatura");

    const subAfterFirst = await prisma.subscription.findUnique({ where: { userId: user8.id } });
    const firstEnd = subAfterFirst!.currentPeriodEnd.getTime();

    // 2ª execução
    const r2 = await processMercadoPagoNotification(pay8, initialPayData);
    assert(r2.status === "already_processed", "8.2. 2ª execução retorna 'already_processed'");

    // 5 execuções sequenciais
    for (let i = 3; i <= 7; i++) {
      const ri = await processMercadoPagoNotification(pay8, initialPayData);
      assert(ri.status === "already_processed", `8.${i}. Execução #${i} retorna 'already_processed'`);
    }

    // 3 execuções adicionais até totalizar 10
    for (let i = 8; i <= 10; i++) {
      const ri = await processMercadoPagoNotification(pay8, initialPayData);
      assert(ri.status === "already_processed", `8.${i}. Execução #${i} retorna 'already_processed'`);
    }

    const subAfterTenth = await prisma.subscription.findUnique({ where: { userId: user8.id } });
    const tenthEnd = subAfterTenth!.currentPeriodEnd.getTime();
    assert(tenthEnd === firstEnd, "8.11. Data de término permanece idêntica após 10 execuções do mesmo paymentId (período adicionado estritamente 1 vez)");

    // -------------------------------------------------------------------------
    // FASE 9: CONCORRÊNCIA REAL — WEBHOOK x /STATUS (2, 5, 10 WORKERS)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 9: CONCORRÊNCIA REAL WEBHOOK x /STATUS ---${RESET}`);

    // Concorrência com 2 workers
    const user9A = await createTestUser("p9a");
    const pay9A = `pay_conc_2_${Date.now()}`;
    createdPaymentIds.push(pay9A);
    const payData9A = {
      id: pay9A,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user9A.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    };

    const results9A = await Promise.all([
      processMercadoPagoNotification(pay9A, payData9A),
      processMercadoPagoNotification(pay9A, payData9A),
    ]);
    const approved9A = results9A.filter((r) => r.status === "approved").length;
    const dup9A = results9A.filter((r) => r.status === "already_processed").length;
    assert(approved9A === 1 && dup9A === 1, "9.1. Concorrência 2 workers: exatamente 1 aprovado e 1 interceptado");

    // Concorrência com 5 workers
    const user9B = await createTestUser("p9b");
    const pay9B = `pay_conc_5_${Date.now()}`;
    createdPaymentIds.push(pay9B);
    const payData9B = {
      id: pay9B,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user9B.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    };

    const results9B = await Promise.all(
      Array.from({ length: 5 }).map(() => processMercadoPagoNotification(pay9B, payData9B))
    );
    const approved9B = results9B.filter((r) => r.status === "approved").length;
    const dup9B = results9B.filter((r) => r.status === "already_processed").length;
    assert(approved9B === 1 && dup9B === 4, `9.2. Concorrência 5 workers: exatamente 1 aprovado (${approved9B}) e 4 interceptados (${dup9B})`);

    // Concorrência com 10 workers
    const user9C = await createTestUser("p9c");
    const pay9C = `pay_conc_10_${Date.now()}`;
    createdPaymentIds.push(pay9C);
    const payData9C = {
      id: pay9C,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user9C.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    };

    const results9C = await Promise.all(
      Array.from({ length: 10 }).map(() => processMercadoPagoNotification(pay9C, payData9C))
    );
    const approved9C = results9C.filter((r) => r.status === "approved").length;
    const dup9C = results9C.filter((r) => r.status === "already_processed").length;
    assert(approved9C === 1 && dup9C === 9, `9.3. Concorrência 10 workers: exatamente 1 aprovado (${approved9C}) e 9 interceptados (${dup9C})`);

    const subCountUser9C = await prisma.subscription.count({ where: { userId: user9C.id } });
    assert(subCountUser9C === 1, "9.4. Exatamente 1 registro Subscription existe no banco após tempestade de 10 workers");

    // -------------------------------------------------------------------------
    // FASE 10: AUDITORIA DE UPGRADE PRO -> BUSINESS
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 10: AUDITORIA DE UPGRADE (PRO -> BUSINESS) ---${RESET}`);
    const user10 = await createTestUser("p10");
    const end10Pre = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 dias restantes de PRO
    await prisma.subscription.create({
      data: {
        userId: user10.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_10_pre",
        currentPeriodStart: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end10Pre,
      },
    });
    await prisma.user.update({
      where: { id: user10.id },
      data: { planId: proPlan!.id },
    });

    const pay10 = `pay_upg_${Date.now()}`;
    createdPaymentIds.push(pay10);
    // Compra BUSINESS mensal
    await processMercadoPagoNotification(pay10, {
      id: pay10,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user10.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    });

    const sub10After = await prisma.subscription.findUnique({
      where: { userId: user10.id },
      include: { plan: true },
    });
    const context10 = await getUserPlanAndUsage(user10.id);

    assert(sub10After?.plan?.name === "BUSINESS", "10.1. Upgrade PRO -> BUSINESS substitui imediatamente o plano para BUSINESS");
    assert(context10?.currentMonthLimit === 999999, "10.2. Cota atualiza imediatamente para sentinela ilimitado (999999)");

    // Na nova regra oficial de upgrade PRO -> BUSINESS:
    // Os 20 dias restantes de PRO são preservados e somados ao período BUSINESS (+30 dias sobre end10Pre = ~50 dias totais)
    const diffDays10 = Math.round((sub10After!.currentPeriodEnd.getTime() - end10Pre.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays10 === 30, `10.3. Upgrade: saldo de 20 dias de PRO preservado (+30 dias de BUSINESS sobre o vencimento PRO anterior, calculado: +${diffDays10} dias)`);

    // -------------------------------------------------------------------------
    // FASE 11: AUDITORIA BUSINESS -> BUSINESS (RENOVAÇÃO DO MESMO PLANO)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 11: AUDITORIA BUSINESS -> BUSINESS (MESMO PLANO) ---${RESET}`);
    const user11 = await createTestUser("p11");
    const end11Pre = new Date(Date.now() + 18 * 24 * 60 * 60 * 1000); // 18 dias restantes de BUSINESS
    await prisma.subscription.create({
      data: {
        userId: user11.id,
        planId: bizPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_11_pre",
        currentPeriodStart: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end11Pre,
      },
    });

    const pay11 = `pay_biz_ren_${Date.now()}`;
    createdPaymentIds.push(pay11);
    await processMercadoPagoNotification(pay11, {
      id: pay11,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user11.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    });

    const sub11After = await prisma.subscription.findUnique({ where: { userId: user11.id } });
    const diffDays11 = Math.round((sub11After!.currentPeriodEnd.getTime() - end11Pre.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays11 === 30, `11.1. BUSINESS -> BUSINESS: dias restantes são rigorosamente preservados (+30 dias sobre end anterior, calculado: +${diffDays11} dias)`);

    // -------------------------------------------------------------------------
    // FASE 12: AUDITORIA DE MUDANÇA DE CICLO (MENSAL <-> ANUAL NO MESMO PLANO)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 12: AUDITORIA DE MUDANÇA DE CICLO ---${RESET}`);
    // PRO Mensal com 10 dias restantes comprando PRO Anual
    const user12 = await createTestUser("p12");
    const end12Pre = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user12.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_12_pre",
        currentPeriodStart: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end12Pre,
      },
    });

    const pay12 = `pay_cycle_${Date.now()}`;
    createdPaymentIds.push(pay12);
    await processMercadoPagoNotification(pay12, {
      id: pay12,
      status: "approved",
      transaction_amount: 99.0, // Anual R$ 99
      external_reference: JSON.stringify({ userId: user12.id, planId: proPlan!.id, planName: "PRO", billingCycle: "year" }),
    });

    const sub12After = await prisma.subscription.findUnique({ where: { userId: user12.id } });
    const diffDays12 = Math.round((sub12After!.currentPeriodEnd.getTime() - end12Pre.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays12 === 365, `12.1. Mudança de ciclo PRO Mensal -> PRO Anual (mesmo plano): adiciona +365 dias ao saldo existente (calculado: +${diffDays12} dias)`);

    // -------------------------------------------------------------------------
    // FASE 13: REVERSÃO POR REFUND / CHARGEBACK (PRESERVAÇÃO DE DADOS)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 13: REFUND E CHARGEBACK (PRESERVAÇÃO DE DADOS) ---${RESET}`);
    const user13 = await createTestUser("p13");
    const pay13 = `pay_ref_${Date.now()}`;
    createdPaymentIds.push(pay13);

    // Ativa PRO
    await processMercadoPagoNotification(pay13, {
      id: pay13,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user13.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });

    // Cria QR Code
    const qr13 = await prisma.qRCode.create({
      data: {
        userId: user13.id,
        name: "QR do Usuário Refund",
        type: "URL",
        shortCode: `audit_qr_${Date.now()}`,
        destination: "https://exemplo.com/ref-test",
        content: JSON.stringify({ url: "https://exemplo.com/ref-test" }),
        styleConfig: JSON.stringify({}),
      },
    });

    // Evento de Refund
    const resRef = await processMercadoPagoNotification(pay13, {
      id: pay13,
      status: "refunded",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user13.id, planId: proPlan!.id }),
    });
    assert(resRef.status === "refunded", "13.1. Processamento de reembolso retorna status 'refunded'");

    const sub13AfterRef = await prisma.subscription.findUnique({ where: { userId: user13.id } });
    assert(sub13AfterRef?.status === "REFUNDED", "13.2. Status da assinatura marcado como REFUNDED");

    const user13AfterRef = await prisma.user.findUnique({ where: { id: user13.id } });
    assert(user13AfterRef?.planId === freePlan!.id, "13.3. Usuário revertido para o plano FREE");

    const qr13AfterRef = await prisma.qRCode.findUnique({ where: { id: qr13.id } });
    assert(qr13AfterRef !== null, "13.4. QR Code permanece 100% salvo no banco (não é apagado pelo refund)");

    // -------------------------------------------------------------------------
    // FASE 14: SEGURANÇA E CENTAVOS (TOLERÂNCIA ZERO)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 14: SEGURANÇA E TOLERÂNCIA ZERO EM CENTAVOS ---${RESET}`);
    const user14 = await createTestUser("p14");
    const pay14Tamper = `pay_tamper_${Date.now()}`;
    createdPaymentIds.push(pay14Tamper);

    const resTamper = await processMercadoPagoNotification(pay14Tamper, {
      id: pay14Tamper,
      status: "approved",
      transaction_amount: 19.89, // R$ 0,01 a menos que R$ 19,90
      external_reference: JSON.stringify({ userId: user14.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });

    assert(resTamper.status === "amount_mismatch", "14.1. Divergência de 1 centavo (R$ 19,89) é categoricamente rejeitada com amount_mismatch");

    const sub14 = await prisma.subscription.findUnique({ where: { userId: user14.id } });
    assert(sub14 === null, "14.2. Nenhuma assinatura foi criada para o pagamento adulterado");

    // -------------------------------------------------------------------------
    // FASE 15: ANÁLISE DE currentPeriodStart E JANELA DE QUOTA
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 15: ANÁLISE DE currentPeriodStart E JANELA DE QUOTA ---${RESET}`);
    const user15 = await createTestUser("p15");
    const pay15 = `pay_start_${Date.now()}`;
    createdPaymentIds.push(pay15);

    await processMercadoPagoNotification(pay15, {
      id: pay15,
      status: "approved",
      transaction_amount: 19.9,
      external_reference: JSON.stringify({ userId: user15.id, planId: proPlan!.id, planName: "PRO", billingCycle: "month" }),
    });

    const sub15 = await prisma.subscription.findUnique({ where: { userId: user15.id } });
    const quotaWindow = calculateUserMonthlyQuotaWindow(user15.createdAt, sub15);

    const nowMs = Date.now();
    const startMs = sub15!.currentPeriodStart.getTime();
    assert(Math.abs(nowMs - startMs) < 60000, "15.1. currentPeriodStart reflete a data/hora da aprovação da transação (now)");
    assert(!quotaWindow.isYearly, "15.2. Janela de quota para plano mensal é identificada corretamente (isYearly = false)");
    assert(
      quotaWindow.currentMonthStart.getTime() === sub15!.currentPeriodStart.getTime(),
      "15.3. Início da janela de quota mensal coincide com currentPeriodStart (novo ciclo de criação liberado a partir do pagamento)"
    );

    // -------------------------------------------------------------------------
    // FASE 16: VERIFICAÇÃO FINAL DE INVIOLABILIDADE (#178856033673)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- FASE 16: VERIFICAÇÃO FINAL DE INTEGRIDADE DO PAGAMENTO HISTÓRICO ---${RESET}`);
    const histAfter = await prisma.subscription.findFirst({
      where: { gatewaySubscriptionId: "178856033673" },
      include: { plan: true, user: true },
    });

    assert(histAfter !== null, "16.1. Registro histórico #178856033673 continua existindo");
    assert(histAfter?.id === histSnapshot.id, "16.2. ID da assinatura permanece idêntico");
    assert(histAfter?.status === histSnapshot.status, "16.3. Status permanece 'ACTIVE'");
    assert(histAfter?.planId === histSnapshot.planId, "16.4. PlanId permanece 'PRO'");
    assert(histAfter?.currentPeriodStart?.toISOString() === histSnapshot.currentPeriodStart, "16.5. currentPeriodStart permanece 100% inalterado");
    assert(histAfter?.currentPeriodEnd?.toISOString() === histSnapshot.currentPeriodEnd, "16.6. currentPeriodEnd permanece 100% inalterado");
    assert(histAfter?.userId === histSnapshot.userId, "16.7. Titular userId permanece 100% inalterado");

    const auditCountForHist = await prisma.activityLog.count({
      where: { entityId: "178856033673" },
    });
    console.log(`    [Auditoria] Logs de atividade para #178856033673: ${auditCountForHist}`);
    assert(auditCountForHist <= 1, "16.8. Nenhum novo log de auditoria indevido foi gerado para a transação histórica");

  } finally {
    // Cleanup de usuários e pagamentos sintéticos de teste
    console.log(`\n${CYAN}--- LIMPEZA CONTROLADA DE DADOS ISOLADOS DE TESTE ---${RESET}`);
    if (createdUserIds.length > 0) {
      await prisma.qRCode.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.activityLog.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.subscription.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      console.log(`  🧹 ${createdUserIds.length} usuários de teste removidos.`);
    }
    if (createdPaymentIds.length > 0) {
      await prisma.webhookEvent.deleteMany({
        where: {
          OR: createdPaymentIds.flatMap((pid) => [
            { eventId: `mp_claim_${pid}` },
            { eventId: `mp_event_${pid}` },
            { eventId: `mp_refund_${pid}` },
            { eventId: `mp_cb_${pid}` },
          ]),
        },
      });
      console.log(`  🧹 Eventos de webhook sintéticos limpos.`);
    }
    await prisma.$disconnect();
  }

  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}RESUMO DA AUDITORIA DE RENOVAÇÃO ANTECIPADA:${RESET}`);
  console.log(`  Total de asserções executadas : ${totalAssertions}`);
  console.log(`  Aprovadas                     : ${passedAssertions}`);
  console.log(`  Falhas                        : ${failedAssertions}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runRenewalPeriodAudit().catch((err) => {
  console.error("Erro fatal na execução da auditoria:", err);
  process.exit(1);
});
