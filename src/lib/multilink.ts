/**
 * Utilitário central de validação e sanitização de URLs para o módulo Multi-Link
 * Previne ataques de Cross-Site Scripting (XSS), injeções de protocolos perigosos
 * e caracteres de controle maliciosos.
 */

// Protocolos web e de comunicação explicitamente permitidos
export const ALLOWED_PROTOCOLS = ["https:", "http:", "mailto:", "tel:", "sms:", "whatsapp:"];

// Protocolos perigosos sumariamente bloqueados
export const FORBIDDEN_PROTOCOLS = [
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
  "about:",
];

export interface MultiLinkValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
}

export interface MultiLinkItem {
  title: string;
  url: string;
}

/**
 * Valida e normaliza uma URL de link para páginas Multi-Link.
 * Rejeita terminantemente esquemas perigosos como javascript:, data:, vbscript:.
 */
export function validateMultiLinkUrl(rawUrl: string | null | undefined): MultiLinkValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "URL não informada ou inválida." };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, error: "URL não pode ser vazia." };
  }

  // 1. Rejeita null bytes, quebras de linha e caracteres de controle (ASCII 0x00 - 0x1F, 0x7F)
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return { valid: false, error: "URL contém caracteres de controle inválidos." };
  }

  // Normaliza representações para verificação de esquemas maliciosos
  const cleanLower = trimmed.replace(/\s+/g, "").toLowerCase();

  // 2. Bloqueio explícito de protocolos perigosos
  for (const forbidden of FORBIDDEN_PROTOCOLS) {
    if (cleanLower.startsWith(forbidden)) {
      return {
        valid: false,
        error: `O protocolo "${forbidden}" é estritamente proibido por motivos de segurança (prevenção XSS).`,
      };
    }
  }

  // 3. Protocolos de comunicação permitidos (mailto:, tel:, sms:, whatsapp:)
  if (/^(mailto:|tel:|sms:|whatsapp:)/i.test(trimmed)) {
    // Valida que o esquema seja seguido por dados reais (não apenas o prefixo)
    const parts = trimmed.split(":");
    if (parts.length < 2 || !parts[1].trim()) {
      return { valid: false, error: "Link de contato incompleto." };
    }
    return { valid: true, normalizedUrl: trimmed };
  }

  // 4. Normalização de URL Web (HTTP / HTTPS)
  let urlToParse = trimmed;

  // Se inicia com protocolo relativo //exemplo.com
  if (urlToParse.startsWith("//")) {
    urlToParse = `https:${urlToParse}`;
  } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlToParse)) {
    // Se não possui nenhum esquema definido (ex: "meusite.com.br" ou "www.instagram.com")
    urlToParse = `https://${urlToParse}`;
  }

  // 5. Validação rigorosa via construtor padrão URL
  try {
    const parsed = new URL(urlToParse);

    // Garante que o protocolo final seja exclusivamente http: ou https:
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        valid: false,
        error: `Protocolo "${parsed.protocol}" não é permitido para links web. Utilize https:// ou http://.`,
      };
    }

    // Garante que exista um hostname válido
    if (!parsed.hostname || parsed.hostname.length < 3 || !parsed.hostname.includes(".")) {
      // Exceção apenas para localhost em desenvolvimento
      if (parsed.hostname !== "localhost") {
        return { valid: false, error: "Nome de domínio (host) inválido na URL." };
      }
    }

    return {
      valid: true,
      normalizedUrl: parsed.href,
    };
  } catch {
    return { valid: false, error: "Estrutura da URL inválida ou malformada." };
  }
}

/**
 * Retorna a URL segura normalizada ou null se a URL for perigosa/inválida.
 */
export function sanitizeMultiLinkUrl(rawUrl: string | null | undefined): string | null {
  const result = validateMultiLinkUrl(rawUrl);
  return result.valid && result.normalizedUrl ? result.normalizedUrl : null;
}

/**
 * Higieniza uma lista inteira de links, descartando os que apresentarem protocolos perigosos.
 */
export function sanitizeMultiLinkLinks(links: any[]): MultiLinkItem[] {
  if (!Array.isArray(links)) return [];

  const sanitized: MultiLinkItem[] = [];

  for (const item of links) {
    if (!item || typeof item !== "object") continue;

    const title = typeof item.title === "string" ? item.title.trim().substring(0, 80) : "Link";
    const safeUrl = sanitizeMultiLinkUrl(item.url);

    if (safeUrl) {
      sanitized.push({
        title: title || "Link",
        url: safeUrl,
      });
    }
  }

  return sanitized;
}
