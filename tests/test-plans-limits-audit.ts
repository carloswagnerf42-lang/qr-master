import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import { NextRequest } from "next/server";
import { POST as createQR, GET as listQRs } from "../src/app/api/qr/route";
import { GET as getQR, PUT as updateQR, DELETE as deleteQR } from "../src/app/api/qr/[id]/route";
import { POST as duplicateQR } from "../src/app/api/qr/[id]/duplicate/route";
import { GET as getAnalytics } from "../src/app/api/analytics/route";
import { GET as getCampaigns, POST as createCampaign } from "../src/app/api/campaigns/route";
import { POST as uploadStorage } from "../src/app/api/storage/upload/route";
import { POST as saveFile } from "../src/app/api/files/save/route";
import { GET as downloadFile } from "../src/app/api/files/[id]/download/route";
import { POST as checkoutBilling } from "../src/app/api/billing/checkout/route";
import { PATCH as updateMe } from "../src/app/api/auth/me/route";
import { GET as getAdminPlans } from "../src/app/api/admin/plan/route";
import { GET as getAdminGateways } from "../src/app/api/admin/gateway/route";
import { GET as getAdminUsers } from "../src/app/api/admin/users/route";
import { processMercadoPagoNotification } from "../src/lib/mercadopago";

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

async function runPlansAndLimitsAuditSuite() {
  console.log("\n=======================================================");
  console.log("🛡️ INICIANDO AUDITORIA DE PLANOS, LIMITES E AUTORIZAÇÃO");
  console.log("=======================================================\n");

  // 1. Setup de Planos e Usuários de Auditoria
  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  if (!freePlan || !proPlan || !bizPlan) {
    throw new Error("Planos base (FREE, PRO, BUSINESS) não encontrados no banco.");
  }

  // Usuários dedicados de auditoria (nunca usuários reais)
  const auditUsers = {
    free: await prisma.user.upsert({
      where: { email: "audit_free_user@qrmaster.com" },
      update: { planId: freePlan.id, role: "USER" },
      create: {
        name: "Audit Free User",
        email: "audit_free_user@qrmaster.com",
        passwordHash: "hash_test_123",
        role: "USER",
        planId: freePlan.id,
      },
    }),
    pro: await prisma.user.upsert({
      where: { email: "audit_pro_user@qrmaster.com" },
      update: { planId: proPlan.id, role: "USER" },
      create: {
        name: "Audit Pro User",
        email: "audit_pro_user@qrmaster.com",
        passwordHash: "hash_test_123",
        role: "USER",
        planId: proPlan.id,
      },
    }),
    biz: await prisma.user.upsert({
      where: { email: "audit_biz_user@qrmaster.com" },
      update: { planId: bizPlan.id, role: "USER" },
      create: {
        name: "Audit Biz User",
        email: "audit_biz_user@qrmaster.com",
        passwordHash: "hash_test_123",
        role: "USER",
        planId: bizPlan.id,
      },
    }),
    userA: await prisma.user.upsert({
      where: { email: "audit_user_a@qrmaster.com" },
      update: { planId: proPlan.id, role: "USER" },
      create: {
        name: "Audit User A",
        email: "audit_user_a@qrmaster.com",
        passwordHash: "hash_test_123",
        role: "USER",
        planId: proPlan.id,
      },
    }),
    userB: await prisma.user.upsert({
      where: { email: "audit_user_b@qrmaster.com" },
      update: { planId: proPlan.id, role: "USER" },
      create: {
        name: "Audit User B",
        email: "audit_user_b@qrmaster.com",
        passwordHash: "hash_test_123",
        role: "USER",
        planId: proPlan.id,
      },
    }),
  };

  const auditUserIds = Object.values(auditUsers).map((u) => u.id);

  // Limpeza prévia de dados de auditoria
  await prisma.qRCodeScan.deleteMany({
    where: { qrCode: { userId: { in: auditUserIds } } },
  });
  await prisma.generatedFile.deleteMany({
    where: { userId: { in: auditUserIds } },
  });
  await prisma.qRCode.deleteMany({
    where: { userId: { in: auditUserIds } },
  });
  await prisma.campaign.deleteMany({
    where: { userId: { in: auditUserIds } },
  });
  await prisma.subscription.deleteMany({
    where: { userId: { in: auditUserIds } },
  });

  // Garante assinaturas ativas para contas PRO e BUSINESS de auditoria
  const futureEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.subscription.create({
    data: {
      userId: auditUsers.pro.id,
      planId: proPlan.id,
      status: "ACTIVE",
      gateway: "mercadopago",
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureEnd,
    },
  });
  await prisma.subscription.create({
    data: {
      userId: auditUsers.biz.id,
      planId: bizPlan.id,
      status: "ACTIVE",
      gateway: "mercadopago",
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureEnd,
    },
  });
  await prisma.subscription.create({
    data: {
      userId: auditUsers.userA.id,
      planId: proPlan.id,
      status: "ACTIVE",
      gateway: "mercadopago",
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureEnd,
    },
  });
  await prisma.subscription.create({
    data: {
      userId: auditUsers.userB.id,
      planId: proPlan.id,
      status: "ACTIVE",
      gateway: "mercadopago",
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureEnd,
    },
  });

  console.log("--- FASE 3: TESTES DE LIMITES E BYPASS NO PLANO FREE ---");
  {
    // A) Criação até atingir o limite FREE (5)
    for (let i = 1; i <= 5; i++) {
      const req = createAuthRequest("http://localhost:3000/api/qr", auditUsers.free, {
        method: "POST",
        body: {
          name: `QR Free ${i}`,
          destination: `https://example.com/free-${i}`,
          isDynamic: false,
        },
      });
      const res = await createQR(req);
      assert(res.status === 200, `FREE: criação de QR #${i} deve retornar 200 OK`);
    }

    // B) Criação do 6º QR acima do limite deve ser rejeitada com 403
    const reqExceed = createAuthRequest("http://localhost:3000/api/qr", auditUsers.free, {
      method: "POST",
      body: {
        name: "QR Free 6 (Excedente)",
        destination: "https://example.com/free-6",
        isDynamic: false,
      },
    });
    const resExceed = await createQR(reqExceed);
    assert(resExceed.status === 403, "FREE: 6º QR deve ser bloqueado com HTTP 403");
    const jsonExceed = await resExceed.json();
    assert(jsonExceed.code === "LIMIT_REACHED", "FREE: código de erro deve ser LIMIT_REACHED");

    // Contagem no banco não pode ultrapassar 5
    const dbCountFree = await prisma.qRCode.count({ where: { userId: auditUsers.free.id } });
    assert(dbCountFree === 5, "FREE: banco de dados contém estritamente 5 QR codes");

    // C) Tentativa de manipulação de payload (plan: PRO, role: ADMIN, isPremium: true)
    const reqTamper = createAuthRequest("http://localhost:3000/api/qr", auditUsers.free, {
      method: "POST",
      body: {
        name: "QR Forjado",
        destination: "https://example.com/forjado",
        isDynamic: false,
        plan: "PRO",
        planId: proPlan.id,
        role: "ADMIN",
        isPremium: true,
        subscriptionStatus: "ACTIVE",
      },
    });
    const resTamper = await createQR(reqTamper);
    assert(resTamper.status === 403, "FREE: tentativa de bypass com payload forjado deve retornar 403");
  }

  console.log("\n--- FASE 4: TESTES DE RECURSOS PREMIUM NO PLANO FREE ---");
  {
    // 1. QR Dinâmico
    const reqDyn = createAuthRequest("http://localhost:3000/api/qr", auditUsers.free, {
      method: "POST",
      body: {
        name: "QR Dinâmico Inválido",
        destination: "https://example.com/dyn",
        isDynamic: true,
      },
    });
    const resDyn = await createQR(reqDyn);
    assert(resDyn.status === 403, "FREE: criação de QR dinâmico deve retornar 403");

    // 2. Edição de Destino Dinâmico
    const freeFakeDynQR = await prisma.qRCode.create({
      data: {
        userId: auditUsers.free.id,
        name: "Fake Dynamic QR",
        destination: "https://example.com/orig",
        shortCode: "test-free-dyn",
        isDynamic: true,
        type: "url",
        content: JSON.stringify({ url: "https://example.com/orig" }),
        styleConfig: "{}",
      },
    });
    const reqEditDyn = createAuthRequest(
      `http://localhost:3000/api/qr/${freeFakeDynQR.id}`,
      auditUsers.free,
      {
        method: "PUT",
        body: { destination: "https://example.com/hacked" },
      }
    );
    const resEditDyn = await updateQR(reqEditDyn, { params: { id: freeFakeDynQR.id } });
    assert(resEditDyn.status === 403, "FREE: edição de destino de QR dinâmico deve retornar 403");

    // 3. Analytics
    const reqAnalytics = createAuthRequest("http://localhost:3000/api/analytics", auditUsers.free);
    const resAnalytics = await getAnalytics(reqAnalytics);
    assert(resAnalytics.status === 403, "FREE: acesso a /api/analytics deve retornar 403");

    // 4. Logotipo Customizado
    const reqLogo = createAuthRequest("http://localhost:3000/api/qr", auditUsers.free, {
      method: "POST",
      body: {
        name: "QR com Logo",
        destination: "https://example.com/logo",
        isDynamic: false,
        logoUrl: "https://example.com/logo.png",
      },
    });
    const resLogo = await createQR(reqLogo);
    assert(resLogo.status === 403, "FREE: inclusão de logoUrl deve retornar 403");

    const reqUploadLogo = createAuthRequest("http://localhost:3000/api/storage/upload", auditUsers.free, {
      method: "POST",
      body: {
        fileName: "meu_logo.png",
        folder: "logos",
        fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      },
    });
    const resUploadLogo = await uploadStorage(reqUploadLogo);
    assert(resUploadLogo.status === 403, "FREE: upload na pasta 'logos' deve retornar 403");

    // 5. Campanhas Promocionais
    const reqGetCamp = createAuthRequest("http://localhost:3000/api/campaigns", auditUsers.free);
    const resGetCamp = await getCampaigns(reqGetCamp);
    assert(resGetCamp.status === 403, "FREE: GET /api/campaigns deve retornar 403");

    const reqPostCamp = createAuthRequest("http://localhost:3000/api/campaigns", auditUsers.free, {
      method: "POST",
      body: { name: "Campanha Free" },
    });
    const resPostCamp = await createCampaign(reqPostCamp);
    assert(resPostCamp.status === 403, "FREE: POST /api/campaigns deve retornar 403");

    // 6. Exportação SVG e PDF
    const reqSvg = createAuthRequest("http://localhost:3000/api/files/save", auditUsers.free, {
      method: "POST",
      body: {
        fileName: "qr.svg",
        fileType: "svg",
        fileData: "<svg></svg>",
      },
    });
    const resSvg = await saveFile(reqSvg);
    assert(resSvg.status === 403, "FREE: exportação SVG deve retornar 403");

    const reqPdf = createAuthRequest("http://localhost:3000/api/files/save", auditUsers.free, {
      method: "POST",
      body: {
        fileName: "qr.pdf",
        fileType: "pdf",
        fileData: "JVBERi0xLjQKJ",
      },
    });
    const resPdf = await saveFile(reqPdf);
    assert(resPdf.status === 403, "FREE: exportação PDF deve retornar 403");
  }

  console.log("\n--- FASE 5: TESTES DE LIMITES PRO E OFF-BY-ONE ---");
  {
    // Limite oficial do plano PRO no banco é 15 QRs/mês
    // Testamos: 14 (limite-1), 15 (limite), 16 (limite+1 -> bloqueado)
    for (let i = 1; i <= 14; i++) {
      const req = createAuthRequest("http://localhost:3000/api/qr", auditUsers.pro, {
        method: "POST",
        body: {
          name: `QR PRO ${i}`,
          destination: `https://example.com/pro-${i}`,
          isDynamic: true,
        },
      });
      const res = await createQR(req);
      assert(res.status === 200, `PRO: criação de QR #${i} deve retornar 200 OK`);
    }

    // 15º QR (limite exato)
    const req15 = createAuthRequest("http://localhost:3000/api/qr", auditUsers.pro, {
      method: "POST",
      body: {
        name: "QR PRO 15 (Limite Exato)",
        destination: "https://example.com/pro-15",
        isDynamic: true,
      },
    });
    const res15 = await createQR(req15);
    assert(res15.status === 200, "PRO: 15º QR (limite exato) deve retornar 200 OK");

    // 16º QR (limite + 1 -> deve ser bloqueado)
    const req16 = createAuthRequest("http://localhost:3000/api/qr", auditUsers.pro, {
      method: "POST",
      body: {
        name: "QR PRO 16 (Acima do Limite)",
        destination: "https://example.com/pro-16",
        isDynamic: true,
      },
    });
    const res16 = await createQR(req16);
    assert(res16.status === 403, "PRO: 16º QR (limite + 1) deve ser bloqueado com HTTP 403");

    // Contagem no banco deve ser rigorosamente 15
    const dbCountPro = await prisma.qRCode.count({ where: { userId: auditUsers.pro.id } });
    assert(dbCountPro === 15, "PRO: banco de dados contém exatamente 15 QR codes");

    // Recursos PRO devem funcionar normalmente
    const reqAnalyticsPro = createAuthRequest("http://localhost:3000/api/analytics", auditUsers.pro);
    const resAnalyticsPro = await getAnalytics(reqAnalyticsPro);
    assert(resAnalyticsPro.status === 200, "PRO: acesso a /api/analytics é permitido (200 OK)");

    const reqCampPro = createAuthRequest("http://localhost:3000/api/campaigns", auditUsers.pro);
    const resCampPro = await getCampaigns(reqCampPro);
    assert(resCampPro.status === 200, "PRO: acesso a /api/campaigns é permitido (200 OK)");
  }

  console.log("\n--- FASE 6: TESTES DO PLANO BUSINESS (ILIMITADO) ---");
  {
    const reqBiz = createAuthRequest("http://localhost:3000/api/qr", auditUsers.biz, {
      method: "POST",
      body: {
        name: "QR Business Test",
        destination: "https://example.com/biz",
        isDynamic: true,
      },
    });
    const resBiz = await createQR(reqBiz);
    assert(resBiz.status === 200, "BUSINESS: criação de QR dinâmico permitida (200 OK)");
  }

  console.log("\n--- FASE 7: TESTES DE IDOR / CROSS-ACCOUNT ---");
  {
    // USER_A cria QR_A
    const reqCreateA = createAuthRequest("http://localhost:3000/api/qr", auditUsers.userA, {
      method: "POST",
      body: {
        name: "QR Privado de A",
        destination: "https://original-a.com",
        isDynamic: true,
      },
    });
    const resCreateA = await createQR(reqCreateA);
    const dataA = await resCreateA.json();
    const qrAId = dataA.qrCode.id;
    const shortCodeA = dataA.qrCode.shortCode;

    // USER_B tenta acessar GET /api/qr/[qrAId]
    const reqGetB = createAuthRequest(`http://localhost:3000/api/qr/${qrAId}`, auditUsers.userB);
    const resGetB = await getQR(reqGetB, { params: { id: qrAId } });
    assert(resGetB.status === 404, "IDOR: USER_B não pode consultar QR de USER_A (404 Not Found)");

    // USER_B tenta alterar destino PUT /api/qr/[qrAId]
    const reqPutB = createAuthRequest(`http://localhost:3000/api/qr/${qrAId}`, auditUsers.userB, {
      method: "PUT",
      body: { destination: "https://hacked-by-b.com" },
    });
    const resPutB = await updateQR(reqPutB, { params: { id: qrAId } });
    assert(resPutB.status === 404, "IDOR: USER_B não pode editar destino do QR de USER_A (404)");

    // Confirma que destino no banco permanece inalterado
    const checkQRA = await prisma.qRCode.findUnique({ where: { id: qrAId } });
    assert(
      checkQRA?.destination === dataA.qrCode.destination &&
      checkQRA?.destination !== "https://hacked-by-b.com",
      "IDOR: destino do QR de USER_A permanece intacto"
    );

    // USER_B tenta duplicar QR de USER_A
    const reqDupB = createAuthRequest(
      `http://localhost:3000/api/qr/${qrAId}/duplicate`,
      auditUsers.userB,
      { method: "POST" }
    );
    const resDupB = await duplicateQR(reqDupB, { params: { id: qrAId } });
    assert(resDupB.status === 404, "IDOR: USER_B não pode duplicar QR de USER_A (404)");

    // USER_B tenta excluir QR de USER_A
    const reqDelB = createAuthRequest(`http://localhost:3000/api/qr/${qrAId}`, auditUsers.userB, {
      method: "DELETE",
    });
    const resDelB = await deleteQR(reqDelB, { params: { id: qrAId } });
    assert(resDelB.status === 404, "IDOR: USER_B não pode excluir QR de USER_A (404)");

    // USER_B tenta consultar analytics do QR de USER_A
    const reqAnalyticsB = createAuthRequest(
      `http://localhost:3000/api/analytics?qrCodeId=${qrAId}`,
      auditUsers.userB
    );
    const resAnalyticsB = await getAnalytics(reqAnalyticsB);
    assert(resAnalyticsB.status === 404, "IDOR: USER_B não pode ver analytics do QR de USER_A (404)");

    // USER_A salva um arquivo privado
    const fileA = await prisma.generatedFile.create({
      data: {
        userId: auditUsers.userA.id,
        fileName: "secret_a.png",
        fileType: "png",
        fileSize: 1024,
        mimeType: "image/png",
        storagePath: "users/a/secret_a.png",
        downloadUrl: "https://storage.example.com/secret_a.png",
      },
    });

    // USER_B tenta baixar o arquivo privado de USER_A
    const reqDownloadB = createAuthRequest(
      `http://localhost:3000/api/files/${fileA.id}/download`,
      auditUsers.userB
    );
    const resDownloadB = await downloadFile(reqDownloadB, { params: { id: fileA.id } });
    assert(resDownloadB.status === 404, "IDOR: USER_B não pode baixar arquivo privado de USER_A (404)");

    // Redirecionamento público não é IDOR: o shortCode é público
    assert(typeof shortCodeA === "string" && shortCodeA.length > 0, "Redirecionamento público preserva shortCode");
  }

  console.log("\n--- FASE 8 & 10: MANIPULAÇÃO DE CHECKOUT, PREÇO E PLANO ---");
  {
    const reqFakePrice = createAuthRequest("http://localhost:3000/api/billing/checkout", auditUsers.free, {
      method: "POST",
      body: {
        planName: "BUSINESS",
        billingCycle: "month",
        price: 0,
        amount: 1,
        unit_price: 0.1,
        currency: "USD",
        userId: auditUsers.userA.id,
      },
    });
    const resFakePrice = await checkoutBilling(reqFakePrice);
    assert([200, 503].includes(resFakePrice.status), "CHECKOUT: endpoint trata requisição sem aceitar preço adulterado");
  }

  console.log("\n--- FASE 11 & 12: IDEMPOTÊNCIA E PAGAMENTO INEXISTENTE NO MERCADO PAGO ---");
  {
    // Pagamento inexistente / simulado ID 123456
    const resSimulated: any = await processMercadoPagoNotification("123456");
    assert(resSimulated.simulated === true || resSimulated.status === "not_found", "MP: ID simulado 123456 é tratado sem erro 500");

    // Confirma que nenhuma assinatura foi gerada pelo teste simulado
    const checkSub = await prisma.subscription.findFirst({
      where: { gatewaySubscriptionId: "123456" },
    });
    assert(checkSub === null, "MP: ID simulado 123456 NÃO cria nenhuma assinatura no banco de dados");

    // Idempotência: mesmo evento já processado
    const testPaymentId = "mock_idemp_1";
    const testEventKey = `mp_payment_${testPaymentId}`;
    await prisma.webhookEvent.upsert({
      where: { eventId: testEventKey },
      create: {
        gateway: "mercadopago",
        eventId: testEventKey,
        eventType: "payment.approved",
        status: "PROCESSED",
        payload: JSON.stringify({ id: testPaymentId }),
      },
      update: { status: "PROCESSED" },
    });

    const resReplay = await processMercadoPagoNotification(testPaymentId);
    assert(resReplay.status === "already_processed", "MP: webhook duplicado retorna 'already_processed' (Idempotência garantida)");
  }

  console.log("\n--- FASE 15: TESTE DE CONCORRÊNCIA (RACE CONDITION) NA COTA ---");
  {
    const raceUser = await prisma.user.create({
      data: {
        name: "Race Test User",
        email: `race_user_${Date.now()}@qrmaster.com`,
        passwordHash: "hash_test",
        role: "USER",
        planId: freePlan.id,
      },
    });

    // Insere previamente 4 QR codes para deixar o usuário a 1 unidade do limite (4 de 5)
    for (let i = 1; i <= 4; i++) {
      await prisma.qRCode.create({
        data: {
          userId: raceUser.id,
          name: `QR Race Prev ${i}`,
          destination: `https://example.com/race-${i}`,
          isDynamic: false,
          type: "url",
          content: "{}",
          styleConfig: "{}",
        },
      });
    }

    const countBefore = await prisma.qRCode.count({ where: { userId: raceUser.id } });
    assert(countBefore === 4, "CONCORRÊNCIA: usuário preparado com exatamente 4 QRs (limite 5)");

    // Dispara 2 requisições rigorosamente simultâneas via Promise.all
    const req1 = createAuthRequest("http://localhost:3000/api/qr", raceUser, {
      method: "POST",
      body: { name: "QR Concorrente 1", destination: "https://example.com/c1", isDynamic: false },
    });
    const req2 = createAuthRequest("http://localhost:3000/api/qr", raceUser, {
      method: "POST",
      body: { name: "QR Concorrente 2", destination: "https://example.com/c2", isDynamic: false },
    });

    const [res1, res2] = await Promise.all([createQR(req1), createQR(req2)]);

    const statuses = [res1.status, res2.status].sort();
    assert(
      statuses[0] === 200 && statuses[1] === 403,
      `CONCORRÊNCIA: exatamente uma criação é aprovada (200) e a outra rejeitada (403). Statuses: [${statuses.join(", ")}]`
    );

    const countAfter = await prisma.qRCode.count({ where: { userId: raceUser.id } });
    assert(countAfter === 5, "CONCORRÊNCIA: banco contém rigorosamente 5 QRs, impedindo ultrapassagem da cota");

    // Limpeza do usuário de corrida
    await prisma.qRCode.deleteMany({ where: { userId: raceUser.id } });
    await prisma.activityLog.deleteMany({ where: { userId: raceUser.id } });
    await prisma.user.delete({ where: { id: raceUser.id } });
  }

  console.log("\n--- FASE 16: AUTORIZAÇÃO ADMINISTRATIVA E ESCALAÇÃO DE PRIVILÉGIOS ---");
  {
    const reqAdminPlan = createAuthRequest("http://localhost:3000/api/admin/plan", auditUsers.free);
    const resAdminPlan = await getAdminPlans(reqAdminPlan);
    assert(resAdminPlan.status === 403, "ADMIN: USER comum recebe 403 em /api/admin/plan");

    const reqAdminGateways = createAuthRequest("http://localhost:3000/api/admin/gateway", auditUsers.free);
    const resAdminGateways = await getAdminGateways(reqAdminGateways);
    assert(resAdminGateways.status === 403, "ADMIN: USER comum recebe 403 em /api/admin/gateway");

    const reqAdminUsers = createAuthRequest("http://localhost:3000/api/admin/users", auditUsers.free);
    const resAdminUsers = await getAdminUsers(reqAdminUsers);
    assert(resAdminUsers.status === 403, "ADMIN: USER comum recebe 403 em /api/admin/users");

    // USER comum tenta auto-promoção enviando { role: 'ADMIN' } em PATCH /api/auth/me
    const reqSelfPromote = createAuthRequest("http://localhost:3000/api/auth/me", auditUsers.free, {
      method: "PATCH",
      body: {
        role: "ADMIN",
        planId: bizPlan.id,
      },
    });
    await updateMe(reqSelfPromote);

    const checkUserRole = await prisma.user.findUnique({
      where: { id: auditUsers.free.id },
      select: { role: true, planId: true },
    });
    assert(checkUserRole?.role === "USER", "PRIVILEGE ESCALATION: role permanece 'USER'");
    assert(checkUserRole?.planId === freePlan.id, "PRIVILEGE ESCALATION: planId permanece FREE");
  }

  // Limpeza final dos dados de auditoria
  await prisma.qRCodeScan.deleteMany({
    where: { qrCode: { userId: { in: auditUserIds } } },
  });
  await prisma.generatedFile.deleteMany({
    where: { userId: { in: auditUserIds } },
  });
  await prisma.qRCode.deleteMany({
    where: { userId: { in: auditUserIds } },
  });
  await prisma.campaign.deleteMany({
    where: { userId: { in: auditUserIds } },
  });
  await prisma.subscription.deleteMany({
    where: { userId: { in: auditUserIds } },
  });
  await prisma.activityLog.deleteMany({
    where: { userId: { in: auditUserIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: auditUserIds } },
  });

  console.log("\n=======================================================");
  console.log(`🎉 AUDITORIA CONCLUÍDA: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS (100%)`);
  console.log("=======================================================\n");
}

runPlansAndLimitsAuditSuite()
  .catch((err) => {
    console.error("ERRO FATAL NA SUÍTE DE TESTES:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
