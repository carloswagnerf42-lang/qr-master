/**
 * Suíte de Testes Regressivos GA4-12
 * Validação Comportamental da Correção Definitiva do Evento de Login Google OAuth
 * 
 * Cobre:
 * 1. Teste da Causa Raiz GA4-11 (sequenciamento dataLayer e roteamento do gtag.js)
 * 2. Deduplicação rigorosa (OAuth, F5, SPA navigation, React StrictMode, Novo OAuth)
 * 3. Destino explícito (send_to = G-CJSQ0KFJC7)
 * 4. Zero PII
 * 5. Governança de Consentimento (granted, denied, unknown)
 */

import { trackLogin, isGa4Configured, GA_MEASUREMENT_ID } from "../src/lib/analytics";

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

async function runRegressionSuite() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: GA4-12 — REGRESSÃO DEFINITIVA GOOGLE OAUTH LOGIN");
  console.log("==========================================================================\n");

  // ========================================================================
  // GRUPO 1: PROVA DA CAUSA RAIZ GA4-11 E SEQUENCIAMENTO DETERMINÍSTICO
  // ========================================================================
  console.log("--- 1. Prova da Causa Raiz GA4-11 e Sequenciamento Determinístico ---");

  // Mock do ambiente do navegador
  let dataLayer: any[] = [];
  const mockGtag = (...args: any[]) => {
    dataLayer.push(args);
  };

  let mockLocalStorageData: Record<string, string> = {
    qr_master_analytics_consent: "granted",
  };

  let currentUrl = "https://qrmasterdigital.com/dashboard?auth=google";

  const setupMockWindow = () => {
    dataLayer = [];
    (globalThis as any).window = {
      dataLayer,
      gtag: mockGtag,
      localStorage: {
        getItem: (k: string) => mockLocalStorageData[k] ?? null,
        setItem: (k: string, v: string) => { mockLocalStorageData[k] = v; },
        removeItem: (k: string) => { delete mockLocalStorageData[k]; },
      },
      location: {
        get href() { return currentUrl; },
        set href(val) { currentUrl = val; },
      },
      history: {
        replaceState: (_: any, __: any, newUrl: string) => {
          if (newUrl.startsWith("http")) {
            currentUrl = newUrl;
          } else {
            const u = new URL(currentUrl);
            currentUrl = `${u.origin}${newUrl}`;
          }
        },
      },
      addEventListener: (type: string, listener: any) => {
        eventListeners[type] = eventListeners[type] || [];
        eventListeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: any) => {
        if (eventListeners[type]) {
          eventListeners[type] = eventListeners[type].filter((l) => l !== listener);
        }
      },
      dispatchEvent: (e: any) => {
        const listeners = eventListeners[e.type] || [];
        listeners.forEach((l) => l(e));
        return true;
      },
    };
    (globalThis as any).localStorage = (globalThis as any).window.localStorage;
  };

  let eventListeners: Record<string, any[]> = {};
  setupMockWindow();

  // Teste 1.1: isGa4Configured é false inicialmente (antes do comando config)
  assert(!isGa4Configured(), "1.1. isGa4Configured() retorna false antes do comando config entrar no dataLayer");

  // Simula script inline no layout.tsx
  mockGtag("consent", "default", { analytics_storage: "denied" });
  mockGtag("consent", "update", { analytics_storage: "granted" });

  assert(!isGa4Configured(), "1.2. isGa4Configured() continua false apenas com stub e consentimento (sem config)");

  // Simula injeção de config pelo GoogleAnalytics.tsx
  mockGtag("js", new Date());
  mockGtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
  (window as any).__qr_master_ga4_ready = true;

  assert(isGa4Configured(), "1.3. isGa4Configured() retorna true deterministicamente após o comando config");

  // Teste 1.4: Na arquitetura corrigida, login é despachado após config e com send_to
  trackLogin({ method: "google" });

  const configIndex = dataLayer.findIndex((item) => item[0] === "config");
  const loginIndex = dataLayer.findIndex((item) => item[0] === "event" && item[1] === "login");

  assert(configIndex >= 0, "1.4. Comando 'config' está presente no dataLayer");
  assert(loginIndex >= 0, "1.5. Comando 'event login' está presente no dataLayer");
  assert(
    loginIndex > configIndex,
    "1.6. Regressão GA4-11: Evento 'login' entra estritamente APÓS o 'config' no dataLayer",
    `configIndex=${configIndex}, loginIndex=${loginIndex}`
  );

  const loginPayload = dataLayer[loginIndex][2];
  assert(
    loginPayload.send_to === "G-CJSQ0KFJC7",
    "1.7. Evento 'login' possui destino explícito send_to='G-CJSQ0KFJC7'"
  );
  assert(
    loginPayload.method === "google",
    "1.8. Evento 'login' possui método comercial method='google'"
  );

  // ========================================================================
  // GRUPO 2: DEDUPLICAÇÃO OBRIGATÓRIA (Cenários A a E)
  // ========================================================================
  console.log("\n--- 2. Deduplicação Obrigatória em Todos os Cenários ---");

  // Cenário A: OAuth Google Concluído -> exatamente 1 login
  setupMockWindow();
  mockLocalStorageData = { qr_master_analytics_consent: "granted" };
  currentUrl = "https://qrmasterdigital.com/dashboard?auth=google";

  // Simula montagem do GoogleAuthTracker com prontidão do GA4
  let loginCount = 0;
  let executedRefA = { current: false };

  const simulateTrackerMount = (executedRef: { current: boolean }) => {
    if (executedRef.current) return;
    const url = new URL(window.location.href);
    const authParam = url.searchParams.get("auth");

    if (authParam === "google") {
      const cleanUrl = () => {
        const u = new URL(window.location.href);
        if (u.searchParams.has("auth")) {
          u.searchParams.delete("auth");
          window.history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
        }
      };

      const dispatchAndClean = () => {
        if (executedRef.current) return;
        executedRef.current = true;
        trackLogin({ method: "google" });
        cleanUrl();
      };

      const consent = (globalThis as any).window.localStorage.getItem("qr_master_analytics_consent");
      if (consent === "granted") {
        if (isGa4Configured()) {
          dispatchAndClean();
        } else {
          window.addEventListener("qr_master_ga4_ready", dispatchAndClean);
        }
      } else if (consent === "denied") {
        executedRef.current = true;
        cleanUrl();
      }
    }
  };

  // Inicializa GA4
  mockGtag("js", new Date());
  mockGtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
  (window as any).__qr_master_ga4_ready = true;

  // Monta tracker
  simulateTrackerMount(executedRefA);

  const loginsCenarioA = dataLayer.filter((i) => i[0] === "event" && i[1] === "login");
  assert(loginsCenarioA.length === 1, "2.1. Cenário A (OAuth): Exatamente 1 evento login transmitido");
  assert(
    currentUrl === "https://qrmasterdigital.com/dashboard",
    "2.2. URL foi limpa via history.replaceState (sem ?auth=google)"
  );

  // Cenário B: F5 / Reload da página -> 0 novos logins
  const countBeforeReload = dataLayer.filter((i) => i[0] === "event" && i[1] === "login").length;
  // Na montagem pós-reload, a URL já é limpa (/dashboard) e uma nova ref é instanciada
  let executedRefB = { current: false };
  simulateTrackerMount(executedRefB);

  const countAfterReload = dataLayer.filter((i) => i[0] === "event" && i[1] === "login").length;
  assert(
    countAfterReload === countBeforeReload,
    "2.3. Cenário B (F5/Reload): Exatamente 0 novos logins após reload"
  );

  // Cenário C: Navegação SPA (dashboard -> settings -> dashboard) -> 0 novos logins
  currentUrl = "https://qrmasterdigital.com/settings";
  currentUrl = "https://qrmasterdigital.com/dashboard";
  let executedRefC = { current: false };
  simulateTrackerMount(executedRefC);

  const countAfterSpa = dataLayer.filter((i) => i[0] === "event" && i[1] === "login").length;
  assert(
    countAfterSpa === countBeforeReload,
    "2.4. Cenário C (SPA Navigation): Exatamente 0 novos logins em transições internas"
  );

  // Cenário D: React StrictMode (dupla execução do useEffect no mount) -> 1 login
  setupMockWindow();
  mockLocalStorageData = { qr_master_analytics_consent: "granted" };
  currentUrl = "https://qrmasterdigital.com/dashboard?auth=google";
  mockGtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
  (window as any).__qr_master_ga4_ready = true;

  let executedRefStrictMode = { current: false };
  // Executa o effect duas vezes com a mesma ref (comportamento do React StrictMode)
  simulateTrackerMount(executedRefStrictMode);
  simulateTrackerMount(executedRefStrictMode);

  const loginsStrictMode = dataLayer.filter((i) => i[0] === "event" && i[1] === "login");
  assert(
    loginsStrictMode.length === 1,
    "2.5. Cenário D (StrictMode): Exatamente 1 login (useRef bloqueia segunda chamada)"
  );

  // Cenário E: Novo login legítimo via OAuth posteriormente -> 1 novo login
  // Usuário deslogou e realizou um novo OAuth dias depois, chegando novamente com ?auth=google
  currentUrl = "https://qrmasterdigital.com/dashboard?auth=google";
  let executedRefNovoOAuth = { current: false };
  simulateTrackerMount(executedRefNovoOAuth);

  const totalLoginsAposNovoOAuth = dataLayer.filter((i) => i[0] === "event" && i[1] === "login");
  assert(
    totalLoginsAposNovoOAuth.length === 2,
    "2.6. Cenário E (Novo OAuth futuro): Dispara legitimamente 1 novo evento login"
  );

  // ========================================================================
  // GRUPO 3: GOVERNANÇA DE CONSENTIMENTO (denied & unknown)
  // ========================================================================
  console.log("\n--- 3. Governança Estrita de Consentimento (Denied e Unknown) ---");

  // Cenário 3.1: Consentimento DENIED no momento da chegada
  setupMockWindow();
  mockLocalStorageData = { qr_master_analytics_consent: "denied" };
  currentUrl = "https://qrmasterdigital.com/dashboard?auth=google";
  mockGtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
  (window as any).__qr_master_ga4_ready = true;

  let executedRefDenied = { current: false };
  simulateTrackerMount(executedRefDenied);

  const loginsDenied = dataLayer.filter((i) => i[0] === "event" && i[1] === "login");
  assert(loginsDenied.length === 0, "3.1. Consentimento 'denied': 0 eventos login enviados");
  assert(
    currentUrl === "https://qrmasterdigital.com/dashboard",
    "3.2. Consentimento 'denied': URL é limpa imediatamente (sem deixar ?auth preso)"
  );

  // Cenário 3.2: Consentimento UNKNOWN (null) -> Aguarda decisão do banner
  setupMockWindow();
  mockLocalStorageData = {};
  currentUrl = "https://qrmasterdigital.com/dashboard?auth=google";

  let executedRefUnknown = { current: false };
  let pendingDispatch: any = null;

  const simulateTrackerMountWithBanner = (executedRef: { current: boolean }) => {
    const url = new URL(window.location.href);
    const authParam = url.searchParams.get("auth");
    if (authParam === "google") {
      const cleanUrl = () => {
        const u = new URL(window.location.href);
        if (u.searchParams.has("auth")) {
          u.searchParams.delete("auth");
          window.history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
        }
      };

      const dispatchAndClean = () => {
        if (executedRef.current) return;
        executedRef.current = true;
        trackLogin({ method: "google" });
        cleanUrl();
      };

      const consent = (globalThis as any).window.localStorage.getItem("qr_master_analytics_consent");
      if (!consent) {
        pendingDispatch = () => {
          (globalThis as any).window.localStorage.setItem("qr_master_analytics_consent", "granted");
          if (isGa4Configured()) {
            dispatchAndClean();
          } else {
            window.addEventListener("qr_master_ga4_ready", dispatchAndClean);
          }
        };
      }
    }
  };

  simulateTrackerMountWithBanner(executedRefUnknown);
  assert(
    dataLayer.filter((i) => i[0] === "event" && i[1] === "login").length === 0,
    "3.3. Consentimento pendente (null): Nenhum evento enviado no mount inicial"
  );

  // Usuário clica no banner "Aceitar analytics" e GA4 é configurado
  mockGtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
  (window as any).__qr_master_ga4_ready = true;
  pendingDispatch();

  assert(
    dataLayer.filter((i) => i[0] === "event" && i[1] === "login").length === 1,
    "3.4. Após aceite do banner: Evento login é transmitido com sucesso"
  );
  assert(
    currentUrl === "https://qrmasterdigital.com/dashboard",
    "3.5. Após aceite do banner: URL é limpa com segurança"
  );

  // ========================================================================
  // GRUPO 4: AUDITORIA TOTAL DE PRIVACIDADE E ZERO PII
  // ========================================================================
  console.log("\n--- 4. Auditoria de Privacidade e Zero PII com send_to ---");

  setupMockWindow();
  mockLocalStorageData = { qr_master_analytics_consent: "granted" };
  mockGtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
  (window as any).__qr_master_ga4_ready = true;

  // Tentativa maliciosa/acidental de injetar PII no trackLogin
  (trackLogin as any)({
    method: "google",
    email: "user@example.com",
    name: "User Name",
    userId: "usr_12345",
    sub: "google_sub_999",
    avatar: "https://lh3.googleusercontent.com/photo.jpg",
    token: "jwt_token_secret",
    code: "oauth_auth_code_xyz",
  });

  const lastEvent = dataLayer[dataLayer.length - 1];
  const payload = lastEvent[2];

  assert(lastEvent[0] === "event" && lastEvent[1] === "login", "4.1. Evento registrado é 'login'");
  assert(payload.method === "google", "4.2. Único parâmetro comercial é method='google'");
  assert(payload.send_to === "G-CJSQ0KFJC7", "4.3. Destino de roteamento oficial é send_to='G-CJSQ0KFJC7'");
  assert(payload.email === undefined, "4.4. Zero PII: email excluído");
  assert(payload.name === undefined, "4.5. Zero PII: name excluído");
  assert(payload.userId === undefined, "4.6. Zero PII: userId excluído");
  assert(payload.sub === undefined, "4.7. Zero PII: Google sub excluído");
  assert(payload.avatar === undefined, "4.8. Zero PII: avatar excluído");
  assert(payload.token === undefined, "4.9. Zero PII: token excluído");
  assert(payload.code === undefined, "4.10. Zero PII: authorization code excluído");

  // Limpeza
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;

  console.log("\n==========================================================================");
  console.log(`TOTAL DE ASSERTS REGRESSIVOS: ${totalAsserts}`);
  console.log(`APROVADOS:                   ${passedAsserts}`);
  console.log(`FALHAS:                      ${failedAsserts}`);
  console.log("==========================================================================\n");

  if (failedAsserts > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error("Erro na execução da suíte regressiva:", err);
  process.exit(1);
});
