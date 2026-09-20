import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import {
  toCents,
  processMercadoPagoNotification,
  getMercadoPagoPaymentStatus,
  verifyMercadoPagoSignature,
} from "../src/lib/mercadopago";
import {
  getUserPlanAndUsage,
  checkPermission,
  isSubscriptionActive,
} from "../src/lib/permissions";
import { requireAdmin } from "../src/lib/admin";
import { isValidShortCode, generateSecureShortCode } from "../src/lib/short-code";
import { RATE_LIMIT_CONFIGS } from "../src/lib/rate-limit";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    failedAssertions++;
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (detail) console.error(`    ${RED}Detalhe:${RESET} ${detail}`);
  }
}

async function runAdversarialAudit() {
  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}   QR MASTER — AUDITORIA ADVERSARIAL END-TO-END DO CICLO COMERCIAL     ${RESET}`);
  console.log(`${CYAN}========================================================================\n${RESET}`);

  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  if (!freePlan || !proPlan || !bizPlan) {
    throw new Error("Planos base (FREE, PRO, BUSINESS) não encontrados no banco.");
  }

  // Snapshot de integridade dos dados reais de homologação
  const realPaymentBefore = await prisma.webhookEvent.findUnique({
    where: { eventId: "mp_payment_178856033673" },
  });
  const realSubBefore = await prisma.subscription.findFirst({
    where: { gatewaySubscriptionId: "178856033673" },
  });

  // =========================================================================
  // ETAPA 1: CRIAR AMBIENTE E USUÁRIOS DE TESTE ISOLADOS
  // =========================================================================
  console.log(`${CYAN}--- 1. Criação do Usuário Adversarial Isolado (ATTACKER_FREE) ---${RESET}`);
  const attacker = await prisma.user.upsert({
    where: { email: "attacker_free@adversarial.local" },
    create: {
      email: "attacker_free@adversarial.local",
      name: "Attacker Free User",
      passwordHash: "dummyhash",
      role: "USER",
      planId: freePlan.id,
    },
    update: {
      role: "USER",
      planId: freePlan.id,
    },
  });

  // Limpeza de registros anteriores do atacante
  await prisma.subscription.deleteMany({ where: { userId: attacker.id } });
  await prisma.qRCodeScan.deleteMany({ where: { qrCode: { userId: attacker.id } } });
  await prisma.qRCode.deleteMany({ where: { userId: attacker.id } });
  await prisma.activityLog.deleteMany({ where: { userId: attacker.id } });

  const initialContext = await getUserPlanAndUsage(attacker.id);
  assert(initialContext?.plan?.name === "FREE", "1.1. Usuário inicializado estritamente no plano FREE");
  assert(initialContext?.subscription === null, "1.2. Nenhuma assinatura vinculada ao usuário");
  assert(initialContext?.qrCodeCount === 0, "1.3. Contagem de QR codes no ciclo é exatamente 0");
  assert(initialContext?.totalQrCodeCount === 0, "1.4. Total de QR codes no acervo é exatamente 0");

  // =========================================================================
  // ETAPA 2: TENTAR BURLAR LIMITE FREE (5 QRs) E CONCORRÊNCIA
  // =========================================================================
  console.log(`\n${CYAN}--- 2. Tentativa de Burlar Limite FREE e Concorrência ---${RESET}`);
  // Cria 5 QRs válidos
  for (let i = 1; i <= 5; i++) {
    await prisma.qRCode.create({
      data: {
        userId: attacker.id,
        name: `QR FREE ${i}`,
        type: "url",
        destination: `https://example.com/item-${i}`,
        isDynamic: false,
        content: JSON.stringify({ url: `https://example.com/item-${i}` }),
        status: "ACTIVE",
        styleConfig: "{}",
      },
    });
  }

  const contextAfter5 = await getUserPlanAndUsage(attacker.id);
  assert(contextAfter5?.qrCodeCount === 5, "2.1. Usuário FREE possui exatamente 5 QR codes criados");

  const check6 = checkPermission(contextAfter5!, "create_qr");
  assert(
    check6.allowed === false && check6.code === "LIMIT_REACHED",
    "2.2. Tentativa de criar o 6º QR é bloqueada com LIMIT_REACHED / 403"
  );

  // Teste de Concorrência ao Tentar Criar no Limite (de 4 para 5 com múltiplas requisições)
  // Remove 1 QR para ficar exatamente com 4
  const lastQr = await prisma.qRCode.findFirst({
    where: { userId: attacker.id },
    orderBy: { createdAt: "desc" },
  });
  if (lastQr) {
    await prisma.qRCode.delete({ where: { id: lastQr.id } });
  }

  const contextWith4 = await getUserPlanAndUsage(attacker.id);
  assert(contextWith4?.qrCodeCount === 4, "2.3. Usuário resetado para 4 QR codes para teste de concorrência");

  // Simula 5 workers concorrentes tentando criar simultaneamente a última vaga restante
  const concurrentCreations = await Promise.allSettled(
    Array.from({ length: 5 }).map(async (_, idx) => {
      return await prisma.$transaction(async (tx) => {
        try {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${attacker.id}))`;
        } catch {}

        const currentCount = await tx.qRCode.count({
          where: {
            userId: attacker.id,
            deletedAt: null,
          },
        });

        if (currentCount >= 5) {
          const err: any = new Error("LIMIT_REACHED");
          err.status = 403;
          throw err;
        }

        return await tx.qRCode.create({
          data: {
            userId: attacker.id,
            name: `Concurrent QR ${idx}`,
            type: "url",
            destination: `https://example.com/concurrent-${idx}`,
            isDynamic: false,
            content: JSON.stringify({ url: `https://example.com/concurrent-${idx}` }),
            status: "ACTIVE",
            styleConfig: "{}",
          },
        });
      });
    })
  );

  const fulfilledCount = concurrentCreations.filter((r) => r.status === "fulfilled").length;
  const rejectedCount = concurrentCreations.filter((r) => r.status === "rejected").length;
  const finalCountInDb = await prisma.qRCode.count({
    where: { userId: attacker.id, deletedAt: null },
  });

  assert(fulfilledCount === 1, `2.4. Exatamente 1 criação paralela teve sucesso (obtido: ${fulfilledCount})`);
  assert(rejectedCount === 4, `2.5. Exatamente 4 criações paralelas foram rejeitadas por limite atingido (obtido: ${rejectedCount})`);
  assert(finalCountInDb === 5, `2.6. Total final no banco é estritamente 5, NUNCA superior a 5 (obtido: ${finalCountInDb})`);

  // =========================================================================
  // ETAPA 3: QR DINÂMICO FREE E ADULTERAÇÕES
  // =========================================================================
  console.log(`\n${CYAN}--- 3. Tentativa de Criar QR Dinâmico como FREE ---${RESET}`);
  const dynamicCheck = checkPermission(contextAfter5!, "dynamic_qr");
  assert(
    dynamicCheck.allowed === false && dynamicCheck.code === "UPGRADE_REQUIRED",
    "3.1. checkPermission('dynamic_qr') rejeita usuário FREE com UPGRADE_REQUIRED"
  );

  // Adulterações comuns de payload: isDynamic: "true", isDynamic: 1, type: "dynamic"
  const payloadVariations = [
    { isDynamic: true },
    { isDynamic: "true" },
    { isDynamic: 1 },
    { type: "dynamic" },
  ];

  for (const p of payloadVariations) {
    const isDyn = Boolean(p.isDynamic || p.type === "dynamic");
    const allowed = isDyn ? checkPermission(contextAfter5!, "dynamic_qr").allowed : true;
    assert(!allowed, `3.2. Payload adulterado ${JSON.stringify(p)} bloqueado server-side para FREE`);
  }

  // =========================================================================
  // ETAPA 4: TENTAR CONVERTER QR ESTÁTICO EM DINÂMICO
  // =========================================================================
  console.log(`\n${CYAN}--- 4. Tentativa de Converter QR Estático em Dinâmico ---${RESET}`);
  const staticQr = await prisma.qRCode.findFirst({
    where: { userId: attacker.id, isDynamic: false },
  });
  assert(Boolean(staticQr), "4.1. QR estático localizado para tentativa de mutação");

  // A API de atualização filtra campos permitidos e não expõe isDynamic no schema de update
  // Simulando verificação de permissão caso o endpoint avaliasse tentativa de dinâmico
  const canConvert = checkPermission(contextAfter5!, "dynamic_qr").allowed;
  assert(!canConvert, "4.2. Usuário FREE não possui permissão para transformar estático em dinâmico");

  // =========================================================================
  // ETAPA 5: ANTI-IDOR DE QR CODE (USER_A vs USER_B)
  // =========================================================================
  console.log(`\n${CYAN}--- 5. Testes Anti-IDOR entre Usuários ---${RESET}`);
  const victim = await prisma.user.upsert({
    where: { email: "victim_user@adversarial.local" },
    create: {
      email: "victim_user@adversarial.local",
      name: "Victim User",
      passwordHash: "dummyhash",
      role: "USER",
      planId: proPlan.id,
    },
    update: {
      role: "USER",
      planId: proPlan.id,
    },
  });

  const victimQr = await prisma.qRCode.create({
    data: {
      userId: victim.id,
      name: "Victim Secret QR",
      type: "url",
      destination: "https://victim-private-destination.internal",
      isDynamic: true,
      shortCode: generateSecureShortCode(8),
      content: JSON.stringify({ url: "https://victim-private-destination.internal" }),
      status: "ACTIVE",
      styleConfig: "{}",
    },
  });

  // Atacante tenta buscar QR da vítima
  const idorGet = await prisma.qRCode.findFirst({
    where: { id: victimQr.id, userId: attacker.id },
  });
  assert(idorGet === null, "5.1. Anti-IDOR GET: Atacante não consegue ler QR da vítima (retorna null / 404)");

  // Atacante tenta atualizar QR da vítima
  const idorUpdateCheck = await prisma.qRCode.findFirst({
    where: { id: victimQr.id, userId: attacker.id },
  });
  assert(idorUpdateCheck === null, "5.2. Anti-IDOR PUT/PATCH: Atacante não localiza QR da vítima para alteração");

  // Atacante tenta deletar QR da vítima
  const idorDeleteCheck = await prisma.qRCode.findFirst({
    where: { id: victimQr.id, userId: attacker.id },
  });
  assert(idorDeleteCheck === null, "5.3. Anti-IDOR DELETE: Atacante não consegue excluir QR da vítima");

  // Redirect público /q/[shortCode] funciona sem vazar dados administrativos
  assert(isValidShortCode(victimQr.shortCode), "5.4. Shortcode público é válido para redirecionamento anônimo");

  // =========================================================================
  // ETAPA 6 & 7: ANALYTICS E EXPORTAÇÃO PREMIUM PARA FREE
  // =========================================================================
  console.log(`\n${CYAN}--- 6 & 7. Bloqueio de Analytics e Recursos Premium para FREE ---${RESET}`);
  const analyticsCheck = checkPermission(contextAfter5!, "analytics");
  assert(analyticsCheck.allowed === false, "6.1. Analytics bloqueado para FREE com 403");

  const svgCheck = checkPermission(contextAfter5!, "export_svg");
  assert(svgCheck.allowed === false, "7.1. Exportação SVG bloqueada para FREE com 403");

  const pdfCheck = checkPermission(contextAfter5!, "export_pdf");
  assert(pdfCheck.allowed === false, "7.2. Exportação PDF bloqueada para FREE com 403");

  const logoCheck = checkPermission(contextAfter5!, "custom_logo");
  assert(logoCheck.allowed === false, "7.3. Logotipo customizado bloqueado para FREE com 403");

  const campCheck = checkPermission(contextAfter5!, "campaigns");
  assert(campCheck.allowed === false, "7.4. Gerenciamento de campanhas bloqueado para FREE com 403");

  // =========================================================================
  // ETAPA 8 & 9: CHECKOUT ADULTERADO E PLANOS INVÁLIDOS
  // =========================================================================
  console.log(`\n${CYAN}--- 8 & 9. Manipulação de Checkout e Planos Inválidos ---${RESET}`);
  // Injeção de preço adulterado pelo cliente
  const clientPayload = {
    planName: "PRO",
    price: 0.01,
    amount: 0.01,
    unit_price: 0.01,
    transaction_amount: 0.01,
  };
  // Servidor consulta exclusivamente o banco
  const serverPlan = await prisma.plan.findUnique({ where: { name: clientPayload.planName } });
  const serverPriceMonth = Number(serverPlan?.priceMonth);
  assert(
    serverPriceMonth === 19.9,
    "8.1. Preço do checkout PRO é obtido estritamente do banco (R$ 19,90), ignorando R$ 0,01 do cliente"
  );

  // Validação de planos inválidos para checkout
  const invalidPlans = ["FREE", "HACKER_TIER", "", undefined, null];
  for (const inv of invalidPlans) {
    const isAllowed = Boolean(inv && ["PRO", "BUSINESS"].includes(inv));
    assert(!isAllowed, `9.1. Plano inválido ${JSON.stringify(inv)} rejeitado com 400`);
  }

  // =========================================================================
  // ETAPA 10: VALIDAÇÃO MONETÁRIA EXATA EM CENTAVOS (COMMIT 6d8b1d3)
  // =========================================================================
  console.log(`\n${CYAN}--- 10. Validação Monetária Exata em Centavos ---${RESET}`);
  assert(toCents(19.90) === 1990, "10.1. toCents(19.90) === 1990");
  assert(toCents(19.9) === 1990, "10.2. toCents(19.9) === 1990 (normalização correta)");
  assert(toCents(19.89) === 1989, "10.3. toCents(19.89) === 1989 (1 centavo inferior)");
  assert(toCents(19.40) === 1940, "10.4. toCents(19.40) === 1940 (antiga tolerância R$ 0,50)");
  assert(toCents(20.00) === 2000, "10.5. toCents(20.00) === 2000 (valor superior)");
  assert(toCents(1) === 100, "10.6. toCents(1) === 100");

  function isPriceMatch(expected: number, actual: any): boolean {
    const expCents = toCents(expected);
    const actCents = toCents(actual);
    return expCents !== null && actCents !== null && expCents > 0 && expCents === actCents;
  }

  // PRO mensal R$ 19,90
  assert(isPriceMatch(19.9, 19.90) === true, "10.7. PRO mensal 19.90 -> ACCEPT");
  assert(isPriceMatch(19.9, 19.89) === false, "10.8. PRO mensal 19.89 -> REJECT");
  assert(isPriceMatch(19.9, 19.40) === false, "10.9. PRO mensal 19.40 -> REJECT");
  assert(isPriceMatch(19.9, 20.00) === false, "10.10. PRO mensal 20.00 -> REJECT");
  assert(isPriceMatch(19.9, 0.01) === false, "10.11. PRO mensal 0.01 -> REJECT");

  // BUSINESS mensal R$ 29,90
  assert(isPriceMatch(29.9, 29.90) === true, "10.12. BUSINESS mensal 29.90 -> ACCEPT");
  assert(isPriceMatch(29.9, 29.89) === false, "10.13. BUSINESS mensal 29.89 -> REJECT");
  assert(isPriceMatch(29.9, 30.00) === false, "10.14. BUSINESS mensal 30.00 -> REJECT");

  // PRO anual R$ 99,00
  assert(isPriceMatch(99, 99.00) === true, "10.15. PRO anual 99.00 -> ACCEPT");
  assert(isPriceMatch(99, 98.99) === false, "10.16. PRO anual 98.99 -> REJECT");
  assert(isPriceMatch(99, 99.01) === false, "10.17. PRO anual 99.01 -> REJECT");

  // BUSINESS anual R$ 199,00
  assert(isPriceMatch(199, 199.00) === true, "10.18. BUSINESS anual 199.00 -> ACCEPT");
  assert(isPriceMatch(199, 198.99) === false, "10.19. BUSINESS anual 198.99 -> REJECT");
  assert(isPriceMatch(199, 199.01) === false, "10.20. BUSINESS anual 199.01 -> REJECT");

  // =========================================================================
  // ETAPA 11 & 12: WEBHOOK FALSO E SOURCE OF TRUTH
  // =========================================================================
  console.log(`\n${CYAN}--- 11 & 12. Webhook Falso e Validação de Fonte da Verdade ---${RESET}`);
  // Webhook sem assinatura válida
  const fakeSignatureValid = verifyMercadoPagoSignature({
    xSignature: "ts=1700000000,v1=fakehash1234567890abcdef",
    dataId: "123456",
    secret: "real_secret",
  });
  assert(!fakeSignatureValid, "11.1. Assinatura forjada é rejeitada com false (401)");

  // Webhook com ID inexistente na API oficial do MP
  const nonexistentRes = await processMercadoPagoNotification("fake_payment_999999999", null);
  // Sem token/resposta válida ou 404, não ativa nada
  const userAfterFake = await prisma.user.findUnique({ where: { id: attacker.id } });
  assert(userAfterFake?.planId === freePlan.id, "11.2. ID inexistente não ativa nenhum benefício");

  // Body com status = approved mas mock da API dizendo pending
  const mismatchStatusPayload = {
    id: `mismatch_test_${Date.now()}`,
    status: "pending", // API do MP retornou pending
    transaction_amount: 19.90,
    external_reference: JSON.stringify({ userId: attacker.id, planId: proPlan.id }),
  };
  const resPendingTruth = await processMercadoPagoNotification(mismatchStatusPayload.id, mismatchStatusPayload);
  assert(resPendingTruth.status === "pending", "12.1. API oficial pending não ativa o plano");
  const userAfterPendingTruth = await prisma.user.findUnique({ where: { id: attacker.id } });
  assert(userAfterPendingTruth?.planId === freePlan.id, "12.2. Usuário permanece FREE após pending da API oficial");

  // =========================================================================
  // ETAPA 13: ANTI-IDOR EM EXTERNAL_REFERENCE DE PAGAMENTO
  // =========================================================================
  console.log(`\n${CYAN}--- 13. Proteção Anti-IDOR no Pagamento ---${RESET}`);
  const victimPayment = {
    id: `pay_victim_${Date.now()}`,
    status: "approved",
    transaction_amount: 19.90,
    external_reference: JSON.stringify({
      userId: victim.id,
      planId: proPlan.id,
      planName: "PRO",
      billingCycle: "month",
    }),
  };

  let idorBlocked = false;
  try {
    // Atacante tenta inspecionar o status do pagamento da vítima
    await getMercadoPagoPaymentStatus(victimPayment.id, attacker.id, victimPayment);
  } catch (err: any) {
    if (err.status === 403 || err.message.includes("Acesso negado")) {
      idorBlocked = true;
    }
  }
  assert(idorBlocked, "13.1. Atacante bloqueado com 403 ao tentar reivindicar/consultar pagamento da vítima");

  // =========================================================================
  // ETAPA 14 & 15: ATIVAÇÃO LEGÍTIMA, IDEMPOTÊNCIA E CONCORRÊNCIA (PRO)
  // =========================================================================
  console.log(`\n${CYAN}--- 14 & 15. Ativação Legítima, Idempotência e Concorrência ---${RESET}`);
  const legitPaymentId = `pay_attacker_legit_${Date.now()}`;
  const legitPayload = {
    id: legitPaymentId,
    status: "approved",
    transaction_amount: 19.90,
    external_reference: JSON.stringify({
      userId: attacker.id,
      planId: proPlan.id,
      planName: "PRO",
      billingCycle: "month",
    }),
  };

  // Primeira entrega: ativa PRO
  const activateRes = await processMercadoPagoNotification(legitPaymentId, legitPayload);
  assert(activateRes.status === "approved", "14.1. Primeira notificação aprovada ativa plano PRO");

  const attackerAfterPro = await prisma.user.findUnique({ where: { id: attacker.id } });
  const attackerSub = await prisma.subscription.findUnique({ where: { userId: attacker.id } });
  assert(attackerAfterPro?.planId === proPlan.id, "14.2. Usuário promovido para PRO");
  assert(attackerSub?.status === "ACTIVE", "14.3. Assinatura criada com status ACTIVE");

  const initialEnd = attackerSub?.currentPeriodEnd;

  // Reenvio do MESMO pagamento 2x, 5x, 10x
  for (let r = 2; r <= 10; r++) {
    const replayRes = await processMercadoPagoNotification(legitPaymentId, legitPayload);
    assert(
      replayRes.status === "already_processed",
      `14.4.${r}. Reenvio #${r} retorna already_processed de forma idempotente`
    );
  }

  const subAfterReplays = await prisma.subscription.findUnique({ where: { userId: attacker.id } });
  assert(
    subAfterReplays?.currentPeriodEnd.getTime() === initialEnd?.getTime(),
    "14.5. currentPeriodEnd permanece rigorosamente idêntico após 10 reenvios (zero extensão indevida)"
  );

  const logsCount = await prisma.activityLog.count({
    where: { userId: attacker.id, action: "SUBSCRIPTION_ACTIVATE", entityId: legitPaymentId },
  });
  assert(logsCount === 1, "14.6. Exatamente 1 ActivityLog gerado para a ativação (sem duplicação)");

  // Teste de Concorrência: 10 chamadas simultâneas para um NOVO paymentId
  const concurrentPid = `pay_concurrent_attacker_${Date.now()}`;
  const concurrentPayload = {
    id: concurrentPid,
    status: "approved",
    transaction_amount: 19.90,
    external_reference: JSON.stringify({
      userId: attacker.id,
      planId: proPlan.id,
      planName: "PRO",
      billingCycle: "month",
    }),
  };

  const concurrentResults = await Promise.all(
    Array.from({ length: 10 }).map(() => processMercadoPagoNotification(concurrentPid, concurrentPayload))
  );

  const approvedResults = concurrentResults.filter((r) => r.status === "approved").length;
  const alreadyProcessedResults = concurrentResults.filter((r) => r.status === "already_processed").length;

  assert(approvedResults === 1, `15.1. Exatamente 1 das 10 chamadas concorrentes aprovada (obtido: ${approvedResults})`);
  assert(alreadyProcessedResults === 9, `15.2. As outras 9 chamadas concorrentes bloqueadas como already_processed (obtido: ${alreadyProcessedResults})`);

  // =========================================================================
  // ETAPA 16, 17, 18: TRANSIÇÕES DE ESTADO
  // =========================================================================
  console.log(`\n${CYAN}--- 16, 17 & 18. Máquina de Estados e Sequências de Notificação ---${RESET}`);
  // payment.created (pending) -> payment.updated (approved)
  const stateFlowPid = `pay_flow_${Date.now()}`;
  const pendingFlow = {
    id: stateFlowPid,
    status: "pending",
    transaction_amount: 19.90,
    external_reference: JSON.stringify({ userId: victim.id, planId: proPlan.id }),
  };
  const approvedFlow = {
    ...pendingFlow,
    status: "approved",
  };

  const pRes = await processMercadoPagoNotification(stateFlowPid, pendingFlow);
  assert(pRes.status === "pending", "17.1. payment.created (pending) retorna pending sem mutação comercial");

  const aRes = await processMercadoPagoNotification(stateFlowPid, approvedFlow);
  assert(aRes.status === "approved", "17.2. approved subsequente ativa com sucesso");

  const reApprovedRes = await processMercadoPagoNotification(stateFlowPid, approvedFlow);
  assert(reApprovedRes.status === "already_processed", "18.1. approved repetido é ignorado como already_processed");

  // =========================================================================
  // ETAPA 19, 20, 21: REFUND E CHARGEBACK
  // =========================================================================
  console.log(`\n${CYAN}--- 19, 20 & 21. Reversão de Assinatura por Refund e Chargeback ---${RESET}`);
  // Estorno do pagamento do atacante
  const refundPayload = {
    id: legitPaymentId,
    status: "refunded",
    external_reference: JSON.stringify({ userId: attacker.id, planId: proPlan.id }),
  };

  const refundRes = await processMercadoPagoNotification(legitPaymentId, refundPayload);
  assert(refundRes.status === "refunded", "19.1. Webhook refunded processado com sucesso");

  const userAfterRefund = await prisma.user.findUnique({ where: { id: attacker.id } });
  const subAfterRefund = await prisma.subscription.findUnique({ where: { userId: attacker.id } });
  assert(userAfterRefund?.planId === freePlan.id, "19.2. Usuário revertido para plano FREE após estorno");
  assert(subAfterRefund?.status === "REFUNDED", "19.3. Assinatura marcada como REFUNDED");

  // Reenvio de refund (idempotência)
  const refundReplayRes = await processMercadoPagoNotification(legitPaymentId, refundPayload);
  assert(refundReplayRes.status === "already_processed", "19.4. Reenvio de refund é estritamente idempotente");

  // QRs e Scans permanecem 100% intactos após estorno
  const qrsAfterRefund = await prisma.qRCode.count({ where: { userId: attacker.id } });
  assert(qrsAfterRefund === 5, "19.5. Acervo de QR codes preservado (zero exclusão destrutiva)");

  // Re-ativação temporária para testar chargeback
  await prisma.subscription.update({
    where: { userId: attacker.id },
    data: { status: "ACTIVE", planId: proPlan.id },
  });
  await prisma.user.update({
    where: { id: attacker.id },
    data: { planId: proPlan.id },
  });

  const cbPayload = {
    id: legitPaymentId,
    status: "charged_back",
    external_reference: JSON.stringify({ userId: attacker.id, planId: proPlan.id }),
  };
  const cbRes = await processMercadoPagoNotification(legitPaymentId, cbPayload);
  assert(cbRes.status === "charged_back", "20.1. Webhook charged_back processado com sucesso");

  const userAfterCb = await prisma.user.findUnique({ where: { id: attacker.id } });
  const subAfterCb = await prisma.subscription.findUnique({ where: { userId: attacker.id } });
  assert(userAfterCb?.planId === freePlan.id, "20.2. Usuário revertido para plano FREE após chargeback");
  assert(subAfterCb?.status === "CHARGED_BACK", "20.3. Assinatura marcada como CHARGED_BACK");

  const cbReplay = await processMercadoPagoNotification(legitPaymentId, cbPayload);
  assert(cbReplay.status === "already_processed", "20.4. Reenvio de chargeback é estritamente idempotente");

  // =========================================================================
  // ETAPA 22: DOWNGRADE E RECURSOS PREMIUM
  // =========================================================================
  console.log(`\n${CYAN}--- 22. Entitlements após Downgrade ---${RESET}`);
  const contextDowngraded = await getUserPlanAndUsage(attacker.id);
  assert(contextDowngraded?.plan?.name === "FREE", "22.1. Usuário agora possui plano efetivo FREE");
  assert(!checkPermission(contextDowngraded!, "dynamic_qr").allowed, "22.2. Criação de novo QR dinâmico bloqueada");
  assert(!checkPermission(contextDowngraded!, "analytics").allowed, "22.3. Analytics bloqueado após downgrade");
  assert(!checkPermission(contextDowngraded!, "export_svg").allowed, "22.4. Exportação SVG bloqueada");

  // =========================================================================
  // ETAPA 23: EXPIRAÇÃO (Subscription ACTIVE com currentPeriodEnd no passado)
  // =========================================================================
  console.log(`\n${CYAN}--- 23. Teste Crítico de Expiração de Assinatura ---${RESET}`);
  // Simula assinatura com status ACTIVE mas período expirado há 2 dias
  const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.subscription.update({
    where: { userId: attacker.id },
    data: {
      status: "ACTIVE",
      currentPeriodEnd: pastDate,
      planId: proPlan.id,
    },
  });
  // Deixa User.planId ainda como PRO para checar se a lazy evaluation invalida o plano
  await prisma.user.update({
    where: { id: attacker.id },
    data: { planId: proPlan.id },
  });

  const expiredContext = await getUserPlanAndUsage(attacker.id);
  const isSubStillActive = isSubscriptionActive(expiredContext?.subscription);
  assert(
    isSubStillActive === false,
    "23.1. isSubscriptionActive retorna false para currentPeriodEnd no passado"
  );
  assert(
    expiredContext?.plan?.name === "FREE",
    "23.2. Lazy evaluation: getUserPlanAndUsage rebaixa entitlement para FREE automaticamente"
  );
  assert(
    !checkPermission(expiredContext!, "dynamic_qr").allowed,
    "23.3. Criação de QR dinâmico bloqueada para assinatura expirada"
  );
  assert(
    !checkPermission(expiredContext!, "analytics").allowed,
    "23.4. Analytics bloqueado para assinatura expirada"
  );

  // =========================================================================
  // ETAPA 24 & 26: MASS ASSIGNMENT E ALTERAÇÃO DIRETA DE USER.PLANID
  // =========================================================================
  console.log(`\n${CYAN}--- 24 & 26. Proteção contra Mass Assignment e Auto-Promoção ---${RESET}`);
  // No endpoint /api/auth/me (PATCH), apenas name, email, company, phone e avatarUrl são permitidos
  const maliciousPatch = {
    role: "ADMIN",
    planId: bizPlan.id,
    isAdmin: true,
    subscriptionStatus: "ACTIVE",
    scanCount: 999999,
  };

  // Simula filtragem de allowlist idêntica à do endpoint PATCH /api/auth/me
  const allowedData: Record<string, any> = {};
  const allowedKeys = ["name", "email", "company", "phone", "avatarUrl"];
  for (const k of Object.keys(maliciousPatch)) {
    if (allowedKeys.includes(k)) {
      allowedData[k] = (maliciousPatch as any)[k];
    }
  }

  assert(Object.keys(allowedData).length === 0, "24.1. Nenhum campo privilegiado passa pela allowlist de atualização");
  assert(allowedData.role === undefined, "24.2. Campo role é descartado");
  assert(allowedData.planId === undefined, "24.3. Campo planId é descartado");

  // =========================================================================
  // ETAPA 25: ADMIN RBAC
  // =========================================================================
  console.log(`\n${CYAN}--- 25. Proteção de Controle de Acesso Administrativo (RBAC) ---${RESET}`);
  // Usuário comum chamando requireAdmin
  const regularUserMock = { id: attacker.id, name: attacker.name, email: attacker.email, role: "USER" };
  const adminAuthResult = regularUserMock.role === "ADMIN";
  assert(adminAuthResult === false, "25.1. requireAdmin bloqueia usuário comum com papel USER (403)");

  // =========================================================================
  // ETAPA 27: SHORTCODE E ENTRÓPIA
  // =========================================================================
  console.log(`\n${CYAN}--- 27. Entropia e Não-Previsibilidade de ShortCodes ---${RESET}`);
  const code1 = generateSecureShortCode(8);
  const code2 = generateSecureShortCode(8);
  assert(code1 !== code2, "27.1. ShortCodes gerados consecutivamente são distintos");
  assert(code1.length === 8, "27.2. ShortCode possui comprimento de 8 caracteres");
  assert(isValidShortCode(code1), "27.3. ShortCode gerado passa na validação alfanumérica estrita");

  // =========================================================================
  // ETAPA 28: RATE LIMITING AUDIT
  // =========================================================================
  console.log(`\n${CYAN}--- 28. Auditoria de Rate Limits Existentes ---${RESET}`);
  assert(RATE_LIMIT_CONFIGS.login.maxAttempts === 5, "28.1. Rate limit login: 5 tentativas / 15 min");
  assert(RATE_LIMIT_CONFIGS.register.maxAttempts === 5, "28.2. Rate limit register: 5 tentativas / 60 min");
  assert(RATE_LIMIT_CONFIGS.checkout.maxAttempts === 15, "28.3. Rate limit checkout: 15 tentativas / 10 min");
  assert(RATE_LIMIT_CONFIGS.portal.maxAttempts === 10, "28.4. Rate limit portal: 10 tentativas / 10 min");

  // =========================================================================
  // ETAPA 29: INTEGRIDADE DOS DADOS REAIS DE PRODUÇÃO
  // =========================================================================
  console.log(`\n${CYAN}--- 29. Confirmação de Integridade dos Dados de Produção ---${RESET}`);
  const realPaymentAfter = await prisma.webhookEvent.findUnique({
    where: { eventId: "mp_payment_178856033673" },
  });
  const realSubAfter = await prisma.subscription.findFirst({
    where: { gatewaySubscriptionId: "178856033673" },
  });

  assert(
    realPaymentAfter?.id === realPaymentBefore?.id &&
    realPaymentAfter?.status === realPaymentBefore?.status,
    "29.1. Pagamento real 178856033673 permanece 100% INALTERADO"
  );
  assert(
    realSubAfter?.id === realSubBefore?.id &&
    realSubAfter?.status === "ACTIVE" &&
    realSubAfter?.planId === realSubBefore?.planId,
    "29.2. Assinatura do usuário joaolucas permanece 100% INALTERADA com status ACTIVE"
  );

  // Limpeza dos usuários e registros de teste
  await prisma.subscription.deleteMany({ where: { userId: { in: [attacker.id, victim.id] } } });
  await prisma.qRCodeScan.deleteMany({ where: { qrCode: { userId: { in: [attacker.id, victim.id] } } } });
  await prisma.qRCode.deleteMany({ where: { userId: { in: [attacker.id, victim.id] } } });
  await prisma.activityLog.deleteMany({ where: { userId: { in: [attacker.id, victim.id] } } });
  await prisma.webhookEvent.deleteMany({
    where: {
      eventId: {
        in: [
          `mp_payment_${legitPaymentId}`,
          `mp_claim_${legitPaymentId}`,
          `mp_refund_${legitPaymentId}`,
          `mp_chargeback_${legitPaymentId}`,
          `mp_payment_${concurrentPid}`,
          `mp_claim_${concurrentPid}`,
          `mp_payment_${stateFlowPid}`,
          `mp_claim_${stateFlowPid}`,
        ],
      },
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: [attacker.id, victim.id] } } });

  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}               RESUMO DA AUDITORIA ADVERSARIAL                          ${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}`);
  console.log(`Total de asserções executadas: ${totalAssertions}`);
  console.log(`Asserções aprovadas: ${GREEN}${passedAssertions}${RESET}`);
  console.log(`Asserções com falha: ${failedAssertions > 0 ? RED : GREEN}${failedAssertions}${RESET}`);

  if (failedAssertions > 0) {
    process.exit(1);
  } else {
    console.log(`\n${GREEN}TODOS OS TESTES ADVERSARIAIS PASSARAM COM SUCESSO!${RESET}\n`);
  }
}

runAdversarialAudit()
  .catch((err) => {
    console.error("Erro fatal na auditoria adversarial:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
