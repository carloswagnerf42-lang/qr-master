import crypto from "crypto";

/**
 * Utilitário de validação segura de credenciais do Google Identity Services e OAuth 2.0.
 */

export const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_VERIFIER_COOKIE = "oauth_code_verifier";
export const GOOGLE_LINK_COOKIE = "qrmaster_link_credential";

export function getOAuthCookieDomain(hostname?: string): string | undefined {
  if (process.env.NODE_ENV !== "production") {
    return undefined;
  }
  if (!hostname) {
    return ".qrmasterdigital.com";
  }
  const clean = hostname.split(":")[0].toLowerCase();
  if (clean === "localhost" || clean === "127.0.0.1") {
    return undefined;
  }
  if (clean.includes("qrmasterdigital.com")) {
    return ".qrmasterdigital.com";
  }
  return undefined;
}

export function getOAuthCookieOptions(maxAgeSeconds = 300, hostname?: string) {
  const domain = getOAuthCookieDomain(hostname);
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
    ...(domain ? { domain } : {}),
  };
}

/**
 * Gera um state criptograficamente aleatório para prevenção de OAuth CSRF.
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Gera um code_verifier seguro para PKCE (RFC 7636).
 */
export function generatePkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Gera o code_challenge a partir do code_verifier utilizando SHA256 base64url (S256).
 */
export function generatePkceChallenge(codeVerifier: string): string {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

/**
 * Comparação segura em tempo constante para mitigar timing attacks.
 */
export function safeCompare(a?: string | null, b?: string | null): boolean {
  if (!a || !b || typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface GooglePayload {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GooglePayload | null> {
  if (!idToken || typeof idToken !== "string") {
    return null;
  }

  // Suporte a ambiente de testes controlados (evita dependência de rede externa nos testes automatizados)
  if (process.env.NODE_ENV === "test" || process.env.ENABLE_TEST_AUTH === "true") {
    if (idToken.startsWith("test_mock_token:")) {
      try {
        const payloadJson = Buffer.from(idToken.replace("test_mock_token:", ""), "base64").toString("utf-8");
        const parsed = JSON.parse(payloadJson);
        return {
          sub: parsed.sub || "mock_google_sub_12345",
          email: parsed.email.toLowerCase().trim(),
          emailVerified: parsed.emailVerified !== false,
          name: parsed.name || "Usuário Teste Google",
          picture: parsed.picture,
        };
      } catch {
        return null;
      }
    }
  }

  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`;
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Valida emissor oficial do Google
    const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
    if (!validIssuers.includes(data.iss)) {
      return null;
    }

    // Valida expiração
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const exp = parseInt(data.exp, 10);
    if (isNaN(exp) || exp < nowInSeconds) {
      return null;
    }

    // Valida Audience (Client ID) se estiver configurado no ambiente
    const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (googleClientId && data.aud !== googleClientId) {
      return null;
    }

    // Valida se o e-mail foi verificado pelo Google
    const isEmailVerified = data.email_verified === "true" || data.email_verified === true;
    if (!isEmailVerified || !data.email) {
      return null;
    }

    return {
      sub: data.sub,
      email: data.email.toLowerCase().trim(),
      emailVerified: true,
      name: data.name || data.email.split("@")[0],
      picture: data.picture,
    };
  } catch (error) {
    console.error("Erro ao validar token Google:", error);
    return null;
  }
}
