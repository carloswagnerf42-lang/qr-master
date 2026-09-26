/**
 * SECURITY-AUTH-08B: Suíte de Testes Anti-Enumeração de Contas no Login Tradicional
 *
 * Neutraliza o achado SEC-AUDIT-08-001:
 * "Enumeração de Usuários Cadastrados com Google na Rota de Login Tradicional"
 *
 * Comprova que a resposta pública de falha de autenticação tradicional é
 * estritamente indistinguível entre:
 * 1. E-mail inexistente
 * 2. Conta tradicional com senha incorreta
 * 3. Conta Google-only (passwordHash === null)
 *
 * Verificando:
 * - Mesmo HTTP Status (401)
 * - Mesmo JSON retornado ({ error: "Credenciais inválidas. Verifique seu e-mail e senha." })
 * - Mesma mensagem pública de erro
 * - Ausência de termos reveladores ("Google", "cadastrada", "cadastrado", "conta existe", etc.)
 * - Ausência de criação de Session server-side em caso de falha
 * - Criação correta de Session server-side e sucesso (200) em login válido
 */

export {};

const asyncHooks = require("async_hooks");
(globalThis as any).AsyncLocalStorage = asyncHooks.AsyncLocalStorage;

const { requestAsyncStorage } = require("next/dist/client/components/request-async-storage.external");
const { RequestCookies } = require("next/dist/compiled/@edge-runtime/cookies");
const { NextRequest } = require("next/server");
const { prisma } = require("../src/lib/db");
const { hashPassword, DUMMY_PASSWORD_HASH } = require("../src/lib/auth");
const { resetRateLimit } = require("../src/lib/rate-limit");
const bcrypt = require("bcryptjs");
const { POST } = require("../src/app/api/auth/login/route") as {
  POST: (req: any) => Promise<{ status: number; json: () => Promise<any> }>;
};

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` - ${detail}` : ""}`);
    failedCount++;
  }
}

async function executeInRequestContext<T>(fn: () => Promise<T>): Promise<T> {
  const headers = new Headers();
  const mutableCookies = new RequestCookies(headers);
  return requestAsyncStorage.run(
    { mutableCookies, cookies: mutableCookies },
    fn
  );
}

async function runTestSuite() {
  console.log("================================================================");
  console.log("🛡️ SECURITY-AUTH-08B: SUÍTE DE TESTES ANTI-ENUMERAÇÃO NO LOGIN");
  console.log("================================================================\n");

  const timestamp = Date.now();
  const testPassword = "ValidTestPassword123!";
  const testWrongPassword = "CompletelyWrongPassword999!";

  const traditionalEmail = `test_trad_${timestamp}@test.qrmasterdigital.com`;
  const googleEmail = `test_google_${timestamp}@test.qrmasterdigital.com`;
  const nonexistentEmail = `test_nonexistent_${timestamp}@test.qrmasterdigital.com`;

  let traditionalUserId: string | null = null;
  let googleUserId: string | null = null;

  try {
    // 0. Preparação dos dados de teste
    console.log("▶ Configurando usuários de teste...");
    const hashedPassword = await hashPassword(testPassword);

    const traditionalUser = await prisma.user.create({
      data: {
        name: "Test Traditional User",
        email: traditionalEmail,
        passwordHash: hashedPassword,
        role: "USER",
      },
    });
    traditionalUserId = traditionalUser.id;

    const googleUser = await prisma.user.create({
      data: {
        name: "Test Google User",
        email: googleEmail,
        passwordHash: null, // Conta Google-only sem senha local
        role: "USER",
      },
    });
    googleUserId = googleUser.id;

    console.log(`  ✓ Usuário tradicional criado: ${traditionalEmail} (id: ${traditionalUserId})`);
    console.log(`  ✓ Usuário Google-only criado: ${googleEmail} (id: ${googleUserId}, passwordHash: null)\n`);

    // ========================================================================
    // TESTE 1: E-mail inexistente + senha qualquer -> falha de autenticação
    // ========================================================================
    console.log("▶ TESTE 1: E-mail inexistente com senha qualquer");
    const ipTest1 = `192.168.10.${timestamp % 250}`;
    await resetRateLimit(ipTest1, "login");

    const req1 = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ipTest1,
      },
      body: JSON.stringify({
        email: nonexistentEmail,
        password: testWrongPassword,
      }),
    });

    const res1 = await executeInRequestContext(() => POST(req1));
    const body1 = await res1.json();

    assert(res1.status === 401, "1.1. E-mail inexistente retorna HTTP 401");
    assert(
      body1.error === "Credenciais inválidas. Verifique seu e-mail e senha.",
      "1.2. E-mail inexistente retorna mensagem genérica padrão de credenciais inválidas",
      JSON.stringify(body1)
    );

    // ========================================================================
    // TESTE 2: Conta tradicional existente + senha incorreta -> falha
    // ========================================================================
    console.log("\n▶ TESTE 2: Conta tradicional existente com senha incorreta");
    const ipTest2 = `192.168.11.${timestamp % 250}`;
    await resetRateLimit(ipTest2, "login");

    const req2 = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ipTest2,
      },
      body: JSON.stringify({
        email: traditionalEmail,
        password: testWrongPassword,
      }),
    });

    const res2 = await executeInRequestContext(() => POST(req2));
    const body2 = await res2.json();

    assert(res2.status === 401, "2.1. Senha incorreta retorna HTTP 401");
    assert(
      body2.error === "Credenciais inválidas. Verifique seu e-mail e senha.",
      "2.2. Senha incorreta retorna mensagem genérica padrão de credenciais inválidas",
      JSON.stringify(body2)
    );

    // ========================================================================
    // TESTE 3: Conta Google-only existente (passwordHash === null) -> falha
    // ========================================================================
    console.log("\n▶ TESTE 3: Conta Google-only existente (passwordHash === null)");
    const ipTest3 = `192.168.12.${timestamp % 250}`;
    await resetRateLimit(ipTest3, "login");

    const req3 = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ipTest3,
      },
      body: JSON.stringify({
        email: googleEmail,
        password: testWrongPassword,
      }),
    });

    const res3 = await executeInRequestContext(() => POST(req3));
    const body3 = await res3.json();

    assert(res3.status === 401, "3.1. Conta Google-only retorna HTTP 401 (não 400)");
    assert(
      body3.error === "Credenciais inválidas. Verifique seu e-mail e senha.",
      "3.2. Conta Google-only retorna mensagem genérica de credenciais inválidas",
      JSON.stringify(body3)
    );

    // ========================================================================
    // TESTE 4: Comparação estrita de respostas (TESTE 1 == TESTE 2 == TESTE 3)
    // ========================================================================
    console.log("\n▶ TESTE 4 (OBRIGATÓRIO): Comparação de Indistinguibilidade das Respostas");
    assert(
      res1.status === res2.status && res2.status === res3.status,
      "4.1. HTTP Status idêntico nos 3 cenários (401 === 401 === 401)"
    );
    assert(
      body1.error === body2.error && body2.error === body3.error,
      "4.2. Campo 'error' rigorosamente idêntico nos 3 cenários"
    );
    assert(
      JSON.stringify(body1) === JSON.stringify(body2) && JSON.stringify(body2) === JSON.stringify(body3),
      "4.3. Payload JSON completo rigorosamente idêntico nos 3 cenários"
    );

    // ========================================================================
    // TESTE 5: Conta tradicional + senha correta -> login funciona
    // ========================================================================
    console.log("\n▶ TESTE 5: Conta tradicional existente com senha correta");
    const ipTest5 = `192.168.13.${timestamp % 250}`;
    await resetRateLimit(ipTest5, "login");

    const req5 = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ipTest5,
        "user-agent": "AntiEnumTestSuite/1.0",
      },
      body: JSON.stringify({
        email: traditionalEmail,
        password: testPassword,
      }),
    });

    const res5 = await executeInRequestContext(() => POST(req5));
    const body5 = await res5.json();

    assert(res5.status === 200, "5.1. Login com credenciais válidas retorna HTTP 200");
    assert(body5.success === true, "5.2. Login com credenciais válidas retorna success: true");
    assert(body5.user?.id === traditionalUserId, "5.3. Objeto user retornado corresponde ao usuário logado");

    // ========================================================================
    // TESTE 6: Falhas de autenticação NÃO criam Session server-side
    // ========================================================================
    console.log("\n▶ TESTE 6: Validação de que falhas NÃO criam Session server-side");
    const googleSessionsCount = await prisma.session.count({
      where: { userId: googleUserId },
    });
    assert(
      googleSessionsCount === 0,
      "6.1. Tentativa de login tradicional em conta Google-only NÃO criou Session no banco"
    );

    // ========================================================================
    // TESTE 7: Login válido cria Session server-side normalmente
    // ========================================================================
    console.log("\n▶ TESTE 7: Validação de criação de Session server-side no login válido");
    const tradSessionsCount = await prisma.session.count({
      where: { userId: traditionalUserId },
    });
    assert(
      tradSessionsCount >= 1,
      `7.1. Login válido criou registro Session server-side (encontrado: ${tradSessionsCount})`
    );

    // ========================================================================
    // TESTE 8: Ausência absoluta de termos reveladores nas mensagens de erro
    // ========================================================================
    console.log("\n▶ TESTE 8: Auditoria léxica contra vazamento de termos reveladores");
    const forbiddenPatterns = [
      /\bgoogle\b/i,
      /\bcadastrad[ao]\b/i,
      /\bconta\s+existe\b/i,
      /\busu[aá]rio\s+existe\b/i,
      /\bencontrad[ao]\b/i,
      /\brecupere\s+sua\s+senha\b/i,
      /\bcontinuar\s+com\s+google\b/i,
    ];

    const errorBodies = [body1, body2, body3];
    let leakyWordFound = false;

    for (let i = 0; i < errorBodies.length; i++) {
      const jsonStr = JSON.stringify(errorBodies[i]);
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(jsonStr)) {
          console.error(`  ✗ Termo revelador detectado no cenário ${i + 1}: ${pattern} em ${jsonStr}`);
          leakyWordFound = true;
        }
      }
    }

    assert(
      !leakyWordFound,
      "8.1. Nenhuma resposta de falha contém termos que revelem cadastro ('Google', 'cadastrada', 'conta existe', etc.)"
    );

    // ========================================================================
    // TESTE 9: Conta com passwordHash vazio ("")
    // ========================================================================
    console.log("\n▶ TESTE 9: Conta com passwordHash vazio (\"\")");
    const emptyHashEmail = `test_empty_${timestamp}@test.qrmasterdigital.com`;
    const emptyHashUser = await prisma.user.create({
      data: {
        name: "Test Empty Hash User",
        email: emptyHashEmail,
        passwordHash: "",
        role: "USER",
      },
    });

    const ipTest9 = `192.168.19.${timestamp % 250}`;
    await resetRateLimit(ipTest9, "login");

    const req9 = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ipTest9,
      },
      body: JSON.stringify({
        email: emptyHashEmail,
        password: testWrongPassword,
      }),
    });

    const res9 = await executeInRequestContext(() => POST(req9));
    const body9 = await res9.json();

    assert(res9.status === 401, "9.1. Conta com passwordHash vazio retorna HTTP 401");
    assert(
      body9.error === "Credenciais inválidas. Verifique seu e-mail e senha.",
      "9.2. Conta com passwordHash vazio retorna mensagem de erro genérica"
    );

    const emptySessionsCount = await prisma.session.count({
      where: { userId: emptyHashUser.id },
    });
    assert(emptySessionsCount === 0, "9.3. Falha com passwordHash vazio NÃO cria Session no banco");

    // Limpa usuário do teste 9
    await prisma.user.delete({ where: { id: emptyHashUser.id } });

    // ========================================================================
    // TESTE 10: Auditoria Criptográfica de Invocação Uniforme (bcrypt.compare)
    // ========================================================================
    console.log("\n▶ TESTE 10: Auditoria de Invocação Criptográfica Uniforme (bcrypt.compare)");
    assert(
      DUMMY_PASSWORD_HASH.startsWith("$2a$10$") && DUMMY_PASSWORD_HASH.length === 60,
      "10.1. DUMMY_PASSWORD_HASH possui cost factor 10 ($2a$10$) e comprimento exato de 60 caracteres"
    );

    const originalBcryptCompare = bcrypt.compare;
    const interceptedCalls: { password: string; hash: string }[] = [];

    bcrypt.compare = async (password: string, hash: string) => {
      interceptedCalls.push({ password, hash });
      return originalBcryptCompare(password, hash);
    };

    try {
      // 10.A. Chamada com e-mail inexistente
      const ipSpyA = `192.168.30.${timestamp % 250}`;
      await resetRateLimit(ipSpyA, "login");
      const reqSpyA = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ipSpyA },
        body: JSON.stringify({ email: nonexistentEmail, password: testWrongPassword }),
      });
      await executeInRequestContext(() => POST(reqSpyA));

      // 10.B. Chamada com conta Google-only
      const ipSpyB = `192.168.31.${timestamp % 250}`;
      await resetRateLimit(ipSpyB, "login");
      const reqSpyB = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ipSpyB },
        body: JSON.stringify({ email: googleEmail, password: testWrongPassword }),
      });
      await executeInRequestContext(() => POST(reqSpyB));

      // 10.C. Chamada com conta tradicional e senha errada
      const ipSpyC = `192.168.32.${timestamp % 250}`;
      await resetRateLimit(ipSpyC, "login");
      const reqSpyC = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ipSpyC },
        body: JSON.stringify({ email: traditionalEmail, password: testWrongPassword }),
      });
      await executeInRequestContext(() => POST(reqSpyC));

      assert(
        interceptedCalls.length === 3,
        `10.2. bcrypt.compare foi executado exatamente 3 vezes (uma por cenário, obtido: ${interceptedCalls.length})`
      );

      assert(
        interceptedCalls[0]?.hash === DUMMY_PASSWORD_HASH,
        "10.3. Usuário inexistente executa bcrypt.compare contra DUMMY_PASSWORD_HASH (cost 10)"
      );

      assert(
        interceptedCalls[1]?.hash === DUMMY_PASSWORD_HASH,
        "10.4. Usuário Google-only executa bcrypt.compare contra DUMMY_PASSWORD_HASH (cost 10)"
      );

      assert(
        interceptedCalls[2]?.hash === hashedPassword,
        "10.5. Usuário tradicional executa bcrypt.compare contra o hash persistido real"
      );
    } finally {
      bcrypt.compare = originalBcryptCompare;
    }
  } finally {
    // Limpeza rigorosa e segura dos dados criados
    console.log("\n▶ Limpando dados de teste...");
    try {
      const idsToClean = [traditionalUserId, googleUserId].filter(Boolean) as string[];
      if (idsToClean.length > 0) {
        await prisma.activityLog.deleteMany({
          where: { userId: { in: idsToClean } },
        });
        await prisma.session.deleteMany({
          where: { userId: { in: idsToClean } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: idsToClean } },
        });
        console.log("  ✓ Limpeza concluída com sucesso.");
      }
    } catch (cleanupErr) {
      console.error("  ✗ Erro durante a limpeza de dados de teste:", cleanupErr);
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log("\n================================================================");
  console.log(`TOTAL: ${passedCount + failedCount} | PASS: ${passedCount} | FAIL: ${failedCount}`);
  console.log("================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Erro fatal durante execução da suíte:", err);
  process.exit(1);
});
