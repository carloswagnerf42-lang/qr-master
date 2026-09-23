import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signToken, setSessionCookie } from "@/lib/auth";
import { getClientIp, checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(ip, "register");
    if (!rateCheck.allowed) {
      return createRateLimitResponse("register", rateCheck.retryAfter, rateCheck.resetAt);
    }

    const { name, email, password, company, phone } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são campos obrigatórios." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve conter no mínimo 6 caracteres." },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado em nossa plataforma." },
        { status: 409 }
      );
    }

    // Busca o plano padrão FREE ou PRO
    const defaultPlan = await prisma.plan.findFirst({
      where: { name: "FREE" },
    });

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        role: "USER",
        company: company ? company.trim() : null,
        phone: phone ? phone.trim() : null,
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
      },
    });

    // Cria categorias iniciais padrão
    await prisma.category.createMany({
      data: [
        { userId: user.id, name: "Marketing", color: "#6366f1" },
        { userId: user.id, name: "Vendas", color: "#10b981" },
        { userId: user.id, name: "Redes Sociais", color: "#06b6d4" },
      ],
    });

    const token = signToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      planId: user.planId,
    });

    setSessionCookie(token);

    // Registra log de atividade
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        description: "Conta criada e primeiro login efetuado com sucesso",
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
    console.error("Erro na rota de cadastro:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao processar o cadastro." },
      { status: 500 }
    );
  }
}
