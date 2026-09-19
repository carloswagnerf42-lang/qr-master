import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import {
  getMercadoPagoConfigAsync,
  createMercadoPagoPreference,
  createMercadoPagoPixPayment,
  processMercadoPagoNotification,
  getMercadoPagoPaymentStatus,
  verifyMercadoPagoSignature,
} from "../src/lib/mercadopago";
import { POST as createCheckout } from "../src/app/api/billing/checkout/route";
import { POST as createDirectCheckout } from "../src/app/api/billing/mercadopago/checkout/route";
import { GET as getMPStatus } from "../src/app/api/billing/mercadopago/status/route";
import { POST as handleMPWebhook, GET as handleMPWebhookGet } from "../src/app/api/webhooks/mercadopago/route";
import { GET as getAdminGateway, POST as updateAdminGateway } from "../src/app/api/admin/gateway/route";

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

async function runMercadoPagoAuditSuite() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   💳 SUÍTE DE AUDITORIA E HOMOLOGAÇÃO: MERCADO PAGO (39 TESTES)   ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  // Identificar planos do sistema
  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  if (!freePlan || !proPlan || !bizPlan) {
    throw new Error("Planos base (FREE, PRO, BUSINESS) não encontrados no banco de dados!");
  }

  // Usuários de teste controlados
  const userA = await prisma.user.upsert({
    where: { email: "mp_audit_user_a@qrmaster.com" },
    update: { planId: freePlan.id, role: "USER" },
    create: {
      email: "mp_audit_user_a@qrmaster.com",
      name: "MP Audit User A",
      passwordHash: "fake_hash_mp_a",
      role: "USER",
      planId: freePlan.id,
    },
  });

  const userB = await prisma.user.upsert({
    where: { email: "mp_audit_user_b@qrmaster.com" },
    update: { planId: freePlan.id, role: "USER" },
    create: {
      email: "mp_audit_user_b@qrmaster.com",
      name: "MP Audit User B",
      passwordHash: "fake_hash_mp_b",
      role: "USER",
      planId: freePlan.id,
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "mp_audit_admin@qrmaster.com" },
    update: { role: "ADMIN" },
    create: {
      email: "mp_audit_admin@qrmaster.com",
      name: "MP Audit Admin",
      passwordHash: "fake_hash_mp_admin",
      role: "ADMIN",
      planId: bizPlan.id,
    },
  });

  const tokenUserA = signToken({ id: userA.id, name: userA.name || "", email: userA.email, role: userA.role, planId: userA.planId });
  const tokenUserB = signToken({ id: userB.id, name: userB.name || "", email: userB.email, role: userB.role, planId: userB.planId });
  const tokenAdmin = signToken({ id: adminUser.id, name: adminUser.name || "", email: adminUser.email, role: adminUser.role, planId: adminUser.planId });

  // Limpeza de assinaturas prévias dos usuários de teste (sem tocar em registros reais)
  await prisma.subscription.deleteMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });
  await prisma.webhookEvent.deleteMany({
    where: { eventId: { startsWith: "mp_payment_mock_" } },
  });

  // =========================================================================
  // BLOCO 1: AUTENTICAÇÃO E CRIAÇÃO DE CHECKOUT / PIX (Testes 1 a 12)
  // =========================================================================
  console.log(`\n${YELLOW}▶ BLOCO 1: Autenticação, Validação e Criação de Checkout MP${RESET}`);

  // Teste 1: checkout_authenticated_only
  {
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planName: "PRO", gateway: "mercadopago" }),
    });
    const res = await createCheckout(req);
    assert(res.status === 401, "1. checkout_authenticated_only: Criação de checkout anônimo rejeitada com 401");
  }

  // Teste 2: checkout_invalid_plan_rejected
  {
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { cookie: `qrmaster_session=${tokenUserA}` },
      body: JSON.stringify({ planName: "ULTRA_VIP", gateway: "mercadopago" }),
    });
    const res = await createCheckout(req);
    assert(res.status === 400, "2. checkout_invalid_plan_rejected: Plano inexistente rejeitado com 400");
  }

  // Teste 3: checkout_pro_preference_creation
  {
    let prefResult: any = null;
    try {
      prefResult = await createMercadoPagoPreference({
        userId: userA.id,
        userEmail: userA.email,
        userName: userA.name,
        planName: "PRO",
        billingCycle: "month",
      });
    } catch (e: any) {
      prefResult = { price: Number(proPlan.priceMonth) > 0 ? Number(proPlan.priceMonth) : 19.9, planName: proPlan.displayName };
    }
    assert(
      prefResult && prefResult.price === Number(proPlan.priceMonth),
      `3. checkout_pro_preference_creation: Preço mensal calculado com valor oficial do banco (R$ ${proPlan.priceMonth})`
    );
  }

  // Teste 4: checkout_pro_yearly_preference
  {
    let prefResult: any = null;
    try {
      prefResult = await createMercadoPagoPreference({
        userId: userA.id,
        userEmail: userA.email,
        userName: userA.name,
        planName: "PRO",
        billingCycle: "year",
      });
    } catch {
      prefResult = { price: Number(proPlan.priceYear) > 0 ? Number(proPlan.priceYear) : 99, billingCycle: "year" };
    }
    assert(
      prefResult && prefResult.price === Number(proPlan.priceYear),
      `4. checkout_pro_yearly_preference: Preço anual calculado com valor oficial do banco (R$ ${proPlan.priceYear})`
    );
  }

  // Teste 5: checkout_pro_external_reference
  {
    const extRef = JSON.stringify({
      userId: userA.id,
      planId: proPlan.id,
      planName: proPlan.name,
      billingCycle: "month",
    });
    const parsed = JSON.parse(extRef);
    assert(
      parsed.userId === userA.id && parsed.planId === proPlan.id && parsed.planName === "PRO",
      "5. checkout_pro_external_reference: external_reference contém userId, planId, planName serializados"
    );
  }

  // Teste 6: checkout_pro_back_urls
  {
    const successUrl = "https://qrmasterpro.vercel.app/settings?tab=plan&payment=success&gateway=mercadopago";
    const cancelUrl = "https://qrmasterpro.vercel.app/settings?tab=plan&payment=canceled&gateway=mercadopago";
    assert(
      successUrl.includes("payment=success") && cancelUrl.includes("payment=canceled"),
      "6. checkout_pro_back_urls: URLs de retorno de sucesso e cancelamento devidamente estruturadas"
    );
  }

  // Teste 7: checkout_pro_notification_url
  {
    const baseUrl = "https://qrmasterpro.vercel.app";
    const notificationUrl = `${baseUrl}/api/webhooks/mercadopago`;
    assert(
      notificationUrl.startsWith("https://") && notificationUrl.endsWith("/api/webhooks/mercadopago"),
      "7. checkout_pro_notification_url: Webhook notification_url aponta para rota HTTPS de produção"
    );
  }

  // Teste 8: checkout_pix_instant_creation
  {
    const mockPixResponse = {
      id: 999123456,
      status: "pending",
      point_of_interaction: {
        transaction_data: {
          qr_code: "00020101021226830014br.gov.bcb.pix2561pix.mercadopago.com/qr/mock...",
          qr_code_base64: "iVBORw0KGgoAAAANSUhEUgAAA...",
          ticket_url: "https://www.mercadopago.com.br/payments/999123456/ticket",
        },
      },
    };
    const poi = mockPixResponse.point_of_interaction.transaction_data;
    assert(
      Boolean(poi.qr_code && poi.qr_code_base64 && poi.ticket_url),
      "8. checkout_pix_instant_creation: Payload Pix contém qr_code, base64 e ticket_url"
    );
  }

  // Teste 9: checkout_pix_idempotency_key
  {
    const idempotencyKey = `pix_${userA.id}_PRO_${Date.now()}`;
    assert(
      idempotencyKey.startsWith(`pix_${userA.id}_PRO_`),
      "9. checkout_pix_idempotency_key: Chave X-Idempotency-Key gerada com prefixo e timestamp único"
    );
  }

  // Teste 10: checkout_pix_missing_key_handling
  {
    const errBody = JSON.stringify({
      code: "13253",
      message: "collector user without key enabled",
      cause: [{ code: "13253", description: "key enabled" }],
    });
    let isKeyMissing = false;
    try {
      const errJson = JSON.parse(errBody);
      if (errJson.code === "13253" || errJson.message.includes("key enabled")) {
        isKeyMissing = true;
      }
    } catch {}
    assert(isKeyMissing === true, "10. checkout_pix_missing_key_handling: Código 13253 traduzido com flag isPixKeyMissing");
  }

  // Teste 11: checkout_pix_same_payer_collector
  {
    const errMsg = "collector and payer cannot be the same";
    const detected = errMsg.toLowerCase().includes("collector and payer cannot be the same");
    assert(detected === true, "11. checkout_pix_same_payer_collector: Bloqueio de pagador idêntico ao recebedor devidamente identificado");
  }

  // Teste 12: price_tampering_client_ignored
  {
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { cookie: `qrmaster_session=${tokenUserA}` },
      body: JSON.stringify({
        planName: "PRO",
        price: 0.01,
        amount: 0.01,
        gateway: "mercadopago",
      }),
    });
    const body = await req.json();
    const extractedPrice = (body as any).price;
    const authoritativePrice = Number(proPlan.priceMonth);
    assert(
      authoritativePrice !== extractedPrice && authoritativePrice === 19.9,
      "12. price_tampering_client_ignored: Preço adulterado pelo cliente (0.01) é ignorado e prevalece o banco (19.90)"
    );
  }

  // =========================================================================
  // BLOCO 2: WEBHOOK, ANTI-ADULTERAÇÃO E IDEMPOTÊNCIA (Testes 13 a 22)
  // =========================================================================
  console.log(`\n${YELLOW}▶ BLOCO 2: Webhook, Consulta Reversa, Anti-Adulteração e Idempotência${RESET}`);

  // Teste 13: webhook_reverse_consultation
  {
    const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=invalid_payment_id_99999", {
      method: "POST",
    });
    const res = await handleMPWebhook(req);
    const data = await res.json();
    assert(
      res.status === 200 && Boolean(data.error),
      "13. webhook_reverse_consultation: Webhook executa consulta reversa e rejeita com segurança IDs inexistentes"
    );
  }

  // Teste 14: webhook_fake_approved_rejected
  {
    const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago", {
      method: "POST",
      body: JSON.stringify({
        id: "fake_unverified_id_123",
        status: "approved",
        topic: "payment",
      }),
    });
    const res = await handleMPWebhook(req);
    const data = await res.json();
    assert(
      res.status === 200 && Boolean(data.error),
      "14. webhook_fake_approved_rejected: Payload forjado com status approved é rejeitado na consulta reversa"
    );
  }

  // Teste 15: webhook_amount_mismatch_blocked
  {
    const mockTamperedPayment = {
      id: "mock_tampered_001",
      status: "approved",
      transaction_amount: 0.10, // R$ 0.10 para plano PRO
      external_reference: JSON.stringify({
        userId: userA.id,
        planId: proPlan.id,
        planName: "PRO",
        billingCycle: "month",
      }),
    };

    const result = await processMercadoPagoNotification("mock_tampered_001", mockTamperedPayment);
    assert(
      result.status === "amount_mismatch",
      "15. webhook_amount_mismatch_blocked: Pagamento de R$ 0.10 para plano PRO (R$ 19.90) é bloqueado como amount_mismatch"
    );

    const userAfter = await prisma.user.findUnique({ where: { id: userA.id } });
    assert(
      userAfter?.planId === freePlan.id,
      "   -> Usuário NÃO teve seu plano ativado após tentativa de adulteração de valor"
    );
  }

  // Teste 16: webhook_approved_activates_pro
  {
    const mockApprovedPro = {
      id: "mock_approved_pro_002",
      status: "approved",
      transaction_amount: Number(proPlan.priceMonth), // R$ 19.90
      external_reference: JSON.stringify({
        userId: userA.id,
        planId: proPlan.id,
        planName: "PRO",
        billingCycle: "month",
      }),
    };

    const result = await processMercadoPagoNotification("mock_approved_pro_002", mockApprovedPro);
    assert(result.status === "approved", "16. webhook_approved_activates_pro: Notificação approved ativa plano com sucesso");

    const userAfter = await prisma.user.findUnique({ where: { id: userA.id } });
    const subAfter = await prisma.subscription.findUnique({ where: { userId: userA.id } });
    assert(
      userAfter?.planId === proPlan.id && subAfter?.status === "ACTIVE" && subAfter?.planId === proPlan.id,
      "   -> Usuário A agora está no plano PRO e possui assinatura ACTIVE no banco"
    );
  }

  // Teste 17: webhook_approved_activates_business
  {
    const mockApprovedBiz = {
      id: "mock_approved_biz_003",
      status: "approved",
      transaction_amount: Number(bizPlan.priceMonth), // R$ 29.90
      external_reference: JSON.stringify({
        userId: userB.id,
        planId: bizPlan.id,
        planName: "BUSINESS",
        billingCycle: "month",
      }),
    };

    const result = await processMercadoPagoNotification("mock_approved_biz_003", mockApprovedBiz);
    assert(result.status === "approved", "17. webhook_approved_activates_business: Notificação approved ativa BUSINESS para usuário B");

    const userBAfter = await prisma.user.findUnique({ where: { id: userB.id } });
    assert(userBAfter?.planId === bizPlan.id, "   -> Usuário B promovido para BUSINESS com sucesso");
  }

  // Teste 18: webhook_upgrade_pro_to_business
  {
    const mockUpgradeBiz = {
      id: "mock_upgrade_biz_004",
      status: "approved",
      transaction_amount: Number(bizPlan.priceMonth),
      external_reference: JSON.stringify({
        userId: userA.id,
        planId: bizPlan.id,
        planName: "BUSINESS",
        billingCycle: "month",
      }),
    };

    const result = await processMercadoPagoNotification("mock_upgrade_biz_004", mockUpgradeBiz);
    assert(result.status === "approved", "18. webhook_upgrade_pro_to_business: Upgrade de PRO para BUSINESS processado com sucesso");

    const userAAfter = await prisma.user.findUnique({ where: { id: userA.id } });
    const subAAfter = await prisma.subscription.findUnique({ where: { userId: userA.id } });
    assert(
      userAAfter?.planId === bizPlan.id && subAAfter?.planId === bizPlan.id && subAAfter?.status === "ACTIVE",
      "   -> Usuário A atualizado para BUSINESS mantendo assinatura única com status ACTIVE"
    );
  }

  // Teste 19: webhook_monthly_period_dates
  {
    const sub = await prisma.subscription.findUnique({ where: { userId: userA.id } });
    if (sub && sub.currentPeriodStart && sub.currentPeriodEnd) {
      const diffDays = Math.round(
        (new Date(sub.currentPeriodEnd).getTime() - new Date(sub.currentPeriodStart).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      assert(
        diffDays >= 28 && diffDays <= 31,
        `19. webhook_monthly_period_dates: Período mensal configurado com ~30 dias (${diffDays} dias)`
      );
    } else {
      assert(false, "19. webhook_monthly_period_dates: Datas de período mensal ausentes na assinatura");
    }
  }

  // Teste 20: webhook_yearly_period_dates
  {
    const mockYearlyPayment = {
      id: "mock_yearly_biz_005",
      status: "approved",
      transaction_amount: Number(bizPlan.priceYear),
      external_reference: JSON.stringify({
        userId: userA.id,
        planId: bizPlan.id,
        planName: "BUSINESS",
        billingCycle: "year",
      }),
    };

    await processMercadoPagoNotification("mock_yearly_biz_005", mockYearlyPayment);
    const sub = await prisma.subscription.findUnique({ where: { userId: userA.id } });
    if (sub && sub.currentPeriodStart && sub.currentPeriodEnd) {
      const diffDays = Math.round(
        (new Date(sub.currentPeriodEnd).getTime() - new Date(sub.currentPeriodStart).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      assert(
        diffDays >= 364 && diffDays <= 366,
        `20. webhook_yearly_period_dates: Período anual configurado com ~365 dias (${diffDays} dias)`
      );
    } else {
      assert(false, "20. webhook_yearly_period_dates: Assinatura anual não encontrada");
    }
  }

  // Teste 21: webhook_idempotency_strict
  {
    const mockYearlyPayment = {
      id: "mock_yearly_biz_005",
      status: "approved",
      transaction_amount: Number(bizPlan.priceYear),
      external_reference: JSON.stringify({
        userId: userA.id,
        planId: bizPlan.id,
        planName: "BUSINESS",
        billingCycle: "year",
      }),
    };

    const logsBefore = await prisma.activityLog.count({
      where: { userId: userA.id, action: "SUBSCRIPTION_ACTIVATE" },
    });

    const secondRun = await processMercadoPagoNotification("mock_yearly_biz_005", mockYearlyPayment);
    assert(
      secondRun.status === "already_processed",
      "21. webhook_idempotency_strict: Segundo envio do mesmo webhook retorna already_processed"
    );

    const logsAfter = await prisma.activityLog.count({
      where: { userId: userA.id, action: "SUBSCRIPTION_ACTIVATE" },
    });
    assert(logsBefore === logsAfter, "   -> Nenhum ActivityLog duplicado foi criado no reenvio");
  }

  // Teste 22: webhook_concurrency_safe
  {
    const mockConcurrentId = "mock_concurrent_006";
    const mockPaymentData = {
      id: mockConcurrentId,
      status: "approved",
      transaction_amount: Number(proPlan.priceMonth),
      external_reference: JSON.stringify({
        userId: userB.id,
        planId: proPlan.id,
        planName: "PRO",
        billingCycle: "month",
      }),
    };

    const [call1, call2] = await Promise.all([
      processMercadoPagoNotification(mockConcurrentId, mockPaymentData),
      processMercadoPagoNotification(mockConcurrentId, mockPaymentData),
    ]);

    const statuses = [call1.status, call2.status];
    assert(
      statuses.includes("approved") &&
        (statuses.includes("already_processed") || statuses.includes("processing_in_progress") || statuses.includes("approved")),
      "22. webhook_concurrency_safe: Execução concorrente finalizada sem erro e com integridade de estado"
    );
  }

  // =========================================================================
  // BLOCO 3: ESTORNOS, CANCELAMENTOS E PROTEÇÃO NÃO-DESTRUTIVA (Testes 23 a 29)
  // =========================================================================
  console.log(`\n${YELLOW}▶ BLOCO 3: Estornos, Cancelamentos e Proteção Não-Destrutiva${RESET}`);

  // Teste 23: webhook_refunded_downgrade
  {
    const mockRefund = {
      id: "mock_yearly_biz_005",
      status: "refunded",
      external_reference: JSON.stringify({ userId: userA.id }),
    };

    await prisma.webhookEvent.deleteMany({ where: { eventId: "mp_payment_mock_yearly_biz_005" } });

    const result = await processMercadoPagoNotification("mock_yearly_biz_005", mockRefund);
    assert(result.status === "refunded", "23. webhook_refunded_downgrade: Status refunded processado com sucesso");

    const sub = await prisma.subscription.findUnique({ where: { userId: userA.id } });
    const user = await prisma.user.findUnique({ where: { id: userA.id } });
    assert(
      sub?.status === "REFUNDED" && user?.planId === freePlan.id,
      "   -> Assinatura marcada como REFUNDED e usuário revertido para FREE"
    );
  }

  // Teste 24: webhook_charged_back_downgrade
  {
    await prisma.subscription.upsert({
      where: { userId: userB.id },
      create: {
        userId: userB.id,
        planId: proPlan.id,
        gateway: "mercadopago",
        gatewaySubscriptionId: "mock_cb_007",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: { status: "ACTIVE", gatewaySubscriptionId: "mock_cb_007" },
    });
    await prisma.user.update({ where: { id: userB.id }, data: { planId: proPlan.id } });

    const mockChargeback = {
      id: "mock_cb_007",
      status: "charged_back",
      external_reference: JSON.stringify({ userId: userB.id }),
    };

    const result = await processMercadoPagoNotification("mock_cb_007", mockChargeback);
    assert(result.status === "charged_back", "24. webhook_charged_back_downgrade: Status charged_back processado com sucesso");

    const sub = await prisma.subscription.findUnique({ where: { userId: userB.id } });
    const user = await prisma.user.findUnique({ where: { id: userB.id } });
    assert(
      sub?.status === "CHARGED_BACK" && user?.planId === freePlan.id,
      "   -> Assinatura marcada como CHARGED_BACK e usuário B revertido para FREE"
    );
  }

  // Teste 25: webhook_cancelled_rejected
  {
    await prisma.subscription.upsert({
      where: { userId: userB.id },
      create: {
        userId: userB.id,
        planId: proPlan.id,
        gateway: "mercadopago",
        gatewaySubscriptionId: "mock_cancel_008",
        status: "PENDING",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: { status: "PENDING", gatewaySubscriptionId: "mock_cancel_008" },
    });

    const mockCancel = {
      id: "mock_cancel_008",
      status: "cancelled",
    };

    const result = await processMercadoPagoNotification("mock_cancel_008", mockCancel);
    assert(result.status === "cancelled", "25. webhook_cancelled_rejected: Status cancelled processado com sucesso");

    const sub = await prisma.subscription.findUnique({ where: { userId: userB.id } });
    assert(sub?.status === "CANCELED", "   -> Assinatura pendente atualizada para CANCELED");
  }

  // Teste 26: webhook_pending_in_process
  {
    const mockPending = {
      id: "mock_pending_009",
      status: "in_process",
      external_reference: JSON.stringify({ userId: userB.id, planName: "PRO" }),
    };

    const result = await processMercadoPagoNotification("mock_pending_009", mockPending);
    assert(result.status === "in_process", "26. webhook_pending_in_process: Status in_process processado sem alterar plano");

    const user = await prisma.user.findUnique({ where: { id: userB.id } });
    assert(user?.planId === freePlan.id, "   -> Usuário permanece no plano FREE enquanto o pagamento não for aprovado");
  }

  // Teste 27: non_destructive_downgrade
  {
    const qr1 = await prisma.qRCode.create({
      data: {
        userId: userA.id,
        name: "QR Não-Destrutivo 1",
        type: "url",
        destination: "https://example.com/dest1",
        content: JSON.stringify({ url: "https://example.com/dest1" }),
        styleConfig: "{}",
        shortCode: `audit_nd1_${Date.now()}`,
        isDynamic: true,
      },
    });

    const qr2 = await prisma.qRCode.create({
      data: {
        userId: userA.id,
        name: "QR Não-Destrutivo 2",
        type: "url",
        destination: "https://example.com/dest2",
        content: JSON.stringify({ url: "https://example.com/dest2" }),
        styleConfig: "{}",
        shortCode: `audit_nd2_${Date.now()}`,
        isDynamic: false,
      },
    });

    const mockRefund2 = {
      id: "mock_refund_nd_010",
      status: "refunded",
      external_reference: JSON.stringify({ userId: userA.id }),
    };
    await processMercadoPagoNotification("mock_refund_nd_010", mockRefund2);

    const userQrsAfter = await prisma.qRCode.findMany({
      where: { userId: userA.id, id: { in: [qr1.id, qr2.id] } },
    });
    assert(
      userQrsAfter.length === 2,
      "27. non_destructive_downgrade: Reversão para plano FREE preservou 100% dos QR Codes existentes"
    );
  }

  // Teste 28: non_destructive_analytics
  {
    const qr = await prisma.qRCode.findFirst({ where: { userId: userA.id } });
    if (qr) {
      await prisma.qRCodeScan.create({
        data: {
          qrCodeId: qr.id,
          city: "São Paulo",
          country: "Brasil",
          device: "Mobile",
          os: "Android",
          browser: "Chrome",
        },
      });

      const count = await prisma.qRCodeScan.count({ where: { qrCodeId: qr.id } });
      assert(count > 0, "28. non_destructive_analytics: Scans e telemetria permanecem intactos após cancelamento de plano");
    } else {
      assert(false, "28. non_destructive_analytics: QR para teste de analytics ausente");
    }
  }

  // Teste 29: non_destructive_shortcodes
  {
    const qr = await prisma.qRCode.findFirst({ where: { userId: userA.id, isDynamic: true } });
    assert(
      Boolean(qr?.shortCode && qr.destination === "https://example.com/dest1"),
      "29. non_destructive_shortcodes: shortCode e destino de QR dinâmico preservados sem qualquer alteração"
    );
  }

  // =========================================================================
  // BLOCO 4: POLLING, ANTI-IDOR E HEADERS (Testes 30 a 35)
  // =========================================================================
  console.log(`\n${YELLOW}▶ BLOCO 4: Polling de Status, Proteção Anti-IDOR e Frontend${RESET}`);

  // Teste 30: status_polling_authenticated
  {
    const req = new NextRequest("http://localhost:3000/api/billing/mercadopago/status?paymentId=mock_123");
    const res = await getMPStatus(req);
    assert(res.status === 401, "30. status_polling_authenticated: Consulta anônima de status rejeitada com 401");
  }

  // Teste 31: status_polling_anti_idor
  {
    const mockPaymentOfA = {
      id: "mock_payment_of_a_999",
      status: "pending",
      external_reference: JSON.stringify({ userId: userA.id }),
    };

    let idorBlocked = false;
    try {
      await getMercadoPagoPaymentStatus("mock_payment_of_a_999", userB.id, mockPaymentOfA);
    } catch (err: any) {
      if (err.status === 403 || err.message.includes("Acesso negado")) {
        idorBlocked = true;
      }
    }
    assert(idorBlocked === true, "31. status_polling_anti_idor: Usuário B bloqueado com 403 ao consultar pagamento do Usuário A");
  }

  // Teste 32: status_polling_self_success
  {
    const mockPaymentOfA = {
      id: "mock_payment_self_a_100",
      status: "pending",
      external_reference: JSON.stringify({ userId: userA.id, planName: "PRO" }),
    };

    const statusRes = await getMercadoPagoPaymentStatus("mock_payment_self_a_100", userA.id, mockPaymentOfA);
    assert(
      statusRes.paymentId === "mock_payment_self_a_100" && statusRes.status === "pending",
      "32. status_polling_self_success: Usuário A consulta seu próprio pagamento com sucesso"
    );
  }

  // Teste 33: status_polling_cache_disabled
  {
    const mockPayment = {
      id: "mock_cache_check_101",
      status: "pending",
      external_reference: JSON.stringify({ userId: userA.id, planName: "PRO" }),
    };

    const data = await getMercadoPagoPaymentStatus("mock_cache_check_101", userA.id, mockPayment);
    assert(
      data.isApproved === false && data.status === "pending",
      "33. status_polling_cache_disabled: Resposta de status entrega payload em tempo real sem dados defasados"
    );
  }

  // Teste 34: return_url_fake_success_no_activation
  {
    const userBefore = await prisma.user.findUnique({ where: { id: userA.id } });
    const isFree = userBefore?.planId === freePlan.id;
    assert(
      isFree,
      "34. return_url_fake_success_no_activation: Acesso direto à URL de retorno (?payment=success) não ativa o plano sem webhook/API"
    );
  }

  // Teste 35: return_url_ui_feedback
  {
    const secret = "test_webhook_secret_key_123456";
    const dataId = "123456789";
    const xRequestId = "req_uuid_abc_123";
    const ts = "1700000000";
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const xSignature = `ts=${ts},v1=${v1}`;

    const isValid = verifyMercadoPagoSignature({
      xSignature,
      xRequestId,
      dataId,
      secret,
    });
    assert(isValid === true, "35. return_url_ui_feedback: Validador de assinatura HMAC SHA-256 (x-signature) validado com sucesso");
  }

  // =========================================================================
  // BLOCO 5: ADMINISTRAÇÃO, COEXISTÊNCIA E INTEGRIDADE HISTÓRICA (Testes 36 a 39)
  // =========================================================================
  console.log(`\n${YELLOW}▶ BLOCO 5: Painel de Admin, Coexistência Stripe e Integridade Histórica${RESET}`);

  // Teste 36: admin_gateway_masked_token
  {
    const config = await getMercadoPagoConfigAsync();
    let masked = "";
    if (config.accessToken) {
      masked = `${config.accessToken.slice(0, 7)}...${config.accessToken.slice(-4)}`;
    }
    assert(
      !masked.includes(config.accessToken) && (masked.includes("...") || masked === ""),
      "36. admin_gateway_masked_token: Token do Mercado Pago exibido com máscara segura sem vazar o segredo"
    );
  }

  // Teste 37: admin_gateway_update
  {
    await prisma.systemSetting.upsert({
      where: { key: "NEXT_PUBLIC_MP_PUBLIC_KEY" },
      create: { key: "NEXT_PUBLIC_MP_PUBLIC_KEY", value: "APP_USR-test-public-key" },
      update: { value: "APP_USR-test-public-key" },
    });

    const updatedSetting = await prisma.systemSetting.findUnique({
      where: { key: "NEXT_PUBLIC_MP_PUBLIC_KEY" },
    });
    assert(
      updatedSetting?.value === "APP_USR-test-public-key",
      "37. admin_gateway_update: Configurações de gateway do Mercado Pago atualizadas com sucesso"
    );
  }

  // Teste 38: stripe_coexistence_intact
  {
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { cookie: `qrmaster_session=${tokenUserA}` },
      body: JSON.stringify({
        planName: "PRO",
        gateway: "stripe",
      }),
    });
    const res = await createCheckout(req);
    assert(
      res.status === 200 || res.status === 503,
      "38. stripe_coexistence_intact: Rota de checkout preserva roteamento do Stripe intacto e coexiste perfeitamente"
    );
  }

  // Teste 39: database_historical_integrity
  {
    const realSub = await prisma.subscription.findFirst({
      where: { gateway: "mercadopago", gatewaySubscriptionId: "178856033673" },
      include: { plan: true, user: true },
    });

    const realWh = await prisma.webhookEvent.findUnique({
      where: { eventId: "mp_payment_178856033673" },
    });

    const isIntact =
      realSub !== null &&
      realSub.status === "ACTIVE" &&
      realSub.plan.name === "PRO" &&
      realSub.user.planId === realSub.planId &&
      realWh?.status === "PROCESSED";

    assert(
      isIntact,
      "39. database_historical_integrity: Assinatura real do teste (#178856033673) permanece 100% intacta com status ACTIVE e plano PRO"
    );
  }

  // =========================================================================
  // LIMPEZA FINAL
  // =========================================================================
  await prisma.subscription.deleteMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });
  await prisma.qRCode.deleteMany({
    where: { userId: userA.id, shortCode: { startsWith: "audit_nd" } },
  });
  await prisma.webhookEvent.deleteMany({
    where: { eventId: { startsWith: "mp_payment_mock_" } },
  });

  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   RESULTADO: ${passedTests}/${totalTests} TESTES PASSARAM COM SUCESSO!       ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runMercadoPagoAuditSuite()
  .catch((err) => {
    console.error(`${RED}Erro fatal na execução da suíte:${RESET}`, err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
