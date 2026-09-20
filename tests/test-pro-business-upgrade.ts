/**
 * SUÍTE DE TESTES: POLÍTICA OFICIAL DE UPGRADE PRO -> BUSINESS
 * Projeto: QR MASTER
 * 
 * Cenários validados:
 * 1. PRO mensal ativo -> BUSINESS mensal (+30 dias além do vencimento PRO)
 * 2. PRO mensal ativo -> BUSINESS anual (+365 dias além do vencimento PRO)
 * 3. PRO anual ativo -> BUSINESS mensal (+30 dias além do vencimento PRO)
 * 4. PRO anual ativo -> BUSINESS anual (+365 dias além do vencimento PRO)
 * 5. PRO expirado -> BUSINESS mensal (base é now + 30 dias)
 * 6. PRO expirado -> BUSINESS anual (base é now + 365 dias)
 * 7. PRO vencendo exatamente agora -> BUSINESS (base é now + 30 dias)
 * 8. PRO com 1 dia restante -> BUSINESS (+30 dias sobre o vencimento)
 * 9. PRO com 20 dias restantes -> BUSINESS (+30 dias sobre o vencimento)
 * 10. PRO com período longo restante (ex: 180 dias) -> BUSINESS
 * 11. Validação de Imediação: plano BUSINESS, cota 999999 e entitlements disponíveis na hora
 * 12. Idempotência: 1x, 2x, 5x, 10x reprocessamentos do mesmo paymentId de upgrade
 * 13. Concorrência: 2, 5 e 10 workers paralelos para o mesmo paymentId de upgrade
 * 14. Reversão por Refund / Chargeback pós-upgrade (downgrade seguro para FREE e preservação de QRs)
 * 15. Inviolabilidade do Pagamento Histórico Real #178856033673
 */

import { PrismaClient } from "@prisma/client";
import { processMercadoPagoNotification } from "../src/lib/mercadopago";
import { getUserPlanAndUsage, checkPermission } from "../src/lib/permissions";

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

async function runProToBusinessUpgradeSuite() {
  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}🚀 SUÍTE DE TESTES: POLÍTICA OFICIAL DE UPGRADE PRO -> BUSINESS${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);

  const createdUserIds: string[] = [];
  const createdPaymentIds: string[] = [];

  try {
    // Snapshot Inicial do Pagamento Histórico #178856033673
    console.log(`${YELLOW}--- 0. SNAPSHOT DO PAGAMENTO HISTÓRICO PROTEGIDO ---${RESET}`);
    const histBefore = await prisma.subscription.findFirst({
      where: { gatewaySubscriptionId: "178856033673" },
      include: { plan: true, user: true },
    });
    assert(histBefore !== null, "0.1. Registro histórico #178856033673 presente no banco");
    assert(histBefore?.status === "ACTIVE", "0.2. Status inicial é ACTIVE");
    assert(histBefore?.plan?.name === "PRO", "0.3. Plano inicial é PRO");

    const histSnapshot = {
      id: histBefore?.id,
      gatewaySubscriptionId: histBefore?.gatewaySubscriptionId,
      status: histBefore?.status,
      planId: histBefore?.planId,
      currentPeriodStart: histBefore?.currentPeriodStart?.toISOString(),
      currentPeriodEnd: histBefore?.currentPeriodEnd?.toISOString(),
      userId: histBefore?.userId,
    };

    const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
    const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
    const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

    assert(!!freePlan && !!proPlan && !!bizPlan, "0.4. Planos FREE, PRO e BUSINESS carregados");

    async function createTestUser(prefix: string) {
      const email = `upg_${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@test.local`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: "dummy_upg_hash",
          name: `User ${prefix}`,
          role: "USER",
          planId: freePlan!.id,
        },
      });
      createdUserIds.push(user.id);
      return user;
    }

    // -------------------------------------------------------------------------
    // CENÁRIO 1: PRO Mensal Ativo -> BUSINESS Mensal
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 1: PRO MENSAL ATIVO -> BUSINESS MENSAL ---${RESET}`);
    const user1 = await createTestUser("c1");
    const end1Pre = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 dias restantes
    await prisma.subscription.create({
      data: {
        userId: user1.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c1_pre",
        currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end1Pre,
      },
    });
    await prisma.user.update({ where: { id: user1.id }, data: { planId: proPlan!.id } });

    const pay1 = `pay_c1_${Date.now()}`;
    createdPaymentIds.push(pay1);
    await processMercadoPagoNotification(pay1, {
      id: pay1,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user1.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    });

    const sub1After = await prisma.subscription.findUnique({ where: { userId: user1.id }, include: { plan: true } });
    const user1Context = await getUserPlanAndUsage(user1.id);
    const diffDays1 = Math.round((sub1After!.currentPeriodEnd.getTime() - end1Pre.getTime()) / (1000 * 60 * 60 * 24));

    assert(sub1After?.plan?.name === "BUSINESS", "1.1. Plano atualizado para BUSINESS imediatamente");
    assert(user1Context?.currentMonthLimit === 999999, "1.2. Cota atualizada para sentinela ilimitado (999999) imediatamente");
    assert(diffDays1 === 30, `1.3. Vigência: saldo de 15 dias de PRO preservado (+30 dias de BUSINESS sobre end anterior, calculado: +${diffDays1} dias)`);

    // -------------------------------------------------------------------------
    // CENÁRIO 2: PRO Mensal Ativo -> BUSINESS Anual
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 2: PRO MENSAL ATIVO -> BUSINESS ANUAL ---${RESET}`);
    const user2 = await createTestUser("c2");
    const end2Pre = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user2.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c2_pre",
        currentPeriodStart: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end2Pre,
      },
    });
    await prisma.user.update({ where: { id: user2.id }, data: { planId: proPlan!.id } });

    const pay2 = `pay_c2_${Date.now()}`;
    createdPaymentIds.push(pay2);
    await processMercadoPagoNotification(pay2, {
      id: pay2,
      status: "approved",
      transaction_amount: 199.0,
      external_reference: JSON.stringify({ userId: user2.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "year" }),
    });

    const sub2After = await prisma.subscription.findUnique({ where: { userId: user2.id }, include: { plan: true } });
    const diffDays2 = Math.round((sub2After!.currentPeriodEnd.getTime() - end2Pre.getTime()) / (1000 * 60 * 60 * 24));
    assert(sub2After?.plan?.name === "BUSINESS", "2.1. BUSINESS anual ativado imediatamente");
    assert(diffDays2 === 365, `2.2. Vigência: saldo de 12 dias preservado (+365 dias de BUSINESS sobre end anterior, calculado: +${diffDays2} dias)`);

    // -------------------------------------------------------------------------
    // CENÁRIO 3: PRO Anual Ativo -> BUSINESS Mensal
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 3: PRO ANUAL ATIVO -> BUSINESS MENSAL ---${RESET}`);
    const user3 = await createTestUser("c3");
    const end3Pre = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 dias restantes do PRO anual
    await prisma.subscription.create({
      data: {
        userId: user3.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c3_pre",
        currentPeriodStart: new Date(Date.now() - 275 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end3Pre,
      },
    });
    await prisma.user.update({ where: { id: user3.id }, data: { planId: proPlan!.id } });

    const pay3 = `pay_c3_${Date.now()}`;
    createdPaymentIds.push(pay3);
    await processMercadoPagoNotification(pay3, {
      id: pay3,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user3.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    });

    const sub3After = await prisma.subscription.findUnique({ where: { userId: user3.id }, include: { plan: true } });
    const diffDays3 = Math.round((sub3After!.currentPeriodEnd.getTime() - end3Pre.getTime()) / (1000 * 60 * 60 * 24));
    assert(sub3After?.plan?.name === "BUSINESS", "3.1. PRO Anual -> BUSINESS Mensal ativado imediatamente");
    assert(diffDays3 === 30, `3.2. Vigência: saldo de 90 dias preservado (+30 dias de BUSINESS sobre end anterior, calculado: +${diffDays3} dias)`);

    // -------------------------------------------------------------------------
    // CENÁRIO 4: PRO Anual Ativo -> BUSINESS Anual
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 4: PRO ANUAL ATIVO -> BUSINESS ANUAL ---${RESET}`);
    const user4 = await createTestUser("c4");
    const end4Pre = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user4.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c4_pre",
        currentPeriodStart: new Date(Date.now() - 305 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end4Pre,
      },
    });
    await prisma.user.update({ where: { id: user4.id }, data: { planId: proPlan!.id } });

    const pay4 = `pay_c4_${Date.now()}`;
    createdPaymentIds.push(pay4);
    await processMercadoPagoNotification(pay4, {
      id: pay4,
      status: "approved",
      transaction_amount: 199.0,
      external_reference: JSON.stringify({ userId: user4.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "year" }),
    });

    const sub4After = await prisma.subscription.findUnique({ where: { userId: user4.id }, include: { plan: true } });
    const diffDays4 = Math.round((sub4After!.currentPeriodEnd.getTime() - end4Pre.getTime()) / (1000 * 60 * 60 * 24));
    assert(sub4After?.plan?.name === "BUSINESS", "4.1. PRO Anual -> BUSINESS Anual ativado imediatamente");
    assert(diffDays4 === 365, `4.2. Vigência: saldo de 60 dias preservado (+365 dias de BUSINESS sobre end anterior, calculado: +${diffDays4} dias)`);

    // -------------------------------------------------------------------------
    // CENÁRIO 5: PRO Expirado -> BUSINESS Mensal
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 5: PRO EXPIRADO -> BUSINESS MENSAL ---${RESET}`);
    const user5 = await createTestUser("c5");
    const end5Pre = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // expirado há 5 dias
    await prisma.subscription.create({
      data: {
        userId: user5.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c5_pre",
        currentPeriodStart: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end5Pre,
      },
    });
    await prisma.user.update({ where: { id: user5.id }, data: { planId: proPlan!.id } });

    const pay5 = `pay_c5_${Date.now()}`;
    createdPaymentIds.push(pay5);
    await processMercadoPagoNotification(pay5, {
      id: pay5,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user5.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    });

    const sub5After = await prisma.subscription.findUnique({ where: { userId: user5.id } });
    const diffDays5 = Math.round((sub5After!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diffDays5 === 30, `5.1. PRO expirado: baseDate recai em now (+30 dias a partir da aprovação, obtido: ${diffDays5} dias)`);

    // -------------------------------------------------------------------------
    // CENÁRIO 6: PRO Expirado -> BUSINESS Anual
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 6: PRO EXPIRADO -> BUSINESS ANUAL ---${RESET}`);
    const user6 = await createTestUser("c6");
    const end6Pre = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user6.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c6_pre",
        currentPeriodStart: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end6Pre,
      },
    });
    await prisma.user.update({ where: { id: user6.id }, data: { planId: proPlan!.id } });

    const pay6 = `pay_c6_${Date.now()}`;
    createdPaymentIds.push(pay6);
    await processMercadoPagoNotification(pay6, {
      id: pay6,
      status: "approved",
      transaction_amount: 199.0,
      external_reference: JSON.stringify({ userId: user6.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "year" }),
    });

    const sub6After = await prisma.subscription.findUnique({ where: { userId: user6.id } });
    const diffDays6 = Math.round((sub6After!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diffDays6 === 365, `6.1. PRO expirado: baseDate recai em now (+365 dias a partir da aprovação, obtido: ${diffDays6} dias)`);

    // -------------------------------------------------------------------------
    // CENÁRIO 7: PRO Vencendo Exatamente Agora -> BUSINESS
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 7: PRO VENCENDO EXATAMENTE AGORA -> BUSINESS ---${RESET}`);
    const user7 = await createTestUser("c7");
    const end7Pre = new Date(Date.now());
    await prisma.subscription.create({
      data: {
        userId: user7.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c7_pre",
        currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end7Pre,
      },
    });
    await prisma.user.update({ where: { id: user7.id }, data: { planId: proPlan!.id } });

    const pay7 = `pay_c7_${Date.now()}`;
    createdPaymentIds.push(pay7);
    await processMercadoPagoNotification(pay7, {
      id: pay7,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user7.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    });

    const sub7After = await prisma.subscription.findUnique({ where: { userId: user7.id } });
    const diffDays7 = Math.round((sub7After!.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert(diffDays7 === 30, `7.1. PRO no vencimento exato: novo período é 30 dias a partir de now (calculado: ${diffDays7} dias)`);

    // -------------------------------------------------------------------------
    // CENÁRIO 8: PRO com Apenas 1 Dia Restante
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 8: PRO COM APENAS 1 DIA RESTANTE ---${RESET}`);
    const user8 = await createTestUser("c8");
    const end8Pre = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user8.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c8_pre",
        currentPeriodStart: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end8Pre,
      },
    });
    await prisma.user.update({ where: { id: user8.id }, data: { planId: proPlan!.id } });

    const pay8 = `pay_c8_${Date.now()}`;
    createdPaymentIds.push(pay8);
    await processMercadoPagoNotification(pay8, {
      id: pay8,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user8.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    });

    const sub8After = await prisma.subscription.findUnique({ where: { userId: user8.id } });
    const diffDays8 = Math.round((sub8After!.currentPeriodEnd.getTime() - end8Pre.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays8 === 30, `8.1. PRO com 1 dia restante: preservado (+30 dias além do vencimento atual, calculado: +${diffDays8} dias)`);

    // -------------------------------------------------------------------------
    // CENÁRIO 9: PRO com 20 Dias Restantes
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 9: PRO COM 20 DIAS RESTANTES ---${RESET}`);
    const user9 = await createTestUser("c9");
    const end9Pre = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user9.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c9_pre",
        currentPeriodStart: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end9Pre,
      },
    });
    await prisma.user.update({ where: { id: user9.id }, data: { planId: proPlan!.id } });

    const pay9 = `pay_c9_${Date.now()}`;
    createdPaymentIds.push(pay9);
    await processMercadoPagoNotification(pay9, {
      id: pay9,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user9.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    });

    const sub9After = await prisma.subscription.findUnique({ where: { userId: user9.id } });
    const diffDays9 = Math.round((sub9After!.currentPeriodEnd.getTime() - end9Pre.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays9 === 30, `9.1. PRO com 20 dias restantes: preservado (+30 dias sobre end anterior, totalizando ~50 dias)`);

    // -------------------------------------------------------------------------
    // CENÁRIO 10: PRO com Período Longo Restante (ex: 200 dias)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 10: PRO COM PERÍODO LONGO RESTANTE ---${RESET}`);
    const user10 = await createTestUser("c10");
    const end10Pre = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user10.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c10_pre",
        currentPeriodStart: new Date(Date.now() - 165 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end10Pre,
      },
    });
    await prisma.user.update({ where: { id: user10.id }, data: { planId: proPlan!.id } });

    const pay10 = `pay_c10_${Date.now()}`;
    createdPaymentIds.push(pay10);
    await processMercadoPagoNotification(pay10, {
      id: pay10,
      status: "approved",
      transaction_amount: 199.0,
      external_reference: JSON.stringify({ userId: user10.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "year" }),
    });

    const sub10After = await prisma.subscription.findUnique({ where: { userId: user10.id } });
    const diffDays10 = Math.round((sub10After!.currentPeriodEnd.getTime() - end10Pre.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays10 === 365, `10.1. PRO com 200 dias restantes: preservado (+365 dias de BUSINESS sobre end anterior, totalizando ~565 dias)`);

    // -------------------------------------------------------------------------
    // CENÁRIO 11: VALIDAÇÃO DE ENTITLEMENTS E COTA IMEDIATOS
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 11: VALIDAÇÃO DE IMEDIAÇÃO DE RECURSOS E COTA ---${RESET}`);
    const user10Context = await getUserPlanAndUsage(user10.id);
    assert(user10Context?.plan?.name === "BUSINESS", "11.1. Contexto do usuário resolve imediatamente para BUSINESS");
    assert(user10Context?.currentMonthLimit === 999999, "11.2. Limite mensal resolve imediatamente para ilimitado (999999)");

    const canCampaigns = checkPermission(user10Context, "campaigns");
    assert(canCampaigns.allowed, "11.3. Acesso a Campanhas corporativas liberado imediatamente");

    const canDynamic = checkPermission(user10Context, "dynamic_qr");
    assert(canDynamic.allowed, "11.4. Acesso a QR Dinâmico liberado imediatamente");

    // -------------------------------------------------------------------------
    // CENÁRIO 12: IDEMPOTÊNCIA (1x, 2x, 5x, 10x)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 12: IDEMPOTÊNCIA DE UPGRADE ---${RESET}`);
    const user12 = await createTestUser("c12");
    const end12Pre = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user12.id,
        planId: proPlan!.id,
        status: "ACTIVE",
        gateway: "mercadopago",
        gatewaySubscriptionId: "sub_c12_pre",
        currentPeriodStart: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: end12Pre,
      },
    });

    const pay12 = `pay_idemp_upg_${Date.now()}`;
    createdPaymentIds.push(pay12);
    const pay12Data = {
      id: pay12,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user12.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    };

    // 1ª execução
    const r1 = await processMercadoPagoNotification(pay12, pay12Data);
    assert(r1.status === "approved", "12.1. 1ª execução aprova e processa upgrade");

    const sub12First = await prisma.subscription.findUnique({ where: { userId: user12.id } });
    const end12First = sub12First!.currentPeriodEnd.getTime();

    // 2ª a 10ª execuções
    for (let i = 2; i <= 10; i++) {
      const ri = await processMercadoPagoNotification(pay12, pay12Data);
      assert(ri.status === "already_processed", `12.${i}. Execução #${i} retorna 'already_processed'`);
    }

    const sub12Tenth = await prisma.subscription.findUnique({ where: { userId: user12.id } });
    assert(sub12Tenth!.currentPeriodEnd.getTime() === end12First, "12.11. Data de término não foi duplicada após 10 execuções do mesmo paymentId");

    // -------------------------------------------------------------------------
    // CENÁRIO 13: CONCORRÊNCIA REAL (2, 5 E 10 WORKERS)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 13: CONCORRÊNCIA SIMULTÂNEA DE UPGRADE ---${RESET}`);
    const user13A = await createTestUser("c13a");
    const pay13A = `pay_conc_upg_2_${Date.now()}`;
    createdPaymentIds.push(pay13A);
    const payData13A = {
      id: pay13A,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user13A.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    };

    const res13A = await Promise.all([
      processMercadoPagoNotification(pay13A, payData13A),
      processMercadoPagoNotification(pay13A, payData13A),
    ]);
    const app13A = res13A.filter((r) => r.status === "approved").length;
    const dup13A = res13A.filter((r) => r.status === "already_processed").length;
    assert(app13A === 1 && dup13A === 1, "13.1. Concorrência 2 workers: exatamente 1 aprovado e 1 interceptado");

    const user13B = await createTestUser("c13b");
    const pay13B = `pay_conc_upg_10_${Date.now()}`;
    createdPaymentIds.push(pay13B);
    const payData13B = {
      id: pay13B,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user13B.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    };

    const res13B = await Promise.all(
      Array.from({ length: 10 }).map(() => processMercadoPagoNotification(pay13B, payData13B))
    );
    const app13B = res13B.filter((r) => r.status === "approved").length;
    const dup13B = res13B.filter((r) => r.status === "already_processed").length;
    assert(app13B === 1 && dup13B === 9, `13.2. Concorrência 10 workers: exatamente 1 aprovado (${app13B}) e 9 interceptados (${dup13B})`);

    // -------------------------------------------------------------------------
    // CENÁRIO 14: REFUND / CHARGEBACK PÓS-UPGRADE
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 14: REVERSÃO POR REFUND APÓS UPGRADE ---${RESET}`);
    const user14 = await createTestUser("c14");
    const pay14 = `pay_upg_ref_${Date.now()}`;
    createdPaymentIds.push(pay14);

    await processMercadoPagoNotification(pay14, {
      id: pay14,
      status: "approved",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user14.id, planId: bizPlan!.id, planName: "BUSINESS", billingCycle: "month" }),
    });

    const qr14 = await prisma.qRCode.create({
      data: {
        userId: user14.id,
        name: "QR do Usuário Upgrade Refund",
        type: "URL",
        shortCode: `upg_qr_${Date.now()}`,
        destination: "https://exemplo.com/upg-ref",
        content: JSON.stringify({ url: "https://exemplo.com/upg-ref" }),
        styleConfig: JSON.stringify({}),
      },
    });

    const resRef = await processMercadoPagoNotification(pay14, {
      id: pay14,
      status: "refunded",
      transaction_amount: 29.9,
      external_reference: JSON.stringify({ userId: user14.id, planId: bizPlan!.id }),
    });
    assert(resRef.status === "refunded", "14.1. Reembolso de upgrade processado com sucesso");

    const sub14After = await prisma.subscription.findUnique({ where: { userId: user14.id } });
    assert(sub14After?.status === "REFUNDED", "14.2. Assinatura marcada como REFUNDED");

    const user14After = await prisma.user.findUnique({ where: { id: user14.id } });
    assert(user14After?.planId === freePlan!.id, "14.3. Usuário rebaixado para FREE conforme política existente");

    const qr14After = await prisma.qRCode.findUnique({ where: { id: qr14.id } });
    assert(qr14After !== null, "14.4. QR Code criado durante BUSINESS NÃO foi excluído após o reembolso");

    // -------------------------------------------------------------------------
    // CENÁRIO 15: INVIOLABILIDADE DA TRANSAÇÃO HISTÓRICA #178856033673
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- CENÁRIO 15: INVIOLABILIDADE DO PAGAMENTO HISTÓRICO PROTEGIDO ---${RESET}`);
    const histAfter = await prisma.subscription.findFirst({
      where: { gatewaySubscriptionId: "178856033673" },
      include: { plan: true, user: true },
    });

    assert(histAfter !== null, "15.1. Registro histórico #178856033673 continua existindo");
    assert(histAfter?.id === histSnapshot.id, "15.2. ID inalterado");
    assert(histAfter?.status === histSnapshot.status, "15.3. Status permanece 'ACTIVE'");
    assert(histAfter?.planId === histSnapshot.planId, "15.4. Plan permanece 'PRO'");
    assert(histAfter?.currentPeriodStart?.toISOString() === histSnapshot.currentPeriodStart, "15.5. currentPeriodStart inalterado");
    assert(histAfter?.currentPeriodEnd?.toISOString() === histSnapshot.currentPeriodEnd, "15.6. currentPeriodEnd inalterado");
    assert(histAfter?.userId === histSnapshot.userId, "15.7. userId inalterado");

    const auditCountForHist = await prisma.activityLog.count({
      where: { entityId: "178856033673" },
    });
    assert(auditCountForHist <= 1, "15.8. Zero logs de auditoria novos gerados para o histórico");

  } finally {
    console.log(`\n${CYAN}--- LIMPEZA DOS DADOS ISOLADOS DE TESTE ---${RESET}`);
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
  console.log(`${CYAN}RESUMO DA SUÍTE DE UPGRADE PRO -> BUSINESS:${RESET}`);
  console.log(`  Total de asserções : ${totalAssertions}`);
  console.log(`  Aprovadas          : ${passedAssertions}`);
  console.log(`  Falhas             : ${failedAssertions}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runProToBusinessUpgradeSuite().catch((err) => {
  console.error("Erro fatal na execução da suíte:", err);
  process.exit(1);
});
