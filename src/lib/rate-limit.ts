import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import crypto from "crypto";
import net from "net";

export interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
  errorMessage: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // segundos até liberar
  resetAt: number;    // timestamp Unix em ms
}

export type RateLimitAction =
  | "login"
  | "register"
  | "checkout"
  | "portal"
  | "qr"
  | "forgotPassword"
  | "resetPassword"
  | "google"
  | "scan";

// Namespaces dedicados e isolados para cada limitador
export const RATE_LIMIT_NAMESPACES: Record<RateLimitAction, string> = {
  login: "qr-master:rl:login",
  register: "qr-master:rl:register",
  forgotPassword: "qr-master:rl:forgot",
  resetPassword: "qr-master:rl:reset",
  google: "qr-master:rl:google",
  qr: "qr-master:rl:qr-create",
  checkout: "qr-master:rl:checkout",
  portal: "qr-master:rl:portal",
  scan: "qr-master:rl:scan",
};

// Configurações por endpoint preservando os limites auditados
export const RATE_LIMIT_CONFIGS: Record<RateLimitAction, RateLimitConfig> = {
  login: {
    maxAttempts: 5,
    windowSeconds: 15 * 60, // 15 minutos
    errorMessage: "Muitas tentativas de acesso. Por favor, aguarde alguns minutos antes de tentar novamente.",
  },
  register: {
    maxAttempts: 5,
    windowSeconds: 60 * 60, // 60 minutos
    errorMessage: "Limite de cadastros atingido para este endereço IP. Por favor, aguarde antes de tentar novamente.",
  },
  checkout: {
    maxAttempts: 15,
    windowSeconds: 10 * 60, // 10 minutos
    errorMessage: "Muitas tentativas de checkout em curto intervalo. Por favor, aguarde alguns minutos.",
  },
  portal: {
    maxAttempts: 10,
    windowSeconds: 10 * 60, // 10 minutos
    errorMessage: "Muitas requisições ao portal de faturamento. Por favor, aguarde alguns minutos.",
  },
  qr: {
    maxAttempts: 30,
    windowSeconds: 60, // 60 segundos
    errorMessage: "Muitas tentativas de criação de QR Code em curto intervalo. Por favor, aguarde alguns instantes.",
  },
  forgotPassword: {
    maxAttempts: 5,
    windowSeconds: 15 * 60, // 15 minutos
    errorMessage: "Muitas solicitações de recuperação de senha. Por favor, aguarde alguns minutos antes de tentar novamente.",
  },
  resetPassword: {
    maxAttempts: 5,
    windowSeconds: 15 * 60, // 15 minutos
    errorMessage: "Muitas tentativas de redefinição de senha. Por favor, aguarde alguns minutos.",
  },
  google: {
    maxAttempts: 5,
    windowSeconds: 15 * 60, // 15 minutos
    errorMessage: "Muitas tentativas de acesso com Google. Por favor, aguarde alguns minutos antes de tentar novamente.",
  },
  scan: {
    maxAttempts: 60,
    windowSeconds: 60, // 60 segundos
    errorMessage: "Muitos acessos ao QR Code em curto intervalo. Aguarde alguns instantes.",
  },
};

// ============================================================================
// PRIVACIDADE E PSEUDONIMIZAÇÃO DE IP (LGPD / PRIVACY FIRST)
// ============================================================================

/**
 * Valida se um valor de identificador corresponde a um endereço IP (IPv4 ou IPv6)
 */
export function isIpAddress(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed === "127.0.0.1" || trimmed === "localhost" || trimmed === "::1") {
    return true;
  }
  return net.isIP(trimmed) !== 0;
}

const DEV_SALT_FALLBACK = "qr-master:dev-rate-limit-hash-fallback-salt";
// Salt aleatório em memória para este processo/container serverless.
// Utilizado exclusivamente no rate limiter local se RATE_LIMIT_HASH_SECRET estiver ausente em produção,
// garantindo que IPs nunca fiquem em texto plano nem utilizem salt estático, e sem enviar nada ao Redis.
const RUNTIME_LOCAL_SALT = crypto.randomBytes(16).toString("hex");

/**
 * Retorna o segredo configurado para HMAC-SHA256 ou o salt seguro de fallback para ambiente não produtivo.
 * Em produção estrita (NODE_ENV === "production"), se RATE_LIMIT_HASH_SECRET estiver ausente,
 * retorna null para indicar que não há segredo confiável disponível para hashing em produção.
 */
export function getHashSecret(): string | null {
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim();
  if (secret && secret.length > 0) {
    return secret;
  }
  if (process.env.NODE_ENV !== "production") {
    return DEV_SALT_FALLBACK;
  }
  return null;
}

/**
 * Produz um hash HMAC-SHA256 seguro a partir de um IP para evitar armazenar IP bruto no Redis ou memória.
 * Utiliza RATE_LIMIT_HASH_SECRET se configurado; caso contrário, utiliza salt seguro de fallback em dev/test
 * ou RUNTIME_LOCAL_SALT em produção (restrito à memória local).
 * NUNCA reutiliza AUTH_SECRET para esta finalidade.
 */
export function hashIpForRateLimit(ip: string): string {
  const secret = getHashSecret();
  const key = secret || RUNTIME_LOCAL_SALT;
  const cleanIp = (ip || "127.0.0.1").trim();
  return crypto.createHmac("sha256", key).update(cleanIp).digest("hex");
}

/**
 * Retorna o identificador normalizado para rate limit:
 * Se for IP, aplica HMAC-SHA256; se for identificador de usuário (UUID/CUID) ou chave composta, preserva.
 */
export function getSafeRateLimitIdentifier(identifier: string): string {
  if (isIpAddress(identifier)) {
    return hashIpForRateLimit(identifier);
  }
  return identifier;
}

/**
 * Extrai o endereço IP real do cliente a partir dos cabeçalhos do proxy/Vercel
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  return "127.0.0.1";
}

// ============================================================================
// RATE LIMITER IN-MEMORY (FALLBACK RESILIENTE DE ALTA DISPONIBILIDADE)
// ============================================================================

interface CacheEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, CacheEntry>();

/**
 * Limpeza preventiva do store local em memória
 */
function cleanupLocalStore(now: number): void {
  if (rateLimitStore.size > 10000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt <= now) {
        rateLimitStore.delete(k);
      }
    }
  }
}

/**
 * Executa verificação in-memory direta (usada como fallback quando Redis falha ou não está configurado)
 */
export function checkRateLimitLocal(
  identifier: string,
  action: RateLimitAction,
  nowMs?: number
): RateLimitResult {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const config = RATE_LIMIT_CONFIGS[action];
  const safeIdentifier = getSafeRateLimitIdentifier(identifier);
  const key = `${action}:${safeIdentifier}`;

  cleanupLocalStore(now);

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + config.windowSeconds * 1000;
    rateLimitStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      retryAfter: 0,
      resetAt,
    };
  }

  if (entry.count >= config.maxAttempts) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
      resetAt: entry.resetAt,
    };
  }

  entry.count += 1;
  const remaining = Math.max(0, config.maxAttempts - entry.count);
  return {
    allowed: true,
    remaining,
    retryAfter: 0,
    resetAt: entry.resetAt,
  };
}

/**
 * Limpa o estado in-memory do identificador
 */
export function resetLocalRateLimit(identifier: string, action?: RateLimitAction): void {
  const safeIdentifier = getSafeRateLimitIdentifier(identifier);
  if (action) {
    rateLimitStore.delete(`${action}:${safeIdentifier}`);
    rateLimitStore.delete(`${action}:${identifier}`);
  } else {
    for (const key of Array.from(rateLimitStore.keys())) {
      if (key.endsWith(`:${safeIdentifier}`) || key.endsWith(`:${identifier}`)) {
        rateLimitStore.delete(key);
      }
    }
  }
}

// ============================================================================
// CLIENTE UPSTASH REDIS E INSTÂNCIAS DE RATELIMIT DISTRIBUÍDO
// ============================================================================

let cachedRedisClient: Redis | null = null;
let lastKnownUrl: string | undefined;
let lastKnownToken: string | undefined;
let ratelimitInstances: Record<RateLimitAction, Ratelimit> | null = null;

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (
    !url ||
    !token ||
    !url.startsWith("https://") ||
    url.includes("COLE_AQUI") ||
    token.includes("COLE_AQUI")
  ) {
    return null;
  }

  if (!cachedRedisClient || lastKnownUrl !== url || lastKnownToken !== token) {
    lastKnownUrl = url;
    lastKnownToken = token;
    cachedRedisClient = new Redis({
      url,
      token,
    });
    ratelimitInstances = null;
  }

  return cachedRedisClient;
}

function getRatelimitInstances(): Record<RateLimitAction, Ratelimit> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error("REDIS_NOT_AVAILABLE");
  }

  if (!ratelimitInstances) {
    ratelimitInstances = {
      login: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_CONFIGS.login.maxAttempts,
          `${RATE_LIMIT_CONFIGS.login.windowSeconds} s`
        ),
        prefix: RATE_LIMIT_NAMESPACES.login,
      }),
      register: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_CONFIGS.register.maxAttempts,
          `${RATE_LIMIT_CONFIGS.register.windowSeconds} s`
        ),
        prefix: RATE_LIMIT_NAMESPACES.register,
      }),
      checkout: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_CONFIGS.checkout.maxAttempts,
          `${RATE_LIMIT_CONFIGS.checkout.windowSeconds} s`
        ),
        prefix: RATE_LIMIT_NAMESPACES.checkout,
      }),
      portal: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_CONFIGS.portal.maxAttempts,
          `${RATE_LIMIT_CONFIGS.portal.windowSeconds} s`
        ),
        prefix: RATE_LIMIT_NAMESPACES.portal,
      }),
      qr: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_CONFIGS.qr.maxAttempts,
          `${RATE_LIMIT_CONFIGS.qr.windowSeconds} s`
        ),
        prefix: RATE_LIMIT_NAMESPACES.qr,
      }),
      forgotPassword: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_CONFIGS.forgotPassword.maxAttempts,
          `${RATE_LIMIT_CONFIGS.forgotPassword.windowSeconds} s`
        ),
        prefix: RATE_LIMIT_NAMESPACES.forgotPassword,
      }),
      resetPassword: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_CONFIGS.resetPassword.maxAttempts,
          `${RATE_LIMIT_CONFIGS.resetPassword.windowSeconds} s`
        ),
        prefix: RATE_LIMIT_NAMESPACES.resetPassword,
      }),
      google: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_CONFIGS.google.maxAttempts,
          `${RATE_LIMIT_CONFIGS.google.windowSeconds} s`
        ),
        prefix: RATE_LIMIT_NAMESPACES.google,
      }),
      scan: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_CONFIGS.scan.maxAttempts,
          `${RATE_LIMIT_CONFIGS.scan.windowSeconds} s`
        ),
        prefix: RATE_LIMIT_NAMESPACES.scan,
      }),
    };
  }

  return ratelimitInstances;
}

export const REDIS_TIMEOUT_MS = 2000;

/**
 * Encapsula uma Promise com timeout rigoroso de segurança.
 *
 * DETALHES TÉCNICOS IMPORTANTES:
 * 1. Anexa `.catch(() => {})` à promise subjacente para garantir que rejeições tardias
 *    (após timeout de 2000ms) não disparem eventos `unhandledRejection` no runtime Node.js.
 * 2. O handler `.catch(() => {})` não altera nem interfere no resultado observado por `Promise.race()`.
 * 3. O timeout em nível de Promise NÃO cancela a requisição HTTP/socket subjacente no Node.js
 *    (o socket subjacente continuará em trânsito até timeout TCP ou resposta do servidor).
 * 4. O SDK `@upstash/ratelimit` na versão instalada não expõe parâmetro de timeout ou AbortSignal
 *    por invocação de `limit()`. Portanto, este isolamento defensivo é o padrão correto.
 */
export async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = REDIS_TIMEOUT_MS
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("REDIS_TIMEOUT")), timeoutMs);
  });

  // Previne unhandledRejection se a promise subjacente rejeitar tardiamente após o timeout
  promise.catch(() => {});

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

let lastErrorLogTimestamp = 0;
let lastSecretWarnTimestamp = 0;

/**
 * Log com throttling defensivo para advertência de ausência de RATE_LIMIT_HASH_SECRET em produção.
 * Estritamente sem expor IP, segredo ou qualquer dado sensível.
 */
function logMissingHashSecretWarning(): void {
  const now = Date.now();
  if (now - lastSecretWarnTimestamp > 60000) {
    lastSecretWarnTimestamp = now;
    console.warn(
      "[RateLimit] RATE_LIMIT_HASH_SECRET ausente em ambiente de produção. " +
        "Operações dependentes de IP utilizarão rate limit local em memória para proteção de privacidade."
    );
  }
}

/**
 * Log com throttling defensivo para evitar tempestade de logs em caso de indisponibilidade
 */
function logRedisFallback(error: any, action: string): void {
  const now = Date.now();
  if (now - lastErrorLogTimestamp > 60000) {
    lastErrorLogTimestamp = now;
    console.warn(
      `[RateLimit] Redis indisponível ou timeout na ação '${action}'. Fallback in-memory ativado. Detalhe:`,
      error?.message || error
    );
  }
}

// ============================================================================
// FUNÇÃO PRINCIPAL: CHECK RATE LIMIT (DISTRIBUÍDO + SLIDING WINDOW + FALLBACK)
// ============================================================================

/**
 * Valida a taxa de requisições do identificador informado para a ação.
 * Em produção/com credenciais Upstash, utiliza Redis distribuído com Sliding Window.
 * Se Redis estiver indisponível ou sofrer timeout, chaveia automaticamente para o fallback local.
 */
export async function checkRateLimit(
  identifier: string,
  action: RateLimitAction,
  nowMs?: number
): Promise<RateLimitResult> {
  // Se nowMs fornecido explicitamente para simulação determinística de tempo em testes,
  // utiliza diretamente o rate limiter in-memory.
  if (typeof nowMs === "number") {
    return checkRateLimitLocal(identifier, action, nowMs);
  }

  const isIp = isIpAddress(identifier);

  // DECISÃO EXPLÍCITA DE PRODUÇÃO / PRIVACIDADE:
  // Se o identificador for IP, verificar disponibilidade de segredo HMAC
  if (isIp) {
    const hashSecret = getHashSecret();
    if (!hashSecret) {
      // Produção com RATE_LIMIT_HASH_SECRET ausente:
      // - NÃO utiliza DEV_SALT_FALLBACK
      // - NÃO envia IP bruto ao Redis
      // - NÃO envia hash com salt fixo ao Redis
      // - NÃO usa identificador sentinela
      // - Utiliza exclusivamente o rate limiter local em memória
      logMissingHashSecretWarning();
      return checkRateLimitLocal(identifier, action);
    }
  }

  const redis = getRedisClient();
  if (!redis) {
    return checkRateLimitLocal(identifier, action);
  }

  const safeIdentifier = getSafeRateLimitIdentifier(identifier);

  try {
    const instances = getRatelimitInstances();
    const limiter = instances[action];
    if (!limiter) {
      return checkRateLimitLocal(identifier, action);
    }

    const res = await executeWithTimeout(limiter.limit(safeIdentifier), REDIS_TIMEOUT_MS);

    // Se o SDK internamente indicou timeout, ativamos o fallback local para não gerar fail-open
    if ((res as any).reason === "timeout") {
      logRedisFallback(new Error("SDK_TIMEOUT"), action);
      return checkRateLimitLocal(identifier, action);
    }

    const now = Date.now();
    const retryAfter = res.success ? 0 : Math.max(1, Math.ceil((res.reset - now) / 1000));

    return {
      allowed: res.success,
      remaining: res.remaining,
      retryAfter,
      resetAt: res.reset,
    };
  } catch (error) {
    logRedisFallback(error, action);
    // Em caso de falha ou timeout do Redis, executa rate limiting local (SEM fail-open)
    return checkRateLimitLocal(identifier, action);
  }
}

// ============================================================================
// RESET DE RATE LIMIT (resetUsedTokens - API PÚBLICA DO SDK)
// ============================================================================

/**
 * Reseta o contador em caso de sucesso ou expiração forçada.
 * No Redis, utiliza exclusivamente a API pública resetUsedTokens() do @upstash/ratelimit.
 */
export async function resetRateLimit(
  identifier: string,
  action?: RateLimitAction
): Promise<void> {
  const isIp = isIpAddress(identifier);

  // 1. Sempre limpa o cache local de fallback
  resetLocalRateLimit(identifier, action);

  // Se for IP em produção sem segredo, foi processado exclusivamente no fallback local;
  // portanto o Redis não possui dados a resetar para este IP.
  if (isIp && !getHashSecret()) {
    return;
  }

  // 2. Se Redis estiver configurado, reseta via API pública documentada resetUsedTokens
  const redis = getRedisClient();
  if (!redis) return;

  const safeIdentifier = getSafeRateLimitIdentifier(identifier);

  try {
    const instances = getRatelimitInstances();
    if (action) {
      const limiter = instances[action];
      if (limiter) {
        await executeWithTimeout(limiter.resetUsedTokens(safeIdentifier), REDIS_TIMEOUT_MS);
      }
    } else {
      await Promise.all(
        Object.values(instances).map((limiter) =>
          executeWithTimeout(limiter.resetUsedTokens(safeIdentifier), REDIS_TIMEOUT_MS).catch(
            (err) => {
              logRedisFallback(err, "reset:all");
            }
          )
        )
      );
    }
  } catch (error) {
    logRedisFallback(error, action || "all");
  }
}

// ============================================================================
// RESPOSTA HTTP 429 E CABEÇALHOS
// ============================================================================

/**
 * Monta a resposta padronizada HTTP 429 Too Many Requests com cabeçalhos de rate limit
 */
export function createRateLimitResponse(
  action: RateLimitAction,
  retryAfter: number,
  resetAt?: number
): NextResponse {
  const config = RATE_LIMIT_CONFIGS[action];
  const safeRetryAfter = Math.max(1, retryAfter);
  const headers: Record<string, string> = {
    "Retry-After": safeRetryAfter.toString(),
    "X-RateLimit-Limit": config.maxAttempts.toString(),
    "X-RateLimit-Remaining": "0",
  };

  if (resetAt) {
    headers["X-RateLimit-Reset"] = Math.ceil(resetAt / 1000).toString();
  }

  return NextResponse.json(
    {
      error: config.errorMessage,
      code: "RATE_LIMITED",
      retryAfter: safeRetryAfter,
    },
    {
      status: 429,
      headers,
    }
  );
}
