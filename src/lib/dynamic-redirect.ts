import { getAppUrl } from "./app-url";

export interface DestinationValidationResult {
  valid: boolean;
  sanitizedUrl?: string;
  error?: string;
}

/**
 * Esquemas perigosos explicitamente bloqueados para prevenção de XSS e injeção
 */
const FORBIDDEN_PROTOCOLS = ["javascript:", "data:", "vbscript:", "file:", "blob:"];

/**
 * Valida e higieniza a URL de destino de um QR Code dinâmico,
 * prevenindo esquemas perigosos, loops de redirecionamento e URLs malformadas.
 */
export function validateAndNormalizeDestination(
  destination: string | null | undefined,
  currentShortCode?: string | null
): DestinationValidationResult {
  if (!destination || typeof destination !== "string") {
    return { valid: false, error: "Destino não informado ou inválido." };
  }

  const trimmed = destination.trim();

  // 1. Verificação de null bytes e caracteres de controle
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return { valid: false, error: "Destino contém caracteres de controle inválidos." };
  }

  const lower = trimmed.toLowerCase();

  // 2. Bloqueio de protocolos inseguros (javascript:, data:, file:, etc.)
  for (const proto of FORBIDDEN_PROTOCOLS) {
    if (lower.startsWith(proto)) {
      return { valid: false, error: `Protocolo de destino "${proto}" não é permitido por segurança.` };
    }
  }

  // 3. Verificação de esquemas especiais válidos (tel:, mailto:, sms:, geo:, whatsapp:)
  if (/^(tel:|mailto:|sms:|geo:|whatsapp:)/i.test(trimmed)) {
    return { valid: true, sanitizedUrl: trimmed };
  }

  // 4. Normalização de URL Web (adiciona https:// se faltar)
  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  // 5. Verificação de estrutura válida via construtor URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    return { valid: false, error: "URL de destino malformada." };
  }

  // 6. Prevenção de Loops de Redirecionamento (Loop Detection)
  if (currentShortCode && typeof currentShortCode === "string") {
    const appUrl = getAppUrl().toLowerCase();
    const targetUrl = parsedUrl.href.toLowerCase();

    // Loop 1: Aponta para a própria rota /q/[currentShortCode]
    if (
      targetUrl.includes(`/q/${currentShortCode.toLowerCase()}`) ||
      (parsedUrl.pathname.toLowerCase() === `/q/${currentShortCode.toLowerCase()}`)
    ) {
      return {
        valid: false,
        error: "Loop de redirecionamento detectado: o destino não pode apontar para o próprio QR Code.",
      };
    }

    // Loop 2: Destino no mesmo host apontando para rota de redirecionamento /q/
    try {
      const appHost = new URL(appUrl).host;
      if (parsedUrl.host === appHost && parsedUrl.pathname.toLowerCase().startsWith("/q/")) {
        return {
          valid: false,
          error: "Loop de redirecionamento detectado: não é permitido encadear múltiplos QR Codes.",
        };
      }
    } catch {
      // Ignora erro ao comparar host se URL base for relativa em teste
    }
  }

  return { valid: true, sanitizedUrl: parsedUrl.href };
}

/**
 * Rate Limiter em memória para proteção contra abuso e flood de telemetria.
 * Limita o registro de scans repetidos do mesmo IP no mesmo shortCode (máx 60 scans/minuto).
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitCache = new Map<string, RateLimitEntry>();

export function checkShortCodeRateLimit(
  ipHash: string,
  shortCode: string,
  maxPerMinute: number = 60
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const key = `${ipHash}:${shortCode}`;
  const entry = rateLimitCache.get(key);

  // Limpeza de entradas expiradas periodicamente se o cache crescer
  if (rateLimitCache.size > 5000) {
    for (const [k, v] of rateLimitCache.entries()) {
      if (v.resetAt <= now) {
        rateLimitCache.delete(k);
      }
    }
  }

  if (!entry || entry.resetAt <= now) {
    rateLimitCache.set(key, {
      count: 1,
      resetAt: now + 60 * 1000,
    });
    return { allowed: true, remaining: maxPerMinute - 1 };
  }

  if (entry.count >= maxPerMinute) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxPerMinute - entry.count };
}
