import { prisma } from "../src/lib/db";
import { POST as passwordRoute } from "../src/app/api/auth/password/route";
import { POST as deleteAccountRoute } from "../src/app/api/auth/delete-account/route";
import {
  createAuthenticatedSessionToken,
  hashPassword,
} from "../src/lib/auth";
import {
  checkRateLimit,
  resetRateLimit,
  checkRateLimitLocal,
  RATE_LIMIT_CONFIGS,
} from "../src/lib/rate-limit";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

let totalAsserts = 0;
let passedAsserts = 0;
let failedAsserts = 0;

function assert(condition: boolean, title: string, detail?: string) {
  totalAsserts++;
  if (condition) {
    console.log(`  ✅ PASS: ${title}`);
    passedAsserts++;
  } else {
    console.error(`  ❌ FAIL: ${title}${detail ? ` — ${detail}` : ""}`);
    failedAsserts++;
  }
}

function makeRequest(
  url: string,
  token: string | null,
  body: any
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["cookie"] = `qrmaster_session=${token}`;
    headers["authorization"] = `Bearer ${token}`;
  }
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function runTestSuite() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: SECURITY-HARD-12A — RATE LIMIT EM OPERAÇÕES SENSÍVEIS");
  console.log("==========================================================================\n");

  // Espião de chamadas a bcrypt.compare
  let bcryptCompareCalls = 0;
  const originalBcryptCompare = bcrypt.compare;
  (bcrypt as any).compare = async function (s: string, hash: string) {
    bcryptCompareCalls++;
    return originalBcryptCompare.call(this, s, hash);
  };

  try {
    // ------------------------------------------------------------------------
    // SETUP: Criação de usuários e sessões de teste no banco
    // ------------------------------------------------------------------------
    const initialPasswordHash = await hashPassword("SenhaOriginal@123");

    const aliceUser = await prisma.user.upsert({
      where: { email: "alice_hard12@test.local" },
      create: {
        email: "alice_hard12@test.local",
        name: "Alice HARD-12",
        role: "USER",
        passwordHash: initialPasswordHash,
      },
      update: {
        passwordHash: initialPasswordHash,
        role: "USER",
      },
    });

    const bobUser = await prisma.user.upsert({
      where: { email: "bob_hard12@test.local" },
      create: {
        email: "bob_hard12@test.local",
        name: "Bob HARD-12",
        role: "USER",
        passwordHash: initialPasswordHash,
      },
      update: {
        passwordHash: initialPasswordHash,
        role: "USER",
      },
    });

    const charlieUser = await prisma.user.upsert({
      where: { email: "charlie_hard12@test.local" },
      create: {
        email: "charlie_hard12@test.local",
        name: "Charlie HARD-12",
        role: "USER",
        passwordHash: initialPasswordHash,
      },
      update: {
        passwordHash: initialPasswordHash,
        role: "USER",
      },
    });

    const aliceSession = await createAuthenticatedSessionToken({
      id: aliceUser.id,
      name: aliceUser.name,
      email: aliceUser.email,
      role: aliceUser.role,
    });

    const bobSession = await createAuthenticatedSessionToken({
      id: bobUser.id,
      name: bobUser.name,
      email: bobUser.email,
      role: bobUser.role,
    });

    const charlieSession = await createAuthenticatedSessionToken({
      id: charlieUser.id,
      name: charlieUser.name,
      email: charlieUser.email,
      role: charlieUser.role,
    });

    // ========================================================================
    // GRUPO A — AUTENTICAÇÃO E REQUISIÇÕES ANÔNIMAS
    // ========================================================================
    console.log("--- GRUPO A: Autenticação e Requisições Anônimas ---");
    bcryptCompareCalls = 0;

    // A1. POST /api/auth/password sem sessão => HTTP 401
    const reqA1 = makeRequest("https://qrmasterdigital.com/api/auth/password", null, {
      currentPassword: "AnyPassword1",
      newPassword: "NewPassword123",
      confirmPassword: "NewPassword123",
    });
    const resA1 = await passwordRoute(reqA1);
    assert(resA1.status === 401, "A1. POST /api/auth/password sem sessão retorna HTTP 401");

    // A2. POST /api/auth/delete-account sem sessão => HTTP 401
    const reqA2 = makeRequest("https://qrmasterdigital.com/api/auth/delete-account", null, {
      password: "AnyPassword1",
      confirmationText: "EXCLUIR",
    });
    const resA2 = await deleteAccountRoute(reqA2);
    assert(resA2.status === 401, "A2. POST /api/auth/delete-account sem sessão retorna HTTP 401");

    // A3. Requisição anônima NÃO executa bcrypt.compare
    assert(
      bcryptCompareCalls === 0,
      "A3. Requisições anônimas não executam bcrypt.compare",
      `Chamadas a bcrypt.compare: ${bcryptCompareCalls}`
    );

    // ========================================================================
    // GRUPO B — PASSWORD CHANGE RATE LIMIT (5 tentativas / 5 minutos)
    // ========================================================================
    console.log("\n--- GRUPO B: Password Change Rate Limit ---");
    await resetRateLimit(aliceUser.id, "password-change");
    bcryptCompareCalls = 0;

    // B1. Tentativas 1 a 5 dentro da janela são permitidas pelo rate limiter
    for (let i = 1; i <= 5; i++) {
      const reqB = makeRequest(
        "https://qrmasterdigital.com/api/auth/password",
        aliceSession.token,
        {
          currentPassword: `SenhaIncorretaTentativa_${i}`,
          newPassword: "NovaSenhaValida123",
          confirmPassword: "NovaSenhaValida123",
        }
      );
      const resB = await passwordRoute(reqB);
      assert(
        resB.status === 400,
        `B1.${i}. Tentativa ${i}/5 de Alice aceita pelo rate limiter (falha em senha incorreta com HTTP 400)`
      );
    }

    assert(
      bcryptCompareCalls === 5,
      "B1.total. Exatamente 5 chamadas a bcrypt.compare executadas para as 5 tentativas permitidas"
    );

    // B2. 6ª tentativa: HTTP 429 Too Many Requests
    const callsBefore6th = bcryptCompareCalls;
    const reqB6 = makeRequest(
      "https://qrmasterdigital.com/api/auth/password",
      aliceSession.token,
      {
        currentPassword: "SenhaIncorretaTentativa_6",
        newPassword: "NovaSenhaValida123",
        confirmPassword: "NovaSenhaValida123",
      }
    );
    const resB6 = await passwordRoute(reqB6);
    const bodyB6 = await resB6.json();

    assert(resB6.status === 429, "B2. 6ª tentativa de Alice é bloqueada com HTTP 429 Too Many Requests");
    assert(bodyB6.code === "RATE_LIMITED", "B2.1. Payload JSON contém code = 'RATE_LIMITED'");

    // B3. 6ª tentativa NÃO executa bcrypt.compare
    assert(
      bcryptCompareCalls === callsBefore6th,
      "B3. 6ª tentativa bloqueada NÃO executa bcrypt.compare (Proteção de CPU DoS)",
      `Chamadas adicionais: ${bcryptCompareCalls - callsBefore6th}`
    );

    // B4. Retry-After presente
    const retryAfterB = resB6.headers.get("retry-after");
    assert(
      Boolean(retryAfterB && Number(retryAfterB) > 0),
      "B4. Cabeçalho Retry-After presente e maior que zero",
      `Valor: ${retryAfterB}`
    );

    // B5. X-RateLimit-Limit correto (5)
    assert(
      resB6.headers.get("x-rateLimit-limit") === "5",
      "B5. Cabeçalho X-RateLimit-Limit reflete 5 tentativas",
      `Valor: ${resB6.headers.get("x-rateLimit-limit")}`
    );

    // B6. X-RateLimit-Remaining = 0 no bloqueio
    assert(
      resB6.headers.get("x-rateLimit-remaining") === "0",
      "B6. Cabeçalho X-RateLimit-Remaining indica 0"
    );

    // ========================================================================
    // GRUPO C — DELETE ACCOUNT RATE LIMIT (5 tentativas / 15 minutos)
    // ========================================================================
    console.log("\n--- GRUPO C: Delete Account Rate Limit ---");
    await resetRateLimit(aliceUser.id, "account-delete");
    bcryptCompareCalls = 0;

    // C1. Tentativas 1 a 5 permitidas pelo rate limiter
    for (let i = 1; i <= 5; i++) {
      const reqC = makeRequest(
        "https://qrmasterdigital.com/api/auth/delete-account",
        aliceSession.token,
        {
          password: `SenhaIncorretaDelete_${i}`,
          confirmationText: "EXCLUIR",
        }
      );
      const resC = await deleteAccountRoute(reqC);
      assert(
        resC.status === 400,
        `C1.${i}. Tentativa ${i}/5 de exclusão aceita pelo rate limiter (falha de senha com HTTP 400)`
      );
    }

    assert(
      bcryptCompareCalls === 5,
      "C1.total. Exatamente 5 chamadas a bcrypt.compare executadas para as 5 tentativas de exclusão"
    );

    // C2. 6ª tentativa: HTTP 429
    const callsBeforeDelete6th = bcryptCompareCalls;
    const reqC6 = makeRequest(
      "https://qrmasterdigital.com/api/auth/delete-account",
      aliceSession.token,
      {
        password: "SenhaIncorretaDelete_6",
        confirmationText: "EXCLUIR",
      }
    );
    const resC6 = await deleteAccountRoute(reqC6);
    const bodyC6 = await resC6.json();

    assert(resC6.status === 429, "C2. 6ª tentativa de exclusão é bloqueada com HTTP 429 Too Many Requests");
    assert(bodyC6.code === "RATE_LIMITED", "C2.1. Payload JSON contém code = 'RATE_LIMITED'");

    // C3. bcrypt.compare NÃO executado na tentativa bloqueada
    assert(
      bcryptCompareCalls === callsBeforeDelete6th,
      "C3. Tentativa bloqueada de exclusão NÃO executa bcrypt.compare",
      `Chamadas adicionais: ${bcryptCompareCalls - callsBeforeDelete6th}`
    );

    // C4. Retry-After presente
    const retryAfterC = resC6.headers.get("retry-after");
    assert(
      Boolean(retryAfterC && Number(retryAfterC) > 0),
      "C4. Cabeçalho Retry-After presente e maior que zero na exclusão",
      `Valor: ${retryAfterC}`
    );

    // C5. Headers de rate limit consistentes
    assert(
      resC6.headers.get("x-rateLimit-limit") === "5",
      "C5.1. X-RateLimit-Limit indica 5"
    );
    assert(
      resC6.headers.get("x-rateLimit-remaining") === "0",
      "C5.2. X-RateLimit-Remaining indica 0"
    );

    // ========================================================================
    // GRUPO D — ISOLAMENTO MULTI-TENANT (Alice vs Bob)
    // ========================================================================
    console.log("\n--- GRUPO D: Isolamento Multi-Tenant ---");
    // Alice está bloqueada em password-change e account-delete
    const reqAliceBlocked = makeRequest(
      "https://qrmasterdigital.com/api/auth/password",
      aliceSession.token,
      {
        currentPassword: "qualquer",
        newPassword: "NovaSenha123",
        confirmPassword: "NovaSenha123",
      }
    );
    const resAliceBlocked = await passwordRoute(reqAliceBlocked);
    assert(resAliceBlocked.status === 429, "D1. Alice permanece bloqueada com HTTP 429");

    // Bob tenta alterar senha pela primeira vez: deve ser aceito pelo rate limiter
    await resetRateLimit(bobUser.id, "password-change");
    const reqBob = makeRequest(
      "https://qrmasterdigital.com/api/auth/password",
      bobSession.token,
      {
        currentPassword: "SenhaIncorretaDoBob",
        newPassword: "NovaSenha123",
        confirmPassword: "NovaSenha123",
      }
    );
    const resBob = await passwordRoute(reqBob);
    assert(
      resBob.status === 400,
      "D2. Bob continua autorizado pelo rate limiter enquanto Alice está bloqueada (recebe 400 por senha)"
    );

    // Alice tenta injetar userId de Bob no body
    const reqAliceSpoof = makeRequest(
      "https://qrmasterdigital.com/api/auth/password",
      aliceSession.token,
      {
        userId: bobUser.id,
        email: bobUser.email,
        currentPassword: "qualquer",
        newPassword: "NovaSenha123",
        confirmPassword: "NovaSenha123",
      }
    );
    const resAliceSpoof = await passwordRoute(reqAliceSpoof);
    assert(
      resAliceSpoof.status === 429,
      "D3. Alice não contorna bloqueio injetando dados de Bob no body (HTTP 429 mantido)"
    );

    // Bob permanece intacto
    const reqBob2 = makeRequest(
      "https://qrmasterdigital.com/api/auth/password",
      bobSession.token,
      {
        currentPassword: "SenhaIncorretaDoBob2",
        newPassword: "NovaSenha123",
        confirmPassword: "NovaSenha123",
      }
    );
    const resBob2 = await passwordRoute(reqBob2);
    assert(resBob2.status === 400, "D4. Bob não sofreu contaminação cruzada por spoofing de Alice");

    // ========================================================================
    // GRUPO E — ISOLAMENTO ENTRE BUCKETS
    // ========================================================================
    console.log("\n--- GRUPO E: Isolamento entre Buckets ---");
    // Charlie: resetar ambos os buckets
    await resetRateLimit(charlieUser.id, "password-change");
    await resetRateLimit(charlieUser.id, "account-delete");

    // 1. Esgotar password-change de Charlie
    for (let i = 1; i <= 5; i++) {
      await checkRateLimit(charlieUser.id, "password-change");
    }
    const checkPwCharlie = await checkRateLimit(charlieUser.id, "password-change");
    assert(!checkPwCharlie.allowed, "E1. Bucket password-change de Charlie está esgotado (allowed: false)");

    // 2. Confirmar que account-delete de Charlie CONTINUA DISPONÍVEL
    const checkDelCharlie = await checkRateLimit(charlieUser.id, "account-delete");
    assert(
      checkDelCharlie.allowed,
      "E2. Bucket account-delete de Charlie continua DISPONÍVEL após esgotamento de password-change"
    );

    // 3. Esgotar account-delete de Charlie e confirmar que checkout, upload, category, campaign não foram afetados
    for (let i = 1; i <= 5; i++) {
      await checkRateLimit(charlieUser.id, "account-delete");
    }
    const checkDelCharlieBlocked = await checkRateLimit(charlieUser.id, "account-delete");
    assert(!checkDelCharlieBlocked.allowed, "E3. Bucket account-delete de Charlie agora está esgotado");

    const checkCheckout = await checkRateLimit(charlieUser.id, "checkout");
    assert(checkCheckout.allowed, "E4. Bucket checkout não sofreu interferência de password-change / account-delete");

    const checkCategory = await checkRateLimit(charlieUser.id, "category");
    assert(checkCategory.allowed, "E5.1. Bucket category não sofreu interferência");

    const checkCampaign = await checkRateLimit(charlieUser.id, "campaign");
    assert(checkCampaign.allowed, "E5.2. Bucket campaign não sofreu interferência");

    // ========================================================================
    // GRUPO F — EXPIRAÇÃO DE JANELA
    // ========================================================================
    console.log("\n--- GRUPO F: Expiração de Janela ---");
    const testExpUser = "test-expiration-user-123";
    const nowMs = 1700000000000;

    // 1. Esgota 5 tentativas no momento nowMs
    for (let i = 1; i <= 5; i++) {
      const res = checkRateLimitLocal(testExpUser, "password-change", nowMs);
      assert(res.allowed, `F1.${i}. Tentativa ${i}/5 permitida no timestamp base`);
    }

    // 6ª tentativa no mesmo instante deve ser bloqueada
    const resBlocked = checkRateLimitLocal(testExpUser, "password-change", nowMs);
    assert(!resBlocked.allowed, "F2. 6ª tentativa no mesmo instante é bloqueada com allowed: false");

    // 2. Simula passagem de 5 minutos + 1 segundo (301 segundos)
    const futureMs = nowMs + 301 * 1000;
    const resAfterExpiry = checkRateLimitLocal(testExpUser, "password-change", futureMs);
    assert(
      resAfterExpiry.allowed,
      "F3. Nova tentativa permitida imediatamente após expiração da janela (5 minutos)",
      `Allowed: ${resAfterExpiry.allowed}`
    );

    // 3. Teste análogo para account-delete (janela de 15 minutos = 900s)
    for (let i = 1; i <= 5; i++) {
      checkRateLimitLocal(testExpUser, "account-delete", nowMs);
    }
    const resDelBlocked = checkRateLimitLocal(testExpUser, "account-delete", nowMs);
    assert(!resDelBlocked.allowed, "F4.1. 6ª tentativa de account-delete bloqueada");

    const futureDelMs = nowMs + 901 * 1000;
    const resDelAfterExpiry = checkRateLimitLocal(testExpUser, "account-delete", futureDelMs);
    assert(
      resDelAfterExpiry.allowed,
      "F4.2. account-delete volta a ser permitido após 15 minutos e 1 segundo"
    );

    // ========================================================================
    // GRUPO G — RESILIÊNCIA FAIL-CLOSED (FALLBACK LOCAL)
    // ========================================================================
    console.log("\n--- GRUPO G: Resiliência Fail-Closed (Fallback Local) ---");
    const failClosedUserId = "fail-closed-test-user-999";

    // Simulação determinística do fallback local
    for (let i = 1; i <= 5; i++) {
      const fallbackRes = checkRateLimitLocal(failClosedUserId, "password-change");
      assert(fallbackRes.allowed, `G1.${i}. Fallback local autoriza tentativa ${i}/5`);
    }

    const fallback6th = checkRateLimitLocal(failClosedUserId, "password-change");
    assert(!fallback6th.allowed, "G2. Fallback local bloqueia 6ª tentativa com allowed: false (Zero Fail-Open)");
    assert(fallback6th.remaining === 0, "G3. Fallback local remaining === 0");
    assert(fallback6th.retryAfter > 0, "G4. Fallback local retryAfter > 0");

    // ========================================================================
    // GRUPO H — ANTI-SPOOFING
    // ========================================================================
    console.log("\n--- GRUPO H: Anti-Spoofing ---");
    // Alice tenta enviar requisições com campos forjados
    const spoofPayloads = [
      { userId: "fake_id_12345" },
      { email: "admin@qrmasterdigital.com" },
      { sessionId: "fake_session_token" },
      { role: "ADMIN", admin: true },
    ];

    for (let i = 0; i < spoofPayloads.length; i++) {
      const payload = spoofPayloads[i];
      const reqSpoof = makeRequest(
        "https://qrmasterdigital.com/api/auth/password",
        aliceSession.token,
        {
          ...payload,
          currentPassword: "any",
          newPassword: "NewPassword123",
          confirmPassword: "NewPassword123",
        }
      );
      const resSpoof = await passwordRoute(reqSpoof);
      assert(
        resSpoof.status === 429,
        `H1.${i + 1}. Payload com campos forjados (${Object.keys(payload).join(",")}) continua bloqueado com HTTP 429`
      );
    }

    console.log("\n==========================================================================");
    console.log(`  TOTAL DE ASSERÇÕES: ${totalAsserts}`);
    console.log(`  APROVADAS:          ${passedAsserts}`);
    console.log(`  FALHAS:             ${failedAsserts}`);
    console.log("==========================================================================");

    if (failedAsserts > 0) {
      process.exit(1);
    }
  } finally {
    // Restaura o método original de bcrypt.compare
    bcrypt.compare = originalBcryptCompare;
  }
}

runTestSuite().catch((err) => {
  console.error("Erro fatal na execução da suíte:", err);
  process.exit(1);
});
