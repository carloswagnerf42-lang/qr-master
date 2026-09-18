import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.success) return auth.errorResponse;
    const admin = auth.admin;

    const targetUserId = params.id;
    if (!targetUserId) {
      return NextResponse.json({ error: "ID do usuário não especificado." }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { subscription: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const body = await req.json();
    const { role, accountStatus } = body;

    const updates: { role?: string } = {};

    // 1. Alteração de Role com salvaguarda
    if (role !== undefined) {
      if (role !== "USER" && role !== "ADMIN") {
        return NextResponse.json(
          { error: "Papel inválido. Valores aceitos: 'USER' ou 'ADMIN'." },
          { status: 400 }
        );
      }

      // Proteção contra rebaixamento do único admin do sistema
      if (targetUser.role === "ADMIN" && role === "USER") {
        const totalAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
        if (totalAdmins <= 1) {
          return NextResponse.json(
            { error: "Operação bloqueada: não é permitido rebaixar o único administrador do sistema." },
            { status: 400 }
          );
        }
      }

      updates.role = role;
    }

    let updatedUser = targetUser;
    if (Object.keys(updates).length > 0) {
      updatedUser = await prisma.user.update({
        where: { id: targetUserId },
        data: updates,
        include: { subscription: true },
      });

      await logAdminAction({
        adminId: admin.id,
        action: "ADMIN_ROLE_CHANGE",
        entityId: targetUser.id,
        description: `Papel de acesso do usuário "${targetUser.name}" alterado para "${role}" pelo Administrador (${admin.name}).`,
      });
    }

    // 2. Alteração do Status da Conta / Assinatura (ACTIVE, SUSPENDED, CANCELED, PAST_DUE)
    let updatedSubscription = targetUser.subscription;
    if (accountStatus !== undefined) {
      const validStatuses = ["ACTIVE", "SUSPENDED", "CANCELED", "PAST_DUE"];
      if (!validStatuses.includes(accountStatus)) {
        return NextResponse.json(
          { error: `Status de conta inválido. Permitidos: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }

      const now = new Date();
      const defaultPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      updatedSubscription = await prisma.subscription.upsert({
        where: { userId: targetUserId },
        create: {
          userId: targetUserId,
          planId: targetUser.planId || "free-plan",
          status: accountStatus,
          currentPeriodStart: now,
          currentPeriodEnd: defaultPeriodEnd,
        },
        update: {
          status: accountStatus,
        },
      });

      await logAdminAction({
        adminId: admin.id,
        action: "ADMIN_ACCOUNT_STATUS_CHANGE",
        entityId: targetUser.id,
        description: `Status da conta do usuário "${targetUser.name}" alterado para "${accountStatus}" pelo Administrador (${admin.name}).`,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Usuário atualizado com sucesso.",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        accountStatus: updatedSubscription?.status || "ACTIVE",
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar usuário pelo admin:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao atualizar usuário." },
      { status: 500 }
    );
  }
}
