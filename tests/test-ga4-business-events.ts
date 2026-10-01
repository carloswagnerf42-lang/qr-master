import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import * as analyticsModule from "../src/lib/analytics";
import {
  trackSignUp,
  trackLogin,
  trackQrCreated,
  trackUpgradeIntent,
  trackBeginCheckout,
} from "../src/lib/analytics";

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
  console.log("  SUÍTE DE TESTES: GA4-07 — CIRÚRGICO LOGIN & BUSINESS FUNNEL RESILIENCE");
  console.log("==========================================================================\n");

  const analyticsModuleContent = readFile("src/lib/analytics.ts");
  const registerContent = readFile("src/app/(auth)/register/page.tsx");
  const loginContent = readFile("src/app/(auth)/login/page.tsx");
  const createContent = readFile("src/app/(dashboard)/create/page.tsx");
  const settingsContent = readFile("src/app/(dashboard)/settings/page.tsx");
  const qRouteContent = readFile("src/app/q/[shortCode]/route.ts");
  const googleAuthTrackerContent = readFile("src/components/analytics/GoogleAuthTracker.tsx");
  const dashboardLayoutContent = readFile("src/app/(dashboard)/layout.tsx");
  const callbackRouteContent = readFile("src/app/api/auth/callback/google/route.ts");

  // Mock environment
  let gtagCalls: Array<{ command: string; action: string; params?: any }> = [];
  const mockGtag = (command: string, action: string, params?: any) => {
    gtagCalls.push({ command, action, params });
  };

  let mockLocalStorageData: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => mockLocalStorageData[key] ?? null,
    setItem: (key: string, val: string) => {
      mockLocalStorageData[key] = val;
    },
    removeItem: (key: string) => {
      delete mockLocalStorageData[key];
    },
  };

  (globalThis as any).window = {
    gtag: mockGtag,
    localStorage: mockLocalStorage,
  };
  (globalThis as any).localStorage = mockLocalStorage;

  // Ativar consentimento para testes de allowlist e payloads
  mockLocalStorageData = { qr_master_analytics_consent: "granted" };

  // ========================================================================
  // GRUPO 1: ALLOWLIST ESTRITA POR EVENTO (Testes 1 a 6)
  // ========================================================================
  console.log("--- 1 a 6: Allowlist Estrita por Evento ---");

  // 1. sign_up possui somente method
  gtagCalls = [];
  trackSignUp({ method: "email" });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].action === "sign_up" &&
      JSON.stringify(Object.keys(gtagCalls[0].params).sort()) === JSON.stringify(["method"]) &&
      gtagCalls[0].params.method === "email",
    "1. sign_up possui somente method"
  );

  // 2. login possui somente method (email)
  gtagCalls = [];
  trackLogin({ method: "email" });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].action === "login" &&
      JSON.stringify(Object.keys(gtagCalls[0].params).sort()) === JSON.stringify(["method"]) &&
      gtagCalls[0].params.method === "email",
    "2. login possui somente method (email)"
  );

  // 2b. login suporta method: "google"
  gtagCalls = [];
  trackLogin({ method: "google" });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].action === "login" &&
      JSON.stringify(Object.keys(gtagCalls[0].params).sort()) === JSON.stringify(["method"]) &&
      gtagCalls[0].params.method === "google",
    "2b. login suporta method: 'google'"
  );

  // 2c. login com method arbitrário/inválido sanitiza defensivamente para 'email'
  gtagCalls = [];
  (trackLogin as any)({ method: "unsupported_provider" });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].action === "login" &&
      gtagCalls[0].params.method === "email",
    "2c. login com method arbitrário/inválido sanitiza defensivamente para 'email'"
  );

  // 3. qr_created possui somente qr_type e plan_tier
  gtagCalls = [];
  trackQrCreated({ qr_type: "dynamic", plan_tier: "pro" });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].action === "qr_created" &&
      JSON.stringify(Object.keys(gtagCalls[0].params).sort()) === JSON.stringify(["plan_tier", "qr_type"]) &&
      gtagCalls[0].params.qr_type === "dynamic" &&
      gtagCalls[0].params.plan_tier === "pro",
    "3. qr_created possui somente: qr_type e plan_tier"
  );

  // 4. upgrade_intent possui somente plan_tier e billing_cycle
  gtagCalls = [];
  trackUpgradeIntent({ plan_tier: "pro", billing_cycle: "monthly" });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].action === "upgrade_intent" &&
      JSON.stringify(Object.keys(gtagCalls[0].params).sort()) === JSON.stringify(["billing_cycle", "plan_tier"]) &&
      gtagCalls[0].params.plan_tier === "pro" &&
      gtagCalls[0].params.billing_cycle === "monthly",
    "4. upgrade_intent possui somente: plan_tier e billing_cycle"
  );

  // 5. begin_checkout possui somente currency, value, items
  gtagCalls = [];
  trackBeginCheckout({
    currency: "BRL",
    value: 29.9,
    items: [{ item_id: "pro_monthly", item_name: "QR MASTER PRO Mensal" }],
  });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].action === "begin_checkout" &&
      JSON.stringify(Object.keys(gtagCalls[0].params).sort()) === JSON.stringify(["currency", "items", "value"]) &&
      gtagCalls[0].params.currency === "BRL" &&
      gtagCalls[0].params.value === 29.9,
    "5. begin_checkout possui somente: currency, value, items"
  );

  // 6. items possui somente item_id e item_name
  assert(
    gtagCalls.length === 1 &&
      Array.isArray(gtagCalls[0].params.items) &&
      gtagCalls[0].params.items.length === 1 &&
      JSON.stringify(Object.keys(gtagCalls[0].params.items[0]).sort()) === JSON.stringify(["item_id", "item_name"]),
    "6. items possui somente: item_id, item_name"
  );

  // ========================================================================
  // GRUPO 2: DEFESA DETERMINÍSTICA CONTRA PAYLOAD ARBITRÁRIO E PII (Testes 7 a 15)
  // ========================================================================
  console.log("\n--- 7 a 15: Defesa Contra Payload Arbitrário e PII ---");

  // 7. payload arbitrário não pode ser injetado e sendGaEvent não é exportado
  gtagCalls = [];
  (trackSignUp as any)({
    method: "email",
    maliciousPayload: "arbitrary_data",
    extraConfig: { deep: true },
  });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].params.maliciousPayload === undefined &&
      gtagCalls[0].params.extraConfig === undefined &&
      (analyticsModule as any).sendGaEvent === undefined &&
      (analyticsModule as any).dispatchGaEvent === undefined,
    "7. payload arbitrário não pode ser injetado e sendGaEvent não é exportado publicamente"
  );

  // 8. email não pode ser enviado
  gtagCalls = [];
  (trackSignUp as any)({ method: "email", email: "leak@qrmasterdigital.com" });
  (trackLogin as any)({ method: "email", email: "leak@qrmasterdigital.com" });
  assert(
    gtagCalls.every((call) => call.params.email === undefined) &&
      !registerContent.includes("trackSignUp({ email") &&
      !loginContent.includes("trackLogin({ email"),
    "8. email não pode ser enviado"
  );

  // 9. userId não pode ser enviado
  gtagCalls = [];
  (trackLogin as any)({ method: "email", userId: "user_123456" });
  (trackQrCreated as any)({ qr_type: "dynamic", plan_tier: "pro", userId: "user_123456" });
  assert(
    gtagCalls.every((call) => call.params.userId === undefined) &&
      !createContent.includes("trackQrCreated({ userId"),
    "9. userId não pode ser enviado"
  );

  // 10. paymentId não pode ser enviado
  gtagCalls = [];
  (trackBeginCheckout as any)({
    currency: "BRL",
    value: 29.9,
    paymentId: "mp_pay_9999",
    items: [{ item_id: "pro_m", item_name: "Pro", paymentId: "mp_pay_9999" }],
  });
  assert(
    gtagCalls[0].params.paymentId === undefined &&
      gtagCalls[0].params.items[0].paymentId === undefined &&
      !settingsContent.includes("trackBeginCheckout({ paymentId"),
    "10. paymentId não pode ser enviado"
  );

  // 11. destination não pode ser enviado
  gtagCalls = [];
  (trackQrCreated as any)({
    qr_type: "dynamic",
    plan_tier: "pro",
    destination: "https://secret.com/page",
  });
  assert(
    gtagCalls[0].params.destination === undefined &&
      !createContent.includes("trackQrCreated({ destination"),
    "11. destination não pode ser enviado"
  );

  // 12. shortCode não pode ser enviado
  gtagCalls = [];
  (trackQrCreated as any)({
    qr_type: "dynamic",
    plan_tier: "pro",
    shortCode: "sc_xyz888",
  });
  assert(
    gtagCalls[0].params.shortCode === undefined &&
      !createContent.includes("trackQrCreated({ shortCode"),
    "12. shortCode não pode ser enviado"
  );

  // 13. token não pode ser enviado
  gtagCalls = [];
  (trackLogin as any)({ method: "email", token: "jwt.secret.token" });
  assert(
    gtagCalls[0].params.token === undefined &&
      !loginContent.includes("trackLogin({ token"),
    "13. token não pode ser enviado"
  );

  // 14. sessionId não pode ser enviado
  gtagCalls = [];
  (trackLogin as any)({ method: "email", sessionId: "sess_uuid_999" });
  (trackUpgradeIntent as any)({
    plan_tier: "pro",
    billing_cycle: "monthly",
    sessionId: "sess_uuid_999",
  });
  assert(
    gtagCalls.every((call) => call.params.sessionId === undefined),
    "14. sessionId não pode ser enviado"
  );

  // 15. item_name comercial legítimo permanece funcional
  gtagCalls = [];
  trackBeginCheckout({
    currency: "BRL",
    value: 19.9,
    items: [{ item_id: "pro_monthly", item_name: "QR MASTER PRO Mensal" }],
  });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].params.items[0].item_name === "QR MASTER PRO Mensal",
    "15. item_name comercial legítimo permanece funcional ('QR MASTER PRO Mensal')"
  );

  // ========================================================================
  // GRUPO 2B: COORDENAÇÃO DE LOGIN E NAVEGAÇÃO RESILIENTE (GA4-07)
  // ========================================================================
  console.log("\n--- GA4-07: Coordenação Cirúrgica do Evento Login ---");

  // 15.1. trackLogin aciona event_callback e callback de navegação quando consentido
  let navigateCalled: boolean = false;
  gtagCalls = [];
  mockLocalStorageData = { qr_master_analytics_consent: "granted" };

  trackLogin({ method: "email" }, () => {
    navigateCalled = true;
  });

  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].action === "login" &&
      gtagCalls[0].params.method === "email" &&
      typeof gtagCalls[0].params.event_callback === "function" &&
      gtagCalls[0].params.event_timeout === 400,
    "15.1. trackLogin registra event_callback e event_timeout de 400ms no gtag"
  );

  // Simula execução do callback pelo gtag
  gtagCalls[0].params.event_callback();
  assert(Boolean(navigateCalled), "15.2. callback de navegação é executado com sucesso após despacho do gtag");

  // 15.3. Callback fallback de 400ms executa se gtag demorar ou travar
  let fallbackExecuted: boolean = false;
  gtagCalls = [];
  trackLogin({ method: "email" }, () => {
    fallbackExecuted = true;
  });
  // Não chamamos event_callback do gtag — aguardamos timer de 400ms
  await new Promise((r) => setTimeout(r, 450));
  assert(Boolean(fallbackExecuted), "15.3. fallback seguro de 400ms garante navegação mesmo se gtag não responder");

  // 15.4. Navegação NUNCA executa duas vezes (idempotência de navegação)
  let countNav = 0;
  gtagCalls = [];
  trackLogin({ method: "email" }, () => {
    countNav++;
  });
  // Dispara callback do gtag E aguarda timeout do fallback
  gtagCalls[0].params.event_callback();
  await new Promise((r) => setTimeout(r, 450));
  assert(countNav === 1, "15.4. callback/fallback executa estritamente uma única vez (sem dupla navegação)");

  // 15.5. Consent denied executa navegação imediatamente sem chamar gtag
  navigateCalled = false;
  gtagCalls = [];
  mockLocalStorageData = { qr_master_analytics_consent: "denied" };
  trackLogin({ method: "email" }, () => {
    navigateCalled = true;
  });
  assert(
    gtagCalls.length === 0 && Boolean(navigateCalled),
    "15.5. consent denied executa navegação imediatamente sem enviar dados ao gtag"
  );

  // 15.6. Consent ausente executa navegação imediatamente sem chamar gtag
  navigateCalled = false;
  gtagCalls = [];
  mockLocalStorageData = {};
  trackLogin({ method: "email" }, () => {
    navigateCalled = true;
  });
  assert(
    gtagCalls.length === 0 && Boolean(navigateCalled),
    "15.6. consent ausente executa navegação imediatamente sem enviar dados ao gtag (fail-closed)"
  );

  // 15.7. Falha/exceção no gtag não impede navegação
  navigateCalled = false;
  mockLocalStorageData = { qr_master_analytics_consent: "granted" };
  (globalThis as any).window.gtag = () => {
    throw new Error("Simulated network/gtag crash");
  };
  trackLogin({ method: "email" }, () => {
    navigateCalled = true;
  });
  assert(Boolean(navigateCalled), "15.7. falha ou exceção no gtag não impede o login nem bloqueia o usuário");

  // Restaura mock gtag padrão
  (globalThis as any).window.gtag = mockGtag;

  // 15.8. Login na página src/app/(auth)/login/page.tsx só dispara após HTTP 200 confirmado
  const loginHandleSubmit = loginContent.slice(
    loginContent.indexOf("const handleSubmit"),
    loginContent.indexOf("return (")
  );
  assert(
    loginHandleSubmit.includes("if (!res.ok)") &&
      loginHandleSubmit.indexOf("if (!res.ok)") < loginHandleSubmit.indexOf("trackLogin") &&
      loginHandleSubmit.includes("trackLogin({ method: \"email\" }, navigateToDashboard)") &&
      loginHandleSubmit.includes("navigateToDashboard = () => {") &&
      loginHandleSubmit.includes("router.push(\"/dashboard\")"),
    "15.8. login só dispara após HTTP 200 e antes da navegação coordenada"
  );

  // 15.9. Sem timeouts arbitrários longos (1000ms / 2000ms)
  assert(
    !analyticsModuleContent.includes("1000") &&
      !analyticsModuleContent.includes("2000") &&
      analyticsModuleContent.includes("400"),
    "15.9. ausência de timeouts arbitrários longos (timeout estrito de 400ms)"
  );

  // ========================================================================
  // GRUPO 2C: GOOGLE OAUTH LOGIN TRACKING & DEDUPLICAÇÃO (GA4-09)
  // ========================================================================
  console.log("\n--- GA4-09: Rastreamento do Login via Google OAuth e Anti-Duplicação ---");

  // 15.10. GoogleAuthTracker existe e é client-side
  assert(
    googleAuthTrackerContent.includes('"use client"') &&
      googleAuthTrackerContent.includes("export function GoogleAuthTracker"),
    "15.10. GoogleAuthTracker é um componente client-side estrito ('use client')"
  );

  // 15.11. GoogleAuthTracker detecta parâmetro ?auth=google e limpa a URL imediatamente via history.replaceState
  assert(
    googleAuthTrackerContent.includes('authParam === "google"') &&
      googleAuthTrackerContent.includes('url.searchParams.delete("auth")') &&
      googleAuthTrackerContent.includes("window.history.replaceState"),
    "15.11. GoogleAuthTracker detecta ?auth=google e limpa a URL imediatamente via window.history.replaceState"
  );

  // 15.12. GoogleAuthTracker dispara trackLogin({ method: "google" })
  assert(
    googleAuthTrackerContent.includes('trackLogin({ method: "google" })'),
    "15.12. GoogleAuthTracker dispara trackLogin({ method: 'google' })"
  );

  // 15.13. GoogleAuthTracker possui proteção contra execução duplicada (useRef idempotente)
  assert(
    googleAuthTrackerContent.includes("executedRef") &&
      googleAuthTrackerContent.includes("if (executedRef.current) return"),
    "15.13. GoogleAuthTracker possui proteção contra execução duplicada no ciclo de vida (useRef)"
  );

  // 15.14. DashboardLayout monta GoogleAuthTracker
  assert(
    dashboardLayoutContent.includes("import { GoogleAuthTracker }") &&
      dashboardLayoutContent.includes("<GoogleAuthTracker />"),
    "15.14. DashboardLayout importa e renderiza <GoogleAuthTracker />"
  );

  // 15.15. Rota de callback OAuth aponta redirects de sucesso para /dashboard?auth=google
  const callbackDashboardRedirects = callbackRouteContent.match(/NextResponse\.redirect\(`\${appUrl}\/dashboard[^`]*`\)/g) || [];
  assert(
    callbackDashboardRedirects.length === 3 &&
      callbackDashboardRedirects.every((r) => r.includes("/dashboard?auth=google")),
    "15.15. Todas as 3 rotas de sucesso no callback OAuth redirecionam com ?auth=google"
  );

  // 15.16. trackLogin com method: "google" despacha evento com consent granted
  gtagCalls = [];
  mockLocalStorageData = { qr_master_analytics_consent: "granted" };
  trackLogin({ method: "google" });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].action === "login" &&
      gtagCalls[0].params.method === "google",
    "15.16. trackLogin({ method: 'google' }) despacha en=login com method='google' quando consentido"
  );

  // 15.17. trackLogin com method: "google" é bloqueado quando consent denied (fail-closed)
  gtagCalls = [];
  mockLocalStorageData = { qr_master_analytics_consent: "denied" };
  trackLogin({ method: "google" });
  assert(
    gtagCalls.length === 0,
    "15.17. trackLogin({ method: 'google' }) é bloqueado quando consent denied"
  );

  // 15.18. trackLogin com method: "google" é bloqueado quando consent ausente (fail-closed)
  gtagCalls = [];
  mockLocalStorageData = {};
  trackLogin({ method: "google" });
  assert(
    gtagCalls.length === 0,
    "15.18. trackLogin({ method: 'google' }) é bloqueado quando consent ausente"
  );

  // 15.19. Nenhuma PII do Google é enviada no evento de login
  gtagCalls = [];
  mockLocalStorageData = { qr_master_analytics_consent: "granted" };
  (trackLogin as any)({
    method: "google",
    email: "user@gmail.com",
    googleId: "gid_12345",
    sub: "sub_google_98765",
    picture: "https://lh3.googleusercontent.com/photo.jpg",
    name: "User Name",
  });
  assert(
    gtagCalls.length === 1 &&
      gtagCalls[0].params.email === undefined &&
      gtagCalls[0].params.googleId === undefined &&
      gtagCalls[0].params.sub === undefined &&
      gtagCalls[0].params.picture === undefined &&
      gtagCalls[0].params.name === undefined &&
      gtagCalls[0].params.method === "google",
    "15.19. Nenhuma PII do Google (email, sub, picture, name, googleId) é enviada no evento de login"
  );

  // 15.20. Fluxo de login por email em login/page.tsx permanece intacto com method: "email"
  assert(
    loginHandleSubmit.includes('trackLogin({ method: "email" }, navigateToDashboard)'),
    "15.20. Fluxo de login por email em login/page.tsx permanece intacto com method: 'email'"
  );

  // ========================================================================
  // GRUPO 3: GOVERNANÇA DE CONSENTIMENTO (Testes 16 a 18)
  // ========================================================================
  console.log("\n--- 16 a 18: Governança de Consentimento (Consent Mode v2) ---");

  // 16. consent denied continua bloqueando tudo
  gtagCalls = [];
  mockLocalStorageData = { qr_master_analytics_consent: "denied" };
  trackSignUp({ method: "email" });
  trackLogin({ method: "email" });
  trackQrCreated({ qr_type: "static", plan_tier: "free" });
  trackUpgradeIntent({ plan_tier: "pro", billing_cycle: "monthly" });
  trackBeginCheckout({
    currency: "BRL",
    value: 10,
    items: [{ item_id: "p", item_name: "P" }],
  });
  assert(gtagCalls.length === 0, "16. consent denied continua bloqueando tudo");

  // 17. consent ausente bloqueia tudo
  gtagCalls = [];
  mockLocalStorageData = {};
  trackSignUp({ method: "email" });
  trackLogin({ method: "email" });
  trackQrCreated({ qr_type: "static", plan_tier: "free" });
  trackUpgradeIntent({ plan_tier: "pro", billing_cycle: "monthly" });
  trackBeginCheckout({
    currency: "BRL",
    value: 10,
    items: [{ item_id: "p", item_name: "P" }],
  });
  assert(gtagCalls.length === 0, "17. consent ausente bloqueia tudo (fail-closed)");

  // 18. consent granted permite os eventos homologados
  gtagCalls = [];
  mockLocalStorageData = { qr_master_analytics_consent: "granted" };
  trackLogin({ method: "email" });
  trackQrCreated({ qr_type: "dynamic", plan_tier: "pro" });
  assert(
    gtagCalls.length === 2 &&
      gtagCalls[0].action === "login" &&
      gtagCalls[1].action === "qr_created",
    "18. consent granted permite os eventos homologados"
  );

  // Limpeza de ambiente de mock
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;

  // ========================================================================
  // GRUPO 4: INTEGRIDADE DO SISTEMA E ESCOPO (Testes 19 a 23)
  // ========================================================================
  console.log("\n--- 19 a 23: Integridade do Sistema, Escopo e Banco de Dados ---");

  // 19. purchase continua ausente
  assert(
    !analyticsModuleContent.includes("trackPurchase") &&
      !analyticsModuleContent.includes("purchase") &&
      !registerContent.includes("purchase") &&
      !loginContent.includes("purchase") &&
      !createContent.includes("purchase") &&
      !settingsContent.includes("purchase"),
    "19. purchase continua ausente"
  );

  // 20. page_view manual continua ausente
  assert(
    !analyticsModuleContent.includes("page_view") &&
      !registerContent.includes("page_view") &&
      !loginContent.includes("page_view") &&
      !createContent.includes("page_view") &&
      !settingsContent.includes("page_view"),
    "20. page_view manual continua ausente"
  );

  // 21. /q/[shortCode] continua intacto
  assert(
    !qRouteContent.includes("track") &&
      !qRouteContent.includes("analytics") &&
      !qRouteContent.includes("gtag"),
    "21. /q/[shortCode] continua intacto"
  );

  // 22. Prisma permanece intacto
  try {
    const prismaDiff = execSync("git diff prisma/schema.prisma", { encoding: "utf-8" });
    assert(prismaDiff.trim().length === 0, "22. Prisma permanece intacto");
  } catch (e: any) {
    assert(false, "22. Falha ao verificar diff do prisma/schema.prisma", e.message);
  }

  // 23. Migrations permanecem intactas
  try {
    const migrationsStatus = execSync("git status --porcelain prisma/migrations", { encoding: "utf-8" });
    assert(migrationsStatus.trim().length === 0, "23. migrations permanecem intactas");
  } catch (e: any) {
    assert(false, "23. Falha ao verificar status de prisma/migrations", e.message);
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
  console.error("Erro fatal na suíte de testes de eventos de negócio:", err);
  process.exit(1);
});
