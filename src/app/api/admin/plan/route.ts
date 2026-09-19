import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/admin";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.success) return auth.errorResponse;

    const plans = await prisma.plan.findMany({
      orderBy: { priceMonth: "asc" },
      include: {
        _count: {
          select: { users: true, subscriptions: true },
        },
      },
    });

    return NextResponse.json({ success: true, plans });
  } catch (error) {
    console.error("Erro ao listar planos administrativos:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao listar planos." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.success) return auth.errorResponse;
    const admin = auth.admin;

    const body = await req.json();
    const { userId, planId, planName, durationDays = 30, paymentNote, status = "ACTIVE" } = body;

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário não especificado." }, { status: 400 });
    }

    // Localiza o usuário alvo
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    // Localiza o plano selecionado
    let selectedPlan = null;
    if (planId) {
      selectedPlan = await prisma.plan.findUnique({ where: { id: planId } });
    } else if (planName) {
      selectedPlan = await prisma.plan.findUnique({ where: { name: planName } });
    }

    if (!selectedPlan) {
      return NextResponse.json({ error: "Plano selecionado não é válido." }, { status: 400 });
    }

    const now = new Date();
    const effectiveDays = Math.max(1, Number(durationDays) || 30);
    const periodEnd = new Date(now.getTime() + effectiveDays * 24 * 60 * 60 * 1000);

    // 1. Atualiza o planId no usuário
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        planId: selectedPlan.id,
      },
      include: {
        plan: true,
        subscription: true,
      },
    });

    // 2. Atualiza ou cria a assinatura (Subscription) com período e status
    const subscription = await prisma.subscription.upsert({
      where: { userId: userId },
      create: {
        userId: userId,
        planId: selectedPlan.id,
        status: status || "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      update: {
        planId: selectedPlan.id,
        status: status || "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    // 3. Registra no log de auditoria
    const noteText = paymentNote ? ` (Origem: ${paymentNote})` : " (Ativação manual admin)";
    await logAdminAction({
      adminId: admin.id,
      action: "ADMIN_PLAN_ACTIVATION",
      entityId: targetUser.id,
      description: `Plano "${selectedPlan.displayName}" ativado manualmente pelo Administrador (${admin.name}) para o usuário "${targetUser.name}"${noteText}. Validade: ${periodEnd.toLocaleDateString("pt-BR")}.`,
    });

    return NextResponse.json({
      success: true,
      message: `Plano ${selectedPlan.displayName} ativado com sucesso para ${targetUser.name}!`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        plan: selectedPlan,
        subscription,
      },
    });
  } catch (error) {
    console.error("Erro na ativação manual de plano:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao ativar plano." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.success) return auth.errorResponse;
    const admin = auth.admin;

    const body = await req.json();
    const {
      planId,
      priceMonth,
      priceYear,
      displayName,
      maxQRCodes,
      dynamicQRs,
      analytics,
      exportSvg,
      exportPdf,
      customLogo,
      campaigns,
    } = body;

    if (!planId) {
      return NextResponse.json({ error: "ID do plano não especificado." }, { status: 400 });
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
    }

    const dataToUpdate: Record<string, any> = {};

    if (priceMonth !== undefined) {
      const numPrice = Number(priceMonth);
      if (isNaN(numPrice) || numPrice < 0) {
        return NextResponse.json(
          { error: "O preço mensal deve ser um valor numérico válido maior ou igual a zero." },
          { status: 400 }
        );
      }
      if (plan.name === "FREE" && numPrice !== 0) {
        return NextResponse.json(
          { error: "O plano FREE não pode ter cobrança mensal maior que zero." },
          { status: 400 }
        );
      }
      dataToUpdate.priceMonth = numPrice;
    }

    if (priceYear !== undefined) {
      const numPriceYear = Number(priceYear);
      if (isNaN(numPriceYear) || numPriceYear < 0) {
        return NextResponse.json(
          { error: "O preço anual deve ser um valor numérico válido maior ou igual a zero." },
          { status: 400 }
        );
      }
      if (plan.name === "FREE" && numPriceYear !== 0) {
        return NextResponse.json(
          { error: "O plano FREE não pode ter cobrança anual maior que zero." },
          { status: 400 }
        );
      }
      dataToUpdate.priceYear = numPriceYear;
    }

    if (displayName !== undefined && typeof displayName === "string" && displayName.trim()) {
      dataToUpdate.displayName = displayName.trim();
    }

    if (maxQRCodes !== undefined) {
      const numMax = Number(maxQRCodes);
      if (!isNaN(numMax) && numMax > 0) {
        dataToUpdate.maxQRCodes = numMax;
      }
    }

    if (dynamicQRs !== undefined) dataToUpdate.dynamicQRs = Boolean(dynamicQRs);
    if (analytics !== undefined) dataToUpdate.analytics = Boolean(analytics);
    if (exportSvg !== undefined) dataToUpdate.exportSvg = Boolean(exportSvg);
    if (exportPdf !== undefined) dataToUpdate.exportPdf = Boolean(exportPdf);
    if (customLogo !== undefined) dataToUpdate.customLogo = Boolean(customLogo);
    if (campaigns !== undefined) dataToUpdate.campaigns = Boolean(campaigns);

    const updatedPlan = await prisma.plan.update({
      where: { id: planId },
      data: dataToUpdate,
    });

    await logAdminAction({
      adminId: admin.id,
      action: "ADMIN_PLAN_UPDATE",
      entityId: plan.id,
      description: `Plano "${plan.name}" atualizado pelo Administrador (${admin.name}). Preço: R$ ${updatedPlan.priceMonth.toFixed(2)}/mês | R$ ${updatedPlan.priceYear.toFixed(2)}/ano.`,
    });

    return NextResponse.json({
      success: true,
      message: `Plano ${updatedPlan.displayName} atualizado com sucesso!`,
      plan: updatedPlan,
    });
  } catch (error) {
    console.error("Erro ao atualizar plano administrativo:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao atualizar plano." },
      { status: 500 }
    );
  }
}

