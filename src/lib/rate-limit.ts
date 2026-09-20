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

export type RateLimitAction = "login" | "register" | "checkout" | "portal" | "qr";

// Configurações por endpoint
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
 * Valida a taxa de requisições do identificador informado para a ação.
 * Suporta parâmetro opcional nowMs para facilitar testes temporais determinísticos.
 */
export function checkRateLimit(
  identifier: string,
  action: RateLimitAction,
  nowMs?: number
): RateLimitResult {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
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
 * Reseta o contador em caso de sucesso ou expiração forçada
 */
export function resetRateLimit(identifier: string, action?: RateLimitAction): void {
  if (action) {
    const key = `${action}:${identifier}`;
    rateLimitStore.delete(key);
  } else {
    for (const key of Array.from(rateLimitStore.keys())) {
      if (key.endsWith(`:${identifier}`)) {
        rateLimitStore.delete(key);
      }
    }
  }
}

/**
 * Monta a resposta padronizada HTTP 429 Too Many Requests com cabeçalhos de rate limit
 */
export function createRateLimitResponse(
  action: RateLimitAction,
  retryAfter: number,
  resetAt?: number
): NextResponse {
  const config = RATE_LIMIT_CONFIGS[action];
  const headers: Record<string, string> = {
    "Retry-After": retryAfter.toString(),
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
      retryAfter,
    },
    {
      status: 429,
      headers,
    }
  );
}
