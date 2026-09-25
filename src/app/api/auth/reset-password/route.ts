import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, hashToken, revokeAllUserSessions } from "@/lib/auth";
import { getClientIp, checkRateLimit, resetRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(ip, "resetPassword");
    if (!rateCheck.allowed) {
      return createRateLimitResponse("resetPassword", rateCheck.retryAfter, rateCheck.resetAt);
    }

    const { token, password } = await req.json().catch(() => ({}));

    if (!token || typeof token !== "string" || token.trim().length === 0) {
      return NextResponse.json(
        { error: "Token de redefinição inválido ou ausente." },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "A nova senha deve conter no mínimo 6 caracteres." },
        { status: 400 }
      );
    }

    const tokenHash = hashToken(token.trim());

    // Busca o registro do token no banco de dados
    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Link de redefinição inválido ou inexistente. Por favor, solicite uma nova redefinição." },
        { status: 400 }
      );
    }

    if (tokenRecord.usedAt !== null) {
      return NextResponse.json(
        { error: "Este link de redefinição já foi utilizado anteriormente. Solicite um novo link se necessário." },
        { status: 400 }
      );
    }

    if (tokenRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Este link de redefinição expirou (validade máxima de 1 hora). Por favor, solicite um novo link." },
        { status: 400 }
      );
    }

    // Hash da nova senha
    const newPasswordHash = await hashPassword(password);

    // Atualiza a senha do usuário
    await prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { passwordHash: newPasswordHash },
    });

    // Revoga todas as sessões ativas do usuário em todos os dispositivos
    await revokeAllUserSessions(tokenRecord.userId);

    // Marca o token como utilizado
    await prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    // Invalida outros tokens pendentes deste usuário
    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: tokenRecord.userId,
        id: { not: tokenRecord.id },
      },
    });

    // Reseta o rate limit para este IP
    await resetRateLimit(ip, "resetPassword");

    // Registra log de auditoria
    await prisma.activityLog.create({
      data: {
        userId: tokenRecord.userId,
        action: "RESET_PASSWORD",
        description: "Senha redefinida com sucesso via token de recuperação",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Senha redefinida com sucesso! Você já pode entrar com sua nova senha.",
    });
  } catch (error) {
    console.error("Erro na rota de redefinição de senha:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao processar a redefinição de senha." },
      { status: 500 }
    );
  }
}
