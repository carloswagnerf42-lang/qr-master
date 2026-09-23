/**
 * SUÍTE DE TESTES: RATE LIMIT SERVER-SIDE PARA CRIAÇÃO DE QR CODE (POST /api/qr)
 * 
 * Validações obrigatórias:
 * 1. Requisição abaixo do limite (1 a 29) -> 200 OK
 * 2. Exatamente no limite (tentativa 30) -> 200 OK
 * 3. Requisição acima do limite (tentativa 31) -> 429 Too Many Requests
 * 4. Validação de formato da resposta 429: code = RATE_LIMITED, retryAfter > 0, headers X-RateLimit-*
 * 5. Reset da janela após expiração de 60s
 * 6. Isolamento estrito entre usuários (USER_A bloqueado não afeta USER_B)
 * 7. Requests concorrentes
 * 8. Request bloqueado não cria QR e não gera ActivityLog no banco
 * 9. Quota FREE continua 5 (403 LIMIT_REACHED no 6º QR)
 * 10. Quota PRO continua 15 (403 LIMIT_REACHED no 16º QR)
 * 11. BUSINESS continua comercialmente ilimitado (porém sujeito a rate limit técnico)
 * 12. 403 LIMIT_REACHED permanece distinto de 429 RATE_LIMITED
 * 13. GET /api/qr não é afetado pelo limiter do POST
 * 14. Requests inválidos repetidos consomem cota do rate limit (anti-fuzzing/anti-flood)
 */

import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import { NextRequest } from "next/server";
import { POST as createQR, GET as listQRs } from "../src/app/api/qr/route";
import { resetRateLimit, checkRateLimit } from "../src/lib/rate-limit";

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

  if (options.body !== undefined) {
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

async function runQrRateLimitSuite() {
  console.log("\n=======================================================");
  console.log("🛡️ INICIANDO SUÍTE DE TESTES: RATE LIMIT SERVER-SIDE (POST /api/qr)");
  console.log("=======================================================\n");

  // 1. Obter planos base
  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  if (!freePlan || !proPlan || !bizPlan) {
    throw new Error("Planos base (FREE, PRO, BUSINESS) não encontrados.");
  }

  // 2. Criar usuários dedicados para o teste
  const timestamp = Date.now();
  const testUsers = {
    userA: await prisma.user.create({
      data: {
        name: "RateLimit User A (BUSINESS)",
        email: `rate_a_${timestamp}@qrmaster.com`,
        passwordHash: "hash_test_rl",
        role: "USER",
        planId: bizPlan.id,
      },
    }),
    userB: await prisma.user.create({
      data: {
        name: "RateLimit User B (BUSINESS)",
        email: `rate_b_${timestamp}@qrmaster.com`,
        passwordHash: "hash_test_rl",
        role: "USER",
        planId: bizPlan.id,
      },
    }),
    userFree: await prisma.user.create({
      data: {
        name: "RateLimit User Free",
        email: `rate_free_${timestamp}@qrmaster.com`,
        passwordHash: "hash_test_rl",
        role: "USER",
        planId: freePlan.id,
      },
    }),
    userPro: await prisma.user.create({
      data: {
        name: "RateLimit User Pro",
        email: `rate_pro_${timestamp}@qrmaster.com`,
        passwordHash: "hash_test_rl",
        role: "USER",
        planId: proPlan.id,
      },
    }),
  };

  const allUserIds = Object.values(testUsers).map((u) => u.id);

  // Criar assinaturas ativas para contas PRO e BUSINESS do teste
  const futureEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.subscription.create({
    data: {
      userId: testUsers.userA.id,
      planId: bizPlan.id,
      status: "ACTIVE",
      gateway: "mercadopago",
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureEnd,
    },
  });
  await prisma.subscription.create({
    data: {
      userId: testUsers.userB.id,
      planId: bizPlan.id,
      status: "ACTIVE",
      gateway: "mercadopago",
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureEnd,
    },
  });
  await prisma.subscription.create({
    data: {
      userId: testUsers.userPro.id,
      planId: proPlan.id,
      status: "ACTIVE",
      gateway: "mercadopago",
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureEnd,
    },
  });

  try {
    // Reset preventivo de rate limits para os IDs de teste
    for (const u of Object.values(testUsers)) {
      await resetRateLimit(u.id, "qr");
    }

    console.log("--- 0. DIAGNÓSTICO DA CAUSA DA FALHA ORIGINAL NA REQUEST #6 ---");
    {
      // Cria usuário com planId mas SEM Subscription ativa (reproduz exatamente a condição da falha original)
      const diagUser = await prisma.user.create({
        data: {
          name: "Diag User Without Sub",
          email: `diag_user_${timestamp}@qrmaster.com`,
          passwordHash: "hash_test_rl",
          role: "USER",
          planId: bizPlan.id, // Possui planId mas SEM Subscription ativa no banco
        },
      });
      allUserIds.push(diagUser.id);
      await resetRateLimit(diagUser.id, "qr");

      for (let i = 1; i <= 5; i++) {
        const req = createAuthRequest("http://localhost:3000/api/qr", diagUser, {
          method: "POST",
          body: { name: `Diag QR #${i}`, destination: `https://example.com/diag/${i}`, isDynamic: false },
        });
        const res = await createQR(req);
        assert(res.status === 200, `Diag: requisição #${i} permitida (HTTP 200)`);
      }

      // Requisição #6
      const req6 = createAuthRequest("http://localhost:3000/api/qr", diagUser, {
        method: "POST",
        body: { name: "Diag QR #6", destination: "https://example.com/diag/6", isDynamic: false },
      });
      const res6 = await createQR(req6);
      const body6 = await res6.json();

      console.log(`\n  [DIAGNÓSTICO DA REQUEST #6]`);
      console.log(`  -> HTTP Status : ${res6.status}`);
      console.log(`  -> Code        : ${body6.code}`);
      console.log(`  -> Error       : ${body6.error}`);
      console.log(`  -> Limit       : ${body6.limit}`);
      console.log(`  -> Current     : ${body6.current}`);
      console.log(`  -> RequiredPlan: ${body6.requiredPlan}\n`);

      if (res6.status === 403 && body6.code === "LIMIT_REACHED") {
        console.log("  🚨 CAUSA CONFIRMADA:");
        console.log("  quota comercial FREE interrompeu o cenário antes do rate limiter.\n");
      }

      assert(res6.status === 403, "Diagnóstico: Request #6 retorna HTTP 403");
      assert(body6.code === "LIMIT_REACHED", "Diagnóstico: Request #6 retorna code LIMIT_REACHED");
    }

    console.log("--- 1. TESTES DE CONSUMO ABAIXO E EXATAMENTE NO LIMITE (30 REQS) ---");
    {
      // A) Executa as primeiras criações legítimas reais via rota para validar status 200 e persistência
      for (let i = 1; i <= 3; i++) {
        const req = createAuthRequest("http://localhost:3000/api/qr", testUsers.userA, {
          method: "POST",
          body: {
            name: `QR Teste A #${i}`,
            destination: `https://example.com/a/${i}`,
            type: "url",
            isDynamic: false,
          },
        });
        const res = await createQR(req);
        assert(res.status === 200, `Requisição #${i} abaixo do limite é permitida (HTTP 200)`);
      }

      // B) Preenche rapidamente as tentativas 4 até 29 via checkRateLimit dentro da mesma janela de 60s
      for (let i = 4; i <= 29; i++) {
        const check = await checkRateLimit(testUsers.userA.id, "qr");
        assert(check.allowed === true, `Tentativa #${i} abaixo do limite é permitida`);
      }

      // C) 30ª requisição (exatamente no limite) via rota real
      const req30 = createAuthRequest("http://localhost:3000/api/qr", testUsers.userA, {
        method: "POST",
        body: {
          name: "QR Teste A #30 (limite exato)",
          destination: "https://example.com/a/30",
          type: "url",
          isDynamic: false,
        },
      });
      const res30 = await createQR(req30);
      assert(res30.status === 200, "30ª requisição (exatamente no limite) é permitida (HTTP 200)");
    }

    console.log("\n--- 2. TESTE DE BLOQUEIO ACIMA DO LIMITE (31ª REQUISIÇÃO -> 429) ---");
    {
      const countBefore31 = await prisma.qRCode.count({ where: { userId: testUsers.userA.id } });
      const logsBefore31 = await prisma.activityLog.count({ where: { userId: testUsers.userA.id } });

      // 31ª requisição deve ser bloqueada
      const req31 = createAuthRequest("http://localhost:3000/api/qr", testUsers.userA, {
        method: "POST",
        body: {
          name: "QR Teste A #31 (excedente)",
          destination: "https://example.com/a/31",
          type: "url",
          isDynamic: false,
        },
      });
      const res31 = await createQR(req31);
      assert(res31.status === 429, "31ª requisição é BLOQUEADA com HTTP 429 Too Many Requests");

      const body31 = await res31.json();
      assert(body31.code === "RATE_LIMITED", "Resposta 429 possui code: 'RATE_LIMITED'");
      assert(typeof body31.retryAfter === "number" && body31.retryAfter > 0, `Retry-After retornado no JSON válido (${body31.retryAfter}s)`);

      // Validação de Headers
      const retryAfterHeader = res31.headers.get("Retry-After");
      const limitHeader = res31.headers.get("X-RateLimit-Limit");
      const remainingHeader = res31.headers.get("X-RateLimit-Remaining");
      const resetHeader = res31.headers.get("X-RateLimit-Reset");

      assert(retryAfterHeader !== null && parseInt(retryAfterHeader, 10) > 0, `Header Retry-After presente (${retryAfterHeader})`);
      assert(limitHeader === "30", `Header X-RateLimit-Limit informa limite de 30 (obtido: ${limitHeader})`);
      assert(remainingHeader === "0", `Header X-RateLimit-Remaining é 0 (obtido: ${remainingHeader})`);
      assert(resetHeader !== null && parseInt(resetHeader, 10) > 0, `Header X-RateLimit-Reset presente (${resetHeader})`);

      // Confirma que nenhum QR e nenhum ActivityLog foram criados pela requisição bloqueada
      const countAfter31 = await prisma.qRCode.count({ where: { userId: testUsers.userA.id } });
      const logsAfter31 = await prisma.activityLog.count({ where: { userId: testUsers.userA.id } });

      assert(countAfter31 === countBefore31, "Requisição 429 NÃO cria nenhum QR Code no banco de dados");
      assert(logsAfter31 === logsBefore31, "Requisição 429 NÃO cria nenhum ActivityLog no banco de dados (anti-amplificação de escrita)");
    }

    console.log("\n--- 3. TESTE DE ISOLAMENTO ENTRE USUÁRIOS (USER_A vs USER_B) ---");
    {
      // USER_A está esgotado (429). USER_B deve estar 100% livre
      const reqB = createAuthRequest("http://localhost:3000/api/qr", testUsers.userB, {
        method: "POST",
        body: {
          name: "QR Teste B #1",
          destination: "https://example.com/b/1",
          type: "url",
          isDynamic: false,
        },
      });
      const resB = await createQR(reqB);
      assert(resB.status === 200, "USER_B não é afetado pelo rate limit de USER_A (HTTP 200 OK)");

      // USER_A continua bloqueado
      const reqAAgain = createAuthRequest("http://localhost:3000/api/qr", testUsers.userA, {
        method: "POST",
        body: {
          name: "QR Teste A bloqueado novamente",
          destination: "https://example.com/a/blocked",
          type: "url",
          isDynamic: false,
        },
      });
      const resAAgain = await createQR(reqAAgain);
      assert(resAAgain.status === 429, "USER_A permanece bloqueado com HTTP 429");
    }

    console.log("\n--- 4. TESTE DE RESET DA JANELA TEMPORAL ---");
    {
      // Simula a passagem do tempo com clock determinístico (61 segundos adiante)
      const futureTime = Date.now() + 61 * 1000;
      const checkFuture = await checkRateLimit(testUsers.userA.id, "qr", futureTime);
      assert(checkFuture.allowed === true, "Após expiração da janela (60s), requisição volta a ser permitida (allowed: true)");
      assert(checkFuture.remaining === 29, "Novo ciclo é iniciado com remaining: 29");

      // Reset direto via resetRateLimit
      await resetRateLimit(testUsers.userA.id, "qr");
      const reqAAfterReset = createAuthRequest("http://localhost:3000/api/qr", testUsers.userA, {
        method: "POST",
        body: {
          name: "QR Teste A pós-reset",
          destination: "https://example.com/a/reset",
          type: "url",
          isDynamic: false,
        },
      });
      const resAAfterReset = await createQR(reqAAfterReset);
      assert(resAAfterReset.status === 200, "Após reset da janela, rota POST /api/qr aceita requisição com HTTP 200");
    }

    console.log("\n--- 5. TESTE DE NÃO-INTERFERÊNCIA EM OUTROS MÉTODOS (GET /api/qr) ---");
    {
      // Esgota intencionalmente o rate limit de USER_B
      for (let i = 2; i <= 31; i++) {
        await checkRateLimit(testUsers.userB.id, "qr");
      }
      const checkB = await checkRateLimit(testUsers.userB.id, "qr");
      assert(checkB.allowed === false, "USER_B está com rate limit esgotado para POST");

      // Requisição GET /api/qr deve continuar funcionando normalmente
      const reqGet = createAuthRequest("http://localhost:3000/api/qr", testUsers.userB, {
        method: "GET",
      });
      const resGet = await listQRs(reqGet);
      assert(resGet.status === 200, "GET /api/qr NÃO é afetado pelo rate limiter do POST (HTTP 200 OK)");

      const getBody = await resGet.json();
      assert(Array.isArray(getBody.qrCodes), "GET /api/qr retorna lista válida de QR Codes");
    }

    console.log("\n--- 6. TESTE DE REQUESTS INVÁLIDOS E CONSUMO DE RATE LIMIT (ANTI-FUZZING) ---");
    {
      await resetRateLimit(testUsers.userB.id, "qr");

      // Dispara payload inválido (sem nome e sem destino)
      const reqInvalid = createAuthRequest("http://localhost:3000/api/qr", testUsers.userB, {
        method: "POST",
        body: {
          name: "",
          destination: "",
        },
      });
      const resInvalid = await createQR(reqInvalid);
      assert(resInvalid.status === 400, "Payload inválido retorna 400 Bad Request");

      // Valida que a tentativa autenticada consumiu a janela do rate limit (anti-abuso/fuzzing)
      const checkInvalidConsumed = await checkRateLimit(testUsers.userB.id, "qr");
      // Como o endpoint POST executa checkRateLimit antes da validação do payload (ordem auditada),
      // a primeira tentativa já consumiu o contador
      assert(checkInvalidConsumed.remaining < 29, "Tentativa com payload inválido consumiu a janela de rate limit");
    }

    console.log("\n--- 7. REGRESSÃO: QUOTA COMERCIAL FREE (5 QRs -> 403 LIMIT_REACHED) ---");
    {
      await resetRateLimit(testUsers.userFree.id, "qr");

      // Cria 5 QR codes permitidos pelo plano FREE
      for (let i = 1; i <= 5; i++) {
        const req = createAuthRequest("http://localhost:3000/api/qr", testUsers.userFree, {
          method: "POST",
          body: {
            name: `FREE QR #${i}`,
            destination: `https://example.com/free/${i}`,
            type: "url",
            isDynamic: false,
          },
        });
        const res = await createQR(req);
        assert(res.status === 200, `FREE: criação #${i}/5 aprovada (HTTP 200)`);
      }

      // 6º QR code deve ser bloqueado por quota comercial (403 LIMIT_REACHED), NÃO 429
      const req6 = createAuthRequest("http://localhost:3000/api/qr", testUsers.userFree, {
        method: "POST",
        body: {
          name: "FREE QR #6 (excesso de quota comercial)",
          destination: "https://example.com/free/6",
          type: "url",
          isDynamic: false,
        },
      });
      const res6 = await createQR(req6);
      assert(res6.status === 403, "FREE: 6º QR é bloqueado com HTTP 403 (Cota Comercial, não 429)");

      const body6 = await res6.json();
      assert(body6.code === "LIMIT_REACHED", "FREE: código de erro é estritamente 'LIMIT_REACHED'");
      assert(body6.limit === 5, "FREE: limite reportado é 5");

      // Banco de dados contém estritamente 5 QRs para o usuário FREE
      const countFree = await prisma.qRCode.count({ where: { userId: testUsers.userFree.id } });
      assert(countFree === 5, "FREE: banco de dados contém estritamente 5 QR codes");
    }

    console.log("\n--- 8. REGRESSÃO: QUOTA COMERCIAL PRO (15 QRs -> 403 LIMIT_REACHED) ---");
    {
      await resetRateLimit(testUsers.userPro.id, "qr");

      // Pré-insere 13 QRs diretamente no banco para acelerar o teste e testar off-by-one
      for (let i = 1; i <= 13; i++) {
        await prisma.qRCode.create({
          data: {
            userId: testUsers.userPro.id,
            name: `PRO QR Pre ${i}`,
            destination: `https://example.com/pro-pre-${i}`,
            type: "url",
            isDynamic: false,
            content: "{}",
            styleConfig: "{}",
          },
        });
      }

      // Criação #14 via rota
      const req14 = createAuthRequest("http://localhost:3000/api/qr", testUsers.userPro, {
        method: "POST",
        body: {
          name: "PRO QR #14",
          destination: "https://example.com/pro/14",
          type: "url",
          isDynamic: false,
        },
      });
      const res14 = await createQR(req14);
      assert(res14.status === 200, "PRO: criação #14 aprovada (HTTP 200)");

      // Criação #15 (limite exato) via rota
      const req15 = createAuthRequest("http://localhost:3000/api/qr", testUsers.userPro, {
        method: "POST",
        body: {
          name: "PRO QR #15 (limite exato)",
          destination: "https://example.com/pro/15",
          type: "url",
          isDynamic: false,
        },
      });
      const res15 = await createQR(req15);
      assert(res15.status === 200, "PRO: criação #15 (limite exato) aprovada (HTTP 200)");

      // 16º QR code deve ser bloqueado por quota comercial (403 LIMIT_REACHED), NÃO 429
      const req16 = createAuthRequest("http://localhost:3000/api/qr", testUsers.userPro, {
        method: "POST",
        body: {
          name: "PRO QR #16 (excesso de quota comercial)",
          destination: "https://example.com/pro/16",
          type: "url",
          isDynamic: false,
        },
      });
      const res16 = await createQR(req16);
      assert(res16.status === 403, "PRO: 16º QR é bloqueado com HTTP 403 (Cota Comercial, não 429)");

      const body16 = await res16.json();
      assert(body16.code === "LIMIT_REACHED", "PRO: código de erro é estritamente 'LIMIT_REACHED'");
      assert(body16.limit === 15, "PRO: limite reportado é 15");

      // Banco de dados contém estritamente 15 QRs para o usuário PRO
      const countPro = await prisma.qRCode.count({ where: { userId: testUsers.userPro.id } });
      assert(countPro === 15, "PRO: banco de dados contém estritamente 15 QR codes");
    }

    console.log("\n--- 9. REGRESSÃO: PLANO BUSINESS (ILIMITADO COMERCIALMENTE + SUJEITO A RATE LIMIT) ---");
    {
      // Reset rate limit para USER_A
      await resetRateLimit(testUsers.userA.id, "qr");

      // Criação de QR dinâmico permitida para BUSINESS
      const reqBizDynamic = createAuthRequest("http://localhost:3000/api/qr", testUsers.userA, {
        method: "POST",
        body: {
          name: "BUSINESS QR Dinâmico",
          destination: "https://example.com/biz/dynamic",
          type: "url",
          isDynamic: true,
        },
      });
      const resBizDynamic = await createQR(reqBizDynamic);
      assert(resBizDynamic.status === 200, "BUSINESS: criação de QR dinâmico aprovada com HTTP 200");

      // Consome até a 30ª requisição para demonstrar que BUSINESS também está sujeito ao rate limit técnico
      for (let i = 2; i <= 30; i++) {
        await checkRateLimit(testUsers.userA.id, "qr");
      }

      // 31ª requisição do BUSINESS é bloqueada com 429
      const reqBizFlood = createAuthRequest("http://localhost:3000/api/qr", testUsers.userA, {
        method: "POST",
        body: {
          name: "BUSINESS QR Flood",
          destination: "https://example.com/biz/flood",
          type: "url",
          isDynamic: false,
        },
      });
      const resBizFlood = await createQR(reqBizFlood);
      assert(resBizFlood.status === 429, "BUSINESS: também está protegido contra flood técnico (HTTP 429)");
    }

    console.log("\n--- 10. TESTE DE CONCORRÊNCIA EM ALTO VOLUME ---");
    {
      // Novo usuário de teste para concorrência
      const raceUser = await prisma.user.create({
        data: {
          name: "Race Rate Limit User",
          email: `race_rl_${timestamp}@qrmaster.com`,
          passwordHash: "hash_test_rl",
          role: "USER",
          planId: bizPlan.id,
        },
      });
      allUserIds.push(raceUser.id);
      await prisma.subscription.create({
        data: {
          userId: raceUser.id,
          planId: bizPlan.id,
          status: "ACTIVE",
          gateway: "mercadopago",
          currentPeriodStart: new Date(),
          currentPeriodEnd: futureEnd,
        },
      });
      await resetRateLimit(raceUser.id, "qr");

      // Pré-ocupa 28 slots de rate limit (sobrando exatamente 2 slots para atingir 30)
      for (let i = 1; i <= 28; i++) {
        await checkRateLimit(raceUser.id, "qr");
      }

      // Dispara 6 requisições estritamente simultâneas via Promise.all
      const concurrentReqs = Array.from({ length: 6 }, (_, idx) =>
        createAuthRequest("http://localhost:3000/api/qr", raceUser, {
          method: "POST",
          body: {
            name: `QR Concorrente ${idx + 1}`,
            destination: `https://example.com/c/${idx + 1}`,
            type: "url",
            isDynamic: false,
          },
        })
      );

      const responses = await Promise.all(concurrentReqs.map((r) => createQR(r)));
      const statuses = responses.map((r) => r.status);

      const count200 = statuses.filter((s) => s === 200).length;
      const count429 = statuses.filter((s) => s === 429).length;

      assert(count200 === 2, `Concorrência: exatamente 2 das 6 requisições foram aprovadas com 200 (obtido: ${count200})`);
      assert(count429 === 4, `Concorrência: exatamente 4 das 6 requisições foram bloqueadas com 429 (obtido: ${count429})`);

      // 7ª requisição subsequente deve retornar 429
      const reqAfterFlood = createAuthRequest("http://localhost:3000/api/qr", raceUser, {
        method: "POST",
        body: {
          name: "QR Pós Concorrência",
          destination: "https://example.com/c/after",
          type: "url",
          isDynamic: false,
        },
      });
      const resAfterFlood = await createQR(reqAfterFlood);
      assert(resAfterFlood.status === 429, "Requisição após saturação de concorrência retorna 429");
    }

    console.log("\n=======================================================");
    console.log(`🎉 SUÍTE DE RATE LIMITING CONCLUÍDA: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS (100%)`);
    console.log("=======================================================\n");
  } finally {
    // Limpeza de registros de teste
    await prisma.qRCodeScan.deleteMany({
      where: { qrCode: { userId: { in: allUserIds } } },
    });
    await prisma.generatedFile.deleteMany({
      where: { userId: { in: allUserIds } },
    });
    await prisma.qRCode.deleteMany({
      where: { userId: { in: allUserIds } },
    });
    await prisma.activityLog.deleteMany({
      where: { userId: { in: allUserIds } },
    });
    await prisma.subscription.deleteMany({
      where: { userId: { in: allUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: allUserIds } },
    });

    for (const id of allUserIds) {
      await resetRateLimit(id, "qr");
    }
  }
}

runQrRateLimitSuite()
  .catch((err) => {
    console.error("ERRO FATAL NA SUÍTE DE TESTES DE RATE LIMIT:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
