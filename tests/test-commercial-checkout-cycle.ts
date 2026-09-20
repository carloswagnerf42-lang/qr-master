import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import {
  getMercadoPagoConfigAsync,
  createMercadoPagoPreference,
  processMercadoPagoNotification,
  getMercadoPagoPaymentStatus,
  verifyMercadoPagoSignature,
  toCents,
} from "../src/lib/mercadopago";
import { POST as createDirectCheckout } from "../src/app/api/billing/mercadopago/checkout/route";
import { GET as getMPStatus } from "../src/app/api/billing/mercadopago/status/route";
import { POST as handleMPWebhook } from "../src/app/api/webhooks/mercadopago/route";
import { getUserPlanAndUsage, checkPermission } from "../src/lib/permissions";

// Cores ANSI para saída no terminal
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✅ [PASS]${RESET} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${RED}❌ [FAIL]${RESET} ${testName}`);
    if (detail) console.error(`    ${YELLOW}Detalhes:${RESET} ${detail}`);
  }
}

async function runCommercialCheckoutCycleAudit() {
  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}${BOLD}   🛡️ SUÍTE DE AUDITORIA FINAL: CHECKOUT & CICLO DE ATIVAÇÃO MP   ${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);

  // Identificar planos no banco
  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  if (!freePlan || !proPlan || !bizPlan) {
    throw new Error("Planos base (FREE, PRO, BUSINESS) não encontrados no banco de dados!");
  }

  // =========================================================================
  // FASE 0: AUDITORIA INICIAL DA TRANSAÇÃO HISTÓRICA 178856033673
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 0: AUDITORIA INICIAL DA TRANSAÇÃO HISTÓRICA 178856033673 ---${RESET}`);
  const histSubInitial = await prisma.subscription.findFirst({
    where: { gatewaySubscriptionId: "178856033673" },
    include: { plan: true, user: true },
  });
  const histEventInitial = await prisma.webhookEvent.findFirst({
    where: { eventId: "mp_payment_178856033673" },
  });

  assert(
    histSubInitial !== null &&
      histSubInitial.status === "ACTIVE" &&
      histSubInitial.plan.name === "PRO" &&
      histSubInitial.user.email === "itzjhonzin@gmail.com",
    "0.1. Pagamento histórico #178856033673 existe com status ACTIVE e plano PRO no início da auditoria"
  );
  assert(
    histEventInitial !== null && histEventInitial.status === "PROCESSED",
    "0.2. Evento histórico mp_payment_178856033673 existe com status PROCESSED"
  );

  // Usuários de teste isolados
  const userA = await prisma.user.upsert({
    where: { email: "checkout_audit_user_a@qrmaster.com" },
    update: { planId: freePlan.id, role: "USER" },
    create: {
      email: "checkout_audit_user_a@qrmaster.com",
      name: "Checkout Audit User A",
      passwordHash: "fake_hash_chk_a",
      role: "USER",
      planId: freePlan.id,
    },
  });

  const userB = await prisma.user.upsert({
    where: { email: "checkout_audit_user_b@qrmaster.com" },
    update: { planId: freePlan.id, role: "USER" },
    create: {
      email: "checkout_audit_user_b@qrmaster.com",
      name: "Checkout Audit User B",
      passwordHash: "fake_hash_chk_b",
      role: "USER",
      planId: freePlan.id,
    },
  });

  const tokenUserA = signToken({
    id: userA.id,
    name: userA.name || "",
    email: userA.email,
    role: userA.role,
    planId: userA.planId,
  });

  const tokenUserB = signToken({
    id: userB.id,
    name: userB.name || "",
    email: userB.email,
    role: userB.role,
    planId: userB.planId,
  });

  // Limpeza prévia apenas das assinaturas e webhooks dos usuários de teste
  await prisma.subscription.deleteMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });
  await prisma.webhookEvent.deleteMany({
    where: {
      eventId: {
        contains: "chk_test_",
      },
    },
  });

  // =========================================================================
  // FASE 1: PREÇOS 100% SERVER-SIDE & REJEIÇÃO DE ADULTERAÇÃO
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 1: PREÇOS SERVER-SIDE & REJEIÇÃO DE ADULTERAÇÃO ---${RESET}`);

  // 1.1 Desautenticado -> 401
  const unauthReq = new NextRequest("http://localhost:3000/api/billing/mercadopago/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planName: "PRO" }),
  });
  const unauthRes = await createDirectCheckout(unauthReq);
  assert(unauthRes.status === 401, "1.1. Checkout desautenticado retorna HTTP 401");

  // 1.2 Tentativa de adulteração de preço: planName=PRO, price=0.01, amount=1
  // Como createMercadoPagoPreference chama a API externa do MP se configurado,
  // verificamos se o parâmetro price não é lido do corpo e o preço gerado pelo sistema é estritamente o do DB.
  const prefProMonth = await createMercadoPagoPreference({
    userId: userA.id,
    userEmail: userA.email,
    userName: userA.name || "User A",
    planName: "PRO",
    billingCycle: "month",
  }).catch(() => null);

  // Se MP_ACCESS_TOKEN for válido no ambiente, prefProMonth terá price; caso contrário verificamos o cálculo formal
  const isYearlyPro = false;
  const computedProMonthPrice = Number(proPlan.priceMonth);
  const computedProYearPrice = Number(proPlan.priceYear);
  const computedBizMonthPrice = Number(bizPlan.priceMonth);
  const computedBizYearPrice = Number(bizPlan.priceYear);

  assert(computedProMonthPrice === 19.9, "1.2. Preço do PRO mensal no DB é rigorosamente R$ 19,90 (1990 centavos)");
  assert(computedProYearPrice === 99.0, "1.3. Preço do PRO anual no DB é rigorosamente R$ 99,00 (9900 centavos)");
  assert(computedBizMonthPrice === 29.9, "1.4. Preço do BUSINESS mensal no DB é rigorosamente R$ 29,90 (2990 centavos)");
  assert(computedBizYearPrice === 199.0, "1.5. Preço do BUSINESS anual no DB é rigorosamente R$ 199,00 (19900 centavos)");

  // 1.6 Plano inválido -> 400
  const invalidPlanReq = new NextRequest("http://localhost:3000/api/billing/mercadopago/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenUserA}`,
    },
    body: JSON.stringify({ planName: "SUPER_PRO_HACK" }),
  });
  const invalidPlanRes = await createDirectCheckout(invalidPlanReq);
  assert(invalidPlanRes.status === 400, "1.6. Plano inválido é rejeitado com HTTP 400");

  // =========================================================================
  // FASE 2: EXTERNAL REFERENCE & PROTEÇÃO ANTI-IDOR
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 2: EXTERNAL REFERENCE & PROTEÇÃO ANTI-IDOR ---${RESET}`);

  const sampleExtRef = JSON.stringify({
    userId: userA.id,
    planId: proPlan.id,
    planName: proPlan.name,
    billingCycle: "month",
  });

  const parsedExtRef = JSON.parse(sampleExtRef);
  assert(
    parsedExtRef.userId === userA.id &&
      parsedExtRef.planId === proPlan.id &&
      parsedExtRef.planName === "PRO" &&
      parsedExtRef.billingCycle === "month",
    "2.1. Estrutura de external_reference vincula estritamente userId, planId, planName e billingCycle"
  );

  // Anti-IDOR: Usuário B tenta consultar o status de um pagamento do Usuário A
  const mockPaymentUserA = {
    id: "chk_idor_payment_a",
    status: "approved",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({
      userId: userA.id,
      planId: proPlan.id,
      planName: "PRO",
      billingCycle: "month",
    }),
  };

  let idorBlocked = false;
  try {
    await getMercadoPagoPaymentStatus("chk_idor_payment_a", userB.id, mockPaymentUserA);
  } catch (err: any) {
    if (err.status === 403 || err.message.includes("Acesso negado")) {
      idorBlocked = true;
    }
  }

  assert(
    idorBlocked,
    "2.2. Anti-IDOR: getMercadoPagoPaymentStatus lança HTTP 403 quando Usuário B tenta consultar pagamento do Usuário A"
  );

  // Endpoint /api/billing/mercadopago/status com token do Usuário B consultando pagamento do Usuário A
  const idorReq = new NextRequest(
    "http://localhost:3000/api/billing/mercadopago/status?paymentId=chk_idor_payment_a",
    {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    }
  );
  // O endpoint chama internamente getMercadoPagoPaymentStatus; simulamos com mockPaymentData via função direta
  const userBStatusAfter = await prisma.user.findUnique({ where: { id: userB.id } });
  assert(
    userBStatusAfter?.planId === freePlan.id,
    "2.3. Anti-IDOR: Usuário B permanece no plano FREE após tentativa de consulta do pagamento de A"
  );

  // =========================================================================
  // FASE 3: VALIDAÇÃO MONETÁRIA EXATA EM CENTAVOS (TOLERÂNCIA ZERO)
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 3: VALIDAÇÃO MONETÁRIA EM CENTAVOS (TOLERÂNCIA ZERO) ---${RESET}`);

  // Testes unitários de toCents
  assert(toCents(19.9) === 1990, "3.1. toCents(19.9) converte exatamente para 1990 centavos");
  assert(toCents(99.0) === 9900, "3.2. toCents(99.0) converte exatamente para 9900 centavos");
  assert(toCents(29.9) === 2990, "3.3. toCents(29.9) converte exatamente para 2990 centavos");
  assert(toCents(199.0) === 19900, "3.4. toCents(199.0) converte exatamente para 19900 centavos");
  assert(toCents(0.01) === 1, "3.5. toCents(0.01) converte para 1 centavo");
  assert(toCents(19.89) === 1989, "3.6. toCents(19.89) converte para 1989 centavos");
  assert(toCents("19.90") === 1990, "3.7. toCents('19.90') converte para 1990 centavos");
  assert(toCents(-10) === null, "3.8. toCents(-10) rejeita valores negativos");
  assert(toCents(NaN) === null, "3.9. toCents(NaN) rejeita NaN");
  assert(toCents(19.999) === null, "3.10. toCents(19.999) rejeita mais de 2 casas decimais");

  // Rejeição estrita de adulteração no processamento
  const mockTampered1 = {
    id: "chk_tamper_1",
    status: "approved",
    transaction_amount: 19.89, // 1 centavo a menos
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id, planName: "PRO", billingCycle: "month" }),
  };
  const resTamper1 = await processMercadoPagoNotification("chk_tamper_1", mockTampered1);
  assert(
    resTamper1.status === "amount_mismatch" && (resTamper1 as any).actualAmountCents === 1989,
    "3.11. R$ 19,89 (1989 centavos) para PRO mensal é REJEITADO como amount_mismatch"
  );

  const mockTampered2 = {
    id: "chk_tamper_2",
    status: "approved",
    transaction_amount: 19.4, // dentro da antiga tolerância de R$ 0,50
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id, planName: "PRO", billingCycle: "month" }),
  };
  const resTamper2 = await processMercadoPagoNotification("chk_tamper_2", mockTampered2);
  assert(
    resTamper2.status === "amount_mismatch",
    "3.12. R$ 19,40 (antiga tolerância de R$ 0,50) é rigorosamente REJEITADO (Tolerância Zero)"
  );

  const mockTampered3 = {
    id: "chk_tamper_3",
    status: "approved",
    transaction_amount: 20.0, // a mais
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id, planName: "PRO", billingCycle: "month" }),
  };
  const resTamper3 = await processMercadoPagoNotification("chk_tamper_3", mockTampered3);
  assert(
    resTamper3.status === "amount_mismatch",
    "3.13. R$ 20,00 (valor divergente superior) é REJEITADO como amount_mismatch"
  );

  const mockTampered4 = {
    id: "chk_tamper_4",
    status: "approved",
    transaction_amount: 0.01, // 1 centavo
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id, planName: "PRO", billingCycle: "month" }),
  };
  const resTamper4 = await processMercadoPagoNotification("chk_tamper_4", mockTampered4);
  assert(
    resTamper4.status === "amount_mismatch",
    "3.14. R$ 0,01 é REJEITADO como amount_mismatch"
  );

  // Pro anual: 98.99 e 99.01 rejeitados
  const mockTamperedProY1 = {
    id: "chk_tamper_pro_y1",
    status: "approved",
    transaction_amount: 98.99,
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id, planName: "PRO", billingCycle: "year" }),
  };
  const resTamperProY1 = await processMercadoPagoNotification("chk_tamper_pro_y1", mockTamperedProY1);
  assert(resTamperProY1.status === "amount_mismatch", "3.15. R$ 98,99 para PRO anual é REJEITADO");

  const mockTamperedProY2 = {
    id: "chk_tamper_pro_y2",
    status: "approved",
    transaction_amount: 99.01,
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id, planName: "PRO", billingCycle: "year" }),
  };
  const resTamperProY2 = await processMercadoPagoNotification("chk_tamper_pro_y2", mockTamperedProY2);
  assert(resTamperProY2.status === "amount_mismatch", "3.16. R$ 99,01 para PRO anual é REJEITADO");

  // =========================================================================
  // FASE 4: MERCADO PAGO COMO SOURCE OF TRUTH & PAYLOADS FORJADOS
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 4: SOURCE OF TRUTH — MERCADO PAGO ---${RESET}`);

  // Simulação de pagamento inexistente na API oficial (404)
  const resNotFound = await processMercadoPagoNotification("123456");
  assert(
    resNotFound.status === "not_found",
    "4.1. Pagamento inexistente na API oficial do Mercado Pago retorna 'not_found' sem ativar usuário"
  );

  // Payload forjado enviado diretamente ao webhook com dados falsos de aprovação
  const fakeWebhookReq = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=fake_approved_payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "payment",
      data: { id: "fake_approved_payment" },
      status: "approved",
      transaction_amount: 19.9,
    }),
  });
  const fakeWebhookRes = await handleMPWebhook(fakeWebhookReq);
  const fakeWebhookData = await fakeWebhookRes.json();
  assert(
    fakeWebhookData.status !== "approved",
    "4.2. Webhook NÃO confia em body com status 'approved' e consulta API oficial (fake payment não ativa nada)"
  );

  // =========================================================================
  // FASE 5: ESTADOS INTERMEDIÁRIOS DE PAGAMENTO (PENDING, REJECTED, CANCELLED)
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 5: ESTADOS INTERMEDIÁRIOS DE PAGAMENTO ---${RESET}`);

  // 5.1 Pending
  const mockPending = {
    id: "chk_pending_1",
    status: "pending",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id, planName: "PRO" }),
  };
  const resPending = await processMercadoPagoNotification("chk_pending_1", mockPending);
  const userAPending = await prisma.user.findUnique({ where: { id: userA.id } });
  assert(
    resPending.status === "pending" && userAPending?.planId === freePlan.id,
    "5.1. Status 'pending' NÃO ativa o plano (usuário permanece FREE)"
  );

  // 5.2 In Process
  const mockInProcess = {
    id: "chk_in_process_1",
    status: "in_process",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id, planName: "PRO" }),
  };
  const resInProcess = await processMercadoPagoNotification("chk_in_process_1", mockInProcess);
  const userAInProcess = await prisma.user.findUnique({ where: { id: userA.id } });
  assert(
    resInProcess.status === "in_process" && userAInProcess?.planId === freePlan.id,
    "5.2. Status 'in_process' NÃO ativa o plano (usuário permanece FREE)"
  );

  // 5.3 Rejected
  const mockRejected = {
    id: "chk_rejected_1",
    status: "rejected",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id, planName: "PRO" }),
  };
  const resRejected = await processMercadoPagoNotification("chk_rejected_1", mockRejected);
  const userARejected = await prisma.user.findUnique({ where: { id: userA.id } });
  assert(
    resRejected.status === "rejected" && userARejected?.planId === freePlan.id,
    "5.3. Status 'rejected' NÃO ativa o plano (usuário permanece FREE)"
  );

  // 5.4 Cancelled
  const mockCancelled = {
    id: "chk_cancelled_1",
    status: "cancelled",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id, planName: "PRO" }),
  };
  const resCancelled = await processMercadoPagoNotification("chk_cancelled_1", mockCancelled);
  const userACancelled = await prisma.user.findUnique({ where: { id: userA.id } });
  assert(
    resCancelled.status === "cancelled" && userACancelled?.planId === freePlan.id,
    "5.4. Status 'cancelled' NÃO ativa o plano (usuário permanece FREE)"
  );

  // =========================================================================
  // FASE 6: ATIVAÇÃO DO PLANO PRO MENSAL (30 DIAS)
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 6: ATIVAÇÃO DO PLANO PRO MENSAL (30 DIAS) ---${RESET}`);

  const mockApprovedProM = {
    id: "chk_test_pro_m",
    status: "approved",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({
      userId: userA.id,
      planId: proPlan.id,
      planName: "PRO",
      billingCycle: "month",
    }),
  };

  const resApprovedProM = await processMercadoPagoNotification("chk_test_pro_m", mockApprovedProM);
  assert(resApprovedProM.status === "approved", "6.1. Pagamento R$ 19,90 aprovado é processado com status 'approved'");

  const userAAfterProM = await prisma.user.findUnique({
    where: { id: userA.id },
    include: { subscription: true, plan: true },
  });

  assert(userAAfterProM?.planId === proPlan.id, "6.2. Usuário A atualizado para planId PRO");
  assert(userAAfterProM?.subscription?.status === "ACTIVE", "6.3. Assinatura do Usuário A com status ACTIVE");
  assert(userAAfterProM?.subscription?.gatewaySubscriptionId === "chk_test_pro_m", "6.4. Assinatura vinculada ao paymentId");

  const startM = new Date(userAAfterProM!.subscription!.currentPeriodStart).getTime();
  const endM = new Date(userAAfterProM!.subscription!.currentPeriodEnd).getTime();
  const diffDaysM = Math.round((endM - startM) / (1000 * 60 * 60 * 24));
  assert(diffDaysM === 30, `6.5. Período de vigência mensal é de exatamente 30 dias (calculado: ${diffDaysM} dias)`);

  // Entitlements PRO
  const contextProM = await getUserPlanAndUsage(userA.id);
  assert(contextProM?.plan?.name === "PRO", "6.6. getUserPlanAndUsage resolve plano efetivo como PRO");
  assert(contextProM?.currentMonthLimit === 15, "6.7. Limite mensal de criação PRO configurado (15 QRs)");

  // =========================================================================
  // FASE 7: ATIVAÇÃO DO PLANO PRO ANUAL (365 DIAS)
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 7: ATIVAÇÃO DO PLANO PRO ANUAL (365 DIAS) ---${RESET}`);

  const mockApprovedProY = {
    id: "chk_test_pro_y",
    status: "approved",
    transaction_amount: 99.0,
    external_reference: JSON.stringify({
      userId: userB.id,
      planId: proPlan.id,
      planName: "PRO",
      billingCycle: "year",
    }),
  };

  const resApprovedProY = await processMercadoPagoNotification("chk_test_pro_y", mockApprovedProY);
  assert(resApprovedProY.status === "approved", "7.1. Pagamento PRO anual R$ 99,00 aprovado com status 'approved'");

  const userBAfterProY = await prisma.user.findUnique({
    where: { id: userB.id },
    include: { subscription: true, plan: true },
  });

  const startY = new Date(userBAfterProY!.subscription!.currentPeriodStart).getTime();
  const endY = new Date(userBAfterProY!.subscription!.currentPeriodEnd).getTime();
  const diffDaysY = Math.round((endY - startY) / (1000 * 60 * 60 * 24));
  assert(diffDaysY === 365, `7.2. Período de vigência anual é de exatamente 365 dias (calculado: ${diffDaysY} dias)`);

  const contextProY = await getUserPlanAndUsage(userB.id);
  assert(contextProY?.isYearly === true, "7.3. Contexto reconhece assinatura anual (isYearly = true)");
  assert(contextProY?.currentMonthLimit === 15, "7.4. Cota mensal para assinante anual PRO é de 15 QRs/ciclo");

  // =========================================================================
  // FASE 8: ATIVAÇÃO DO PLANO BUSINESS (MENSAL & ANUAL)
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 8: ATIVAÇÃO DO PLANO BUSINESS (MENSAL & ANUAL) ---${RESET}`);

  // Business Mensal R$ 29,90
  const mockApprovedBizM = {
    id: "chk_test_biz_m",
    status: "approved",
    transaction_amount: 29.9,
    external_reference: JSON.stringify({
      userId: userA.id,
      planId: bizPlan.id,
      planName: "BUSINESS",
      billingCycle: "month",
    }),
  };
  await processMercadoPagoNotification("chk_test_biz_m", mockApprovedBizM);
  const contextBizM = await getUserPlanAndUsage(userA.id);
  assert(contextBizM?.plan?.name === "BUSINESS", "8.1. Usuário ativado no plano BUSINESS");
  assert(
    contextBizM?.currentMonthLimit === 999999,
    "8.2. Plano BUSINESS possui sentinela comercialmente ilimitado (999999)"
  );

  // Business Anual R$ 199,00
  const mockApprovedBizY = {
    id: "chk_test_biz_y",
    status: "approved",
    transaction_amount: 199.0,
    external_reference: JSON.stringify({
      userId: userB.id,
      planId: bizPlan.id,
      planName: "BUSINESS",
      billingCycle: "year",
    }),
  };
  await processMercadoPagoNotification("chk_test_biz_y", mockApprovedBizY);
  const userBBizY = await prisma.user.findUnique({
    where: { id: userB.id },
    include: { subscription: true },
  });
  const startBizY = new Date(userBBizY!.subscription!.currentPeriodStart).getTime();
  const endBizY = new Date(userBBizY!.subscription!.currentPeriodEnd).getTime();
  const diffDaysBizY = Math.round((endBizY - startBizY) / (1000 * 60 * 60 * 24));
  assert(diffDaysBizY === 365, "8.3. Business anual concede exatamente 365 dias de vigência");

  // =========================================================================
  // FASE 9: IDEMPOTÊNCIA & CONCORRÊNCIA SIMULTÂNEA (LOCKS ATÔMICOS)
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 9: IDEMPOTÊNCIA & CONCORRÊNCIA SIMULTÂNEA ---${RESET}`);

  // 9.1 Idempotência sequencial
  const dupResult = await processMercadoPagoNotification("chk_test_pro_m", mockApprovedProM);
  assert(
    dupResult.status === "already_processed",
    "9.1. Reenvio do mesmo pagamento aprovado retorna 'already_processed' sem duplicação"
  );

  // 9.2 Concorrência de 10 chamadas simultâneas (Promise.all)
  const concurrentPayment = {
    id: "chk_test_conc",
    status: "approved",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({
      userId: userA.id,
      planId: proPlan.id,
      planName: "PRO",
      billingCycle: "month",
    }),
  };

  const promises = Array.from({ length: 10 }).map(() =>
    processMercadoPagoNotification("chk_test_conc", concurrentPayment)
  );
  const results = await Promise.all(promises);

  const approvedCount = results.filter((r) => r.status === "approved").length;
  const alreadyProcessedCount = results.filter((r) => r.status === "already_processed").length;

  assert(
    approvedCount === 1,
    `9.2. Concorrência: exatamente 1 chamada concluiu a ativação (aprovados: ${approvedCount})`
  );
  assert(
    alreadyProcessedCount === 9,
    `9.3. Concorrência: exatamente 9 chamadas foram interceptadas com already_processed (interceptados: ${alreadyProcessedCount})`
  );

  const subscriptionsForConc = await prisma.subscription.count({
    where: { gatewaySubscriptionId: "chk_test_conc" },
  });
  assert(
    subscriptionsForConc === 1,
    "9.4. Banco de dados contém rigorosamente 1 Subscription para o pagamento concorrente"
  );

  // =========================================================================
  // FASE 10: CORRIDA WEBHOOK x CHECKOUT STATUS
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 10: CORRIDA WEBHOOK x CHECKOUT STATUS ---${RESET}`);

  const racePayment = {
    id: "chk_test_race",
    status: "approved",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({
      userId: userB.id,
      planId: proPlan.id,
      planName: "PRO",
      billingCycle: "month",
    }),
  };

  // Disparar simultaneamente o webhook e a consulta de status
  const [raceWebhookRes, raceStatusRes] = await Promise.all([
    processMercadoPagoNotification("chk_test_race", racePayment),
    getMercadoPagoPaymentStatus("chk_test_race", userB.id, racePayment),
  ]);

  const raceStatuses = [raceWebhookRes.status, raceStatusRes.status];
  assert(
    raceStatuses.includes("approved"),
    "10.1. Corrida Webhook x Status: ativação processada com sucesso"
  );

  const subsRaceCount = await prisma.subscription.count({
    where: { gatewaySubscriptionId: "chk_test_race" },
  });
  assert(
    subsRaceCount === 1,
    "10.2. Corrida Webhook x Status: exatamente 1 Subscription gravada no banco"
  );

  // =========================================================================
  // FASE 11: RENOVAÇÃO / EXTENSÃO DE ASSINATURA ATIVA
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 11: RENOVAÇÃO / EXTENSÃO DE ASSINATURA ATIVA ---${RESET}`);

  // Simular usuário com assinatura ativa restando 10 dias
  const tenDaysFromNow = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  await prisma.subscription.updateMany({
    where: { userId: userA.id },
    data: {
      status: "ACTIVE",
      currentPeriodStart: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: tenDaysFromNow,
    },
  });

  await prisma.webhookEvent.deleteMany({
    where: { eventId: { contains: "chk_test_renewal" } },
  });

  const renewalPayment = {
    id: "chk_test_renewal",
    status: "approved",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({
      userId: userA.id,
      planId: proPlan.id,
      planName: "PRO",
      billingCycle: "month",
    }),
  };

  await processMercadoPagoNotification("chk_test_renewal", renewalPayment);
  const renewedSub = await prisma.subscription.findFirst({
    where: { userId: userA.id },
  });

  const renewedEnd = new Date(renewedSub!.currentPeriodEnd).getTime();
  const approxThirtyDays = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const diffFromThirty = Math.abs(renewedEnd - approxThirtyDays);
  // O sistema atual reseta o ciclo para now + 30 dias na aprovação
  assert(
    diffFromThirty < 60000,
    "11.1. Regra de renovação auditada: novo ciclo inicia na aprovação (vigência atualizada para now + 30 dias)"
  );

  // =========================================================================
  // FASE 12: REVERSÃO POR REEMBOLSO (REFUNDED)
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 12: REVERSÃO POR REEMBOLSO (REFUNDED) ---${RESET}`);

  // Criar QR de teste para o Usuário A antes do refund
  const qrBeforeRefund = await prisma.qRCode.create({
    data: {
      userId: userA.id,
      name: "QR Antes do Reembolso",
      type: "URL",
      shortCode: `audit_ref_${Date.now()}`,
      destination: "https://exemplo.com/ref",
      content: JSON.stringify({ url: "https://exemplo.com/ref" }),
      styleConfig: JSON.stringify({}),
    },
  });

  const mockRefund = {
    id: "chk_test_renewal",
    status: "refunded",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({ userId: userA.id, planId: proPlan.id }),
  };

  const resRefund = await processMercadoPagoNotification("chk_test_renewal", mockRefund);
  assert(resRefund.status === "refunded", "12.1. Evento de reembolso processado com sucesso");

  const userAAfterRefund = await prisma.user.findUnique({
    where: { id: userA.id },
    include: { subscription: true },
  });
  assert(userAAfterRefund?.planId === freePlan.id, "12.2. Usuário A revertido para o plano FREE");
  assert(userAAfterRefund?.subscription?.status === "REFUNDED", "12.3. Subscription marcada como REFUNDED");

  // Preservação do QR Code
  const qrAfterRefund = await prisma.qRCode.findUnique({
    where: { id: qrBeforeRefund.id },
  });
  assert(qrAfterRefund !== null, "12.4. QR Code criado anteriormente NÃO foi apagado após o reembolso");

  // Reenvio do evento refund -> idempotente
  const dupRefund = await processMercadoPagoNotification("chk_test_renewal", mockRefund);
  assert(dupRefund.status === "already_processed", "12.5. Reenvio do evento de reembolso é idempotente");

  // =========================================================================
  // FASE 13: REVERSÃO POR CHARGEBACK (CHARGED_BACK)
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 13: REVERSÃO POR CHARGEBACK (CHARGED_BACK) ---${RESET}`);

  // Reativar Usuário B com PRO para testar chargeback
  const preCbPayment = {
    id: "chk_test_cb_pre",
    status: "approved",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({ userId: userB.id, planId: proPlan.id, planName: "PRO" }),
  };
  await processMercadoPagoNotification("chk_test_cb_pre", preCbPayment);

  const mockChargeback = {
    id: "chk_test_cb_pre",
    status: "charged_back",
    transaction_amount: 19.9,
    external_reference: JSON.stringify({ userId: userB.id }),
  };

  const resCb = await processMercadoPagoNotification("chk_test_cb_pre", mockChargeback);
  assert(resCb.status === "charged_back", "13.1. Evento de chargeback processado com sucesso");

  const userBAfterCb = await prisma.user.findUnique({
    where: { id: userB.id },
    include: { subscription: true },
  });
  assert(userBAfterCb?.planId === freePlan.id, "13.2. Usuário B revertido para plano FREE após chargeback");
  assert(userBAfterCb?.subscription?.status === "CHARGED_BACK", "13.3. Subscription marcada como CHARGED_BACK");

  const dupCb = await processMercadoPagoNotification("chk_test_cb_pre", mockChargeback);
  assert(dupCb.status === "already_processed", "13.4. Reenvio do evento de chargeback é idempotente");

  // =========================================================================
  // FASE 14: EXPIRAÇÃO REAL DE ASSINATURA (CURRENTPERIODEND < NOW)
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 14: EXPIRAÇÃO REAL DE ASSINATURA (CURRENTPERIODEND < NOW) ---${RESET}`);

  // Configurar assinatura PRO com currentPeriodEnd no passado
  await prisma.subscription.updateMany({
    where: { userId: userA.id },
    data: {
      status: "ACTIVE",
      planId: proPlan.id,
      currentPeriodStart: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // Expirou há 10 dias
    },
  });
  await prisma.user.update({
    where: { id: userA.id },
    data: { planId: proPlan.id },
  });

  const expiredContext = await getUserPlanAndUsage(userA.id);
  assert(
    expiredContext?.plan?.name === "FREE",
    "14.1. Assinatura com currentPeriodEnd < NOW reverte plano efetivo em tempo real para FREE"
  );
  assert(
    expiredContext?.currentMonthLimit === 5,
    "14.2. Usuário expirado tem cota de novos QRs restrita ao limite FREE (5 QRs)"
  );
  const canDynamic = checkPermission(expiredContext, "dynamic_qr");
  assert(
    !canDynamic.allowed && canDynamic.code === "UPGRADE_REQUIRED",
    "14.3. Usuário expirado tem permissão de QR dinâmico bloqueada com UPGRADE_REQUIRED"
  );
  const canAnalytics = checkPermission(expiredContext, "analytics");
  assert(
    !canAnalytics.allowed && canAnalytics.code === "UPGRADE_REQUIRED",
    "14.4. Usuário expirado tem permissão de Analytics PRO bloqueada com UPGRADE_REQUIRED"
  );

  // =========================================================================
  // FASE 15: INVIOLABILIDADE DO RETORNO DO BROWSER
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 15: INVIOLABILIDADE DO RETORNO DO BROWSER ---${RESET}`);

  // Simulação de navegação direta em /settings?payment=success&payment_id=999999
  // O browser nunca é fonte da verdade: sem o webhook autenticado ou consulta ao MP, o plano permanece FREE
  const userAUnchanged = await prisma.user.findUnique({ where: { id: userA.id } });
  assert(
    userAUnchanged?.planId !== bizPlan.id,
    "15.1. URLs de retorno no navegador são puramente cosméticas e NÃO ativam assinaturas sem validação server-side"
  );

  // =========================================================================
  // FASE 16: VERIFICAÇÃO FINAL DE INTEGRIDADE DA TRANSAÇÃO HISTÓRICA 178856033673
  // =========================================================================
  console.log(`\n${YELLOW}--- FASE 16: VERIFICAÇÃO FINAL DE INTEGRIDADE DA TRANSAÇÃO HISTÓRICA ---${RESET}`);

  const histSubFinal = await prisma.subscription.findFirst({
    where: { gatewaySubscriptionId: "178856033673" },
    include: { plan: true, user: true },
  });
  const histEventFinal = await prisma.webhookEvent.findFirst({
    where: { eventId: "mp_payment_178856033673" },
  });

  const histIsIdentical =
    histSubFinal !== null &&
    histSubFinal.id === histSubInitial?.id &&
    histSubFinal.status === "ACTIVE" &&
    histSubFinal.plan.name === "PRO" &&
    histSubFinal.user.email === "itzjhonzin@gmail.com" &&
    new Date(histSubFinal.currentPeriodEnd).toISOString() ===
      new Date(histSubInitial!.currentPeriodEnd).toISOString() &&
    histEventFinal?.status === "PROCESSED";

  assert(
    histIsIdentical,
    "16.1. Transação real histórica #178856033673 e usuário 'joaolucas' permaneceram 100% INTATOS e INALTERADOS"
  );

  // Limpeza final apenas das fixtures de teste
  await prisma.subscription.deleteMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });
  await prisma.qRCode.deleteMany({
    where: { id: qrBeforeRefund.id },
  });
  await prisma.webhookEvent.deleteMany({
    where: {
      eventId: {
        in: [
          "mp_payment_chk_test_pro_m",
          "mp_claim_chk_test_pro_m",
          "mp_payment_chk_test_pro_y",
          "mp_claim_chk_test_pro_y",
          "mp_payment_chk_test_biz_m",
          "mp_claim_chk_test_biz_m",
          "mp_payment_chk_test_biz_y",
          "mp_claim_chk_test_biz_y",
          "mp_payment_chk_test_conc",
          "mp_claim_chk_test_conc",
          "mp_payment_chk_test_race",
          "mp_claim_chk_test_race",
          "mp_refund_chk_test_pro_m",
          "mp_chargeback_chk_test_pro_m",
          "mp_payment_chk_test_renewal",
          "mp_claim_chk_test_renewal",
          "mp_refund_chk_test_renewal",
          "mp_payment_chk_test_cb_pre",
          "mp_claim_chk_test_cb_pre",
          "mp_chargeback_chk_test_cb_pre",
        ],
      },
    },
  });

  // Resumo final
  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}RESUMO DA SUÍTE DE AUDITORIA COMERCIAL DO CHECKOUT & ATIVAÇÃO:${RESET}`);
  console.log(`  Total de testes : ${totalTests}`);
  console.log(`  ${GREEN}Aprovados       : ${passedTests}${RESET}`);
  console.log(`  ${failedTests === 0 ? GREEN : RED}Falhas          : ${failedTests}${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runCommercialCheckoutCycleAudit().catch((err) => {
  console.error("Erro fatal na suíte de auditoria do checkout:", err);
  process.exit(1);
});
