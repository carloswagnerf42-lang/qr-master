import { prisma } from "../src/lib/db";
import { POST as mpCheckoutRoute } from "../src/app/api/billing/mercadopago/checkout/route";
import { POST as standardCheckoutRoute } from "../src/app/api/billing/checkout/route";
import { createAuthenticatedSessionToken } from "../src/lib/auth";
import {
  checkRateLimit,
  resetRateLimit,
  checkRateLimitLocal,
  RATE_LIMIT_CONFIGS,
} from "../src/lib/rate-limit";
import { NextRequest } from "next/server";

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

function makeCheckoutRequest(
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
  console.log("  SUÍTE DE TESTES: SECURITY-HARD-04A — RATE LIMIT MERCADO PAGO CHECKOUT");
  console.log("==========================================================================\n");

  // Garante que o ambiente de teste possua mock token do MP configurado
  process.env.MP_ACCESS_TOKEN = "TEST_MOCK_MP_ACCESS_TOKEN_FOR_RATE_LIMIT_SUITE_12345";

  // Tracker para contabilizar rigorosamente qualquer chamada à API do Mercado Pago
  const tracker = {
    mpCalls: [] as { url: string; method: string; body?: any }[],
  };

  const originalFetch = global.fetch;

  // Interceptador e Mock Estrito da API do Mercado Pago (Segurança Financeira Absoluta)
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as any)?.url || "";

    if (urlStr.includes("api.mercadopago.com")) {
      const method = (init?.method || "GET").toUpperCase();
      let parsedBody: any = null;
      if (init?.body && typeof init.body === "string") {
        try {
          parsedBody = JSON.parse(init.body);
        } catch {
          parsedBody = init.body;
        }
      }

      tracker.mpCalls.push({ url: urlStr, method, body: parsedBody });

      // Se for criação de preferência (checkout)
      if (urlStr.includes("/checkout/preferences")) {
        return new Response(
          JSON.stringify({
            id: `mock_pref_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=mock",
            sandbox_init_point: "https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=mock",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Se for pagamento Pix direto
      if (urlStr.includes("/v1/payments")) {
        return new Response(
          JSON.stringify({
            id: 999999000 + tracker.mpCalls.length,
            status: "pending",
            status_detail: "pending_waiting_transfer",
            point_of_interaction: {
              transaction_data: {
                qr_code: "00020126580014br.gov.bcb.pix0136mock-pix-key-test-rate-limit-52040000",
                qr_code_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
                ticket_url: "https://www.mercadopago.com.br/payments/999999000/ticket",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Chamadas a outros serviços (ex: Upstash Redis) usam o fetch original com binding correto
    return Reflect.apply(originalFetch, globalThis, [input, init]);
  };

  try {
    // Setup de usuários de teste isolados
    const aliceUser = await prisma.user.upsert({
      where: { email: "alice_mp_checkout_test@internal.test" },
      create: {
        id: "usr_alice_mp_rl_test",
        name: "Alice MP RL Test",
        email: "alice_mp_checkout_test@internal.test",
        role: "USER",
      },
      update: { role: "USER" },
    });

    const bobUser = await prisma.user.upsert({
      where: { email: "bob_mp_checkout_test@internal.test" },
      create: {
        id: "usr_bob_mp_rl_test",
        name: "Bob MP RL Test",
        email: "bob_mp_checkout_test@internal.test",
        role: "USER",
      },
      update: { role: "USER" },
    });

    const charlieUser = await prisma.user.upsert({
      where: { email: "charlie_mp_checkout_test@internal.test" },
      create: {
        id: "usr_charlie_mp_rl_test",
        name: "Charlie MP RL Test",
        email: "charlie_mp_checkout_test@internal.test",
        role: "USER",
      },
      update: { role: "USER" },
    });

    // Cria tokens de sessão autenticados
    const { token: aliceToken } = await createAuthenticatedSessionToken({
      id: aliceUser.id,
      name: aliceUser.name,
      email: aliceUser.email,
      role: aliceUser.role,
    });

    const { token: bobToken } = await createAuthenticatedSessionToken({
      id: bobUser.id,
      name: bobUser.name,
      email: bobUser.email,
      role: bobUser.role,
    });

    const { token: charlieToken } = await createAuthenticatedSessionToken({
      id: charlieUser.id,
      name: charlieUser.name,
      email: charlieUser.email,
      role: charlieUser.role,
    });

    // ========================================================================
    // TESTE A: Usuário Anônimo (Não Autenticado)
    // ========================================================================
    console.log("--- TESTE A: Usuário Anônimo (Sem Autenticação) ---");
    tracker.mpCalls = [];

    const unauthReq = makeCheckoutRequest(
      "http://localhost:3000/api/billing/mercadopago/checkout",
      null,
      { planName: "PRO", paymentMethod: "checkout" }
    );
    const unauthRes = await mpCheckoutRoute(unauthReq);
    assert(unauthRes.status === 401, "A1. POST /api/billing/mercadopago/checkout sem sessão retorna HTTP 401");
    const unauthData = await unauthRes.json();
    assert(unauthData.error === "Não autenticado.", "A2. Mensagem de erro é 'Não autenticado.'");
    assert(tracker.mpCalls.length === 0, "A3. ZERO chamadas à API do Mercado Pago na requisição anônima");

    // ========================================================================
    // TESTE B: Requisições Dentro do Limite (1 a 15)
    // ========================================================================
    console.log("\n--- TESTE B: Requisições Dentro do Limite (1 a 15) ---");
    await resetRateLimit(aliceUser.id, "checkout");
    tracker.mpCalls = [];

    const maxAttempts = RATE_LIMIT_CONFIGS.checkout.maxAttempts; // 15
    assert(maxAttempts === 15, `B0. Limite do bucket 'checkout' configurado como ${maxAttempts} requisições`);
    assert(RATE_LIMIT_CONFIGS.checkout.windowSeconds === 600, "B0. Janela do bucket 'checkout' configurada como 600s (10 minutos)");

    const proPlan = await prisma.plan.upsert({
      where: { name: "PRO" },
      create: {
        name: "PRO",
        displayName: "Plano Pro",
        priceMonth: 29,
        priceYear: 290,
        maxQRCodes: 15,
      },
      update: {},
    });

    let allAllowed = true;
    for (let i = 1; i <= maxAttempts; i++) {
      const req = makeCheckoutRequest(
        "http://localhost:3000/api/billing/mercadopago/checkout",
        aliceToken,
        { planName: "PRO", paymentMethod: "checkout", billingCycle: "month" }
      );
      const res = await mpCheckoutRoute(req);
      if (res.status !== 200) {
        allAllowed = false;
        console.error(`    Falha na tentativa ${i}: status ${res.status}`);
      } else {
        process.stdout.write(`.`);
      }
    }
    console.log("");
    assert(allAllowed, "B1. Requisições 1 até 15 de Alice autorizadas com HTTP 200");
    assert(tracker.mpCalls.length === 15, "B2. Exatamente 15 chamadas capturadas pelo mock do Mercado Pago");

    // ========================================================================
    // TESTE C: 16ª Requisição (Bloqueio por Rate Limit)
    // ========================================================================
    console.log("\n--- TESTE C: 16ª Requisição (Bloqueio com HTTP 429) ---");
    const callsBefore16 = tracker.mpCalls.length;

    const req16 = makeCheckoutRequest(
      "http://localhost:3000/api/billing/mercadopago/checkout",
      aliceToken,
      { planName: "PRO", paymentMethod: "checkout", billingCycle: "month" }
    );
    const res16 = await mpCheckoutRoute(req16);

    assert(res16.status === 429, "C1. 16ª requisição de Alice é bloqueada com HTTP 429 Too Many Requests");
    const body16 = await res16.json();
    assert(body16.code === "RATE_LIMITED", "C2. Payload contém code = 'RATE_LIMITED'");
    assert(typeof body16.retryAfter === "number" && body16.retryAfter > 0, "C3. retryAfter informado e maior que zero");
    assert(res16.headers.get("Retry-After") !== null, "C4. Cabeçalho HTTP Retry-After está presente");
    assert(res16.headers.get("X-RateLimit-Limit") === "15", "C5. Cabeçalho X-RateLimit-Limit reflete 15");
    assert(res16.headers.get("X-RateLimit-Remaining") === "0", "C6. Cabeçalho X-RateLimit-Remaining indica 0");
    assert(
      tracker.mpCalls.length === callsBefore16,
      "C7. CRÍTICO: ZERO chamadas adicionais ao Mercado Pago na 16ª requisição bloqueada"
    );

    // ========================================================================
    // TESTE D: Isolamento Multi-Tenant (Alice Bloqueada vs Bob Livre)
    // ========================================================================
    console.log("\n--- TESTE D: Isolamento Multi-Tenant (Alice vs Bob) ---");
    await resetRateLimit(bobUser.id, "checkout");
    const callsBeforeBob = tracker.mpCalls.length;

    // Bob faz checkout
    const reqBob = makeCheckoutRequest(
      "http://localhost:3000/api/billing/mercadopago/checkout",
      bobToken,
      { planName: "BUSINESS", paymentMethod: "checkout", billingCycle: "year" }
    );
    const resBob = await mpCheckoutRoute(reqBob);
    assert(resBob.status === 200, "D1. Bob continua autorizado com HTTP 200 enquanto Alice está bloqueada");
    assert(
      tracker.mpCalls.length === callsBeforeBob + 1,
      "D2. Chamada de Bob ao Mercado Pago foi processada com sucesso"
    );

    // Alice tenta novamente e continua bloqueada
    while ((await checkRateLimit(aliceUser.id, "checkout")).allowed) {}
    const reqAliceAgain = makeCheckoutRequest(
      "http://localhost:3000/api/billing/mercadopago/checkout",
      aliceToken,
      { planName: "PRO", paymentMethod: "checkout" }
    );
    const resAliceAgain = await mpCheckoutRoute(reqAliceAgain);
    assert(resAliceAgain.status === 429, "D3. Alice permanece estritamente bloqueada com HTTP 429");
    assert(
      tracker.mpCalls.length === callsBeforeBob + 1,
      "D4. Nova tentativa bloqueada de Alice NÃO realizou chamada externa"
    );

    // ========================================================================
    // TESTE E: Anti-Spoofing (Payload Não Consegue Alterar a Chave de Rate Limit)
    // ========================================================================
    console.log("\n--- TESTE E: Anti-Spoofing (Identificador Server-Side) ---");
    while ((await checkRateLimit(aliceUser.id, "checkout")).allowed) {}
    const callsBeforeSpoof = tracker.mpCalls.length;

    // Alice envia no payload dados forjados para tentar se passar por Bob ou outro ID
    const reqSpoof = makeCheckoutRequest(
      "http://localhost:3000/api/billing/mercadopago/checkout",
      aliceToken,
      {
        userId: bobUser.id,
        sessionId: "fake_session_123",
        email: "bob_mp_checkout_test@internal.test",
        planName: "PRO",
        paymentMethod: "checkout",
      }
    );
    const resSpoof = await mpCheckoutRoute(reqSpoof);
    assert(
      resSpoof.status === 429,
      "E1. Alice não contorna o bloqueio injetando userId/sessionId/email no body (HTTP 429 mantido)"
    );
    assert(
      tracker.mpCalls.length === callsBeforeSpoof,
      "E2. Nenhuma chamada externa ao Mercado Pago na tentativa de spoofing"
    );

    // ========================================================================
    // TESTE F: Comportamento Compartilhado do Bucket 'checkout'
    // ========================================================================
    console.log("\n--- TESTE F: Bucket Compartilhado entre /api/billing/checkout e /api/billing/mercadopago/checkout ---");
    await resetRateLimit(charlieUser.id, "checkout");

    // Charlie consome 10 tentativas via checkout padrão
    for (let i = 1; i <= 10; i++) {
      await checkRateLimit(charlieUser.id, "checkout");
    }

    // Charlie agora consome 5 tentativas via /api/billing/mercadopago/checkout (atinge exatamente 15)
    for (let i = 11; i <= 15; i++) {
      const resCharlieMp = await mpCheckoutRoute(
        makeCheckoutRequest(
          "http://localhost:3000/api/billing/mercadopago/checkout",
          charlieToken,
          { planName: "PRO", paymentMethod: "checkout" }
        )
      );
      assert(resCharlieMp.status === 200, `F1.${i}. Tentativa ${i}/15 de Charlie aceita`);
    }

    // 16ª tentativa de Charlie em /api/billing/mercadopago/checkout deve ser bloqueada
    const resCharlieBlockedMp = await mpCheckoutRoute(
      makeCheckoutRequest(
        "http://localhost:3000/api/billing/mercadopago/checkout",
        charlieToken,
        { planName: "PRO", paymentMethod: "checkout" }
      )
    );
    assert(
      resCharlieBlockedMp.status === 429,
      "F2. 16ª tentativa de Charlie em /api/billing/mercadopago/checkout é bloqueada com 429"
    );

    // 17ª tentativa de Charlie em /api/billing/checkout também deve ser bloqueada pelo mesmo bucket
    const resCharlieBlockedStandard = await standardCheckoutRoute(
      makeCheckoutRequest(
        "http://localhost:3000/api/billing/checkout",
        charlieToken,
        { planName: "PRO", gateway: "mercadopago" }
      )
    );
    assert(
      resCharlieBlockedStandard.status === 429,
      "F3. Tentativa cruzada de Charlie em /api/billing/checkout também é bloqueada com 429 (Bucket Compartilhado)"
    );

    // ========================================================================
    // TESTE G: Resiliência Fail-Closed e Fallback Local
    // ========================================================================
    console.log("\n--- TESTE G: Resiliência Fail-Closed (Fallback Local em Memória) ---");
    const testLocalId = "test_fail_closed_checkout_local";
    await resetRateLimit(testLocalId, "checkout");

    for (let i = 1; i <= 15; i++) {
      const r = checkRateLimitLocal(testLocalId, "checkout");
      assert(r.allowed, `G1.${i}. Fallback local autoriza tentativa ${i}/15`);
    }

    const r16Local = checkRateLimitLocal(testLocalId, "checkout");
    assert(!r16Local.allowed, "G2. Fallback local bloqueia 16ª tentativa fail-closed");
    assert(r16Local.remaining === 0, "G3. Fallback local remaining === 0");
    assert(r16Local.retryAfter > 0, "G4. Fallback local retryAfter > 0");

  } finally {
    // Restaura o fetch original do Node
    global.fetch = originalFetch;

    // Limpeza de usuários de teste e sessões
    await prisma.session.deleteMany({
      where: {
        userId: { in: ["usr_alice_mp_rl_test", "usr_bob_mp_rl_test", "usr_charlie_mp_rl_test"] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: ["usr_alice_mp_rl_test", "usr_bob_mp_rl_test", "usr_charlie_mp_rl_test"] },
      },
    });

    await resetRateLimit("usr_alice_mp_rl_test", "checkout");
    await resetRateLimit("usr_bob_mp_rl_test", "checkout");
    await resetRateLimit("usr_charlie_mp_rl_test", "checkout");
  }

  console.log("\n==========================================================================");
  console.log(`  TOTAL DE ASSERÇÕES: ${totalAsserts}`);
  console.log(`  APROVADAS:          ${passedAsserts}`);
  console.log(`  FALHAS:             ${failedAsserts}`);
  console.log("==========================================================================");

  if (failedAsserts > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Erro fatal na execução da suíte:", err);
  process.exit(1);
});
