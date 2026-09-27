import { prisma } from "../src/lib/db";
import { POST as createCategoryRoute } from "../src/app/api/categories/route";
import { POST as createCampaignRoute } from "../src/app/api/campaigns/route";
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

function makeRequest(
  url: string,
  token: string | null,
  body: any,
  authMethod: "bearer" | "cookie" | "both" | "none" = "both"
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token && authMethod !== "none") {
    if (authMethod === "cookie" || authMethod === "both") {
      headers["cookie"] = `qrmaster_session=${token}`;
    }
    if (authMethod === "bearer" || authMethod === "both") {
      headers["authorization"] = `Bearer ${token}`;
    }
  }
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Auxiliar para esgotar deterministicamente os tokens de rate limit de um usuário.
 * Reseta o bucket para limpar tokens residuais em decaimento do bucket anterior e consome
 * rapidamente os tokens da janela atual via Promise.all concorrente (~150ms), seguido de
 * verificação sequencial com safety cap para confirmar que o limitador está bloqueado.
 */
async function exhaustTokens(userId: string, action: "category" | "campaign") {
  // Se restarem menos de 10 segundos na janela de 60s do Unix epoch,
  // aguarda a virada da janela para que exhaustTokens e as asserções subsequentes
  // operem com folga (>50s) no mesmo bloco temporal, garantindo requestsInCurrentWindow >= 20.
  const windowMs = 60000;
  const elapsed = Date.now() % windowMs;
  const remainingInWindow = windowMs - elapsed;
  if (remainingInWindow < 10000) {
    await new Promise((resolve) => setTimeout(resolve, remainingInWindow + 200));
  }

  await resetRateLimit(userId, action);

  const maxAttempts = RATE_LIMIT_CONFIGS[action].maxAttempts;
  await Promise.all(
    Array.from({ length: maxAttempts }, () => checkRateLimit(userId, action))
  );

  let blocked = false;
  for (let i = 1; i <= 5; i++) {
    const result = await checkRateLimit(userId, action);
    if (!result.allowed) {
      blocked = true;
      break;
    }
  }

  if (!blocked) {
    throw new Error(
      `Não foi possível esgotar deterministicamente o rate limit para action='${action}'`
    );
  }
}

/**
 * Garante tempo suficiente (runway) dentro da janela deslizante do Upstash (60s).
 * Se restarem menos de `minRunwayMs` na janela atual de 60 segundos do Unix epoch,
 * aguarda o início do próximo ciclo para garantir que todas as 20 asserções de contagem
 * ocorram dentro do mesmo bloco temporal, eliminando distorções por decaimento fracionário
 * (math.floor de token único na janela anterior).
 */
async function ensureWindowRunway(minRunwayMs = 15000) {
  const windowMs = 60000;
  const elapsedInWindow = Date.now() % windowMs;
  const remainingInWindow = windowMs - elapsedInWindow;
  if (remainingInWindow < minRunwayMs) {
    await new Promise((resolve) => setTimeout(resolve, remainingInWindow + 200));
  }
}

async function runTestSuite() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: SECURITY-HARD-02 — RATE LIMIT CATEGORIAS E CAMPANHAS");
  console.log("==========================================================================\n");

  // 1. Obter ou criar planos FREE e PRO
  let proPlan = await prisma.plan.findFirst({ where: { name: "PRO" } });
  if (!proPlan) {
    proPlan = await prisma.plan.create({
      data: {
        name: "PRO",
        displayName: "Plano Pro",
        priceMonth: 29,
        priceYear: 290,
        maxQRCodes: 15,
        customLogo: true,
        exportSvg: true,
        exportPdf: true,
        campaigns: true,
      },
    });
  }

  let freePlan = await prisma.plan.findFirst({ where: { name: "FREE" } });
  if (!freePlan) {
    freePlan = await prisma.plan.create({
      data: {
        name: "FREE",
        displayName: "Plano Grátis",
        priceMonth: 0,
        priceYear: 0,
        maxQRCodes: 5,
        campaigns: false,
      },
    });
  }

  // 2. Usuários de teste
  const aliceUser = await prisma.user.upsert({
    where: { email: "alice_hard02@test.local" },
    create: {
      email: "alice_hard02@test.local",
      name: "Alice HARD-02",
      role: "USER",
      planId: proPlan.id,
    },
    update: { planId: proPlan.id, role: "USER" },
  });

  const bobUser = await prisma.user.upsert({
    where: { email: "bob_hard02@test.local" },
    create: {
      email: "bob_hard02@test.local",
      name: "Bob HARD-02",
      role: "USER",
      planId: proPlan.id,
    },
    update: { planId: proPlan.id, role: "USER" },
  });

  const charlieUser = await prisma.user.upsert({
    where: { email: "charlie_hard02@test.local" },
    create: {
      email: "charlie_hard02@test.local",
      name: "Charlie Free HARD-02",
      role: "USER",
      planId: freePlan.id,
    },
    update: { planId: freePlan.id, role: "USER" },
  });

  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Subscriptions para Alice e Bob (PRO)
  await prisma.subscription.upsert({
    where: { userId: aliceUser.id },
    create: {
      userId: aliceUser.id,
      planId: proPlan.id,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: future,
    },
    update: { planId: proPlan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: future },
  });

  await prisma.subscription.upsert({
    where: { userId: bobUser.id },
    create: {
      userId: bobUser.id,
      planId: proPlan.id,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: future,
    },
    update: { planId: proPlan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: future },
  });

  // Charlie sem subscription ou com subscription FREE
  await prisma.subscription.deleteMany({ where: { userId: charlieUser.id } });

  // Tokens de sessão
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

  // Limpeza preventiva
  await resetRateLimit(aliceUser.id, "category");
  await resetRateLimit(aliceUser.id, "campaign");
  await resetRateLimit(bobUser.id, "category");
  await resetRateLimit(bobUser.id, "campaign");
  await resetRateLimit(charlieUser.id, "category");
  await resetRateLimit(charlieUser.id, "campaign");
  await prisma.category.deleteMany({ where: { userId: { in: [aliceUser.id, bobUser.id, charlieUser.id] } } });
  await prisma.campaign.deleteMany({ where: { userId: { in: [aliceUser.id, bobUser.id, charlieUser.id] } } });

  try {
    // ========================================================================
    // TESTE A: Usuário Anônimo (Não Autenticado)
    // ========================================================================
    console.log("--- TESTE A: Requisição Não Autenticada ---");
    const unauthCat = makeRequest("http://localhost:3000/api/categories", null, { name: "Anon Cat" }, "none");
    const unauthCatRes = await createCategoryRoute(unauthCat);
    assert(unauthCatRes.status === 401, "A1. POST /api/categories sem autenticação retorna HTTP 401");
    const unauthCatData = await unauthCatRes.json();
    assert(unauthCatData.error === "Não autorizado", "A2. Mensagem de erro em categorias é 'Não autorizado'");

    const unauthCamp = makeRequest("http://localhost:3000/api/campaigns", null, { name: "Anon Camp" }, "none");
    const unauthCampRes = await createCampaignRoute(unauthCamp);
    assert(unauthCampRes.status === 401, "A3. POST /api/campaigns sem autenticação retorna HTTP 401");
    const unauthCampData = await unauthCampRes.json();
    assert(unauthCampData.error === "Não autorizado", "A4. Mensagem de erro em campanhas é 'Não autorizado'");

    // ========================================================================
    // TESTE B: Autenticação via Cookie e Bearer em Categorias (getSession(req))
    // ========================================================================
    console.log("\n--- TESTE B: Cobertura de Autenticação Cookie e Bearer em Categorias ---");
    // B1: Autenticação exclusiva via Cookie
    const reqCookie = makeRequest("http://localhost:3000/api/categories", aliceToken, { name: "Cat via Cookie" }, "cookie");
    const resCookie = await createCategoryRoute(reqCookie);
    assert(resCookie.status === 200, "B1. POST /api/categories com cookie qrmaster_session autentica com sucesso (200)");
    const dataCookie = await resCookie.json();
    assert(dataCookie.success === true && Boolean(dataCookie.category?.id), "B2. Categoria criada via cookie possui ID");

    // B2: Autenticação exclusiva via Bearer Header
    const reqBearer = makeRequest("http://localhost:3000/api/categories", aliceToken, { name: "Cat via Bearer" }, "bearer");
    const resBearer = await createCategoryRoute(reqBearer);
    assert(resBearer.status === 200, "B3. POST /api/categories com Authorization Bearer autentica com sucesso (200)");
    const dataBearer = await resBearer.json();
    assert(dataBearer.success === true && Boolean(dataBearer.category?.id), "B4. Categoria criada via Bearer possui ID");

    // B3: Token adulterado
    const reqTampered = makeRequest("http://localhost:3000/api/categories", `${aliceToken}_tampered`, { name: "Cat Tampered" }, "bearer");
    const resTampered = await createCategoryRoute(reqTampered);
    assert(resTampered.status === 401, "B5. POST /api/categories com token adulterado é rejeitado (401)");

    // ========================================================================
    // TESTE C: Validação de Permissão de Plano (Campanhas em Plano FREE)
    // ========================================================================
    console.log("\n--- TESTE C: Validação de Plano FREE em Campanhas ---");
    const reqFreeCamp = makeRequest("http://localhost:3000/api/campaigns", charlieToken, { name: "Campanha Free" });
    const resFreeCamp = await createCampaignRoute(reqFreeCamp);
    assert(resFreeCamp.status === 403, "C1. POST /api/campaigns por usuário do plano FREE retorna HTTP 403");
    const dataFreeCamp = await resFreeCamp.json();
    assert(dataFreeCamp.code === "UPGRADE_REQUIRED", "C2. Código de erro é UPGRADE_REQUIRED");
    assert(dataFreeCamp.requiredPlan === "PRO", "C3. Plano exigido informado é PRO");

    const freeCampCount = await prisma.campaign.count({ where: { userId: charlieUser.id } });
    assert(freeCampCount === 0, "C4. Zero campanhas criadas para o usuário FREE");

    // ========================================================================
    // TESTE D: Esgotamento do Limite de Frequência em Categorias (maxAttempts=20)
    // ========================================================================
    console.log("\n--- TESTE D: Esgotamento do Limite de Frequência em Categorias (20 req/min) ---");
    await ensureWindowRunway(15000);
    await resetRateLimit(aliceUser.id, "category");
    assert(RATE_LIMIT_CONFIGS.category.maxAttempts === 20, "D0. Limite configurado para category é 20");
    assert(RATE_LIMIT_CONFIGS.category.windowSeconds === 60, "D0. Janela configurada para category é 60s");

    // 1ª tentativa via rota HTTP com persistência real
    const resCat1 = await createCategoryRoute(makeRequest("http://localhost:3000/api/categories", aliceToken, { name: "Cat Alice 1" }));
    assert(resCat1.status === 200, "D1.1. 1ª requisição de categoria responde HTTP 200 OK");

    // Consome tentativas 2 a 19 diretamente via checkRateLimit
    for (let i = 2; i <= 19; i++) {
      const check = await checkRateLimit(aliceUser.id, "category");
      assert(check.allowed === true, `D1.${i}. Tentativa ${i}/20 de categoria autorizada (remaining: ${check.remaining})`);
    }

    // 20ª tentativa (exatamente no limite)
    const check20Cat = await checkRateLimit(aliceUser.id, "category");
    assert(check20Cat.allowed === true, "D1.20. 20ª tentativa de categoria permitida no teto exato");
    assert(check20Cat.remaining === 0, "D1.20. Remaining na 20ª tentativa é 0");

    // A 21ª requisição via rota HTTP DEVE ser bloqueada com HTTP 429
    const reqBlockedCat = makeRequest("http://localhost:3000/api/categories", aliceToken, { name: "Cat Alice Blocked 21" });
    const resBlockedCat = await createCategoryRoute(reqBlockedCat);
    assert(resBlockedCat.status === 429, "D2. 21ª requisição de categoria é bloqueada com HTTP 429 Too Many Requests");
    const dataBlockedCat = await resBlockedCat.json();
    assert(dataBlockedCat.code === "RATE_LIMITED", "D3. Payload contém code = 'RATE_LIMITED'");
    assert(typeof dataBlockedCat.retryAfter === "number" && dataBlockedCat.retryAfter > 0, "D4. retryAfter retornado no JSON é maior que zero");
    assert(resBlockedCat.headers.get("Retry-After") !== null, "D5. Cabeçalho HTTP Retry-After presente");
    assert(resBlockedCat.headers.get("X-RateLimit-Limit") === "20", "D6. Cabeçalho X-RateLimit-Limit reflete 20");
    assert(resBlockedCat.headers.get("X-RateLimit-Remaining") === "0", "D7. Cabeçalho X-RateLimit-Remaining indica 0");

    // ========================================================================
    // TESTE E: Esgotamento do Limite de Frequência em Campanhas (maxAttempts=20)
    // ========================================================================
    console.log("\n--- TESTE E: Esgotamento do Limite de Frequência em Campanhas (20 req/min) ---");
    await ensureWindowRunway(15000);
    await resetRateLimit(aliceUser.id, "campaign");
    assert(RATE_LIMIT_CONFIGS.campaign.maxAttempts === 20, "E0. Limite configurado para campaign é 20");
    assert(RATE_LIMIT_CONFIGS.campaign.windowSeconds === 60, "E0. Janela configurada para campaign é 60s");

    // 1ª tentativa via rota HTTP com persistência real
    const resCamp1 = await createCampaignRoute(makeRequest("http://localhost:3000/api/campaigns", aliceToken, {
      name: "Campanha Alice 1",
      description: "Descrição da campanha 1",
    }));
    assert(resCamp1.status === 200, "E1.1. 1ª requisição de campanha responde HTTP 200 OK");

    // Consome tentativas 2 a 19 diretamente via checkRateLimit
    for (let i = 2; i <= 19; i++) {
      const check = await checkRateLimit(aliceUser.id, "campaign");
      assert(check.allowed === true, `E1.${i}. Tentativa ${i}/20 de campanha autorizada (remaining: ${check.remaining})`);
    }

    // 20ª tentativa (exatamente no limite)
    const check20Camp = await checkRateLimit(aliceUser.id, "campaign");
    assert(check20Camp.allowed === true, "E1.20. 20ª tentativa de campanha permitida no teto exato");
    assert(check20Camp.remaining === 0, "E1.20. Remaining na 20ª tentativa é 0");

    // A 21ª requisição de campanha DEVE ser bloqueada com 429
    const reqBlockedCamp = makeRequest("http://localhost:3000/api/campaigns", aliceToken, {
      name: "Campanha Alice Blocked 21",
    });
    const resBlockedCamp = await createCampaignRoute(reqBlockedCamp);
    assert(resBlockedCamp.status === 429, "E2. 21ª requisição de campanha é bloqueada com HTTP 429 Too Many Requests");
    const dataBlockedCamp = await resBlockedCamp.json();
    assert(dataBlockedCamp.code === "RATE_LIMITED", "E3. Payload de campanha contém code = 'RATE_LIMITED'");
    assert(typeof dataBlockedCamp.retryAfter === "number" && dataBlockedCamp.retryAfter > 0, "E4. retryAfter de campanha é maior que zero");
    assert(resBlockedCamp.headers.get("Retry-After") !== null, "E5. Cabeçalho HTTP Retry-After de campanha presente");
    assert(resBlockedCamp.headers.get("X-RateLimit-Limit") === "20", "E6. Cabeçalho X-RateLimit-Limit reflete 20");
    assert(resBlockedCamp.headers.get("X-RateLimit-Remaining") === "0", "E7. Cabeçalho X-RateLimit-Remaining indica 0");

    // ========================================================================
    // TESTE F: Isolamento Multi-Tenant entre Usuários
    // ========================================================================
    console.log("\n--- TESTE F: Isolamento Multi-Tenant (Alice Bloqueada vs Bob Livre) ---");
    // Bob não deve ser afetado pelo bloqueio de Alice
    const reqBobCat = makeRequest("http://localhost:3000/api/categories", bobToken, { name: "Categoria do Bob" });
    const resBobCat = await createCategoryRoute(reqBobCat);
    assert(resBobCat.status === 200, "F1. Bob cria categoria normalmente (HTTP 200) enquanto Alice está bloqueada");

    const reqBobCamp = makeRequest("http://localhost:3000/api/campaigns", bobToken, { name: "Campanha do Bob" });
    const resBobCamp = await createCampaignRoute(reqBobCamp);
    assert(resBobCamp.status === 200, "F2. Bob cria campanha normalmente (HTTP 200) enquanto Alice está bloqueada");

    // Alice continua bloqueada imediatamente em seguida
    await exhaustTokens(aliceUser.id, "category");
    const reqAliceStillBlocked = makeRequest("http://localhost:3000/api/categories", aliceToken, { name: "Alice Still Blocked" });
    const resAliceStillBlocked = await createCategoryRoute(reqAliceStillBlocked);
    assert(resAliceStillBlocked.status === 429, "F3. Alice permanece estritamente bloqueada em categorias (429)");

    await exhaustTokens(aliceUser.id, "campaign");
    const reqAliceCampStillBlocked = makeRequest("http://localhost:3000/api/campaigns", aliceToken, { name: "Alice Camp Still Blocked" });
    const resAliceCampStillBlocked = await createCampaignRoute(reqAliceCampStillBlocked);
    assert(resAliceCampStillBlocked.status === 429, "F4. Alice permanece estritamente bloqueada em campanhas (429)");

    // ========================================================================
    // TESTE G: Isolamento entre Buckets de Ação (Category vs Campaign)
    // ========================================================================
    console.log("\n--- TESTE G: Isolamento entre Buckets (Category vs Campaign) ---");
    // Libera Alice em category, e bloqueia em campaign
    await exhaustTokens(aliceUser.id, "campaign");
    await resetRateLimit(aliceUser.id, "category");
    const reqAliceCatUnblocked = makeRequest("http://localhost:3000/api/categories", aliceToken, { name: "Alice Cat Unblocked" });
    const resAliceCatUnblocked = await createCategoryRoute(reqAliceCatUnblocked);
    assert(resAliceCatUnblocked.status === 200, "G1. Alice liberada em categorias após reset do bucket 'category' (200)");

    const reqAliceCampCheck = makeRequest("http://localhost:3000/api/campaigns", aliceToken, { name: "Alice Camp Check" });
    const resAliceCampCheck = await createCampaignRoute(reqAliceCampCheck);
    assert(
      resAliceCampCheck.status === 429,
      "G2. Alice CONTINUA bloqueada em 'campaign' (429) demonstrando independência de buckets",
      `status=${resAliceCampCheck.status}`
    );

    // Inverso: Bloqueia category e libera campaign
    await exhaustTokens(aliceUser.id, "category");
    await resetRateLimit(aliceUser.id, "campaign");

    const resAliceCatBlockedAgain = await createCategoryRoute(makeRequest("http://localhost:3000/api/categories", aliceToken, { name: "Alice Cat 429" }));
    assert(resAliceCatBlockedAgain.status === 429, "G3. Alice bloqueada em 'category' (429)");

    const resAliceCampUnblocked = await createCampaignRoute(makeRequest("http://localhost:3000/api/campaigns", aliceToken, { name: "Alice Camp Unblocked" }));
    assert(resAliceCampUnblocked.status === 200, "G4. Alice liberada em 'campaign' (200) com 'category' bloqueada");

    // ========================================================================
    // TESTE H: Zero Efeitos Colaterais no Banco durante Requisição 429
    // ========================================================================
    console.log("\n--- TESTE H: Zero Efeitos Colaterais em Banco durante Bloqueio (429) ---");
    await exhaustTokens(aliceUser.id, "category");

    const countCatBefore = await prisma.category.count({ where: { userId: aliceUser.id } });
    const resCatBlockedSideEffect = await createCategoryRoute(
      makeRequest("http://localhost:3000/api/categories", aliceToken, { name: "Ghost Category" })
    );
    assert(resCatBlockedSideEffect.status === 429, "H1. Requisição de categoria rejeitada com 429");
    const countCatAfter = await prisma.category.count({ where: { userId: aliceUser.id } });
    assert(countCatBefore === countCatAfter, "H2. Zero registros criados em Category durante o bloqueio 429");

    await exhaustTokens(aliceUser.id, "campaign");

    const countCampBefore = await prisma.campaign.count({ where: { userId: aliceUser.id } });
    const resCampBlockedSideEffect = await createCampaignRoute(
      makeRequest("http://localhost:3000/api/campaigns", aliceToken, { name: "Ghost Campaign" })
    );
    assert(resCampBlockedSideEffect.status === 429, "H3. Requisição de campanha rejeitada com 429");
    const countCampAfter = await prisma.campaign.count({ where: { userId: aliceUser.id } });
    assert(countCampBefore === countCampAfter, "H4. Zero registros criados em Campaign durante o bloqueio 429");

    // ========================================================================
    // TESTE I: Identificador Derivado Server-Side Anti-Spoofing
    // ========================================================================
    console.log("\n--- TESTE I: Identificador Derivado Server-Side Anti-Spoofing ---");
    await exhaustTokens(aliceUser.id, "category");

    // Alice bloqueada tenta forjar userId e sessionUserId de Bob no body
    const reqSpoofedCat = makeRequest("http://localhost:3000/api/categories", aliceToken, {
      userId: bobUser.id,
      sessionUserId: bobUser.id,
      name: "Spoofed Category",
    });
    const resSpoofedCat = await createCategoryRoute(reqSpoofedCat);
    assert(resSpoofedCat.status === 429, "I1. Forjar userId no payload de categoria não burla o rate limit de Alice");

    await exhaustTokens(aliceUser.id, "campaign");

    const reqSpoofedCamp = makeRequest("http://localhost:3000/api/campaigns", aliceToken, {
      userId: bobUser.id,
      sessionUserId: bobUser.id,
      name: "Spoofed Campaign",
    });
    const resSpoofedCamp = await createCampaignRoute(reqSpoofedCamp);
    assert(resSpoofedCamp.status === 429, "I2. Forjar userId no payload de campanha não burla o rate limit de Alice");

    // ========================================================================
    // TESTE J: Anti-Evasão por Manipulação de Payload
    // ========================================================================
    console.log("\n--- TESTE J: Anti-Evasão por Manipulação de Payload ---");
    const catPayloads = [
      { name: "Different Cat 1", color: "#ff0000" },
      { name: "Different Cat 2", icon: "Folder" },
      { name: "Different Cat 3", color: "#00ff00", icon: "Star", extraParam: 123 },
    ];
    for (let idx = 0; idx < catPayloads.length; idx++) {
      await exhaustTokens(aliceUser.id, "category");
      const p = catPayloads[idx];
      const resEvasion = await createCategoryRoute(makeRequest("http://localhost:3000/api/categories", aliceToken, p));
      assert(
        resEvasion.status === 429,
        `J1.${idx + 1}. Evasão em categoria com ${Object.keys(p).join("+")} rejeitada com 429`,
        `status=${resEvasion.status} body=${await resEvasion.clone().text()}`
      );
    }

    const campPayloads = [
      { name: "Different Camp 1", description: "Different Description" },
      { name: "Different Camp 2", startDate: new Date().toISOString() },
      { name: "Different Camp 3", endDate: new Date().toISOString() },
      { name: "Different Camp 4", arbitraryField: "injected_value", status: "PENDING" },
    ];
    for (let idx = 0; idx < campPayloads.length; idx++) {
      await exhaustTokens(aliceUser.id, "campaign");
      const p = campPayloads[idx];
      const resEvasion = await createCampaignRoute(makeRequest("http://localhost:3000/api/campaigns", aliceToken, p));
      assert(
        resEvasion.status === 429,
        `J2.${idx + 1}. Evasão em campanha com ${Object.keys(p).join("+")} rejeitada com 429`,
        `status=${resEvasion.status} body=${await resEvasion.clone().text()}`
      );
    }

    // ========================================================================
    // TESTE K: Resiliência Fail-Closed e Fallback Local em Memória
    // ========================================================================
    console.log("\n--- TESTE K: Resiliência Fail-Closed e Fallback Local em Memória ---");
    const localUser = "test_local_fallback_user_456";
    for (let i = 1; i <= 20; i++) {
      const check = checkRateLimitLocal(localUser, "category");
      assert(check.allowed === true, `K1.${i}. Fallback local autoriza tentativa ${i}/20`);
    }
    const localBlocked = checkRateLimitLocal(localUser, "category");
    assert(localBlocked.allowed === false, "K2. Fallback local bloqueia 21ª tentativa fail-closed");
    assert(localBlocked.remaining === 0, "K3. Fallback local remaining === 0");
    assert(localBlocked.retryAfter > 0, "K4. Fallback local retryAfter > 0");

    const localCampUser = "test_local_fallback_camp_456";
    for (let i = 1; i <= 20; i++) {
      const check = checkRateLimitLocal(localCampUser, "campaign");
      assert(check.allowed === true, `K5.${i}. Fallback local campaign autoriza tentativa ${i}/20`);
    }
    const localCampBlocked = checkRateLimitLocal(localCampUser, "campaign");
    assert(localCampBlocked.allowed === false, "K6. Fallback local campaign bloqueia 21ª tentativa fail-closed");

    // ========================================================================
    // TESTE L: Recuperação Após Reset / Expiração
    // ========================================================================
    console.log("\n--- TESTE L: Recuperação Após Reset / Expiração ---");
    await resetRateLimit(aliceUser.id, "category");
    const resAliceCatRecovered = await createCategoryRoute(
      makeRequest("http://localhost:3000/api/categories", aliceToken, { name: "Alice Recovered Category" })
    );
    assert(resAliceCatRecovered.status === 200, "L1. Após reset, Alice volta a criar categorias com HTTP 200");

    await resetRateLimit(aliceUser.id, "campaign");
    const resAliceCampRecovered = await createCampaignRoute(
      makeRequest("http://localhost:3000/api/campaigns", aliceToken, { name: "Alice Recovered Campaign" })
    );
    assert(resAliceCampRecovered.status === 200, "L2. Após reset, Alice volta a criar campanhas com HTTP 200");

    // ========================================================================
    // CLEANUP
    // ========================================================================
    await prisma.category.deleteMany({
      where: { userId: { in: [aliceUser.id, bobUser.id, charlieUser.id] } },
    });
    await prisma.campaign.deleteMany({
      where: { userId: { in: [aliceUser.id, bobUser.id, charlieUser.id] } },
    });
    await resetRateLimit(aliceUser.id, "category");
    await resetRateLimit(aliceUser.id, "campaign");
    await resetRateLimit(bobUser.id, "category");
    await resetRateLimit(bobUser.id, "campaign");

  } catch (err) {
    console.error("Erro fatal durante execução da suíte:", err);
    failedAsserts++;
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
  console.error("Erro fatal:", err);
  process.exit(1);
});
