import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, signToken, setSessionCookie } from "@/lib/auth";
import { getClientIp, checkRateLimit, resetRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { verifyGoogleIdToken, GOOGLE_LINK_COOKIE, getOAuthCookieOptions } from "@/lib/google-auth";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(ip, "google");
    if (!rateCheck.allowed) {
      return createRateLimitResponse("google", rateCheck.retryAfter, rateCheck.resetAt);
    }

    const body = await req.json().catch(() => ({}));
    let { credential, password } = body;

    // Recupera credencial transitória do cookie seguro caso não venha no body
    if (!credential) {
      const linkCookie = req.cookies.get(GOOGLE_LINK_COOKIE)?.value;
      if (linkCookie) {
        credential = linkCookie;
      }
    }

    if (!credential || !password) {
      return NextResponse.json(
        { error: "Credencial do Google e senha da conta são obrigatórias." },
        { status: 400 }
      );
    }

    const googleUser = await verifyGoogleIdToken(credential);

    if (!googleUser || !googleUser.emailVerified) {
      return NextResponse.json(
        { error: "Token de autenticação do Google inválido ou expirado." },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Nenhuma conta associada ao e-mail informado foi encontrada." },
        { status: 404 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "Esta conta já opera sem senha via provedor federado." },
        { status: 400 }
      );
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Senha incorreta. Por favor, digite a senha correta da sua conta QR MASTER." },
        { status: 401 }
      );
    }

    // Cria ou atualiza o vínculo de autenticação social
    await prisma.authAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: googleUser.sub,
        },
      },
      update: {
        userId: user.id,
      },
      create: {
        userId: user.id,
        provider: "google",
        providerAccountId: googleUser.sub,
      },
    });

    const token = signToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      planId: user.planId,
    });

    setSessionCookie(token);
    await resetRateLimit(ip, "google");
    await resetRateLimit(ip, "login");

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        description: "Conta Google vinculada com sucesso à conta existente após confirmação de senha",
      },
    });

    const response = NextResponse.json({
      success: true,
      message: "Conta vinculada com sucesso!",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    const clearLinkOptions = getOAuthCookieOptions(0);
    response.cookies.set(GOOGLE_LINK_COOKIE, "", clearLinkOptions);
    response.cookies.set(GOOGLE_LINK_COOKIE, "", { maxAge: 0, path: "/" });

    return response;
  } catch (error) {
    console.error("Erro na vinculação de conta Google:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao processar a vinculação de conta." },
      { status: 500 }
    );
  }
}
