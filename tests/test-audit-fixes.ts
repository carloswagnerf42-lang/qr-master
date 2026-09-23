import { isSubscriptionActive } from "../src/lib/permissions";
import {
  validateMultiLinkUrl,
  sanitizeMultiLinkUrl,
  sanitizeMultiLinkLinks,
} from "../src/lib/multilink";
import {
  checkRateLimit,
  resetRateLimit,
  RATE_LIMIT_CONFIGS,
} from "../src/lib/rate-limit";

// Cores ANSI para saída no terminal
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (detail) console.error(`    ${YELLOW}Detalhes:${RESET} ${detail}`);
  }
}

// Simulação da lógica da rota /q/[shortCode] atualizada com Grace Period
interface MockRedirectContext {
  qrExists: boolean;
  status: "ACTIVE" | "INACTIVE";
  planSupportsDynamic: boolean;
  role: string;
  subscription: {
    status: string;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd?: boolean;
  } | null;
}

function simulateShortCodeRedirect(ctx: MockRedirectContext) {
  // 1. QR inexistente
  if (!ctx.qrExists) {
    return { status: 404, type: "NOT_FOUND", body: "QR Code Não Encontrado" };
  }

  // 2. QR desativado manualmente
  if (ctx.status !== "ACTIVE") {
    return { status: 403, type: "MANUALLY_INACTIVE", body: "QR Code Pausado" };
  }

  // 3. Verificação de plano e assinatura
  if (ctx.role !== "ADMIN") {
    if (!ctx.planSupportsDynamic) {
      return { status: 403, type: "PLAN_RESTRICTED", body: "QR Code Indisponível" };
    }

    const activeSub = isSubscriptionActive(ctx.subscription);
    if (!activeSub) {
      return { status: 403, type: "SUBSCRIPTION_EXPIRED", body: "Assinatura Expirada" };
    }
  }

  // 4. Redirecionamento 307
  return { status: 307, type: "REDIRECT", body: "Redirecionando..." };
}

async function runAuditFixesTests() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   🛠️ BATERIA DE TESTES: CORREÇÕES DA AUDITORIA FINAL          ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  // =================================================================
  // 1. TESTES DO GRACE PERIOD NA ROTA /q/[shortCode]
  // =================================================================
  console.log(`${CYAN}▶ 1. Validação de Grace Period e Ciclo em /q/[shortCode]:${RESET}`);
  {
    const now = new Date();
    const futurePeriod = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // +15 dias
    const pastPeriod = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // -20 dias
    const pastDueWithinGrace = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // -3 dias (grace de 5 dias)
    const pastDueOutsideGrace = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); // -6 dias (fora do grace)

    // A) QR Ativo
    const qrAtivo = simulateShortCodeRedirect({
      qrExists: true,
      status: "ACTIVE",
      planSupportsDynamic: true,
      role: "USER",
      subscription: { status: "ACTIVE", currentPeriodEnd: futurePeriod },
    });
    assert(qrAtivo.status === 307 && qrAtivo.type === "REDIRECT", "A) QR ativo redireciona com status 307");

    // B) QR Expirado
    const qrExpirado = simulateShortCodeRedirect({
      qrExists: true,
      status: "ACTIVE",
      planSupportsDynamic: true,
      role: "USER",
      subscription: { status: "ACTIVE", currentPeriodEnd: pastPeriod },
    });
    assert(qrExpirado.status === 403 && qrExpirado.type === "SUBSCRIPTION_EXPIRED", "B) QR expirado (fora da vigência) é bloqueado com status 403 (Assinatura Expirada)");

    // C) QR Dentro do Grace Period
    const qrGraceInside = simulateShortCodeRedirect({
      qrExists: true,
      status: "ACTIVE",
      planSupportsDynamic: true,
      role: "USER",
      subscription: { status: "PAST_DUE", currentPeriodEnd: pastDueWithinGrace },
    });
    assert(qrGraceInside.status === 307 && qrGraceInside.type === "REDIRECT", "C) QR dentro do Grace Period (3 dias vencido <= 5 dias) MANTÉM redirecionamento 307");

    // D) QR Fora do Grace Period
    const qrGraceOutside = simulateShortCodeRedirect({
      qrExists: true,
      status: "ACTIVE",
      planSupportsDynamic: true,
      role: "USER",
      subscription: { status: "PAST_DUE", currentPeriodEnd: pastDueOutsideGrace },
    });
    assert(qrGraceOutside.status === 403 && qrGraceOutside.type === "SUBSCRIPTION_EXPIRED", "D) QR fora do Grace Period (6 dias vencido > 5 dias) BLOQUEIA com 403 (Assinatura Expirada)");

    // E) QR Desativado Manualmente
    const qrDesativadoManual = simulateShortCodeRedirect({
      qrExists: true,
      status: "INACTIVE",
      planSupportsDynamic: true,
      role: "USER",
      subscription: { status: "ACTIVE", currentPeriodEnd: futurePeriod },
    });
    assert(qrDesativadoManual.status === 403 && qrDesativadoManual.type === "MANUALLY_INACTIVE", "E) QR desativado manualmente exibe aviso de pausado pelo proprietário (403)");

    // F) QR Inexistente
    const qrInexistente = simulateShortCodeRedirect({
      qrExists: false,
      status: "ACTIVE",
      planSupportsDynamic: true,
      role: "USER",
      subscription: null,
    });
    assert(qrInexistente.status === 404 && qrInexistente.type === "NOT_FOUND", "F) QR inexistente ou excluído retorna 404 Not Found");
  }

  // =================================================================
  // 2. TESTES DE SANITIZAÇÃO DE PROTOCOLOS — MULTI-LINK
  // =================================================================
  console.log(`\n${CYAN}▶ 2. Validação e Sanitização de Protocolos em Multi-Link:${RESET}`);
  {
    // Casos válidos
    const httpsRes = validateMultiLinkUrl("https://example.com/meulink");
    assert(httpsRes.valid === true && httpsRes.normalizedUrl === "https://example.com/meulink", "Permite protocolo HTTPS válido");

    const httpRes = validateMultiLinkUrl("http://example.com/pagina");
    assert(httpRes.valid === true && httpRes.normalizedUrl === "http://example.com/pagina", "Permite protocolo HTTP válido");

    const noProtoRes = validateMultiLinkUrl("meusite.com.br/contato");
    assert(noProtoRes.valid === true && noProtoRes.normalizedUrl === "https://meusite.com.br/contato", "Normaliza URL sem protocolo para https://");

    const mailtoRes = validateMultiLinkUrl("mailto:contato@empresa.com");
    assert(mailtoRes.valid === true && mailtoRes.normalizedUrl === "mailto:contato@empresa.com", "Permite protocolo seguro mailto:");

    const telRes = validateMultiLinkUrl("tel:+5511999999999");
    assert(telRes.valid === true && telRes.normalizedUrl === "tel:+5511999999999", "Permite protocolo seguro tel:");

    // Casos perigosos (Bloqueio estrito de XSS)
    const jsRes = validateMultiLinkUrl("javascript:alert(1)");
    assert(jsRes.valid === false && Boolean(jsRes.error?.includes("proibido")), "Bloqueia protocolo perigoso javascript:alert(1)");

    const dataRes = validateMultiLinkUrl("data:text/html,<script>alert(document.cookie)</script>");
    assert(dataRes.valid === false && Boolean(dataRes.error?.includes("proibido")), "Bloqueia protocolo perigoso data:text/html");

    const vbscriptRes = validateMultiLinkUrl("vbscript:msgbox('xss')");
    assert(vbscriptRes.valid === false && Boolean(vbscriptRes.error?.includes("proibido")), "Bloqueia protocolo perigoso vbscript:");

    const fileRes = validateMultiLinkUrl("file:///etc/passwd");
    assert(fileRes.valid === false && Boolean(fileRes.error?.includes("proibido")), "Bloqueia protocolo perigoso file:///");

    const controlCharRes = validateMultiLinkUrl("https://example.com/\x00malicious");
    assert(controlCharRes.valid === false, "Bloqueia caracteres de controle e null bytes");

    // Teste de higienização de lista de links
    const mixedLinks = [
      { title: "Site Oficial", url: "https://minhaempresa.com" },
      { title: "Link Malicioso", url: "javascript:alert(document.cookie)" },
      { title: "WhatsApp", url: "https://wa.me/5511999999999" },
      { title: "Payload Data", url: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" },
      { title: "Blog", url: "blog.minhaempresa.com" },
    ];

    const sanitizedLinks = sanitizeMultiLinkLinks(mixedLinks);
    assert(sanitizedLinks.length === 3, "sanitizeMultiLinkLinks descarta exatamente os 2 links maliciosos");
    assert(sanitizedLinks[0].title === "Site Oficial" && sanitizedLinks[0].url === "https://minhaempresa.com/", "1º link seguro preservado");
    assert(sanitizedLinks[1].title === "WhatsApp" && sanitizedLinks[1].url === "https://wa.me/5511999999999", "2º link seguro preservado");
    assert(sanitizedLinks[2].title === "Blog" && sanitizedLinks[2].url === "https://blog.minhaempresa.com/", "3º link seguro normalizado e preservado");
  }

  // =================================================================
  // 3. TESTES DE RATE LIMITING — LOGIN E CADASTRO
  // =================================================================
  console.log(`\n${CYAN}▶ 3. Proteção contra Abuso e Rate Limiting (Login e Cadastro):${RESET}`);
  {
    const testIpLogin = "192.168.10.100";
    await resetRateLimit(testIpLogin, "login");

    // Tentativas normais dentro da cota (máx 5)
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await checkRateLimit(testIpLogin, "login");
      assert(res.allowed === true && res.remaining === 5 - attempt, `Tentativa de login ${attempt}/5 permitida (saldo: ${res.remaining})`);
    }

    // 5ª tentativa (última permitida)
    const fifthAttempt = await checkRateLimit(testIpLogin, "login");
    assert(fifthAttempt.allowed === true && fifthAttempt.remaining === 0, "5ª tentativa permitida e esgota o saldo (remaining: 0)");

    // 6ª tentativa (Limite atingido -> Bloqueio HTTP 429)
    const sixthAttempt = await checkRateLimit(testIpLogin, "login");
    assert(sixthAttempt.allowed === false, "6ª tentativa é BLOQUEADA por Rate Limiting");
    assert(sixthAttempt.retryAfter > 0, `retryAfter informado corretamente (${sixthAttempt.retryAfter}s)`);

    // Reset em caso de login bem-sucedido
    await resetRateLimit(testIpLogin, "login");
    const afterReset = await checkRateLimit(testIpLogin, "login");
    assert(afterReset.allowed === true && afterReset.remaining === 4, "Após reset por autenticação válida, novo ciclo é liberado");

    // Teste de isolamento para Cadastro (Register)
    const testIpRegister = "192.168.20.200";
    await resetRateLimit(testIpRegister, "register");

    for (let i = 1; i <= 5; i++) {
      const reg = await checkRateLimit(testIpRegister, "register");
      assert(reg.allowed === true, `Cadastro ${i}/5 permitido`);
    }

    const blockedRegister = await checkRateLimit(testIpRegister, "register");
    assert(blockedRegister.allowed === false, "6º cadastro a partir do mesmo IP é BLOQUEADO (429)");
    assert(blockedRegister.retryAfter > 0, "retryAfter presente para o cadastro");
  }

  // =================================================================
  // RESUMO FINAL
  // =================================================================
  console.log(`\n================================================================`);
  console.log(`TOTAL DE ASSERÇÕES DE CORREÇÃO EXECUTADAS: ${totalTests}`);
  console.log(`${GREEN}APROVADOS: ${passedTests}${RESET}`);
  console.log(`${failedTests === 0 ? GREEN : RED}FALHAS: ${failedTests}${RESET}`);
  console.log(`================================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAuditFixesTests().catch((err) => {
  console.error("Erro fatal na suíte de testes de correção:", err);
  process.exit(1);
});
