import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signToken, setSessionCookie } from "@/lib/auth";
import { getClientIp, checkRateLimit, resetRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { verifyGoogleIdToken } from "@/lib/google-auth";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://qrmasterdigital.com").replace(/\/$/, "");

  if (!clientId) {
    return NextResponse.redirect(`${appUrl}/login?error=google_client_id_not_configured`);
  }

  const redirectUri = `${appUrl}/api/auth/callback/google`;
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=select_account`;

  return NextResponse.redirect(googleAuthUrl);
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(ip, "google");
    if (!rateCheck.allowed) {
      return createRateLimitResponse("google", rateCheck.retryAfter, rateCheck.resetAt);
    }

    const { credential } = await req.json().catch(() => ({}));

    if (!credential || typeof credential !== "string") {
      return NextResponse.json(
        { error: "Credencial do Google não informada." },
        { status: 400 }
      );
    }

    // Valida o token ID do Google no servidor
    const googleUser = await verifyGoogleIdToken(credential);

    if (!googleUser || !googleUser.emailVerified) {
      return NextResponse.json(
        { error: "Token de autenticação do Google inválido, expirado ou e-mail não verificado." },
        { status: 401 }
      );
    }

    // 1. Verifica se já existe vínculo em AuthAccount para este Google sub ID
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
      resetRateLimit(ip, "login");

      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "LOGIN",
          description: "Login realizado com sucesso via Google",
        },
      });

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    // 2. Não possui vínculo AuthAccount: verifica se já existe conta pelo e-mail
    const existingUser = await prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (existingUser) {
      // Se a conta já existe e tem senha configurada, exige confirmação de senha para vinculação segura
      if (existingUser.passwordHash) {
        return NextResponse.json({
          requiresLink: true,
          email: existingUser.email,
          name: existingUser.name,
          message: "Uma conta com este e-mail já existe. Digite a senha da sua conta para vincular o acesso com o Google com total segurança.",
        });
      }

      // Se não possui senha (ex: conta criada por outro provedor), vincula diretamente
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
      await resetRateLimit(ip, "google");
      await resetRateLimit(ip, "login");

      await prisma.activityLog.create({
        data: {
          userId: existingUser.id,
          action: "LOGIN",
          description: "Identidade Google vinculada e login realizado com sucesso",
        },
      });

      return NextResponse.json({
        success: true,
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
        },
      });
    }

    // 3. Usuário novo: realiza o cadastro completo via Google
    const defaultPlan = await prisma.plan.findFirst({
      where: { name: "FREE" },
    });

    const newUser = await prisma.user.create({
      data: {
        name: googleUser.name,
        email: googleUser.email,
        passwordHash: null,
        role: googleUser.email.toLowerCase().trim() === "masterdigitalqr@gmail.com" ? "ADMIN" : "USER",
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

    // Cria categorias iniciais padrão
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
    await resetRateLimit(ip, "google");
    await resetRateLimit(ip, "login");

    await prisma.activityLog.create({
      data: {
        userId: newUser.id,
        action: "LOGIN",
        description: "Conta criada e primeiro login efetuado via Google",
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Erro na rota de autenticação Google:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao processar a autenticação com o Google." },
      { status: 500 }
    );
  }
}
