import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signToken, setSessionCookie } from "@/lib/auth";
import { verifyGoogleIdToken } from "@/lib/google-auth";

/**
 * Endpoint de Callback do Google OAuth 2.0
 * Suporta:
 * 1. GET: Fluxo padrão OAuth 2.0 Authorization Code (code -> tokens -> sessão -> redirect)
 * 2. POST: Fluxo Google Identity Services em modo redirect (form-data com 'credential')
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://qrmasterpro.vercel.app").replace(/\/$/, "");

  if (error) {
    console.error("[Google OAuth Callback Error]:", error, errorDescription);
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(errorDescription || error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_code`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${appUrl}/api/auth/callback/google`;

  if (!clientId || !clientSecret) {
    console.error("[Google OAuth Error]: GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET ausentes no ambiente.");
    return NextResponse.redirect(`${appUrl}/login?error=oauth_configuration_missing`);
  }

  try {
    // 1. Troca o Authorization Code pelo ID Token e Access Token com o Google
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error("[Google Token Exchange Failed]:", errBody);
      return NextResponse.redirect(`${appUrl}/login?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const idToken = tokenData.id_token;

    if (!idToken) {
      return NextResponse.redirect(`${appUrl}/login?error=missing_id_token`);
    }

    // 2. Valida o ID Token recebido
    const googleUser = await verifyGoogleIdToken(idToken);
    if (!googleUser || !googleUser.emailVerified) {
      return NextResponse.redirect(`${appUrl}/login?error=unverified_google_account`);
    }

    // 3. Processa Login / Cadastro / Vinculação
    return await processGoogleUserAndRedirect(googleUser, idToken, appUrl);
  } catch (err) {
    console.error("[Google OAuth Exception]:", err);
    return NextResponse.redirect(`${appUrl}/login?error=server_error`);
  }
}

export async function POST(req: NextRequest) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://qrmasterpro.vercel.app").replace(/\/$/, "");

  try {
    let credential = "";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      credential = (formData.get("credential") as string) || "";
    } else {
      const body = await req.json().catch(() => ({}));
      credential = body.credential || "";
    }

    if (!credential) {
      return NextResponse.redirect(`${appUrl}/login?error=missing_credential`);
    }

    const googleUser = await verifyGoogleIdToken(credential);
    if (!googleUser || !googleUser.emailVerified) {
      return NextResponse.redirect(`${appUrl}/login?error=unverified_google_account`);
    }

    return await processGoogleUserAndRedirect(googleUser, credential, appUrl);
  } catch (err) {
    console.error("[Google OAuth POST Exception]:", err);
    return NextResponse.redirect(`${appUrl}/login?error=server_error`);
  }
}

async function processGoogleUserAndRedirect(
  googleUser: { sub: string; email: string; name: string; picture?: string },
  credential: string,
  appUrl: string
) {
  // A. Verifica se existe conta em AuthAccount para este Google sub ID
  const existingAccount = await prisma.authAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: googleUser.sub,
      },
    },
    include: { user: true },
  });

  if (existingAccount && existingAccount.user) {
    const user = existingAccount.user;
    const token = signToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      planId: user.planId,
    });

    setSessionCookie(token);

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        description: "Login efetuado via Google OAuth Redirect",
      },
    });

    return NextResponse.redirect(`${appUrl}/dashboard`);
  }

  // B. Verifica se usuário já existe pelo e-mail
  const existingUser = await prisma.user.findUnique({
    where: { email: googleUser.email },
  });

  if (existingUser) {
    // Se possui senha, exige vinculação segura (Cenário C)
    if (existingUser.passwordHash) {
      return NextResponse.redirect(
        `${appUrl}/login?link_email=${encodeURIComponent(existingUser.email)}&google_credential=${encodeURIComponent(
          credential
        )}`
      );
    }

    // Se não tem senha (ex: outro OAuth), vincula direto
    await prisma.authAccount.create({
      data: {
        userId: existingUser.id,
        provider: "google",
        providerAccountId: googleUser.sub,
      },
    });

    const token = signToken({
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
      role: existingUser.role,
      planId: existingUser.planId,
    });

    setSessionCookie(token);

    await prisma.activityLog.create({
      data: {
        userId: existingUser.id,
        action: "LOGIN",
        description: "Conta Google vinculada via OAuth Redirect",
      },
    });

    return NextResponse.redirect(`${appUrl}/dashboard`);
  }

  // C. Usuário novo: cadastro com plano FREE
  const defaultPlan = await prisma.plan.findFirst({
    where: { name: "FREE" },
  });

  const newUser = await prisma.user.create({
    data: {
      name: googleUser.name,
      email: googleUser.email,
      passwordHash: null,
      avatarUrl: googleUser.picture || null,
      planId: defaultPlan?.id || null,
      settings: {
        create: {
          theme: "system",
          language: "pt-BR",
          notifyNewScans: true,
          notifyWeeklyReport: true,
          notifyLimitAlert: true,
          analyticsConsent: true,
          dataRetentionDays: 365,
        },
      },
      accounts: {
        create: {
          provider: "google",
          providerAccountId: googleUser.sub,
        },
      },
    },
  });

  await prisma.category.createMany({
    data: [
      { userId: newUser.id, name: "Marketing", color: "#6366f1" },
      { userId: newUser.id, name: "Vendas", color: "#10b981" },
      { userId: newUser.id, name: "Redes Sociais", color: "#06b6d4" },
    ],
  });

  const token = signToken({
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    planId: newUser.planId,
  });

  setSessionCookie(token);

  await prisma.activityLog.create({
    data: {
      userId: newUser.id,
      action: "LOGIN",
      description: "Conta criada e login efetuado via Google OAuth Redirect",
    },
  });

  return NextResponse.redirect(`${appUrl}/dashboard`);
}
