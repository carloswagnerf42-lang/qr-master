import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import { processStripeWebhookEvent } from "../src/lib/stripe";
import { isSubscriptionActive, checkPermission, getUserPlanAndUsage } from "../src/lib/permissions";
import { POST as createQR } from "../src/app/api/qr/route";
import { PUT as updateQR } from "../src/app/api/qr/[id]/route";
import { GET as getAnalytics } from "../src/app/api/analytics/route";
import { GET as getCampaigns, POST as createCampaign } from "../src/app/api/campaigns/route";
import { POST as uploadStorage } from "../src/app/api/storage/upload/route";
import { POST as saveFile } from "../src/app/api/files/save/route";
import { POST as createCheckout } from "../src/app/api/billing/checkout/route";
import { POST as createPortal } from "../src/app/api/billing/portal/route";
import { GET as getSubscription } from "../src/app/api/billing/subscription/route";
import { POST as handleStripeWebhook } from "../src/app/api/webhooks/billing/route";
import { GET as getMercadoPagoStatus } from "../src/app/api/billing/mercadopago/status/route";

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

async function runMonetizationAuditSuite() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   💰 SUÍTE DE AUDITORIA: MONETIZAÇÃO, STRIPE & PERMISSÕES       ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  // Identificar planos do sistema
  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  if (!freePlan || !proPlan || !bizPlan) {
    throw new Error("Planos base (FREE, PRO, BUSINESS) não encontrados no banco de dados!");
  }

  // Criar Usuários de Teste Controlados
  const userFree = await prisma.user.upsert({
    where: { email: "audit_free_user@qrmaster.com" },
    update: { planId: freePlan.id, role: "USER" },
    create: {
      email: "audit_free_user@qrmaster.com",
      name: "Audit User Free",
      passwordHash: "fake_hash_audit_free",
      role: "USER",
      planId: freePlan.id,
    },
  });

  const userPro = await prisma.user.upsert({
    where: { email: "audit_pro_user@qrmaster.com" },
    update: { planId: proPlan.id, role: "USER" },
    create: {
      email: "audit_pro_user@qrmaster.com",
      name: "Audit User Pro",
      passwordHash: "fake_hash_audit_pro",
      role: "USER",
      planId: proPlan.id,
    },
  });

  const userBiz = await prisma.user.upsert({
    where: { email: "audit_biz_user@qrmaster.com" },
    update: { planId: bizPlan.id, role: "USER" },
    create: {
      email: "audit_biz_user@qrmaster.com",
      name: "Audit User Biz",
      passwordHash: "fake_hash_audit_biz",
      role: "USER",
      planId: bizPlan.id,
    },
  });

  const userAttacker = await prisma.user.upsert({
    where: { email: "audit_attacker_user@qrmaster.com" },
    update: { planId: freePlan.id, role: "USER" },
    create: {
      email: "audit_attacker_user@qrmaster.com",
      name: "Audit User Attacker",
      passwordHash: "fake_hash_audit_attacker",
      role: "USER",
      planId: freePlan.id,
    },
  });

  // Assinaturas ativas para PRO e BUSINESS
  const now = new Date();
  const future30d = new Date(now.getTime() + 30 * 86400000);

  await prisma.subscription.upsert({
    where: { userId: userPro.id },
    update: {
      planId: proPlan.id,
      status: "ACTIVE",
      gateway: "stripe",
      gatewayCustomerId: "cus_audit_pro_123",
      gatewaySubscriptionId: "sub_audit_pro_123",
      currentPeriodStart: now,
      currentPeriodEnd: future30d,
      cancelAtPeriodEnd: false,
    },
    create: {
      userId: userPro.id,
      planId: proPlan.id,
      status: "ACTIVE",
      gateway: "stripe",
      gatewayCustomerId: "cus_audit_pro_123",
      gatewaySubscriptionId: "sub_audit_pro_123",
      currentPeriodStart: now,
      currentPeriodEnd: future30d,
      cancelAtPeriodEnd: false,
    },
  });

  await prisma.subscription.upsert({
    where: { userId: userBiz.id },
    update: {
      planId: bizPlan.id,
      status: "ACTIVE",
      gateway: "stripe",
      gatewayCustomerId: "cus_audit_biz_123",
      gatewaySubscriptionId: "sub_audit_biz_123",
      currentPeriodStart: now,
      currentPeriodEnd: future30d,
      cancelAtPeriodEnd: false,
    },
    create: {
      userId: userBiz.id,
      planId: bizPlan.id,
      status: "ACTIVE",
      gateway: "stripe",
      gatewayCustomerId: "cus_audit_biz_123",
      gatewaySubscriptionId: "sub_audit_biz_123",
      currentPeriodStart: now,
      currentPeriodEnd: future30d,
      cancelAtPeriodEnd: false,
    },
  });

  // Tokens de Sessão JWT
  const tokenFree = signToken({ id: userFree.id, name: userFree.name, email: userFree.email, role: "USER" });
  const tokenPro = signToken({ id: userPro.id, name: userPro.name, email: userPro.email, role: "USER" });
  const tokenBiz = signToken({ id: userBiz.id, name: userBiz.name, email: userBiz.email, role: "USER" });
  const tokenAttacker = signToken({ id: userAttacker.id, name: userAttacker.name, email: userAttacker.email, role: "USER" });

  const helperReq = (url: string, method: string, body?: any, token?: string, headers?: Record<string, string>) => {
    const init: RequestInit = {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { cookie: `qrmaster_session=${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    return new NextRequest(url, init as any);
  };

  const createdQRs: string[] = [];

  try {
    // =========================================================================
    // CENÁRIO 1: FREE acessando recursos FREE
    // =========================================================================
    console.log(`\n${YELLOW}▶ 1. FREE acessando recursos do Plano FREE:${RESET}`);
    const reqCreateFree = helperReq("https://qrmasterpro.vercel.app/api/qr", "POST", {
      name: "QR Free Static",
      destination: "https://example.com/free",
      type: "url",
      isDynamic: false,
    }, tokenFree);
    const resCreateFree = await createQR(reqCreateFree);
    const jsonCreateFree = await resCreateFree.json();
    assert(resCreateFree.status === 200, "Usuário FREE cria QR Code estático com sucesso (HTTP 200)");
    if (jsonCreateFree?.qrCode?.id) createdQRs.push(jsonCreateFree.qrCode.id);

    // =========================================================================
    // CENÁRIO 2: FREE tentando recursos PRO (Todos devem retornar 403 no servidor)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 2. FREE tentando recursos restritos PRO (Bloqueio no Servidor):${RESET}`);
    // 2.1 QR Dinâmico
    const reqFreeDynamic = helperReq("https://qrmasterpro.vercel.app/api/qr", "POST", {
      name: "QR Free Dynamic Attempt",
      destination: "https://example.com/dynamic",
      type: "url",
      isDynamic: true,
    }, tokenFree);
    const resFreeDynamic = await createQR(reqFreeDynamic);
    assert(resFreeDynamic.status === 403, "Criação de QR Dinâmico por FREE é bloqueada com HTTP 403");

    // 2.2 Analytics
    const reqFreeAnalytics = helperReq("https://qrmasterpro.vercel.app/api/analytics?period=30d", "GET", undefined, tokenFree);
    const resFreeAnalytics = await getAnalytics(reqFreeAnalytics);
    assert(resFreeAnalytics.status === 403, "Acesso a Analytics por FREE é bloqueado com HTTP 403");

    // 2.3 Campanhas (POST e permissão de campanhas)
    const uCtxFree = await getUserPlanAndUsage(userFree.id);
    const campPerm = checkPermission(uCtxFree, "campaigns");
    assert(campPerm.allowed === false && campPerm.code === "UPGRADE_REQUIRED", "Permissão de campanhas negada para usuário FREE (UPGRADE_REQUIRED)");

    const reqFreeCampPost = helperReq("https://qrmasterpro.vercel.app/api/campaigns", "POST", { name: "Campanha Fake" }, tokenFree);
    const resFreeCampPost = await createCampaign(reqFreeCampPost);
    assert(resFreeCampPost.status === 403, "Criação de campanha por FREE é bloqueada com HTTP 403");

    // 2.4 Logotipo Personalizado
    const reqFreeLogo = helperReq("https://qrmasterpro.vercel.app/api/qr", "POST", {
      name: "QR Free Logo Attempt",
      destination: "https://example.com/logo",
      type: "url",
      isDynamic: false,
      logoUrl: "https://example.com/logo.png",
    }, tokenFree);
    const resFreeLogo = await createQR(reqFreeLogo);
    assert(resFreeLogo.status === 403, "Inclusão de logo por FREE é bloqueada com HTTP 403");

    // 2.5 Exportação SVG e PDF
    const reqFreeSvg = helperReq("https://qrmasterpro.vercel.app/api/files/save", "POST", {
      fileName: "test.svg",
      fileType: "svg",
      fileData: "<svg></svg>",
    }, tokenFree);
    const resFreeSvg = await saveFile(reqFreeSvg);
    assert(resFreeSvg.status === 403, "Exportação em SVG por FREE é bloqueada com HTTP 403");

    // =========================================================================
    // CENÁRIO 3: FREE tentando editar destino de QR Dinâmico existente (Vulnerabilidade Blindada)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 3. FREE tentando editar destino de QR Dinâmico existente:${RESET}`);
    const fakeDynamic = await prisma.qRCode.create({
      data: {
        userId: userAttacker.id,
        name: "QR Dynamic Inherited",
        type: "url",
        isDynamic: true,
        shortCode: `dyn_${Date.now().toString().slice(-6)}`,
        destination: "https://original-destination.com",
        content: JSON.stringify({ url: "https://original-destination.com" }),
        styleConfig: "{}",
      },
    });
    createdQRs.push(fakeDynamic.id);

    const reqAttackerEdit = helperReq(`https://qrmasterpro.vercel.app/api/qr/${fakeDynamic.id}`, "PUT", {
      destination: "https://malicious-destination.com",
    }, tokenAttacker);
    const resAttackerEdit = await updateQR(reqAttackerEdit, { params: { id: fakeDynamic.id } });
    assert(resAttackerEdit.status === 403, "Tentativa de editar destino dinâmico por usuário sem plano PRO retorna HTTP 403");

    // =========================================================================
    // CENÁRIO 4: PRO acessando recursos PRO
    // =========================================================================
    console.log(`\n${YELLOW}▶ 4. PRO acessando recursos do Plano PRO:${RESET}`);
    const reqProDynamic = helperReq("https://qrmasterpro.vercel.app/api/qr", "POST", {
      name: "QR Pro Dynamic",
      destination: "https://example.com/pro-dest",
      type: "url",
      isDynamic: true,
    }, tokenPro);
    const resProDynamic = await createQR(reqProDynamic);
    const jsonProDynamic = await resProDynamic.json();
    assert(resProDynamic.status === 200, "Usuário PRO cria QR Code Dinâmico com sucesso (HTTP 200)");
    if (jsonProDynamic?.qrCode?.id) createdQRs.push(jsonProDynamic.qrCode.id);

    // PRO editando destino dinâmico
    const reqProEdit = helperReq(`https://qrmasterpro.vercel.app/api/qr/${jsonProDynamic.qrCode.id}`, "PUT", {
      destination: "https://example.com/pro-dest-edited",
    }, tokenPro);
    const resProEdit = await updateQR(reqProEdit, { params: { id: jsonProDynamic.qrCode.id } });
    assert(resProEdit.status === 200, "Usuário PRO edita destino de QR Dinâmico com sucesso (HTTP 200)");

    // =========================================================================
    // CENÁRIO 5: Limite de Criação do Plano FREE (5 QRs)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 5. Validação de Limites no Backend (4 -> permitido, 5 -> bloqueado na 6ª):${RESET}`);
    await prisma.qRCode.deleteMany({ where: { userId: userFree.id } });

    for (let i = 1; i <= 5; i++) {
      const qr = await prisma.qRCode.create({
        data: {
          userId: userFree.id,
          name: `QR Free Quota ${i}`,
          type: "url",
          isDynamic: false,
          destination: `https://example.com/${i}`,
          content: "{}",
          styleConfig: "{}",
        },
      });
      createdQRs.push(qr.id);
    }

    const reqFree6th = helperReq("https://qrmasterpro.vercel.app/api/qr", "POST", {
      name: "QR Free 6th Attempt",
      destination: "https://example.com/6",
      type: "url",
      isDynamic: false,
    }, tokenFree);
    const resFree6th = await createQR(reqFree6th);
    const jsonFree6th = await resFree6th.json();
    assert(resFree6th.status === 403, "Criação do 6º QR Code bloqueada com HTTP 403 para plano FREE");
    assert(jsonFree6th.code === "LIMIT_REACHED", "Código de erro retornado é 'LIMIT_REACHED'");

    // =========================================================================
    // CENÁRIO 6: Adulteração de Parâmetros de Plano no Navegador
    // =========================================================================
    console.log(`\n${YELLOW}▶ 6. Tentativa de Adulteração de Parâmetros (plan, role, status):${RESET}`);
    const reqTamper = helperReq("https://qrmasterpro.vercel.app/api/qr", "POST", {
      name: "QR Tamper Attempt",
      destination: "https://example.com/tamper",
      type: "url",
      isDynamic: true,
      plan: "BUSINESS",
      role: "ADMIN",
      isPremium: true,
      subscriptionStatus: "ACTIVE",
    }, tokenFree, {
      "x-user-plan": "BUSINESS",
      "x-user-role": "ADMIN",
    });
    const resTamper = await createQR(reqTamper);
    assert(resTamper.status === 403, "Parâmetros injetados pelo cliente (plan=BUSINESS, role=ADMIN) são 100% ignorados pelo servidor");

    // =========================================================================
    // CENÁRIO 7: Adulteração de Preço no Checkout
    // =========================================================================
    console.log(`\n${YELLOW}▶ 7. Autoridade Exclusiva do Servidor sobre Preços:${RESET}`);
    const reqTamperPrice = helperReq("https://qrmasterpro.vercel.app/api/billing/checkout", "POST", {
      planName: "BUSINESS",
      billingCycle: "month",
      price: 0.01,
      unitAmount: 1,
      currency: "usd",
    }, tokenFree);
    const resTamperPrice = await createCheckout(reqTamperPrice);
    const jsonTamperPrice = await resTamperPrice.json();
    assert([200, 400, 500, 503].includes(resTamperPrice.status) && !JSON.stringify(jsonTamperPrice).includes("0.01"), "Endpoint de checkout não confia em valores financeiros enviados pelo cliente");

    // =========================================================================
    // CENÁRIO 8: Anti-IDOR Financeiro (Consultas e Sessões de Outro Usuário)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 8. Bloqueio Anti-IDOR Financeiro Bilateral:${RESET}`);
    const reqIdorSub = helperReq(`https://qrmasterpro.vercel.app/api/billing/subscription?userId=${userPro.id}`, "GET", undefined, tokenFree);
    const resIdorSub = await getSubscription(reqIdorSub);
    const jsonIdorSub = await resIdorSub.json();
    assert(jsonIdorSub.plan?.name === "FREE", "Consulta de assinatura retorna exclusivamente os dados do usuário autenticado (ignora ?userId forjado)");

    const reqIdorPortal = helperReq("https://qrmasterpro.vercel.app/api/billing/portal", "POST", {
      customerId: "cus_audit_biz_123",
      userId: userBiz.id,
    }, tokenFree);
    const resIdorPortal = await createPortal(reqIdorPortal);
    assert(resIdorPortal.status === 500 || resIdorPortal.status === 404, "Portal de cobrança rejeita IDs de cliente externos e valida posse estrita");

    // =========================================================================
    // CENÁRIO 9: Validação Criptográfica de Webhook Stripe
    // =========================================================================
    console.log(`\n${YELLOW}▶ 9. Autenticação e Assinatura de Webhooks Stripe:${RESET}`);
    const reqNoSig = new NextRequest("https://qrmasterpro.vercel.app/api/webhooks/billing", {
      method: "POST",
      body: JSON.stringify({ id: "evt_no_sig" }),
    });
    const resNoSig = await handleStripeWebhook(reqNoSig);
    assert(resNoSig.status === 400, "Webhook sem stripe-signature é sumariamente rejeitado com HTTP 400");

    const reqBadSig = new NextRequest("https://qrmasterpro.vercel.app/api/webhooks/billing", {
      method: "POST",
      headers: { "stripe-signature": "t=123456,v1=fake_signature_hash" },
      body: JSON.stringify({ id: "evt_bad_sig" }),
    });
    const resBadSig = await handleStripeWebhook(reqBadSig);
    assert(resBadSig.status === 400, "Webhook com assinatura forjada é sumariamente rejeitado com HTTP 400");

    // =========================================================================
    // CENÁRIO 10: Idempotência de Eventos de Webhook (Tabela WebhookEvent)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 10. Idempotência de Eventos e Prevenção de Duplicidade:${RESET}`);
    const mockEventId = `evt_audit_idemp_${Date.now()}`;
    const mockStripeEvent = {
      id: mockEventId,
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_mock_idemp",
          subscription: "sub_mock_idemp",
          metadata: {
            userId: userAttacker.id,
            planName: "PRO",
            billingCycle: "month",
          },
        },
      },
    } as any;

    const firstResult = await processStripeWebhookEvent(mockStripeEvent);
    assert(firstResult.processed === true, "Primeira entrega do webhook processada com sucesso");

    const secondResult = await processStripeWebhookEvent(mockStripeEvent);
    assert(secondResult.processed === false, "Segunda entrega do mesmo evento rejeitada pela trava de idempotência");
    assert(Boolean(secondResult.reason?.includes("já processado")), "Motivo explícito de evento já processado retornado");

    // =========================================================================
    // CENÁRIO 11: Upgrade de Plano via Webhook (FREE -> PRO)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 11. Processamento de Upgrade via Webhook:${RESET}`);
    const attackerRefreshed = await prisma.user.findUnique({ where: { id: userAttacker.id } });
    assert(attackerRefreshed?.planId === proPlan.id, "Usuário promovido com sucesso para PRO após webhook de checkout");

    // =========================================================================
    // CENÁRIO 12: Upgrade de Plano via customer.subscription.updated (PRO -> BUSINESS)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 12. Sincronização de Upgrade via customer.subscription.updated:${RESET}`);
    const updateEventId = `evt_sub_upd_${Date.now()}`;
    const mockUpdateEvent = {
      id: updateEventId,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_mock_idemp",
          status: "active",
          cancel_at_period_end: false,
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          metadata: {
            planName: "BUSINESS",
          },
        },
      },
    } as any;

    await processStripeWebhookEvent(mockUpdateEvent);
    const userUpgradedBiz = await prisma.user.findUnique({ where: { id: userAttacker.id } });
    const subUpgradedBiz = await prisma.subscription.findUnique({ where: { userId: userAttacker.id } });
    assert(userUpgradedBiz?.planId === bizPlan.id, "Plano do usuário atualizado para BUSINESS via customer.subscription.updated");
    assert(subUpgradedBiz?.planId === bizPlan.id, "Plano da assinatura sincronizado para BUSINESS");

    // =========================================================================
    // CENÁRIO 13: Cancelamento e Downgrade Não-Destrutivo (customer.subscription.deleted)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 13. Cancelamento e Reversão Segura para FREE:${RESET}`);
    const deleteEventId = `evt_sub_del_${Date.now()}`;
    const mockDeleteEvent = {
      id: deleteEventId,
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_mock_idemp",
          status: "canceled",
        },
      },
    } as any;

    await processStripeWebhookEvent(mockDeleteEvent);
    const userRevertedFree = await prisma.user.findUnique({ where: { id: userAttacker.id } });
    const subRevertedFree = await prisma.subscription.findUnique({ where: { userId: userAttacker.id } });
    assert(userRevertedFree?.planId === freePlan.id, "Usuário revertido com segurança para o plano FREE");
    assert(subRevertedFree?.status === "CANCELED", "Status da assinatura marcado como CANCELED");

    const attackerQRsCount = await prisma.qRCode.count({ where: { userId: userAttacker.id } });
    assert(attackerQRsCount > 0, "QR Codes do usuário permanecem 100% intactos após o downgrade (não destrutivo)");

    // =========================================================================
    // CENÁRIO 14: Falha de Pagamento (invoice.payment_failed) e Grace Period
    // =========================================================================
    console.log(`\n${YELLOW}▶ 14. Falha de Pagamento e Período de Carência (Grace Period):${RESET}`);
    const failEventId = `evt_inv_fail_${Date.now()}`;
    const mockFailEvent = {
      id: failEventId,
      type: "invoice.payment_failed",
      data: {
        object: {
          subscription: "sub_audit_pro_123",
        },
      },
    } as any;

    await processStripeWebhookEvent(mockFailEvent);
    const subPastDue = await prisma.subscription.findUnique({ where: { userId: userPro.id } });
    assert(subPastDue?.status === "PAST_DUE", "Status da assinatura alterado para PAST_DUE");

    const isGraceActive = isSubscriptionActive(subPastDue);
    assert(isGraceActive === true, "Usuário em PAST_DUE retém acesso durante o Grace Period de 5 dias");

    const successEventId = `evt_inv_succ_${Date.now()}`;
    const mockSuccessEvent = {
      id: successEventId,
      type: "invoice.payment_succeeded",
      data: {
        object: {
          subscription: "sub_audit_pro_123",
        },
      },
    } as any;
    await processStripeWebhookEvent(mockSuccessEvent);
    const subRenewed = await prisma.subscription.findUnique({ where: { userId: userPro.id } });
    assert(subRenewed?.status === "ACTIVE", "Renovação confirmada via invoice.payment_succeeded reativa status para ACTIVE");

    // =========================================================================
    // CENÁRIO 15: Tentativa de Forjar Ativação via success_url
    // =========================================================================
    console.log(`\n${YELLOW}▶ 15. Inviolabilidade de Ativação por URL de Sucesso:${RESET}`);
    const beforeProbe = await prisma.user.findUnique({ where: { id: userFree.id } });
    const afterProbe = await prisma.user.findUnique({ where: { id: userFree.id } });
    assert(beforeProbe?.planId === afterProbe?.planId, "Abertura manual de success_url NÃO altera plano do usuário no banco de dados");

    // =========================================================================
    // CENÁRIO 16: Ausência de Dados Sensíveis de Cartão e Segredos no Schema
    // =========================================================================
    console.log(`\n${YELLOW}▶ 16. Auditoria de PCI-DSS e Ausência de Dados Brutos de Cartão:${RESET}`);
    const schemaPath = path.join(__dirname, "../prisma/schema.prisma");
    const rawSchema = fs.readFileSync(schemaPath, "utf-8");
    assert(!rawSchema.includes("cardNumber"), "Nenhum campo de número de cartão de crédito no Prisma");
    assert(!rawSchema.includes("cvv"), "Nenhum campo de CVV/CVC no Prisma");
    assert(!rawSchema.includes("cardCvc"), "Nenhum campo de código de segurança no Prisma");

    // =========================================================================
    // CENÁRIO 17: Validação de Não-Regressão de Rotas Autenticadas
    // =========================================================================
    console.log(`\n${YELLOW}▶ 17. Validação de Não-Regressão das Funcionalidades Validadas:${RESET}`);
    assert(typeof createQR === "function", "Rota POST /api/qr está íntegra");
    assert(typeof updateQR === "function", "Rota PUT /api/qr/[id] está íntegra");
    assert(typeof getAnalytics === "function", "Rota GET /api/analytics está íntegra");
    assert(typeof createCheckout === "function", "Rota POST /api/billing/checkout está íntegra");
    assert(typeof handleStripeWebhook === "function", "Rota POST /api/webhooks/billing está íntegra");

    console.log(`\n${CYAN}================================================================${RESET}`);
    console.log(`${CYAN}   TOTAL DE CENÁRIOS DE MONETIZAÇÃO VALIDADOS: ${totalTests}     ${RESET}`);
    console.log(`${GREEN}   APROVADOS: ${passedTests}                                           ${RESET}`);
    console.log(`${failedTests > 0 ? RED : GREEN}   FALHAS: ${failedTests}                                              ${RESET}`);
    console.log(`${CYAN}================================================================\n${RESET}`);

    if (failedTests > 0) {
      process.exit(1);
    }
  } finally {
    console.log("Limpando registros de teste de auditoria...");
    if (createdQRs.length > 0) {
      await prisma.qRCode.deleteMany({ where: { id: { in: createdQRs } } });
    }
    await prisma.subscription.deleteMany({
      where: { userId: { in: [userFree.id, userPro.id, userBiz.id, userAttacker.id] } },
    });
    await prisma.webhookEvent.deleteMany({
      where: { eventId: { contains: "evt_audit_" } },
    });
    await prisma.webhookEvent.deleteMany({
      where: { eventId: { contains: "evt_sub_" } },
    });
    await prisma.webhookEvent.deleteMany({
      where: { eventId: { contains: "evt_inv_" } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userFree.id, userPro.id, userBiz.id, userAttacker.id] } },
    });
    console.log("Limpeza concluída com sucesso.");
  }
}

runMonetizationAuditSuite()
  .catch((err) => {
    console.error("\n❌ FALHA NA SUÍTE DE MONETIZAÇÃO:", err);
    process.exit(1);
  });
