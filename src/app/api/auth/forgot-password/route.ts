import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateSecureToken } from "@/lib/auth";
import { getClientIp, checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(ip, "forgotPassword");
    if (!rateCheck.allowed) {
      return createRateLimitResponse("forgotPassword", rateCheck.retryAfter, rateCheck.resetAt);
    }

    const { email } = await req.json().catch(() => ({}));

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Por favor, informe um endereço de e-mail válido." },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    // Mensagem de sucesso genérica para proteção contra enumeração de e-mails
    const successMessage = "Se este e-mail estiver cadastrado em nossa plataforma, você receberá um link seguro para redefinir sua senha em instantes.";

    if (!user) {
      return NextResponse.json({
        success: true,
        message: successMessage,
      });
    }

    // Invalida tokens anteriores não utilizados do usuário
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Gera novo token criptográfico de uso único
    const { rawToken, tokenHash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora de validade

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Constrói a URL de redefinição
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://qrmasterdigital.com").replace(/\/$/, "");
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    // Dispara o e-mail oficial
    await sendPasswordResetEmail(user.email, resetUrl, user.name);

    // Registra log de auditoria
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "REQUEST_PASSWORD_RESET",
        description: "Solicitação de recuperação de senha gerada",
      },
    });

    return NextResponse.json({
      success: true,
      message: successMessage,
    });
  } catch (error) {
    console.error("Erro na rota de recuperação de senha:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao processar a recuperação de senha." },
      { status: 500 }
    );
  }
}
