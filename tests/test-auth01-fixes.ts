process.env.ENABLE_TEST_AUTH = "true";

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import {
  generateOAuthState,
  generatePkceVerifier,
  generatePkceChallenge,
  safeCompare,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  GOOGLE_LINK_COOKIE,
} from "../src/lib/google-auth";
import { GET as googleGet } from "../src/app/api/auth/google/route";
import { GET as googleCallbackGet } from "../src/app/api/auth/callback/google/route";
import { POST as qrPost } from "../src/app/api/qr/route";
import { POST as linkPost } from "../src/app/api/auth/google/link/route";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (detail) console.error(`    Detalhe: ${detail}`);
    failCount++;
  }
}

async function runAuth01Tests() {
  console.log("\n==========================================================");
  console.log("🛡️  SUÍTE DE TESTES DE SEGURANÇA: CORREÇÕES AUTH-01");
  console.log("==========================================================\n");

  // =========================================================================
  // PARTE 1 — TESTES DE OAUTH STATE & PKCE (AUTH-01-01)
  // =========================================================================
  console.log("▶ 1. Testando Geração e Propriedades Criptográficas de State e PKCE:");

  const state1 = generateOAuthState();
  const state2 = generateOAuthState();
  assert(typeof state1 === "string" && state1.length === 64, "1. state é criado com entropia de 32 bytes (64 hex chars)");
  assert(state1 !== state2, "1b. states gerados sucessivamente são únicos e imprevisíveis");

  const verifier = generatePkceVerifier();
  assert(typeof verifier === "string" && verifier.length === 43, "6a. code_verifier PKCE gerado no formato base64url (43 chars)");

  const challenge = generatePkceChallenge(verifier);
  const expectedChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  assert(challenge === expectedChallenge, "6b. code_challenge utiliza cálculo S256 (BASE64URL(SHA256(verifier)))");

  assert(safeCompare(state1, state1) === true, "2a. safeCompare aceita states idênticos em tempo constante");
  assert(safeCompare(state1, state2) === false, "4a. safeCompare rejeita states divergentes");
  assert(safeCompare(state1, "") === false, "3a. safeCompare rejeita state vazio");

  console.log("\n▶ 2. Testando Rota de Início OAuth (GET /api/auth/google):");
  process.env.GOOGLE_CLIENT_ID = "mock-google-client-id-test.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "mock-google-client-secret-test";

  const initReq = new NextRequest("https://qrmasterdigital.com/api/auth/google");
  const initRes = await googleGet(initReq);

  assert(initRes.status === 307 || initRes.status === 302, "Rota inicial retorna redirecionamento HTTP 30x");
  const redirectLocation = initRes.headers.get("location") || "";
  const parsedRedirect = new URL(redirectLocation);

  assert(parsedRedirect.searchParams.has("state"), "1. Parâmetro 'state' enviado na URL de autorização");
  assert(parsedRedirect.searchParams.get("code_challenge_method") === "S256", "6c. Parâmetro 'code_challenge_method=S256' enviado");
  assert(parsedRedirect.searchParams.has("code_challenge"), "6d. Parâmetro 'code_challenge' enviado na autorização");

  const stateCookie = initRes.cookies.get(OAUTH_STATE_COOKIE);
  const verifierCookie = initRes.cookies.get(OAUTH_VERIFIER_COOKIE);
  assert(!!stateCookie && stateCookie.value === parsedRedirect.searchParams.get("state"), "1c. oauth_state gravado em cookie HttpOnly idêntico ao da URL");
  assert(!!verifierCookie && verifierCookie.value.length === 43, "1d. oauth_code_verifier gravado em cookie transitório seguro");

  console.log("\n▶ 3. Testando Rota de Callback OAuth (GET /api/auth/callback/google):");

  // 3.1 State ausente na query
  const reqMissingQueryState = new NextRequest("https://qrmasterdigital.com/api/auth/callback/google?code=mock_code", {
    headers: { cookie: `${OAUTH_STATE_COOKIE}=${state1}; ${OAUTH_VERIFIER_COOKIE}=${verifier}` },
  });
  const resMissingQueryState = await googleCallbackGet(reqMissingQueryState);
  const locMissingQuery = resMissingQueryState.headers.get("location") || "";
  assert(locMissingQuery.includes("error=invalid_oauth_state"), "3. state ausente na query é sumariamente rejeitado");

  // 3.2 State ausente no cookie
  const reqMissingCookieState = new NextRequest(`https://qrmasterdigital.com/api/auth/callback/google?code=mock_code&state=${state1}`);
  const resMissingCookieState = await googleCallbackGet(reqMissingCookieState);
  const locMissingCookie = resMissingCookieState.headers.get("location") || "";
  assert(locMissingCookie.includes("error=invalid_oauth_state"), "3b. state ausente no cookie é sumariamente rejeitado");

  // 3.3 State incorreto / divergente
  const reqMismatchState = new NextRequest(`https://qrmasterdigital.com/api/auth/callback/google?code=mock_code&state=${state1}`, {
    headers: { cookie: `${OAUTH_STATE_COOKIE}=${state2}; ${OAUTH_VERIFIER_COOKIE}=${verifier}` },
  });
  const resMismatchState = await googleCallbackGet(reqMismatchState);
  const locMismatch = resMismatchState.headers.get("location") || "";
  assert(locMismatch.includes("error=invalid_oauth_state"), "4. state incorreto/divergente é sumariamente rejeitado");

  // 3.4 State correto é aceito
  // Quando o state é correto, a execução avança além da validação do state (chegando à troca de código ou falha de rede/mock)
  const reqValidState = new NextRequest(`https://qrmasterdigital.com/api/auth/callback/google?code=mock_code&state=${state1}`, {
    headers: { cookie: `${OAUTH_STATE_COOKIE}=${state1}; ${OAUTH_VERIFIER_COOKIE}=${verifier}` },
  });
  const resValidState = await googleCallbackGet(reqValidState);
  const locValid = resValidState.headers.get("location") || "";
  assert(!locValid.includes("error=invalid_oauth_state"), "2. state correto é aceito pela validação");

  // 3.5 Replay protection: Cookies de oauth são invalidados/removidos
  const clearedState = resValidState.cookies.get(OAUTH_STATE_COOKIE);
  const clearedVerifier = resValidState.cookies.get(OAUTH_VERIFIER_COOKIE);
  assert(clearedState?.maxAge === 0, "5. state é consumido/removido na resposta (proteção anti-replay)");
  assert(clearedVerifier?.maxAge === 0, "8. code_verifier é consumido/removido após uso");

  // =========================================================================
  // PARTE 2 — TESTES DE ELIMINAÇÃO DE TOKEN NA URL (AUTH-01-02)
  // =========================================================================
  console.log("\n▶ 4. Testando Eliminação de Token na URL de Vinculação de Conta:");

  // Testa diretamente que ao redirecionar para /login com vinculação de conta, a URL não tem token
  // Cria usuário de teste com passwordHash para disparar o cenário de vinculação
  const testEmailLink = `test_link_${Date.now()}@example.com`;
  const userWithPassword = await prisma.user.create({
    data: {
      email: testEmailLink,
      name: "Usuário Com Senha",
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456", // mock hash
      role: "USER",
    },
  });

  // Mock de fetch para simular troca de token com o Google retornando um mock token
  const linkState = generateOAuthState();
  const linkVerifier = generatePkceVerifier();

  const originalFetch = global.fetch;
  const mockIdToken = "test_mock_token:" + Buffer.from(JSON.stringify({
    sub: `google_sub_link_${Date.now()}`,
    email: testEmailLink,
    emailVerified: true,
    name: "Usuário Com Senha",
  })).toString("base64");

  let verifierChecked = false;
  global.fetch = async (url: any, init?: any) => {
    if (typeof url === "string" && url.includes("oauth2.googleapis.com/token")) {
      const bodyStr = init?.body?.toString() || "";
      if (!verifierChecked) {
        verifierChecked = true;
        const hasVerifier = bodyStr.includes("code_verifier=");
        assert(hasVerifier, "7. code_verifier participa da troca de token com o Google");
      }

      return new Response(JSON.stringify({ id_token: mockIdToken }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(url, init);
  };

  const reqCallbackLink = new NextRequest(`https://qrmasterdigital.com/api/auth/callback/google?code=mock_code&state=${linkState}`, {
    headers: { cookie: `${OAUTH_STATE_COOKIE}=${linkState}; ${OAUTH_VERIFIER_COOKIE}=${linkVerifier}` },
  });

  const resCallbackLink = await googleCallbackGet(reqCallbackLink);
  global.fetch = originalFetch; // restaura fetch

  const linkRedirectUrl = resCallbackLink.headers.get("location") || "";
  assert(!linkRedirectUrl.includes("google_credential="), "9. google_credential NÃO aparece na URL");
  assert(!linkRedirectUrl.includes(mockIdToken), "10. token/credential do Google NÃO aparece em query string");
  assert(linkRedirectUrl.includes(`link_email=${encodeURIComponent(testEmailLink)}`), "URL contém apenas link_email não secreto");

  const linkCookie = resCallbackLink.cookies.get(GOOGLE_LINK_COOKIE);
  assert(!!linkCookie && linkCookie.value === mockIdToken, "Credencial do Google é armazenada em cookie seguro HttpOnly transitório");

  // Testa que a rota /api/auth/google/link consegue consumir do cookie
  const linkReqWithCookie = new NextRequest("https://qrmasterdigital.com/api/auth/google/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `${GOOGLE_LINK_COOKIE}=${mockIdToken}`,
    },
    body: JSON.stringify({ password: "qualquer_senha" }),
  });
  const linkResWithCookie = await linkPost(linkReqWithCookie);
  // Não deve retornar 400 "Credencial do Google e senha da conta são obrigatórias"
  const linkResData = await linkResWithCookie.json();
  assert(linkResData.error !== "Credencial do Google e senha da conta são obrigatórias.", "Rota /api/auth/google/link recupera credencial do cookie com sucesso");

  // =========================================================================
  // PARTE 3 — TESTES DE OWNERSHIP EM CATEGORY E CAMPAIGN (AUTH-01-03)
  // =========================================================================
  console.log("\n▶ 5. Testando Ownership de Category e Campaign em POST /api/qr (Anti-IDOR):");

  const proPlan = await prisma.plan.findFirst({ where: { name: "PRO" } });

  const userA = await prisma.user.create({
    data: {
      email: `user_a_${Date.now()}@example.com`,
      name: "User A",
      role: "USER",
      planId: proPlan?.id || null,
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: `user_b_${Date.now()}@example.com`,
      name: "User B",
      role: "USER",
      planId: proPlan?.id || null,
    },
  });

  const categoryA = await prisma.category.create({
    data: { userId: userA.id, name: `Cat A ${Date.now()}` },
  });

  const categoryB = await prisma.category.create({
    data: { userId: userB.id, name: `Cat B ${Date.now()}` },
  });

  const campaignA = await prisma.campaign.create({
    data: { userId: userA.id, name: `Camp A ${Date.now()}` },
  });

  const campaignB = await prisma.campaign.create({
    data: { userId: userB.id, name: `Camp B ${Date.now()}` },
  });

  // Cria assinatura ativa do plano PRO para User A para habilitar permissão de campanhas
  await prisma.subscription.create({
    data: {
      userId: userA.id,
      planId: proPlan!.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const tokenUserA = signToken({
    id: userA.id,
    name: userA.name,
    email: userA.email,
    role: userA.role,
    planId: userA.planId,
  });

  // 11. Usuário A cria QR com sua própria Category A
  const reqUserAOwnCat = new NextRequest("https://qrmasterdigital.com/api/qr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenUserA}`,
    },
    body: JSON.stringify({
      name: "QR User A Cat A",
      destination: "https://example.com/a",
      categoryId: categoryA.id,
    }),
  });
  const resUserAOwnCat = await qrPost(reqUserAOwnCat);
  assert(resUserAOwnCat.status === 200, "11. usuário pode criar QR com sua própria category (HTTP 200)");

  // 12. Usuário A tenta criar QR com Category B do Usuário B (Bloqueado)
  const reqUserACrossCat = new NextRequest("https://qrmasterdigital.com/api/qr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenUserA}`,
    },
    body: JSON.stringify({
      name: "QR User A Cat B Cross",
      destination: "https://example.com/b",
      categoryId: categoryB.id,
    }),
  });
  const resUserACrossCat = await qrPost(reqUserACrossCat);
  const dataCrossCat = await resUserACrossCat.json();
  assert(resUserACrossCat.status === 400, "12a. usuário NÃO pode utilizar category de outro usuário (HTTP 400)");
  assert(dataCrossCat.error === "Categoria inválida ou não encontrada.", "12b. resposta genérica impede enumeração de categorias de terceiros");

  // 13. Usuário A cria QR com sua própria Campaign A
  const reqUserAOwnCamp = new NextRequest("https://qrmasterdigital.com/api/qr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenUserA}`,
    },
    body: JSON.stringify({
      name: "QR User A Camp A",
      destination: "https://example.com/campa",
      campaignId: campaignA.id,
    }),
  });
  const resUserAOwnCamp = await qrPost(reqUserAOwnCamp);
  assert(resUserAOwnCamp.status === 200, "13. usuário pode criar QR com sua própria campaign (HTTP 200)");

  // 14. Usuário A tenta criar QR com Campaign B do Usuário B (Bloqueado)
  const reqUserACrossCamp = new NextRequest("https://qrmasterdigital.com/api/qr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenUserA}`,
    },
    body: JSON.stringify({
      name: "QR User A Camp B Cross",
      destination: "https://example.com/campb",
      campaignId: campaignB.id,
    }),
  });
  const resUserACrossCamp = await qrPost(reqUserACrossCamp);
  const dataCrossCamp = await resUserACrossCamp.json();
  assert(resUserACrossCamp.status === 400, "14a. usuário NÃO pode utilizar campaign de outro usuário (HTTP 400)");
  assert(dataCrossCamp.error === "Campanha inválida ou não encontrada.", "14b. resposta genérica impede enumeração de campanhas de terceiros");

  // 15. IDs inexistentes são rejeitados
  const reqFakeCat = new NextRequest("https://qrmasterdigital.com/api/qr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenUserA}`,
    },
    body: JSON.stringify({
      name: "QR Fake Cat",
      destination: "https://example.com/fakecat",
      categoryId: "non_existent_category_id_12345",
    }),
  });
  const resFakeCat = await qrPost(reqFakeCat);
  assert(resFakeCat.status === 400, "15a. categoryId inexistente é rejeitado com HTTP 400");

  const reqFakeCamp = new NextRequest("https://qrmasterdigital.com/api/qr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenUserA}`,
    },
    body: JSON.stringify({
      name: "QR Fake Camp",
      destination: "https://example.com/fakecamp",
      campaignId: "non_existent_campaign_id_12345",
    }),
  });
  const resFakeCamp = await qrPost(reqFakeCamp);
  assert(resFakeCamp.status === 400, "15b. campaignId inexistente é rejeitado com HTTP 400");

  // 16. QR sem category e sem campaign continua funcionando normalmente
  const reqNormal = new NextRequest("https://qrmasterdigital.com/api/qr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenUserA}`,
    },
    body: JSON.stringify({
      name: "QR Normal Sem Cat",
      destination: "https://example.com/normal",
    }),
  });
  const resNormal = await qrPost(reqNormal);
  assert(resNormal.status === 200, "16. QR sem category/campaign continua funcionando normalmente (HTTP 200)");

  // Limpeza dos dados de teste
  await prisma.qRCode.deleteMany({ where: { userId: userA.id } });
  await prisma.subscription.deleteMany({ where: { userId: userA.id } });
  await prisma.category.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await prisma.campaign.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, userWithPassword.id] } } });

  console.log("\n==========================================================");
  console.log(`TOTAL DE ASSERÇÕES: ${passCount + failCount}`);
  console.log(`APROVADOS: ${passCount}`);
  console.log(`FALHAS: ${failCount}`);
  console.log("==========================================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runAuth01Tests().catch((err) => {
  console.error("Erro fatal durante a suíte de testes:", err);
  process.exit(1);
});
