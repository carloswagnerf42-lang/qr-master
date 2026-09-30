import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import nextConfig from "../next.config.mjs";

let totalAsserts = 0;
let passedAsserts = 0;
let failedAsserts = 0;

function assert(condition: boolean | undefined | null, title: string, detail?: string) {
  totalAsserts++;
  if (Boolean(condition)) {
    console.log(`  ✅ PASS: ${title}`);
    passedAsserts++;
  } else {
    console.error(`  ❌ FAIL: ${title}${detail ? ` — ${detail}` : ""}`);
    failedAsserts++;
  }
}

function readFile(relPath: string): string {
  const fullPath = path.resolve(process.cwd(), relPath);
  return fs.readFileSync(fullPath, "utf-8");
}

async function runTestSuite() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: GA4-03 — GOOGLE CONSENT MODE V2 & COOKIE GOVERNANCE");
  console.log("==========================================================================\n");

  const layoutContent = readFile("src/app/layout.tsx");
  const gaComponentContent = readFile("src/components/analytics/GoogleAnalytics.tsx");
  const consentBannerContent = readFile("src/components/privacy/CookieConsent.tsx");
  const privacyContent = readFile("src/app/privacy/page.tsx");
  const homeContent = readFile("src/app/page.tsx");
  const termsContent = readFile("src/app/terms/page.tsx");
  const qRouteContent = readFile("src/app/q/[shortCode]/route.ts");

  // ========================================================================
  // GRUPO A: Identificação do Google Analytics 4 (Measurement ID)
  // ========================================================================
  console.log("--- GRUPO A: Measurement ID Oficial ---");
  const EXPECTED_MEASUREMENT_ID = "G-CJSQ0KFJC7";
  assert(
    layoutContent.includes(EXPECTED_MEASUREMENT_ID),
    `A.1. Measurement ID oficial ${EXPECTED_MEASUREMENT_ID} presente no RootLayout`
  );
  assert(
    !layoutContent.includes("G-XXXXXXXXXX") && !layoutContent.includes("UA-"),
    "A.2. Ausência de IDs fictícios ou legados (UA-) no RootLayout"
  );

  // ========================================================================
  // GRUPO B & C: Google Consent Mode v2 (Default Denied & Publicidade Denied)
  // ========================================================================
  console.log("\n--- GRUPO B & C: Consent Mode v2 Default e Bloqueio de Ads ---");
  assert(
    layoutContent.includes("gtag('consent', 'default'"),
    "B.1. gtag('consent', 'default', ...) inicializado no script síncrono do RootLayout"
  );
  assert(
    layoutContent.includes("'analytics_storage': 'denied'"),
    "B.2. analytics_storage é estritamente 'denied' no estado default"
  );
  assert(
    layoutContent.includes("'ad_storage': 'denied'"),
    "C.1. ad_storage é estritamente 'denied' no estado default"
  );
  assert(
    layoutContent.includes("'ad_user_data': 'denied'"),
    "C.2. ad_user_data é estritamente 'denied' no estado default"
  );
  assert(
    layoutContent.includes("'ad_personalization': 'denied'"),
    "C.3. ad_personalization é estritamente 'denied' no estado default"
  );
  assert(
    !layoutContent.includes("adsbygoogle") && !layoutContent.includes("doubleclick.net"),
    "C.4. Ausência total de scripts ou integrações publicitárias do Google Ads"
  );

  // ========================================================================
  // GRUPO D & E: Lógica de Aceite e Recusa (Consent Update)
  // ========================================================================
  console.log("\n--- GRUPO D & E: Lógica de Aceite (Granted) e Recusa (Denied) ---");
  assert(
    gaComponentContent.includes("updateAnalyticsConsent"),
    "D.1. Função updateAnalyticsConsent exportada para atualizar consentimento"
  );
  assert(
    gaComponentContent.includes("gtag(\"consent\", \"update\""),
    "D.2. gtag('consent', 'update', ...) implementado para atualizar permissões"
  );
  assert(
    gaComponentContent.includes("analytics_storage: status"),
    "D.3. analytics_storage reflete dinamicamente a escolha do usuário"
  );
  assert(
    gaComponentContent.includes("ad_storage: \"denied\"") &&
    gaComponentContent.includes("ad_user_data: \"denied\"") &&
    gaComponentContent.includes("ad_personalization: \"denied\""),
    "D.4. Atualização de consentimento mantém publicidade categoricamente 'denied'"
  );
  assert(
    gaComponentContent.includes("removeGaCookies"),
    "E.1. Mecanismo de limpeza removeGaCookies() implementado para estado 'denied'"
  );
  assert(
    gaComponentContent.includes("startsWith(\"_ga\")") &&
    gaComponentContent.includes("startsWith(\"_gid\")"),
    "E.2. Limpeza de cookies foca estritamente em cookies analíticos do GA4"
  );
  const removeGaFunctionBody = gaComponentContent.slice(
    gaComponentContent.indexOf("function removeGaCookies"),
    gaComponentContent.indexOf("function updateAnalyticsConsent")
  );
  assert(
    !removeGaFunctionBody.includes('"token"') &&
    !removeGaFunctionBody.includes('"session"') &&
    !removeGaFunctionBody.includes('"auth"'),
    "E.3. removeGaCookies() não remove cookies essenciais de sessão e autenticação"
  );

  // ========================================================================
  // GRUPO F & G: Persistência no localStorage & Carregamento Condicional
  // ========================================================================
  console.log("\n--- GRUPO F & G: Persistência Local e Carregamento Condicional ---");
  assert(
    gaComponentContent.includes("CONSENT_STORAGE_KEY = \"qr_master_analytics_consent\""),
    "F.1. Chave de persistência local 'qr_master_analytics_consent' padronizada"
  );
  assert(
    gaComponentContent.includes("getStoredAnalyticsConsent"),
    "F.2. getStoredAnalyticsConsent recupera status salvo ('granted' | 'denied' | null)"
  );
  assert(
    gaComponentContent.includes("if (!isGranted) {\n    return null;\n  }"),
    "G.1. GoogleAnalytics NÃO injeta scripts nem carrega gtag.js quando consentimento não foi concedido"
  );
  assert(
    gaComponentContent.includes("https://www.googletagmanager.com/gtag/js?id=${gaId}"),
    "G.2. Script externo do GA4 só é carregado se isGranted for true"
  );

  // ========================================================================
  // GRUPO H: Banner de Consentimento e Acessibilidade
  // ========================================================================
  console.log("\n--- GRUPO H: Interface do Banner de Cookies ---");
  assert(
    consentBannerContent.includes("Cookies e privacidade"),
    "H.1. Título do banner 'Cookies e privacidade' presente"
  );
  assert(
    consentBannerContent.includes("Usamos cookies analíticos opcionais"),
    "H.2. Texto informativo transparente sobre cookies analíticos opcionais"
  );
  assert(
    consentBannerContent.includes("Cookies essenciais continuam funcionando normalmente"),
    "H.3. Esclarecimento de que cookies essenciais funcionam normalmente"
  );
  assert(
    consentBannerContent.includes("Recusar"),
    "H.4. Botão explícito de 'Recusar' presente"
  );
  assert(
    consentBannerContent.includes("Aceitar analytics"),
    "H.5. Botão explícito de 'Aceitar analytics' presente"
  );
  assert(
    !consentBannerContent.includes("Aceitar tudo"),
    "H.6. Ausência do termo enganoso 'Aceitar tudo' (sem dark patterns)"
  );
  assert(
    consentBannerContent.includes("href=\"/privacy\""),
    "H.7. Link direto para /privacy no banner"
  );
  assert(
    consentBannerContent.includes("role=\"dialog\"") || consentBannerContent.includes("role=\"region\""),
    "H.8. Atributos semânticos e de acessibilidade presentes"
  );

  // ========================================================================
  // GRUPO I: Preferências Posteriores (Botão e Modais)
  // ========================================================================
  console.log("\n--- GRUPO I: Alteração Futura da Escolha (Preferências) ---");
  assert(
    consentBannerContent.includes("CookiePreferencesButton"),
    "I.1. Componente CookiePreferencesButton exportado"
  );
  assert(
    consentBannerContent.includes("qr_master_open_cookie_preferences"),
    "I.2. Evento global qr_master_open_cookie_preferences registrado para reabrir preferências"
  );
  assert(
    homeContent.includes("CookiePreferencesButton"),
    "I.3. Footer da página inicial (Landing Page) inclui CookiePreferencesButton"
  );
  assert(
    privacyContent.includes("CookiePreferencesButton"),
    "I.4. Página de Privacidade (/privacy) inclui CookiePreferencesButton"
  );
  assert(
    termsContent.includes("CookiePreferencesButton"),
    "I.5. Página de Termos (/terms) inclui CookiePreferencesButton"
  );

  // ========================================================================
  // GRUPO J: Rota /q/[shortCode] (Isolamento Absoluto de Redirecionamento)
  // ========================================================================
  console.log("\n--- GRUPO J: Isolamento da Rota de QR Code Dinâmico (/q/[shortCode]) ---");
  assert(
    !qRouteContent.includes("googletagmanager") &&
    !qRouteContent.includes("GoogleAnalytics") &&
    !qRouteContent.includes("analytics_storage") &&
    !qRouteContent.includes("CookieConsent"),
    "J.1. Rota /q/[shortCode] 100% isolada e livre de scripts ou componentes de GA4"
  );
  assert(
    qRouteContent.includes("status: 307"),
    "J.2. Rota /q/[shortCode] continua retornando 307 Temporary Redirect direto"
  );

  // ========================================================================
  // GRUPO K: Auditoria da Política de Privacidade (/privacy)
  // ========================================================================
  console.log("\n--- GRUPO K: Política de Privacidade Factual ---");
  assert(
    privacyContent.includes("4. Medição de Audiência e Cookies Analíticos (Google Analytics 4)"),
    "K.1. Seção 4 dedicada ao Google Analytics 4 presente em /privacy"
  );
  assert(
    privacyContent.includes("Google Consent Mode v2"),
    "K.2. Menção ao Google Consent Mode v2 em /privacy"
  );
  assert(
    privacyContent.includes("analytics_storage") && privacyContent.includes("denied"),
    "K.3. Documentação de que o estado inicial é estritamente 'denied'"
  );
  assert(
    privacyContent.includes("https://policies.google.com/privacy"),
    "K.4. Link para a política de privacidade oficial do Google presente"
  );
  assert(
    !privacyContent.includes("100% compatível com LGPD") &&
    !privacyContent.includes("totalmente conforme GDPR"),
    "K.5. Ausência de afirmações jurídicas absolutas ou infundadas"
  );

  // ========================================================================
  // GRUPO L: Content Security Policy (next.config.mjs)
  // ========================================================================
  console.log("\n--- GRUPO L: Content Security Policy Restritiva ---");
  const rules = await nextConfig.headers!();
  const globalRule = rules.find((r) => r.source === "/:path*");
  const cspHeader = globalRule?.headers.find((h) => h.key.toLowerCase() === "content-security-policy")?.value || "";

  assert(!cspHeader.includes("'unsafe-eval'"), "L.1. CSP não contém 'unsafe-eval'");
  assert(!cspHeader.includes("default-src *"), "L.2. default-src não contém wildcard '*'");
  assert(!cspHeader.includes("script-src *"), "L.3. script-src não contém wildcard '*'");
  assert(!cspHeader.includes("connect-src *"), "L.4. connect-src não contém wildcard '*'");
  assert(
    cspHeader.includes("https://www.googletagmanager.com"),
    "L.5. script-src autoriza estritamente https://www.googletagmanager.com"
  );
  assert(
    cspHeader.includes("https://*.google-analytics.com") &&
    cspHeader.includes("https://*.analytics.google.com") &&
    cspHeader.includes("https://*.googletagmanager.com"),
    "L.6. connect-src autoriza endpoints necessários de telemetria regional do GA4"
  );

  // ========================================================================
  // GRUPO M: Integridade do Prisma e Migrations
  // ========================================================================
  console.log("\n--- GRUPO M: Integridade de Banco de Dados e Prisma ---");
  try {
    const prismaDiff = execSync("git diff prisma/schema.prisma", { encoding: "utf-8" });
    assert(prismaDiff.trim().length === 0, "M.1. prisma/schema.prisma possui ZERO alterações");
  } catch (e: any) {
    assert(false, "M.1. Falha ao verificar diff do prisma/schema.prisma", e.message);
  }

  try {
    const migrationsStatus = execSync("git status --porcelain prisma/migrations", { encoding: "utf-8" });
    assert(migrationsStatus.trim().length === 0, "M.2. prisma/migrations possui ZERO alterações");
  } catch (e: any) {
    assert(false, "M.2. Falha ao verificar status de prisma/migrations", e.message);
  }

  // ========================================================================
  // RESUMO FINAL
  // ========================================================================
  console.log("\n==========================================================================");
  console.log(`TOTAL DE ASSERTS: ${totalAsserts}`);
  console.log(`APROVADOS:        ${passedAsserts}`);
  console.log(`FALHAS:           ${failedAsserts}`);
  console.log("==========================================================================");

  if (failedAsserts > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Erro fatal na suíte de testes GA4 Consent:", err);
  process.exit(1);
});
