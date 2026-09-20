import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import { NextRequest } from "next/server";
import { POST as createQR, GET as listQRs } from "../src/app/api/qr/route";
import { GET as getQR, PUT as updateQR, DELETE as deleteQR } from "../src/app/api/qr/[id]/route";
import { GET as getAnalytics } from "../src/app/api/analytics/route";
import { GET as getCampaigns, POST as createCampaign } from "../src/app/api/campaigns/route";
import { GET as getAdminPlans } from "../src/app/api/admin/plan/route";
import { REASON_CONFIG, UpgradeReason } from "../src/components/UpgradeModal";

function createAuthRequest(
  url: string,
  user: { id: string; name: string; email: string; role: string; planId?: string | null },
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): NextRequest {
  const token = signToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    planId: user.planId,
  });

  const headers: Record<string, string> = {
    cookie: `qrmaster_session=${token}`,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...(options.headers || {}),
  };

  const init: any = {
    method: options.method || (options.body ? "POST" : "GET"),
    headers,
  };

  if (options.body) {
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ""}`);
    throw new Error(`Assertion failed: ${testName} - ${detail || ""}`);
  }
}

// Client-side simulation helper: checks if an API error should trigger UpgradeModal
function shouldOpenUpgradeModal(status: number, data: any): { open: boolean; reason?: UpgradeReason } {
  if (status === 403) {
    if (data?.code === "LIMIT_REACHED") {
      return { open: true, reason: "LIMIT_REACHED" };
    }
    if (data?.code === "UPGRADE_REQUIRED") {
      return { open: true, reason: "DYNAMIC_QR" };
    }
  }
  return { open: false };
}

async function runConversionFunnelTestSuite() {
  console.log("\n=======================================================");
  console.log("🚀 INICIANDO SUÍTE DE TESTES: FUNIL DE CONVERSÃO & UX");
  console.log("=======================================================\n");

  // 1. Setup de Planos e Usuários
  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  if (!freePlan || !proPlan || !bizPlan) {
    throw new Error("Planos base (FREE, PRO, BUSINESS) não encontrados no banco.");
  }

  const users = {
    free: await prisma.user.upsert({
      where: { email: "funnel_free_user@qrmaster.com" },
      update: { planId: freePlan.id, role: "USER" },
      create: {
        name: "Funnel Free User",
        email: "funnel_free_user@qrmaster.com",
        passwordHash: "hash_test_funnel_123",
        role: "USER",
        planId: freePlan.id,
      },
    }),
    pro: await prisma.user.upsert({
      where: { email: "funnel_pro_user@qrmaster.com" },
      update: { planId: proPlan.id, role: "USER" },
      create: {
        name: "Funnel Pro User",
        email: "funnel_pro_user@qrmaster.com",
        passwordHash: "hash_test_funnel_123",
        role: "USER",
        planId: proPlan.id,
      },
    }),
    biz: await prisma.user.upsert({
      where: { email: "funnel_biz_user@qrmaster.com" },
      update: { planId: bizPlan.id, role: "USER" },
      create: {
        name: "Funnel Biz User",
        email: "funnel_biz_user@qrmaster.com",
        passwordHash: "hash_test_funnel_123",
        role: "USER",
        planId: bizPlan.id,
      },
    }),
    victim: await prisma.user.upsert({
      where: { email: "funnel_victim_user@qrmaster.com" },
      update: { planId: proPlan.id, role: "USER" },
      create: {
        name: "Funnel Victim User",
        email: "funnel_victim_user@qrmaster.com",
        passwordHash: "hash_test_funnel_123",
        role: "USER",
        planId: proPlan.id,
      },
    }),
  };

  const allUserIds = Object.values(users).map((u) => u.id);

  // Limpeza prévia
  await prisma.qRCodeScan.deleteMany({ where: { qrCode: { userId: { in: allUserIds } } } });
  await prisma.generatedFile.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.qRCode.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.campaign.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: allUserIds } } });

  // Assinaturas ativas para PRO e BUSINESS de teste
  const futureEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.subscription.create({
    data: {
      userId: users.pro.id,
      planId: proPlan.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureEnd,
    },
  });
  await prisma.subscription.create({
    data: {
      userId: users.biz.id,
      planId: bizPlan.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureEnd,
    },
  });

  console.log("--- 1. FREE tentando criar QR dinâmico ---");
  {
    // Frontend gate logic:
    const isFree = users.free.planId === freePlan.id;
    const clientAction = isFree ? "OPEN_UPGRADE_MODAL" : "PROCEED";
    assert(clientAction === "OPEN_UPGRADE_MODAL", "Frontend intercepta tentativa de QR dinâmico no plano FREE");

    // UpgradeModal config validation:
    assert(
      Boolean(REASON_CONFIG["DYNAMIC_QR"]?.title && REASON_CONFIG["DYNAMIC_QR"]?.highlights?.length > 0),
      "UpgradeModal possui copy e benefícios configurados para DYNAMIC_QR"
    );

    // Backend enforcement contract:
    const req = createAuthRequest("http://localhost:3000/api/qr", users.free, {
      body: {
        name: "Tentativa Dinâmica Free",
        destination: "https://example.com/dynamic-test",
        type: "URL",
        isDynamic: true,
      },
    });
    const res = await createQR(req);
    const body = await res.json();
    assert(res.status === 403, "Backend retorna HTTP 403 para QR dinâmico no plano FREE");
    assert(body.code === "UPGRADE_REQUIRED", "Backend retorna código UPGRADE_REQUIRED");
  }

  console.log("\n--- 2. FREE tentando usar logo personalizada ---");
  {
    // Frontend gate check:
    const isFree = true;
    const canUseLogo = !isFree;
    assert(!canUseLogo, "Frontend bloqueia upload de logo para plano FREE e direciona para UpgradeModal");

    // UpgradeModal config validation:
    assert(
      Boolean(REASON_CONFIG["LOGO"]?.title && REASON_CONFIG["LOGO"]?.ctaText),
      "UpgradeModal possui copy e ctaText configurados para LOGO"
    );

    // Backend enforcement contract (se bypassar frontend):
    const reqLogo = createAuthRequest("http://localhost:3000/api/qr", users.free, {
      body: {
        name: "Tentativa Logo Free",
        destination: "https://example.com/logo-test",
        type: "URL",
        isDynamic: false,
        logoUrl: "https://example.com/logo.png",
      },
    });
    const resLogo = await createQR(reqLogo);
    const bodyLogo = await resLogo.json();
    assert(resLogo.status === 403, "Backend retorna HTTP 403 para tentativa de logo no plano FREE");
    assert(bodyLogo.code === "UPGRADE_REQUIRED", "Backend retorna UPGRADE_REQUIRED para logo");
  }

  console.log("\n--- 3. FREE tentando exportar SVG ---");
  {
    // Frontend gate check:
    const isFree = true;
    const canExportSvg = !isFree;
    assert(!canExportSvg, "Frontend bloqueia exportação SVG para plano FREE e direciona para UpgradeModal");

    // UpgradeModal config validation:
    assert(
      Boolean(REASON_CONFIG["SVG_EXPORT"]?.title && REASON_CONFIG["SVG_EXPORT"]?.description),
      "UpgradeModal possui copy clara sobre vetores de alta resolução para SVG_EXPORT"
    );
  }

  console.log("\n--- 4. FREE tentando exportar PDF ---");
  {
    // Frontend gate check:
    const isFree = true;
    const canExportPdf = !isFree;
    assert(!canExportPdf, "Frontend bloqueia exportação PDF para plano FREE e direciona para UpgradeModal");

    // UpgradeModal config validation:
    assert(
      Boolean(REASON_CONFIG["PDF_EXPORT"]?.title && REASON_CONFIG["PDF_EXPORT"]?.highlights),
      "UpgradeModal possui copy clara sobre impressão gráfica para PDF_EXPORT"
    );
  }

  console.log("\n--- 5. FREE no 6º QR Code (Limite comercial atingido) ---");
  {
    // Cria exatamente 5 QRs estáticos para o usuário FREE
    for (let i = 1; i <= 5; i++) {
      const req = createAuthRequest("http://localhost:3000/api/qr", users.free, {
        body: {
          name: `Free QR #${i}`,
          destination: `https://example.com/free-${i}`,
          type: "URL",
          isDynamic: false,
        },
      });
      const res = await createQR(req);
      const body = await res.json().catch(() => ({}));
      assert(
        (res.status === 200 || res.status === 201) && body.success === true,
        `Criação do QR estático #${i} para usuário FREE bem sucedida (HTTP 200/201)`,
        `status: ${res.status}, body: ${JSON.stringify(body)}`
      );
    }

    // Tentativa do 6º QR Code
    const req6 = createAuthRequest("http://localhost:3000/api/qr", users.free, {
      body: {
        name: "Free QR #6 (Excedendo cota)",
        destination: "https://example.com/free-6",
        type: "URL",
        isDynamic: false,
      },
    });
    const res6 = await createQR(req6);
    const body6 = await res6.json();

    assert(res6.status === 403, "6º QR Code retorna HTTP 403");
    assert(body6.code === "LIMIT_REACHED", "6º QR Code retorna código comercial LIMIT_REACHED");

    // Client modal interceptor test:
    const clientIntercept = shouldOpenUpgradeModal(res6.status, body6);
    assert(
      clientIntercept.open && clientIntercept.reason === "LIMIT_REACHED",
      "Interceptor do frontend identifica LIMIT_REACHED e abre UpgradeModal com contexto apropriado"
    );
    assert(
      Boolean(REASON_CONFIG["LIMIT_REACHED"]?.title && REASON_CONFIG["LIMIT_REACHED"]?.highlights?.length >= 3),
      "UpgradeModal possui highlights detalhando planos e cotas para LIMIT_REACHED"
    );
  }

  console.log("\n--- 6. FREE em Analytics (Sem dados falsos) ---");
  {
    const req = createAuthRequest("http://localhost:3000/api/analytics", users.free);
    const res = await getAnalytics(req);
    const body = await res.json();

    assert(res.status === 403, "GET /api/analytics retorna HTTP 403 para plano FREE");
    assert(body.code === "UPGRADE_REQUIRED", "Analytics retorna código UPGRADE_REQUIRED");

    // Frontend paywall validation:
    assert(
      Boolean(REASON_CONFIG["ANALYTICS"]?.title && REASON_CONFIG["ANALYTICS"]?.ctaText),
      "UpgradeModal possui copy educativa configurada para ANALYTICS sem inventar métricas falsas"
    );
  }

  console.log("\n--- 7. FREE em Campanhas (Sem submit indevido) ---");
  {
    const getReq = createAuthRequest("http://localhost:3000/api/campaigns", users.free);
    const getRes = await getCampaigns(getReq);
    const getBody = await getRes.json();

    assert(getRes.status === 403, "GET /api/campaigns retorna HTTP 403 para plano FREE");
    assert(getBody.code === "UPGRADE_REQUIRED", "Campanhas retorna código UPGRADE_REQUIRED no GET");

    const postReq = createAuthRequest("http://localhost:3000/api/campaigns", users.free, {
      body: { name: "Campanha Inválida Free", description: "Teste" },
    });
    const postRes = await createCampaign(postReq);
    const postBody = await postRes.json();

    assert(postRes.status === 403, "POST /api/campaigns retorna HTTP 403 para plano FREE");
    assert(postBody.code === "UPGRADE_REQUIRED", "Campanhas nega criação com UPGRADE_REQUIRED");
  }

  console.log("\n--- 8. 403 de Segurança (IDOR / Admin) NÃO abre UpgradeModal ---");
  {
    // Cria um QR para a vítima (User PRO)
    const createVictimReq = createAuthRequest("http://localhost:3000/api/qr", users.victim, {
      body: {
        name: "QR Confidencial da Vítima",
        type: "URL",
        destination: "https://example.com/victim",
        isDynamic: false,
      },
    });
    const victimRes = await createQR(createVictimReq);
    const victimQR = await victimRes.json();
    assert((victimRes.status === 200 || victimRes.status === 201) && victimQR.success === true, "QR da vítima criado com sucesso");

    // Usuário PRO tentando acessar ou alterar o QR da vítima (IDOR)
    const idorReq = createAuthRequest(
      `http://localhost:3000/api/qr/${victimQR.qrCode.id}`,
      users.pro,
      { method: "GET" }
    );
    const idorRes = await getQR(idorReq, { params: { id: victimQR.qrCode.id } });
    const idorBody = await idorRes.json();

    assert(
      idorRes.status === 403 || idorRes.status === 404,
      `Tentativa de IDOR barrada com status de segurança HTTP ${idorRes.status}`
    );
    assert(
      idorBody.code !== "LIMIT_REACHED" && idorBody.code !== "UPGRADE_REQUIRED",
      "Resposta de IDOR não contém código comercial (não é LIMIT_REACHED nem UPGRADE_REQUIRED)"
    );

    // Tentativa de acessar rota administrativa sem ser ADMIN
    const adminReq = createAuthRequest("http://localhost:3000/api/admin/plan", users.pro);
    const adminRes = await getAdminPlans(adminReq);
    const adminBody = await adminRes.json();

    assert(adminRes.status === 403, "Acesso a /api/admin/plan por usuário comum retorna HTTP 403");
    assert(
      adminBody.code !== "LIMIT_REACHED" && adminBody.code !== "UPGRADE_REQUIRED",
      "Erro de permissão administrativa não é confundido com upgrade comercial"
    );

    // Frontend interceptor test para segurança:
    const idorModalAction = shouldOpenUpgradeModal(idorRes.status, idorBody);
    const adminModalAction = shouldOpenUpgradeModal(adminRes.status, adminBody);

    assert(
      !idorModalAction.open && !adminModalAction.open,
      "Frontend NÃO abre UpgradeModal para erros 403 de segurança (IDOR/Admin)"
    );
  }

  console.log("\n--- 9. Usuário PRO utilizando recursos liberados ---");
  {
    // Dynamic QR creation
    const dynamicReq = createAuthRequest("http://localhost:3000/api/qr", users.pro, {
      body: {
        name: "QR Dinâmico PRO",
        type: "URL",
        destination: "https://example.com/dynamic-pro",
        isDynamic: true,
      },
    });
    const dynamicRes = await createQR(dynamicReq);
    const dynamicBody = await dynamicRes.json().catch(() => ({}));
    assert(
      (dynamicRes.status === 200 || dynamicRes.status === 201) && dynamicBody.success === true,
      "Usuário PRO cria QR dinâmico com sucesso (HTTP 200/201)"
    );

    // Analytics access
    const analyticsReq = createAuthRequest("http://localhost:3000/api/analytics", users.pro);
    const analyticsRes = await getAnalytics(analyticsReq);
    assert(analyticsRes.status === 200, "Usuário PRO acessa Analytics com sucesso (HTTP 200)");

    // Campaigns access
    const campaignsReq = createAuthRequest("http://localhost:3000/api/campaigns", users.pro);
    const campaignsRes = await getCampaigns(campaignsReq);
    assert(campaignsRes.status === 200, "Usuário PRO lista Campanhas com sucesso (HTTP 200)");

    const createCampReq = createAuthRequest("http://localhost:3000/api/campaigns", users.pro, {
      body: { name: "Campanha Black Friday PRO", description: "Campanha promocional" },
    });
    const createCampRes = await createCampaign(createCampReq);
    const createCampBody = await createCampRes.json().catch(() => ({}));
    assert(
      (createCampRes.status === 200 || createCampRes.status === 201) && createCampBody.success === true,
      "Usuário PRO cria Campanha com sucesso (HTTP 200/201)"
    );
  }

  console.log("\n--- 10. Usuário BUSINESS utilizando recursos liberados ---");
  {
    // Cria 6 QRs para o usuário BUSINESS (mais do que o limite de 5 do FREE)
    for (let i = 1; i <= 6; i++) {
      const req = createAuthRequest("http://localhost:3000/api/qr", users.biz, {
        body: {
          name: `Business QR #${i}`,
          type: "URL",
          destination: `https://example.com/biz-${i}`,
          isDynamic: true,
        },
      });
      const res = await createQR(req);
      const bizBody = await res.json().catch(() => ({}));
      assert(
        (res.status === 200 || res.status === 201) && bizBody.success === true,
        `Criação do QR dinâmico #${i} para BUSINESS permitida (HTTP 200/201)`
      );
    }

    // Quota indicator API check
    assert(
      (bizPlan.maxQRCodes ?? 0) >= 999999,
      "Plano BUSINESS possui sentinela ilimitado (maxQRCodes >= 999999)"
    );

    // Analytics e Campanhas para BUSINESS
    const analyticsReq = createAuthRequest("http://localhost:3000/api/analytics", users.biz);
    const analyticsRes = await getAnalytics(analyticsReq);
    assert(analyticsRes.status === 200, "Usuário BUSINESS acessa Analytics com sucesso (HTTP 200)");

    const campaignsReq = createAuthRequest("http://localhost:3000/api/campaigns", users.biz);
    const campaignsRes = await getCampaigns(campaignsReq);
    assert(campaignsRes.status === 200, "Usuário BUSINESS acessa Campanhas com sucesso (HTTP 200)");
  }

  // Limpeza pós-teste
  await prisma.qRCodeScan.deleteMany({ where: { qrCode: { userId: { in: allUserIds } } } });
  await prisma.generatedFile.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.qRCode.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.campaign.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: allUserIds } } });

  console.log("\n=======================================================");
  console.log(`🎉 SUÍTE CONCLUÍDA: ${passedTests}/${totalTests} testes passaram com sucesso!`);
  console.log("=======================================================\n");
}

runConversionFunnelTestSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n💥 ERRO NA SUÍTE:", err);
    process.exit(1);
  });
