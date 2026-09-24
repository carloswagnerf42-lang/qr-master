import { NextRequest } from "next/server";
import { GET as googleGet } from "@/app/api/auth/google/route";
import { GET as callbackGet } from "@/app/api/auth/callback/google/route";
import {
  generateOAuthState,
  generatePkceVerifier,
  generatePkceChallenge,
  safeCompare,
  getOAuthCookieOptions,
  getOAuthCookieDomain,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from "@/lib/google-auth";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failCount++;
  }
}

async function runOAuthIntegrationTests() {
  console.log("==========================================================");
  console.log("🛡️  SUÍTE DE TESTES: INTEGRAÇÃO E AUDITORIA GOOGLE OAUTH");
  console.log("==========================================================\n");

  process.env.GOOGLE_CLIENT_ID = "mock-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "mock-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://qrmasterdigital.com";

  // ----------------------------------------------------
  // TESTE 1: Início do Fluxo (GET /api/auth/google)
  // ----------------------------------------------------
  console.log("▶ 1. Simulando GET /api/auth/google:");
  const initReq = new NextRequest("https://qrmasterdigital.com/api/auth/google");
  const initRes = await googleGet(initReq);

  assert(initRes.status === 307 || initRes.status === 302, "1. Retorna redirect HTTP 30x");

  const location = initRes.headers.get("location") || "";
  const authUrl = new URL(location);

  const queryState = authUrl.searchParams.get("state");
  const queryCodeChallenge = authUrl.searchParams.get("code_challenge");
  const queryChallengeMethod = authUrl.searchParams.get("code_challenge_method");

  assert(!!queryState && queryState.length === 64, "2. URL contém state com 64 hex chars");
  assert(!!queryCodeChallenge && queryCodeChallenge.length > 20, "3. URL contém code_challenge");
  assert(queryChallengeMethod === "S256", "4. URL utiliza método PKCE S256");

  const stateCookie = initRes.cookies.get(OAUTH_STATE_COOKIE);
  const verifierCookie = initRes.cookies.get(OAUTH_VERIFIER_COOKIE);

  assert(!!stateCookie && stateCookie.value === queryState, "5. Cookie oauth_state gravado idêntico ao state da query");
  assert(!!verifierCookie && verifierCookie.value.length > 20, "6. Cookie oauth_code_verifier gravado");

  // Headers anti-cache
  const cacheControl = initRes.headers.get("cache-control") || "";
  assert(cacheControl.includes("no-store"), "7. Header Cache-Control contém no-store");

  // ----------------------------------------------------
  // TESTE 2: Callback com Dados Válidos (Fluxo Positivo)
  // ----------------------------------------------------
  console.log("\n▶ 2. Simulando Callback Válido (GET /api/auth/callback/google):");
  const validCallbackReq = new NextRequest(
    `https://qrmasterdigital.com/api/auth/callback/google?code=mock_code&state=${queryState}`,
    {
      headers: {
        cookie: `${OAUTH_STATE_COOKIE}=${queryState}; ${OAUTH_VERIFIER_COOKIE}=${verifierCookie?.value}`,
      },
    }
  );

  const validRes = await callbackGet(validCallbackReq);
  const validLoc = validRes.headers.get("location") || "";

  // Não pode resultar em invalid_oauth_state!
  assert(!validLoc.includes("error=invalid_oauth_state"), "8. Callback com state e cookie válidos NÃO falha com invalid_oauth_state");

  // ----------------------------------------------------
  // TESTE 3: Casos Negativos de State e Cookie
  // ----------------------------------------------------
  console.log("\n▶ 3. Simulando Casos Negativos:");

  // A. State ausente na query
  const reqNoQueryState = new NextRequest(
    "https://qrmasterdigital.com/api/auth/callback/google?code=mock_code",
    {
      headers: {
        cookie: `${OAUTH_STATE_COOKIE}=${queryState}`,
      },
    }
  );
  const resNoQueryState = await callbackGet(reqNoQueryState);
  const locNoQueryState = resNoQueryState.headers.get("location") || "";
  assert(locNoQueryState.includes("error=invalid_oauth_state"), "9. State ausente na query redireciona para invalid_oauth_state");

  // B. Cookie state ausente
  const reqNoCookieState = new NextRequest(
    `https://qrmasterdigital.com/api/auth/callback/google?code=mock_code&state=${queryState}`
  );
  const resNoCookieState = await callbackGet(reqNoCookieState);
  const locNoCookieState = resNoCookieState.headers.get("location") || "";
  assert(locNoCookieState.includes("error=invalid_oauth_state"), "10. Cookie oauth_state ausente redireciona para invalid_oauth_state");

  const safeState = queryState || "mock";

  // C. State adulterado / divergente
  const reqMismatchedState = new NextRequest(
    `https://qrmasterdigital.com/api/auth/callback/google?code=mock_code&state=tampered_state_${safeState.slice(15)}`,
    {
      headers: {
        cookie: `${OAUTH_STATE_COOKIE}=${safeState}`,
      },
    }
  );
  const resMismatchedState = await callbackGet(reqMismatchedState);
  const locMismatchedState = resMismatchedState.headers.get("location") || "";
  assert(locMismatchedState.includes("error=invalid_oauth_state"), "11. State adulterado redireciona para invalid_oauth_state");

  // D. State com comprimento divergente
  const reqDiffLengthState = new NextRequest(
    `https://qrmasterdigital.com/api/auth/callback/google?code=mock_code&state=short_state`,
    {
      headers: {
        cookie: `${OAUTH_STATE_COOKIE}=${queryState}`,
      },
    }
  );
  const resDiffLengthState = await callbackGet(reqDiffLengthState);
  const locDiffLengthState = resDiffLengthState.headers.get("location") || "";
  assert(locDiffLengthState.includes("error=invalid_oauth_state"), "12. State de tamanho diferente redireciona para invalid_oauth_state");

  // ----------------------------------------------------
  // TESTE 4: Validação de Comparação Criptográfica
  // ----------------------------------------------------
  console.log("\n▶ 4. Testando safeCompare:");
  assert(safeCompare(queryState, queryState) === true, "13. safeCompare aceita strings idênticas");
  assert(safeCompare(queryState, queryState + "x") === false, "14. safeCompare rejeita comprimentos diferentes");
  assert(safeCompare(queryState, "a".repeat(64)) === false, "15. safeCompare rejeita bytes divergentes");
  assert(safeCompare(null, queryState) === false, "16. safeCompare rejeita null");
  assert(safeCompare(undefined, queryState) === false, "17. safeCompare rejeita undefined");

  // ----------------------------------------------------
  // TESTE 5: Canonicalização de Host www
  // ----------------------------------------------------
  console.log("\n▶ 5. Testando Canonicalização de Host www:");
  const wwwReq = new NextRequest("https://www.qrmasterdigital.com/api/auth/google", {
    headers: { host: "www.qrmasterdigital.com" },
  });
  const wwwRes = await googleGet(wwwReq);
  assert(wwwRes.status === 307 || wwwRes.status === 302, "18. www retorna redirect 307/302");
  const wwwLoc = wwwRes.headers.get("location") || "";
  assert(wwwLoc === "https://qrmasterdigital.com/api/auth/google", "19. www redireciona para origem canônica https://qrmasterdigital.com");

  // ----------------------------------------------------
  // TESTE 6: Resolução de Domínio de Cookies
  // ----------------------------------------------------
  console.log("\n▶ 6. Testando Resolução de Domínio de Cookies:");
  const envRecord = process.env as Record<string, string | undefined>;
  const originalEnv = envRecord.NODE_ENV;
  envRecord.NODE_ENV = "production";

  assert(getOAuthCookieDomain("qrmasterdigital.com") === ".qrmasterdigital.com", "20. Domínio em produção resolve para .qrmasterdigital.com");
  assert(getOAuthCookieDomain("www.qrmasterdigital.com") === ".qrmasterdigital.com", "21. Subdomínio www resolve para o domínio apex compartilhado");
  assert(getOAuthCookieDomain("localhost") === undefined, "22. Localhost não define domínio");
  assert(getOAuthCookieDomain("127.0.0.1") === undefined, "23. 127.0.0.1 não define domínio");

  const prodOpts = getOAuthCookieOptions(300, "qrmasterdigital.com");
  assert(prodOpts.httpOnly === true, "24. Cookie é HttpOnly");
  assert(prodOpts.secure === true, "25. Cookie é Secure em produção");
  assert(prodOpts.sameSite === "lax", "26. Cookie é SameSite=Lax");
  assert(prodOpts.path === "/", "27. Cookie path é /");
  assert(prodOpts.domain === ".qrmasterdigital.com", "28. Cookie domain cobre todo o domínio");

  envRecord.NODE_ENV = originalEnv;

  console.log("\n==========================================================");
  console.log(`TOTAL DE ASSERÇÕES: ${passCount + failCount}`);
  console.log(`APROVADOS: ${passCount}`);
  console.log(`FALHAS: ${failCount}`);
  console.log("==========================================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runOAuthIntegrationTests().catch((err) => {
  console.error("Erro fatal na suíte:", err);
  process.exit(1);
});
