import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  verifyPassword,
  createAuthenticatedSessionToken,
  setSessionCookie,
  DUMMY_PASSWORD_HASH,
} from "@/lib/auth";
import { getClientIp, checkRateLimit, resetRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(ip, "login");
    if (!rateCheck.allowed) {
      return createRateLimitResponse("login", rateCheck.retryAfter, rateCheck.resetAt);
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "E-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Mitigação contra Timing Attack (SEC-AUDIT-08D):
    // Se o usuário não existe ou é conta Google-only (sem passwordHash local),
    // executa bcrypt.compare contra DUMMY_PASSWORD_HASH com o mesmo cost factor (10)
    // para equalizar a latência e neutralizar a enumeração de contas por canal lateral temporal.
    const targetHash = user?.passwordHash || DUMMY_PASSWORD_HASH;
    const isValid = await verifyPassword(password, targetHash);

    if (!user || !user.passwordHash || !isValid) {
      return NextResponse.json(
        { error: "Credenciais inválidas. Verifique seu e-mail e senha." },
        { status: 401 }
      );
    }

    const userAgent = req.headers.get("user-agent");
    const { token } = await createAuthenticatedSessionToken(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        planId: user.planId,
      },
      { userAgent, ipAddress: ip }
    );

    setSessionCookie(token);
    await resetRateLimit(ip, "login");

    // Registra log de atividade
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        description: "Login realizado com sucesso",
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
  } catch (error) {
    console.error("Erro na rota de login:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao processar o login." },
      { status: 500 }
    );
  }
}
