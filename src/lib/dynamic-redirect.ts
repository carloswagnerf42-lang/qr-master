import { getAppUrl } from "./app-url";
import { checkRateLimit } from "./rate-limit";
import { normalizeVCardPayload } from "./qr-generator";

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
 * Formatos MIME permitidos para Data URIs raster inline.
 * SVG, XML, HTML e outros formatos executáveis/vetoriais são estritamente proibidos.
 */
const ALLOWED_RASTER_DATA_HEADERS = [
  "data:image/png;base64",
  "data:image/jpeg;base64",
  "data:image/jpg;base64",
  "data:image/webp;base64",
  "data:image/gif;base64",
];

/**
 * Decodifica com segurança o trecho inicial de um payload Base64 para inspeção de Magic Bytes.
 * Decodifica no máximo 64 caracteres Base64 (até 48 bytes binários) para zero sobrecarga de memória.
 */
function getInitialBytesFromBase64(payload: string): Uint8Array | null {
  try {
    const sliceLen = Math.min(payload.length - (payload.length % 4), 64);
    if (sliceLen < 4) return null;
    const chunk = payload.slice(0, sliceLen);
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(chunk, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    } else if (typeof atob !== "undefined") {
      const bin = atob(chunk);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return bytes;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Verifica se um hostname HTTP/HTTPS pertence a um domínio confiável autorizado
 * (Supabase Storage, avatares Google OAuth, domínio oficial da plataforma).
 * Previne host spoofing (*.attacker.com), acessos a redes internas e SSRF.
 */
function isAllowedRemoteImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (!host) return false;

  // Supabase official storage domain (*.supabase.co)
  if (host === "supabase.co" || host.endsWith(".supabase.co")) return true;

  // Google user content (OAuth avatars, *.googleusercontent.com)
  if (host === "googleusercontent.com" || host.endsWith(".googleusercontent.com")) return true;

  // Domínios oficiais da plataforma QR MASTER
  if (host === "qrmasterdigital.com" || host.endsWith(".qrmasterdigital.com")) return true;
  if (host === "qrmasterpro.vercel.app" || host.endsWith(".vercel.app")) return true;

  // Host configurado dinamicamente no Supabase (se fornecido via ambiente)
  const configuredSupabase = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configuredSupabase) {
    try {
      const cfgHost = new URL(configuredSupabase).hostname.toLowerCase();
      if (host === cfgHost || host.endsWith("." + cfgHost)) return true;
    } catch {}
  }

  // Host configurado dinamicamente para o App (se fornecido via ambiente)
  const configuredApp = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configuredApp) {
    try {
      const appHost = new URL(configuredApp).hostname.toLowerCase();
      if (appHost !== "localhost" && appHost !== "127.0.0.1") {
        if (host === appHost || host.endsWith("." + appHost)) return true;
      }
    } catch {}
  }

  return false;
}

/**
 * Valida se uma URL de imagem (avatar ou logotipo) utiliza protocolo e formato seguros.
 * - Suporta Data URIs raster autênticos (PNG, JPEG, WebP, GIF) com validação de magic bytes;
 * - Valida o tipo MIME estritamente no cabeçalho antes de ';base64,';
 * - Rejeita categoricamente SVG, XML, HTML, javascript:, blob: e esquemas maliciosos;
 * - Suporta caminhos relativos locais (/uploads/...);
 * - Para HTTP/HTTPS: valida host via URL parser, rejeita userinfo, localhost, IPs privados e spoofing.
 */
export function isSafeImageUrl(url: unknown): boolean {
  if (!url || typeof url !== "string") return true;

  const trimmed = url.trim();
  if (!trimmed) return true;

  // Rejeita caracteres de controle e null bytes
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return false;
  }

  const lower = trimmed.toLowerCase();

  // Rejeita explicitamente URLs protocol-relative (//evil.com)
  if (lower.startsWith("//")) return false;

  // Rejeita esquemas perigosos
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("about:") ||
    lower.startsWith("ftp:")
  ) {
    return false;
  }

  // Caminhos relativos locais seguros (/uploads/avatar.png)
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return true;
  }

  // Processamento estrutural de Data URIs
  if (lower.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx === -1) return false;

    const header = lower.slice(0, commaIdx);
    const payload = trimmed.slice(commaIdx + 1);

    // O cabeçalho deve começar com data:image/ e terminar com ;base64
    if (!header.startsWith("data:image/") || !header.endsWith(";base64")) {
      return false;
    }

    // O cabeçalho NÃO pode conter SVG, XML ou HTML
    if (header.includes("svg") || header.includes("xml") || header.includes("html")) {
      return false;
    }

    // Permite apenas formatos raster suportados oficialmente
    if (!ALLOWED_RASTER_DATA_HEADERS.includes(header)) {
      return false;
    }

    // Validação estrutural do payload Base64
    if (!payload || payload.length === 0) return false;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return false;
    if (payload.length % 4 === 1) return false;

    // Validação determinística de Magic Bytes para prevenir MIME spoofing (ex: HTML/SVG disfarçado de PNG)
    const magicBytes = getInitialBytesFromBase64(payload);
    if (!magicBytes) return false;

    if (header === "data:image/png;base64") {
      return (
        magicBytes.length >= 8 &&
        magicBytes[0] === 0x89 &&
        magicBytes[1] === 0x50 &&
        magicBytes[2] === 0x4e &&
        magicBytes[3] === 0x47 &&
        magicBytes[4] === 0x0d &&
        magicBytes[5] === 0x0a &&
        magicBytes[6] === 0x1a &&
        magicBytes[7] === 0x0a
      );
    }

    if (header === "data:image/jpeg;base64" || header === "data:image/jpg;base64") {
      return (
        magicBytes.length >= 3 &&
        magicBytes[0] === 0xff &&
        magicBytes[1] === 0xd8 &&
        magicBytes[2] === 0xff
      );
    }

    if (header === "data:image/webp;base64") {
      return (
        magicBytes.length >= 12 &&
        magicBytes[0] === 0x52 &&
        magicBytes[1] === 0x49 &&
        magicBytes[2] === 0x46 &&
        magicBytes[3] === 0x46 &&
        magicBytes[8] === 0x57 &&
        magicBytes[9] === 0x45 &&
        magicBytes[10] === 0x42 &&
        magicBytes[11] === 0x50
      );
    }

    if (header === "data:image/gif;base64") {
      return (
        magicBytes.length >= 6 &&
        magicBytes[0] === 0x47 &&
        magicBytes[1] === 0x49 &&
        magicBytes[2] === 0x46 &&
        magicBytes[3] === 0x38 &&
        (magicBytes[4] === 0x37 || magicBytes[4] === 0x39) &&
        magicBytes[5] === 0x61
      );
    }

    return false;
  }

  // Validação segura de URLs remotas HTTP/HTTPS
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return false;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;

    // Portas permitidas para conteúdo web
    if (parsed.port && parsed.port !== "80" && parsed.port !== "443" && parsed.port !== "8080") {
      return false;
    }

    const host = parsed.hostname.toLowerCase().trim();
    if (!host) return false;

    // Bloqueio de localhost e loopback
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "0.0.0.0" ||
      host.startsWith("127.")
    ) {
      return false;
    }

    // Bloqueio de IPv4 privados, link-local e especiais
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [_, a, b, c, d] = ipv4.map(Number);
      if (a > 255 || b > 255 || c > 255 || d > 255) return false;
      if (a === 127) return false;
      if (a === 10) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false;
      if (a === 0 || a >= 224) return false;
    }

    // Bloqueio de IPv6 link-local e unique-local
    if (
      host.startsWith("fe80:") ||
      host.startsWith("[fe80:") ||
      host.startsWith("fc00:") ||
      host.startsWith("[fc00:") ||
      host.startsWith("fd00:") ||
      host.startsWith("[fd00:")
    ) {
      return false;
    }

    // Allowlist estrita de hosts remotos autorizados (Supabase, Google, Domínio Oficial)
    return isAllowedRemoteImageHost(host);
  }

  return false;
}



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

  // 1. Verificação de null bytes e caracteres de controle (preservando quebras de linha e tabs para vCard/vCalendar/texto)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
    return { valid: false, error: "Destino contém caracteres de controle inválidos." };
  }

  const lower = trimmed.toLowerCase();

  // 2. Bloqueio de protocolos inseguros (javascript:, data:, file:, etc.)
  for (const proto of FORBIDDEN_PROTOCOLS) {
    if (lower.startsWith(proto)) {
      return { valid: false, error: `Protocolo de destino "${proto}" não é permitido por segurança.` };
    }
  }

  // 3. Verificação de esquemas especiais válidos (tel:, sms:, mailto:, geo:, whatsapp:, wifi:, begin:vcard, mecard:, 000201, begin:vcalendar)
  if (/^tel:/i.test(trimmed)) {
    const phonePart = trimmed.replace(/^tel:/i, "").trim();
    const digits = phonePart.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { valid: false, error: "Número de telefone inválido no destino tel: (esperado entre 8 e 15 dígitos)." };
    }
    return { valid: true, sanitizedUrl: trimmed };
  }

  if (/^sms:/i.test(trimmed)) {
    const smsPart = trimmed.replace(/^sms:/i, "").split("?")[0].trim();
    const digits = smsPart.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { valid: false, error: "Número de telefone inválido no destino sms: (esperado entre 8 e 15 dígitos)." };
    }
    return { valid: true, sanitizedUrl: trimmed };
  }

  if (/^mailto:/i.test(trimmed)) {
    const mailPart = trimmed.replace(/^mailto:/i, "").split("?")[0].trim();
    if (!mailPart || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailPart)) {
      return { valid: false, error: "Endereço de e-mail inválido no destino mailto:." };
    }
    return { valid: true, sanitizedUrl: trimmed };
  }

  if (/^begin:vcard/i.test(trimmed)) {
    if (!/\bend:vcard\s*$/i.test(trimmed)) {
      return { valid: false, error: "Payload vCard inválido: END:VCARD ausente." };
    }
    return { valid: true, sanitizedUrl: normalizeVCardPayload(trimmed) };
  }

  if (/^(geo:|whatsapp:|wifi:|mecard:|000201|begin:vcalendar)/i.test(trimmed)) {
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

    // Loop 2: Destino no mesmo host ou domínio da plataforma apontando para rota de redirecionamento /q/
    try {
      const appHost = new URL(appUrl).host.toLowerCase();
      const targetHost = parsedUrl.host.toLowerCase();
      const isPlatformHost =
        targetHost === appHost ||
        targetHost.includes("qrmasterdigital.com") ||
        targetHost.includes("qrmasterpro.vercel.app") ||
        targetHost.includes("localhost:3000") ||
        targetHost === "localhost";

      if (isPlatformHost && parsedUrl.pathname.toLowerCase().startsWith("/q/")) {
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
 * Rate Limiter em memória para proteção contra abuso e flood de telemetria (fallback).
 * Limita o registro de scans repetidos do mesmo IP no mesmo shortCode (máx 60 scans/minuto).
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitCache = new Map<string, RateLimitEntry>();

export function checkShortCodeRateLimitLocal(
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

/**
 * Valida a taxa de scans de um IP para um shortCode específico.
 * Utiliza o namespace distribuído qr-master:rl:scan no Upstash Redis quando disponível,
 * e reverte para fallback local sem nunca interromper o redirecionamento.
 */
export async function checkShortCodeRateLimit(
  ipHash: string,
  shortCode: string,
  maxPerMinute: number = 60
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const key = `${ipHash}:${shortCode}`;
    if (maxPerMinute === 60) {
      const res = await checkRateLimit(key, "scan");
      return { allowed: res.allowed, remaining: res.remaining };
    }
    return checkShortCodeRateLimitLocal(ipHash, shortCode, maxPerMinute);
  } catch {
    // Falhas de telemetria nunca devem impedir o redirecionamento
    return checkShortCodeRateLimitLocal(ipHash, shortCode, maxPerMinute);
  }
}
