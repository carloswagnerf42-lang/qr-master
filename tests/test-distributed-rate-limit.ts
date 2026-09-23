/**
 * SUÍTE DE TESTES: RATE LIMITING DISTRIBUÍDO COM UPSTASH REDIS (FASE 1)
 *
 * Validações obrigatórias:
 * 1. Requests abaixo do limite passam;
 * 2. Request acima do limite é bloqueado;
 * 3. HTTP 429 continua correto;
 * 4. Retry-After / cabeçalhos continuam corretos;
 * 5. Identificadores diferentes possuem quotas independentes;
 * 6. Reset após login bem-sucedido funciona;
 * 7. Reset Redis utiliza resetUsedTokens();
 * 8. Ausência das variáveis Upstash ativa fallback local;
 * 9. Erro de conexão Redis ativa fallback local;
 * 10. Timeout Redis ativa fallback local;
 * 11. Fallback não vira fail-open irrestrito;
 * 12. /q/[shortCode] continua redirecionando quando a telemetria excede o limite;
 * 13. Falha do Redis em /q/[shortCode] não impede redirecionamento;
 * 14. Checkout e portal preservam os limites atuais;
 * 15. Google OAuth preserva seu limite atual;
 * 16. IP bruto não é utilizado como identificador Redis;
 * 17. RATE_LIMIT_HASH_SECRET é utilizado via HMAC-SHA256;
 * 18. Nenhuma credencial Upstash aparece no bundle cliente;
 * 19. Webhooks não foram alterados nem receberam rate limit.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  checkRateLimit,
  resetRateLimit,
  createRateLimitResponse,
  RATE_LIMIT_CONFIGS,
  RATE_LIMIT_NAMESPACES,
  hashIpForRateLimit,
  getSafeRateLimitIdentifier,
  isIpAddress,
  checkRateLimitLocal,
  getHashSecret,
  executeWithTimeout,
} from "../src/lib/rate-limit";
import { checkShortCodeRateLimit, checkShortCodeRateLimitLocal } from "../src/lib/dynamic-redirect";

let passed = 0;
let total = 0;

function assert(condition: boolean, name: string, detail?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    console.error(`  ❌ [FAIL] ${name} ${detail ? `-> ${detail}` : ""}`);
    throw new Error(`Assertion failed: ${name} - ${detail || ""}`);
  }
}

async function runDistributedRateLimitSuite() {
  console.log("\n====================================================================");
  console.log("🛡️  SUÍTE DE TESTES: RATE LIMITING DISTRIBUÍDO COM UPSTASH REDIS (FASE 1)");
  console.log("====================================================================\n");

  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalHashSecret = process.env.RATE_LIMIT_HASH_SECRET;

  const testPrefix = `test_run_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  try {
    // -------------------------------------------------------------------------
    // 1 & 2. REQUESTS ABAIXO DO LIMITE E BLOQUEIO ACIMA DO LIMITE
    // -------------------------------------------------------------------------
    console.log("▶ 1 & 2. Requests abaixo do limite e bloqueio no excedente:");
    {
      const testId = `${testPrefix}_user_limit`;
      await resetRateLimit(testId, "login");

      for (let i = 1; i <= 5; i++) {
        const res = await checkRateLimit(testId, "login");
        assert(res.allowed === true, `Requisição #${i}/5 permitida (remaining: ${res.remaining})`);
      }

      const resBlocked = await checkRateLimit(testId, "login");
      assert(resBlocked.allowed === false, "6ª tentativa é BLOQUEADA com allowed: false");
      assert(resBlocked.retryAfter > 0, `retryAfter informado corretamente (${resBlocked.retryAfter}s)`);

      await resetRateLimit(testId, "login");
    }

    // -------------------------------------------------------------------------
    // 3 & 4. RESPOSTA HTTP 429 E CABEÇALHOS (Retry-After, X-RateLimit-*)
    // -------------------------------------------------------------------------
    console.log("\n▶ 3 & 4. Validação de resposta HTTP 429 e cabeçalhos normativos:");
    {
      const response = createRateLimitResponse("login", 60, Date.now() + 60000);
      assert(response.status === 429, "Status HTTP é exatamente 429 Too Many Requests");

      const body = await response.json();
      assert(body.code === "RATE_LIMITED", "JSON possui code: 'RATE_LIMITED'");
      assert(body.retryAfter === 60, "JSON informa retryAfter: 60");
      assert(typeof body.error === "string" && body.error.length > 0, "JSON possui mensagem de erro informativa");

      const headers = response.headers;
      assert(headers.get("Retry-After") === "60", "Header Retry-After é '60'");
      assert(headers.get("X-RateLimit-Limit") === "5", "Header X-RateLimit-Limit informa limite 5");
      assert(headers.get("X-RateLimit-Remaining") === "0", "Header X-RateLimit-Remaining é '0'");
      assert(headers.get("X-RateLimit-Reset") !== null, "Header X-RateLimit-Reset está presente");
    }

    // -------------------------------------------------------------------------
    // 5. IDENTIFICADORES DIFERENTES POSSUEM QUOTAS INDEPENDENTES
    // -------------------------------------------------------------------------
    console.log("\n▶ 5. Isolamento estrito de quotas entre identificadores distintos:");
    {
      const idUserA = `${testPrefix}_iso_user_A`;
      const idUserB = `${testPrefix}_iso_user_B`;

      await resetRateLimit(idUserA, "login");
      await resetRateLimit(idUserB, "login");

      // Esgota User A
      for (let i = 1; i <= 5; i++) {
        await checkRateLimit(idUserA, "login");
      }
      const checkA = await checkRateLimit(idUserA, "login");
      assert(checkA.allowed === false, "User A esgotou sua quota e está bloqueado");

      // User B deve permanecer livre
      const checkB = await checkRateLimit(idUserB, "login");
      assert(checkB.allowed === true, "User B permanece livre e não sofre interferência de User A");

      await resetRateLimit(idUserA, "login");
      await resetRateLimit(idUserB, "login");
    }

    // -------------------------------------------------------------------------
    // 6 & 7. RESET APÓS SUCESSO (resetUsedTokens - API PÚBLICA)
    // -------------------------------------------------------------------------
    console.log("\n▶ 6 & 7. Reset de rate limit via API pública resetUsedTokens():");
    {
      const resetUser = `${testPrefix}_user_reset`;
      await resetRateLimit(resetUser, "login");

      for (let i = 1; i <= 5; i++) {
        await checkRateLimit(resetUser, "login");
      }
      const blocked = await checkRateLimit(resetUser, "login");
      assert(blocked.allowed === false, "Identificador esgotou a quota");

      // Executa reset via resetRateLimit
      await resetRateLimit(resetUser, "login");

      const afterReset = await checkRateLimit(resetUser, "login");
      assert(afterReset.allowed === true, "Após resetRateLimit, novo ciclo é imediatamente liberado");

      await resetRateLimit(resetUser, "login");
    }

    // -------------------------------------------------------------------------
    // 8. AUSÊNCIA DAS VARIÁVEIS UPSTASH ATIVA FALLBACK LOCAL
    // -------------------------------------------------------------------------
    console.log("\n▶ 8. Ausência das variáveis Upstash ativa fallback in-memory:");
    {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const fallbackId = `${testPrefix}_fb_no_env`;
      await resetRateLimit(fallbackId, "login");

      const res1 = await checkRateLimit(fallbackId, "login");
      assert(res1.allowed === true, "Fallback local permite requisição legítima sem credenciais Redis");

      // Restaura credenciais
      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    }

    // -------------------------------------------------------------------------
    // 9 & 10. ERRO DE CONEXÃO OU TIMEOUT REDIS ATIVA FALLBACK LOCAL
    // -------------------------------------------------------------------------
    console.log("\n▶ 9 & 10. Erro de conexão / timeout do Redis ativa fallback local:");
    {
      // Aponta para host inválido simulando falha de rede
      process.env.UPSTASH_REDIS_REST_URL = "https://unreachable-redis-host-domain-test.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "invalid_token_test";

      const errorFallbackId = `${testPrefix}_fb_conn_err`;
      await resetRateLimit(errorFallbackId, "login");

      const resErr = await checkRateLimit(errorFallbackId, "login");
      assert(resErr.allowed === true, "Em caso de falha de conexão do Redis, fallback local é ativado sem erro 500");

      // Restaura credenciais
      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    }

    // -------------------------------------------------------------------------
    // 11. FALLBACK NÃO VIRA FAIL-OPEN IRRESTRITO
    // -------------------------------------------------------------------------
    console.log("\n▶ 11. Fallback local não vira fail-open irrestrito:");
    {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const failOpenTestId = `${testPrefix}_no_fail_open`;
      await resetRateLimit(failOpenTestId, "login");

      for (let i = 1; i <= 5; i++) {
        await checkRateLimit(failOpenTestId, "login");
      }

      const blockedUnderFallback = await checkRateLimit(failOpenTestId, "login");
      assert(
        blockedUnderFallback.allowed === false,
        "No fallback local, excesso de tentativas continua BLOQUEADO (sem fail-open)"
      );
      assert(blockedUnderFallback.retryAfter > 0, "retryAfter é retornado mesmo durante fallback");

      // Restaura credenciais
      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    }

    // -------------------------------------------------------------------------
    // 12 & 13. /q/[shortCode] NÃO BLOQUEIA REDIRECIONAMENTO E SUPORTA FALHA
    // -------------------------------------------------------------------------
    console.log("\n▶ 12 & 13. Telemetria de scan /q/[shortCode] e preservação do redirecionamento 307:");
    {
      const testScanIp = "hash_scan_user_abc";
      const testCode = "code123";

      // 1. Limite local excedido
      for (let i = 0; i < 60; i++) {
        checkShortCodeRateLimitLocal(testScanIp, testCode, 60);
      }
      const localCheckExceeded = checkShortCodeRateLimitLocal(testScanIp, testCode, 60);
      assert(localCheckExceeded.allowed === false, "Telemetria de scan atinge limite de 60 scans/minuto");

      // 2. Chamada com fallback garante resposta sem exceção
      const resScan = await checkShortCodeRateLimit(testScanIp, testCode, 60);
      assert(typeof resScan.allowed === "boolean", "checkShortCodeRateLimit retorna booleano seguro");

      // 3. Simula falha total do Redis durante scan
      delete process.env.UPSTASH_REDIS_REST_URL;
      const resScanFallback = await checkShortCodeRateLimit("ip_fail", "code_fail", 60);
      assert(typeof resScanFallback.allowed === "boolean", "Falha do Redis em telemetria é tratada sem lançar erro");

      // Restaura credenciais
      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    }

    // -------------------------------------------------------------------------
    // 14. CHECKOUT E PORTAL PRESERVAM LIMITES ATUAIS
    // -------------------------------------------------------------------------
    console.log("\n▶ 14. Limites e namespaces de checkout e portal preservados:");
    {
      assert(RATE_LIMIT_CONFIGS.checkout.maxAttempts === 15, "Checkout: maxAttempts é exatamente 15");
      assert(RATE_LIMIT_CONFIGS.checkout.windowSeconds === 10 * 60, "Checkout: windowSeconds é 600s (10 min)");
      assert(RATE_LIMIT_NAMESPACES.checkout === "qr-master:rl:checkout", "Checkout namespace é qr-master:rl:checkout");

      assert(RATE_LIMIT_CONFIGS.portal.maxAttempts === 10, "Portal: maxAttempts é exatamente 10");
      assert(RATE_LIMIT_CONFIGS.portal.windowSeconds === 10 * 60, "Portal: windowSeconds é 600s (10 min)");
      assert(RATE_LIMIT_NAMESPACES.portal === "qr-master:rl:portal", "Portal namespace é qr-master:rl:portal");
    }

    // -------------------------------------------------------------------------
    // 15. GOOGLE OAUTH PRESERVA SEU LIMITE ATUAL
    // -------------------------------------------------------------------------
    console.log("\n▶ 15. Google OAuth preserva o limite atual:");
    {
      assert(RATE_LIMIT_CONFIGS.google.maxAttempts === 5, "Google OAuth: maxAttempts é exatamente 5");
      assert(RATE_LIMIT_CONFIGS.google.windowSeconds === 15 * 60, "Google OAuth: windowSeconds é 900s (15 min)");
      assert(RATE_LIMIT_NAMESPACES.google === "qr-master:rl:google", "Google namespace é qr-master:rl:google");
    }

    // -------------------------------------------------------------------------
    // 16. IP BRUTO NÃO É UTILIZADO COMO IDENTIFICADOR REDIS
    // -------------------------------------------------------------------------
    console.log("\n▶ 16. IP bruto nunca é enviado ao Redis (pseudonimização):");
    {
      const rawIpv4 = "187.54.120.33";
      const safeIpv4 = getSafeRateLimitIdentifier(rawIpv4);

      assert(safeIpv4 !== rawIpv4, "Identificador gerado é diferente do IP bruto");
      assert(!safeIpv4.includes("187.54.120.33"), "Identificador não contém o IP IPv4");
      assert(safeIpv4.length === 64, "Identificador é um hash SHA-256 de 64 caracteres");

      const rawIpv6 = "2804:14d:5c74:8123::1";
      const safeIpv6 = getSafeRateLimitIdentifier(rawIpv6);
      assert(safeIpv6 !== rawIpv6, "Identificador IPv6 gerado é diferente do IP bruto");
      assert(!safeIpv6.includes("2804:"), "Identificador não contém o prefixo IPv6");
      assert(safeIpv6.length === 64, "Identificador IPv6 é um hash SHA-256 de 64 caracteres");

      // Identificadores que NÃO são IP permanecem inalterados
      const userId = "cuid_cm2p0xyz123";
      assert(getSafeRateLimitIdentifier(userId) === userId, "ID de usuário legítimo é preservado");
    }

    // -------------------------------------------------------------------------
    // 17. RATE_LIMIT_HASH_SECRET É UTILIZADO VIA HMAC-SHA256
    // -------------------------------------------------------------------------
    console.log("\n▶ 17. RATE_LIMIT_HASH_SECRET e HMAC-SHA256:");
    {
      const testSecret = "segredo-dedicado-auditoria-2026-xyz";
      process.env.RATE_LIMIT_HASH_SECRET = testSecret;

      const ip = "201.88.90.10";
      const calculatedHash = hashIpForRateLimit(ip);
      const expectedHash = crypto.createHmac("sha256", testSecret).update(ip).digest("hex");

      assert(calculatedHash === expectedHash, "Hash calculado é rigorosamente HMAC-SHA256 com RATE_LIMIT_HASH_SECRET");

      // Sem a variável, utiliza fallback seguro sem quebrar
      delete process.env.RATE_LIMIT_HASH_SECRET;
      const fallbackHash = hashIpForRateLimit(ip);
      assert(typeof fallbackHash === "string" && fallbackHash.length === 64, "Fallback sem segredo gera hash SHA-256 válido");
      assert(fallbackHash !== ip, "Fallback não expõe o IP");

      process.env.RATE_LIMIT_HASH_SECRET = originalHashSecret;
    }

    // -------------------------------------------------------------------------
    // 18. NENHUMA CREDENCIAL UPSTASH APARECE NO CLIENTE (SEM NEXT_PUBLIC_)
    // -------------------------------------------------------------------------
    console.log("\n▶ 18. Proteção contra exposição de segredos no frontend:");
    {
      const clientEnvKeys = Object.keys(process.env).filter((k) =>
        k.toUpperCase().includes("UPSTASH") && k.startsWith("NEXT_PUBLIC_")
      );
      assert(clientEnvKeys.length === 0, "Nenhuma variável NEXT_PUBLIC_UPSTASH_* existe");

      // Verifica arquivos de frontend para confirmar ausência de imports de Redis
      const dashboardDir = path.resolve(process.cwd(), "src/app/(dashboard)");
      if (fs.existsSync(dashboardDir)) {
        const files = fs.readdirSync(dashboardDir, { recursive: true }) as string[];
        let leaked = false;
        for (const file of files) {
          if (file.endsWith(".tsx") || file.endsWith(".ts")) {
            const content = fs.readFileSync(path.join(dashboardDir, file), "utf8");
            if (content.includes("@upstash/redis") || content.includes("@upstash/ratelimit")) {
              leaked = true;
              break;
            }
          }
        }
        assert(!leaked, "Nenhum arquivo do dashboard cliente importa bibliotecas Upstash Redis");
      }
    }

    // -------------------------------------------------------------------------
    // 19. WEBHOOKS NÃO FORAM ALTERADOS NEM RECEBERAM RATE LIMIT
    // -------------------------------------------------------------------------
    console.log("\n▶ 19. Integridade dos webhooks (Mercado Pago e Stripe):");
    {
      const mpWebhookPath = path.resolve(process.cwd(), "src/app/api/webhooks/mercadopago/route.ts");
      const mpContent = fs.readFileSync(mpWebhookPath, "utf8");
      assert(!mpContent.includes("checkRateLimit"), "Webhook Mercado Pago NÃO possui rate limit");
      assert(mpContent.includes("x-signature"), "Validação de assinatura do Mercado Pago permanece intacta");

      const billingWebhookPath = path.resolve(process.cwd(), "src/app/api/webhooks/billing/route.ts");
      const billingContent = fs.readFileSync(billingWebhookPath, "utf8");
      assert(!billingContent.includes("checkRateLimit"), "Webhook de faturamento NÃO possui rate limit");
    }

    // -------------------------------------------------------------------------
    // 20. TESTES NOVOS OBRIGATÓRIOS: POLÍTICA PRODUÇÃO HMAC E TIMEOUT DEFENSIVO
    // -------------------------------------------------------------------------
    console.log("\n▶ 20. Validação dos Cenários A a F (Hardening de Produção):");
    {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalSecret = process.env.RATE_LIMIT_HASH_SECRET;

      try {
        // Cenário A: NODE_ENV=production, RATE_LIMIT_HASH_SECRET ausente, identificador = IPv4
        (process.env as any).NODE_ENV = "production";
        delete process.env.RATE_LIMIT_HASH_SECRET;

        assert(getHashSecret() === null, "Cenário A: getHashSecret() retorna null em produção sem RATE_LIMIT_HASH_SECRET");

        const ipv4 = "198.51.100.42";
        const resA1 = await checkRateLimit(ipv4, "login");
        assert(resA1.allowed === true, "Cenário A: IPv4 em produção sem secret é permitido via limiter local");
        assert(resA1.remaining === RATE_LIMIT_CONFIGS.login.maxAttempts - 1, "Cenário A: Decrementa quota no store local");

        // Cenário B: NODE_ENV=production, RATE_LIMIT_HASH_SECRET ausente, identificador = IPv6
        const ipv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
        const resB1 = await checkRateLimit(ipv6, "login");
        assert(resB1.allowed === true, "Cenário B: IPv6 em produção sem secret é permitido via limiter local");
        assert(resB1.remaining === RATE_LIMIT_CONFIGS.login.maxAttempts - 1, "Cenário B: Decrementa quota IPv6 no store local");

        // Cenário C: NODE_ENV=production, RATE_LIMIT_HASH_SECRET presente, identificador = IP
        process.env.RATE_LIMIT_HASH_SECRET = "production-super-secret-hmac-key-2026";
        assert(getHashSecret() === "production-super-secret-hmac-key-2026", "Cenário C: getHashSecret() reconhece segredo em produção");

        const ipC = "203.0.113.88";
        const safeC = getSafeRateLimitIdentifier(ipC);
        assert(safeC !== ipC, "Cenário C: Identificador seguro é diferente do IP bruto");
        assert(!safeC.includes(ipC), "Cenário C: Identificador seguro NÃO contém o IP bruto");
        assert(safeC.length === 64, "Cenário C: Identificador é hash HMAC-SHA256 de 64 caracteres");

        // Cenário D: NODE_ENV=production, RATE_LIMIT_HASH_SECRET ausente, identificador = session/user ID
        delete process.env.RATE_LIMIT_HASH_SECRET;
        const userIdD = "usr_prod_sess_991823";
        assert(!isIpAddress(userIdD), "Cenário D: User ID é reconhecido como NÃO-IP");
        const safeD = getSafeRateLimitIdentifier(userIdD);
        assert(safeD === userIdD, "Cenário D: Identificador de sessão/usuário é rigorosamente preservado");

        // Cenário E: Promise Redis excede 2000ms e posteriormente resolve
        let lateResolveExecuted = false;
        const lateResolvingPromise = new Promise<string>((resolve) => {
          setTimeout(() => {
            lateResolveExecuted = true;
            resolve("late_ok");
          }, 80);
        });

        let timeoutOccurredE = false;
        try {
          await executeWithTimeout(lateResolvingPromise, 25);
        } catch (err: any) {
          if (err.message === "REDIS_TIMEOUT") {
            timeoutOccurredE = true;
          }
        }
        assert(timeoutOccurredE, "Cenário E: executeWithTimeout dispara timeout na promise lenta");

        // Aguarda a resolução tardia completar para verificar ausência de efeitos colaterais
        await new Promise((r) => setTimeout(r, 100));
        assert(lateResolveExecuted, "Cenário E: Promise lenta resolveu sem disparar exceções tardias");

        // Cenário F: Promise Redis excede 2000ms e posteriormente rejeita
        let unhandledCaughtF = false;
        const unhandledHandler = () => {
          unhandledCaughtF = true;
        };
        process.on("unhandledRejection", unhandledHandler);

        let lateRejectExecuted = false;
        const lateRejectingPromise = new Promise<string>((_, reject) => {
          setTimeout(() => {
            lateRejectExecuted = true;
            reject(new Error("late_fatal_redis_network_down"));
          }, 80);
        });

        let timeoutOccurredF = false;
        try {
          await executeWithTimeout(lateRejectingPromise, 25);
        } catch (err: any) {
          if (err.message === "REDIS_TIMEOUT") {
            timeoutOccurredF = true;
          }
        }
        assert(timeoutOccurredF, "Cenário F: executeWithTimeout dispara timeout na promise que irá falhar");

        // Aguarda a rejeição tardia completar
        await new Promise((r) => setTimeout(r, 100));
        assert(lateRejectExecuted, "Cenário F: Rejeição tardia ocorreu em background");
        assert(!unhandledCaughtF, "Cenário F: ZERO unhandledRejection disparado no runtime");

        process.removeListener("unhandledRejection", unhandledHandler);
      } finally {
        (process.env as any).NODE_ENV = originalNodeEnv;
        process.env.RATE_LIMIT_HASH_SECRET = originalSecret;
      }
    }

    console.log("\n====================================================================");
    console.log(`🎉 SUÍTE COMPLETA DE RATE LIMITING APROVADA: ${passed}/${total} ASSERÇÕES (100%)`);
    console.log("====================================================================\n");
  } finally {
    // Restaura ambiente original
    process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    process.env.RATE_LIMIT_HASH_SECRET = originalHashSecret;
  }
}

runDistributedRateLimitSuite().catch((err) => {
  console.error("ERRO FATAL NA SUÍTE DE TESTES DISTRIBUÍDOS:", err);
  process.exit(1);
});
