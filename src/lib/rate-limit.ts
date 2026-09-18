import { NextRequest, NextResponse } from "next/server";

export interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
  errorMessage: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // segundos até liberar
  resetAt: number;    // timestamp Unix
}

// Configurações por endpoint
export const RATE_LIMIT_CONFIGS: Record<"login" | "register", RateLimitConfig> = {
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
};

interface CacheEntry {
  count: number;
  resetAt: number;
}

// Armazenamento em memória com controle de retenção
const rateLimitStore = new Map<string, CacheEntry>();

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

/**
 * Valida a taxa de requisições do identificador informado para a ação
 */
export function checkRateLimit(
  identifier: string,
  action: "login" | "register"
): RateLimitResult {
  const now = Date.now();
  const config = RATE_LIMIT_CONFIGS[action];
  const key = `${action}:${identifier}`;

  // Limpeza preventiva se o cache crescer acima de 10.000 registros
  if (rateLimitStore.size > 10000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt <= now) {
        rateLimitStore.delete(k);
      }
    }
  }

  const entry = rateLimitStore.get(key);

  // Se não existir ou a janela de tempo tiver expirado, cria novo ciclo
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

  // Se já atingiu o limite máximo de tentativas
  if (entry.count >= config.maxAttempts) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
      resetAt: entry.resetAt,
    };
  }

  // Incrementa a tentativa
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
 * Reseta o contador em caso de sucesso (por exemplo, após login bem-sucedido)
 */
export function resetRateLimit(identifier: string, action: "login" | "register"): void {
  const key = `${action}:${identifier}`;
  rateLimitStore.delete(key);
}

/**
 * Monta a resposta padronizada HTTP 429 Too Many Requests com cabeçalhos de rate limit
 */
export function createRateLimitResponse(
  action: "login" | "register",
  retryAfter: number
): NextResponse {
  const config = RATE_LIMIT_CONFIGS[action];
  return NextResponse.json(
    {
      error: config.errorMessage,
      retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": retryAfter.toString(),
        "X-RateLimit-Limit": config.maxAttempts.toString(),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
