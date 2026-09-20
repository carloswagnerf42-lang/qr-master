import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import {
  processMercadoPagoNotification,
  getMercadoPagoPaymentStatus,
  verifyMercadoPagoSignature,
} from "../src/lib/mercadopago";
import { POST as handleMPWebhook } from "../src/app/api/webhooks/mercadopago/route";

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

async function runIdempotencyTestSuite() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   🔒 SUÍTE DE IDEMPOTÊNCIA E CONCORRÊNCIA MERCADO PAGO (15 CENÁRIOS)   ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  // Identificar planos
  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  if (!freePlan || !proPlan || !bizPlan) {
    throw new Error("Planos FREE, PRO ou BUSINESS não encontrados no banco.");
  }

  // Usuários de teste isolados
  const user1 = await prisma.user.upsert({
    where: { email: "idemp_test_user_1@qrmaster.com" },
    update: { planId: freePlan.id },
    create: {
      email: "idemp_test_user_1@qrmaster.com",
      name: "Idempotency Test User 1",
      passwordHash: "fake_hash_idemp_1",
      planId: freePlan.id,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: "idemp_test_user_2@qrmaster.com" },
    update: { planId: freePlan.id },
    create: {
      email: "idemp_test_user_2@qrmaster.com",
      name: "Idempotency Test User 2",
      passwordHash: "fake_hash_idemp_2",
      planId: freePlan.id,
    },
  });

  // Limpeza de testes anteriores
  await prisma.subscription.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } },
  });
  await prisma.activityLog.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } },
  });
  await prisma.webhookEvent.deleteMany({
    where: {
      OR: [
        { eventId: { startsWith: "mp_payment_idemp_" } },
        { eventId: { startsWith: "mp_claim_idemp_" } },
        { eventId: { startsWith: "mp_refund_idemp_" } },
        { eventId: { startsWith: "mp_chargeback_idemp_" } },
      ],
    },
  });

  // =========================================================================
  // CENÁRIO 1: payment.created seguido de approved -> ativa 1 vez
  // =========================================================================
  {
    const pid = "idemp_c1_001";
    const createdPayload = {
      id: pid,
      status: "pending",
      transaction_amount: Number(proPlan.priceMonth),
      external_reference: JSON.stringify({ userId: user1.id, planId: proPlan.id, planName: "PRO", billingCycle: "month" }),
    };
    const approvedPayload = {
      ...createdPayload,
      status: "approved",
    };

    const resCreated = await processMercadoPagoNotification(pid, createdPayload);
    assert(resCreated.status === "pending", "Cenário 1.1: payment.created (pending) não altera plano do usuário");

    const uAfterCreated = await prisma.user.findUnique({ where: { id: user1.id } });
    assert(uAfterCreated?.planId === freePlan.id, "   -> Usuário permanece no FREE após pending");

    const resApproved = await processMercadoPagoNotification(pid, approvedPayload);
    assert(resApproved.status === "approved", "Cenário 1.2: approved subsequente ativa plano PRO com sucesso");

    const uAfterApproved = await prisma.user.findUnique({ where: { id: user1.id } });
    const subAfterApproved = await prisma.subscription.findUnique({ where: { userId: user1.id } });
    assert(
      uAfterApproved?.planId === proPlan.id && subAfterApproved?.status === "ACTIVE",
      "   -> Usuário agora está no plano PRO e assinatura ativa"
    );

    const logCount = await prisma.activityLog.count({
      where: { userId: user1.id, action: "SUBSCRIPTION_ACTIVATE", entityId: pid },
    });
    assert(logCount === 1, "   -> Exatamente 1 ActivityLog gerado para a ativação");
  }

  // =========================================================================
  // CENÁRIO 2: payment.created repetido -> não ativa novamente
  // =========================================================================
  {
    const pid = "idemp_c2_002";
    const pendingPayload = {
      id: pid,
      status: "pending",
      transaction_amount: Number(proPlan.priceMonth),
      external_reference: JSON.stringify({ userId: user2.id, planId: proPlan.id, planName: "PRO" }),
    };

    await processMercadoPagoNotification(pid, pendingPayload);
    const resRepeat = await processMercadoPagoNotification(pid, pendingPayload);
    assert(resRepeat.status === "pending", "Cenário 2: payment.created repetido retorna pending sem ativação");

    const u2 = await prisma.user.findUnique({ where: { id: user2.id } });
    assert(u2?.planId === freePlan.id, "   -> Usuário permanece no plano FREE");
  }

  // =========================================================================
  // CENÁRIO 3: payment.created seguido de payment.updated (approved) -> ativa 1 vez
  // =========================================================================
  {
    const pid = "idemp_c3_003";
    const pendingPayload = {
      id: pid,
      status: "in_process",
      transaction_amount: Number(bizPlan.priceMonth),
      external_reference: JSON.stringify({ userId: user2.id, planId: bizPlan.id, planName: "BUSINESS", billingCycle: "month" }),
    };
    const updatedApprovedPayload = {
      ...pendingPayload,
      status: "approved",
    };

    await processMercadoPagoNotification(pid, pendingPayload);
    const resApproved = await processMercadoPagoNotification(pid, updatedApprovedPayload);
    assert(resApproved.status === "approved", "Cenário 3: payment.updated (approved) ativa BUSINESS");

    const u2 = await prisma.user.findUnique({ where: { id: user2.id } });
    const sub2 = await prisma.subscription.findUnique({ where: { userId: user2.id } });
    assert(u2?.planId === bizPlan.id && sub2?.status === "ACTIVE", "   -> Usuário 2 promovido para BUSINESS");
  }

  // =========================================================================
  // CENÁRIO 4: payment.updated repetido -> não ativa novamente
  // =========================================================================
  {
    const pid = "idemp_c3_003"; // Reutiliza o mesmo payment aprovado no Cenário 3
    const updatedApprovedPayload = {
      id: pid,
      status: "approved",
      transaction_amount: Number(bizPlan.priceMonth),
      external_reference: JSON.stringify({ userId: user2.id, planId: bizPlan.id, planName: "BUSINESS", billingCycle: "month" }),
    };

    const logsBefore = await prisma.activityLog.count({
      where: { userId: user2.id, action: "SUBSCRIPTION_ACTIVATE", entityId: pid },
    });

    const resRepeat = await processMercadoPagoNotification(pid, updatedApprovedPayload);
    assert(resRepeat.status === "already_processed", "Cenário 4: payment.updated repetido retorna already_processed");

    const logsAfter = await prisma.activityLog.count({
      where: { userId: user2.id, action: "SUBSCRIPTION_ACTIVATE", entityId: pid },
    });
    assert(logsBefore === logsAfter && logsAfter === 1, "   -> Nenhum novo ActivityLog gerado no reenvio");
  }

  // =========================================================================
  // CENÁRIO 5: Requisições concorrentes simultâneas (Promise.all) -> exatamente 1 ativação, 1 ActivityLog
  // =========================================================================
  {
    const pid = "idemp_c5_concurrent";
    // Reseta user1 para FREE
    await prisma.user.update({ where: { id: user1.id }, data: { planId: freePlan.id } });
    await prisma.subscription.deleteMany({ where: { userId: user1.id } });

    const concurrentPayload = {
      id: pid,
      status: "approved",
      transaction_amount: Number(proPlan.priceMonth),
      external_reference: JSON.stringify({ userId: user1.id, planId: proPlan.id, planName: "PRO", billingCycle: "month" }),
    };

    // Dispara 5 requisições em paralelo exato simulando webhook + polling em corrida
    const results = await Promise.all([
      processMercadoPagoNotification(pid, concurrentPayload),
      processMercadoPagoNotification(pid, concurrentPayload),
      processMercadoPagoNotification(pid, concurrentPayload),
      processMercadoPagoNotification(pid, concurrentPayload),
      processMercadoPagoNotification(pid, concurrentPayload),
    ]);

    const approvedCount = results.filter((r) => r.status === "approved").length;
    const alreadyProcessedCount = results.filter((r) => r.status === "already_processed").length;

    assert(
      approvedCount === 1,
      `Cenário 5.1: Exatamente 1 das 5 requisições concorrentes obteve status 'approved' (obtido: ${approvedCount})`
    );
    assert(
      alreadyProcessedCount === 4,
      `Cenário 5.2: As outras 4 requisições concorrentes foram bloqueadas como 'already_processed' (obtido: ${alreadyProcessedCount})`
    );

    const totalLogs = await prisma.activityLog.count({
      where: { userId: user1.id, action: "SUBSCRIPTION_ACTIVATE", entityId: pid },
    });
    assert(totalLogs === 1, `Cenário 5.3: Exatamente 1 ActivityLog foi persistido no banco (obtido: ${totalLogs})`);

    const totalClaims = await prisma.webhookEvent.count({
      where: { eventId: `mp_claim_${pid}` },
    });
    assert(totalClaims === 1, "   -> Exatamente 1 claim de ativação no WebhookEvent (chave única respeitada)");
  }

  // =========================================================================
  // CENÁRIO 6: pending -> approved -> ativa apenas quando approved
  // =========================================================================
  {
    const pid = "idemp_c6_p_to_a";
    await prisma.user.update({ where: { id: user1.id }, data: { planId: freePlan.id } });

    const pendingPayload = {
      id: pid,
      status: "pending",
      transaction_amount: Number(proPlan.priceMonth),
      external_reference: JSON.stringify({ userId: user1.id, planName: "PRO" }),
    };
    const approvedPayload = { ...pendingPayload, status: "approved" };

    await processMercadoPagoNotification(pid, pendingPayload);
    let u = await prisma.user.findUnique({ where: { id: user1.id } });
    assert(u?.planId === freePlan.id, "Cenário 6.1: Durante estado pending, usuário permanece FREE");

    await processMercadoPagoNotification(pid, approvedPayload);
    u = await prisma.user.findUnique({ where: { id: user1.id } });
    assert(u?.planId === proPlan.id, "Cenário 6.2: Transição para approved ativa o plano PRO");
  }

  // =========================================================================
  // CENÁRIO 7: approved -> approved (reenvio) -> nenhuma renovação duplicada ou alteração no período de vigência
  // =========================================================================
  {
    const pid = "idemp_c7_no_double_period";
    const approvedPayload = {
      id: pid,
      status: "approved",
      transaction_amount: Number(proPlan.priceMonth),
      external_reference: JSON.stringify({ userId: user1.id, planId: proPlan.id, planName: "PRO", billingCycle: "month" }),
    };

    await processMercadoPagoNotification(pid, approvedPayload);
    const sub1 = await prisma.subscription.findUnique({ where: { userId: user1.id } });
    const periodEnd1 = sub1?.currentPeriodEnd?.toISOString();

    // Reenvio do mesmo evento
    const resSecond = await processMercadoPagoNotification(pid, approvedPayload);
    assert(resSecond.status === "already_processed", "Cenário 7.1: Reenvio de approved retorna already_processed");

    const sub2 = await prisma.subscription.findUnique({ where: { userId: user1.id } });
    const periodEnd2 = sub2?.currentPeriodEnd?.toISOString();

    assert(
      periodEnd1 === periodEnd2,
      "Cenário 7.2: currentPeriodEnd permanece rigorosamente idêntico (sem adição indevida de dias)"
    );
  }

  // =========================================================================
  // CENÁRIO 8: approved -> refunded -> processa estorno 1 vez; reenvio é idempotente
  // =========================================================================
  {
    const pid = "idemp_c8_refund";
    const approvedPayload = {
      id: pid,
      status: "approved",
      transaction_amount: Number(proPlan.priceMonth),
      external_reference: JSON.stringify({ userId: user1.id, planId: proPlan.id, planName: "PRO", billingCycle: "month" }),
    };
    const refundPayload = {
      id: pid,
      status: "refunded",
      external_reference: JSON.stringify({ userId: user1.id }),
    };

    await processMercadoPagoNotification(pid, approvedPayload);
    const resRefund1 = await processMercadoPagoNotification(pid, refundPayload);
    assert(resRefund1.status === "refunded", "Cenário 8.1: Primeiro webhook de refunded reverte plano para FREE");

    const uAfterRef = await prisma.user.findUnique({ where: { id: user1.id } });
    const subAfterRef = await prisma.subscription.findUnique({ where: { userId: user1.id } });
    assert(
      uAfterRef?.planId === freePlan.id && subAfterRef?.status === "REFUNDED",
      "   -> Usuário FREE e assinatura marcada como REFUNDED"
    );

    const refLogs1 = await prisma.activityLog.count({
      where: { userId: user1.id, action: "SUBSCRIPTION_REFUND", entityId: pid },
    });
    assert(refLogs1 === 1, "   -> Exatamente 1 ActivityLog de estorno gerado");

    // Reenvio do estorno
    const resRefund2 = await processMercadoPagoNotification(pid, refundPayload);
    assert(resRefund2.status === "already_processed", "Cenário 8.2: Reenvio de refunded retorna already_processed de forma idempotente");

    const refLogs2 = await prisma.activityLog.count({
      where: { userId: user1.id, action: "SUBSCRIPTION_REFUND", entityId: pid },
    });
    assert(refLogs1 === refLogs2, "   -> Nenhum ActivityLog duplicado de estorno gerado no reenvio");
  }

  // =========================================================================
  // CENÁRIO 9: approved -> chargeback -> processa chargeback 1 vez; reenvio é idempotente
  // =========================================================================
  {
    const pid = "idemp_c9_chargeback";
    const approvedPayload = {
      id: pid,
      status: "approved",
      transaction_amount: Number(bizPlan.priceMonth),
      external_reference: JSON.stringify({ userId: user2.id, planId: bizPlan.id, planName: "BUSINESS", billingCycle: "month" }),
    };
    const chargebackPayload = {
      id: pid,
      status: "charged_back",
      external_reference: JSON.stringify({ userId: user2.id }),
    };

    await processMercadoPagoNotification(pid, approvedPayload);
    const resCb1 = await processMercadoPagoNotification(pid, chargebackPayload);
    assert(resCb1.status === "charged_back", "Cenário 9.1: Primeiro webhook de charged_back processado com sucesso");

    const uAfterCb = await prisma.user.findUnique({ where: { id: user2.id } });
    const subAfterCb = await prisma.subscription.findUnique({ where: { userId: user2.id } });
    assert(
      uAfterCb?.planId === freePlan.id && subAfterCb?.status === "CHARGED_BACK",
      "   -> Usuário 2 revertido para FREE e assinatura marcada como CHARGED_BACK"
    );

    // Reenvio do chargeback
    const resCb2 = await processMercadoPagoNotification(pid, chargebackPayload);
    assert(resCb2.status === "already_processed", "Cenário 9.2: Reenvio de charged_back retorna already_processed");
  }

  // =========================================================================
  // CENÁRIO 10: Pagamento com ID falso / inexistente -> não concede plano e rejeita com segurança
  // =========================================================================
  {
    const fakeId = "999999999_fake_nonexistent";
    const resFake = await processMercadoPagoNotification(fakeId);
    assert(
      resFake.status === "not_found",
      "Cenário 10: Consulta reversa de ID inexistente na API do Mercado Pago retorna not_found seguro sem ativar plano"
    );
  }

  // =========================================================================
  // CENÁRIO 11: Pagamento com external_reference adulterado (userId de outro usuário) -> bloqueado no polling
  // =========================================================================
  {
    const pid = "idemp_c11_tampered_ref";
    const paymentBelongingToUser1 = {
      id: pid,
      status: "pending",
      external_reference: JSON.stringify({ userId: user1.id, planName: "PRO" }),
    };

    let idorCaught = false;
    try {
      // Usuário 2 tenta consultar o status do pagamento do Usuário 1
      await getMercadoPagoPaymentStatus(pid, user2.id, paymentBelongingToUser1);
    } catch (err: any) {
      if (err.status === 403 || err.message.includes("Acesso negado")) {
        idorCaught = true;
      }
    }
    assert(idorCaught === true, "Cenário 11: Tentativa de cruzar userId no external_reference é bloqueada com 403");
  }

  // =========================================================================
  // CENÁRIO 12: Pagamento com adulteração de valor (menor que o oficial) -> rejeitado com amount_mismatch
  // =========================================================================
  {
    const pid = "idemp_c12_amount_tampering";
    await prisma.user.update({ where: { id: user1.id }, data: { planId: freePlan.id } });

    const tamperedPayload = {
      id: pid,
      status: "approved",
      transaction_amount: 0.50, // Preço oficial PRO é R$ 19,90
      external_reference: JSON.stringify({ userId: user1.id, planId: proPlan.id, planName: "PRO", billingCycle: "month" }),
    };

    const resTampered = await processMercadoPagoNotification(pid, tamperedPayload);
    assert(
      resTampered.status === "amount_mismatch",
      "Cenário 12.1: Pagamento com valor fraudado (R$ 0,50 vs R$ 19,90) rejeitado como amount_mismatch"
    );

    const uAfterTampered = await prisma.user.findUnique({ where: { id: user1.id } });
    assert(
      uAfterTampered?.planId === freePlan.id,
      "Cenário 12.2: Plano do usuário permanece FREE (anti-tampering preservado)"
    );
  }

  // =========================================================================
  // CENÁRIO 13: Assinatura de webhook inválida -> 401 rejeitado
  // =========================================================================
  {
    const origSecret = process.env.MP_WEBHOOK_SECRET;
    try {
      process.env.MP_WEBHOOK_SECRET = "test_webhook_secret_key_123456";

      const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=123456", {
        method: "POST",
        headers: {
          "x-signature": "ts=1700000000,v1=invalid_fake_hmac_hash_000000000000000000000000000000000000",
          "x-request-id": "fake_req_123",
        },
        body: JSON.stringify({ action: "payment.updated", data: { id: "123456" } }),
      });

      const res = await handleMPWebhook(req);
      assert(res.status === 401, "Cenário 13.1: Webhook com assinatura HMAC SHA-256 forjada é sumariamente rejeitado com 401");

      const isValid = verifyMercadoPagoSignature({
        xSignature: "ts=1700000000,v1=invalid_fake_hmac_hash_000000000000000000000000000000000000",
        xRequestId: "fake_req_123",
        dataId: "123456",
        secret: "test_webhook_secret_key_123456",
      });
      assert(isValid === false, "Cenário 13.2: verifyMercadoPagoSignature retorna false para assinatura adulterada");
    } finally {
      process.env.MP_WEBHOOK_SECRET = origSecret;
    }
  }

  // =========================================================================
  // CENÁRIO 14: Polling com ID válido mas pertencente a outro usuário -> 403 rejeitado
  // =========================================================================
  {
    const pid = "idemp_c14_polling_idor";
    const paymentData = {
      id: pid,
      status: "approved",
      external_reference: JSON.stringify({ userId: user1.id, planName: "PRO" }),
    };

    let blocked = false;
    try {
      await getMercadoPagoPaymentStatus(pid, user2.id, paymentData);
    } catch (err: any) {
      if (err.status === 403 || err.message.includes("Acesso negado")) {
        blocked = true;
      }
    }
    assert(blocked === true, "Cenário 14: Polling do Usuário 2 tentando inspecionar pagamento do Usuário 1 retorna 403");
  }

  // =========================================================================
  // CENÁRIO 15: Erro durante a transação (rollback atômico) -> nenhuma alteração parcial persiste
  // =========================================================================
  {
    const pid = "idemp_c15_rollback_test";
    await prisma.user.update({ where: { id: user1.id }, data: { planId: freePlan.id } });
    await prisma.subscription.deleteMany({ where: { userId: user1.id } });

    // Simulamos um erro forçado passando um external_reference com userId inexistente para violar FK ou erro
    const invalidFkPayload = {
      id: pid,
      status: "approved",
      transaction_amount: Number(proPlan.priceMonth),
      external_reference: JSON.stringify({
        userId: "non_existent_cuid_user_xyz",
        planId: proPlan.id,
        planName: "PRO",
      }),
    };

    let rollbackErrorCaught = false;
    try {
      await processMercadoPagoNotification(pid, invalidFkPayload);
    } catch {
      rollbackErrorCaught = true;
    }

    assert(rollbackErrorCaught === true, "Cenário 15.1: Erro em chave estrangeira / transação é capturado");

    // Verifica que o claim foi revertido pelo rollback atômico do PostgreSQL
    const claimAfterRollback = await prisma.webhookEvent.findUnique({
      where: { eventId: `mp_claim_${pid}` },
    });
    assert(
      claimAfterRollback === null,
      "Cenário 15.2: Rollback atômico removeu o claim da transação (nenhum registro órfão)"
    );

    const logAfterRollback = await prisma.activityLog.findFirst({
      where: { entityId: pid },
    });
    assert(
      logAfterRollback === null,
      "Cenário 15.3: Nenhum ActivityLog foi gravado na transação abortada"
    );
  }

  // =========================================================================
  // LIMPEZA FINAL
  // =========================================================================
  await prisma.subscription.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } },
  });
  await prisma.activityLog.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } },
  });
  await prisma.webhookEvent.deleteMany({
    where: {
      OR: [
        { eventId: { startsWith: "mp_payment_idemp_" } },
        { eventId: { startsWith: "mp_claim_idemp_" } },
        { eventId: { startsWith: "mp_refund_idemp_" } },
        { eventId: { startsWith: "mp_chargeback_idemp_" } },
      ],
    },
  });

  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   RESULTADO: ${passedTests}/${totalTests} ASSERÇÕES PASSARAM COM SUCESSO!       ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runIdempotencyTestSuite()
  .catch((err) => {
    console.error(`${RED}Erro fatal na suíte de idempotência:${RESET}`, err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
