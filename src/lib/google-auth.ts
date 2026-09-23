/**
 * Utilitário de validação segura de credenciais do Google Identity Services.
 */

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
