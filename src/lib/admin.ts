import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { prisma } from "./db";

export interface AdminContext {
  id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * Validação centralizada de autorização administrativa no servidor.
 * Retorna o administrador autenticado ou uma resposta JSON de erro com status 401 ou 403.
 */
export async function requireAdmin(req?: Request | NextRequest): Promise<
  | { success: true; admin: AdminContext; errorResponse?: never }
  | { success: false; admin?: never; errorResponse: NextResponse }
> {
  const user = await getCurrentUser(req);

  if (!user) {
    return {
      success: false,
      errorResponse: NextResponse.json(
        { error: "Não autenticado. Faça login para acessar este recurso." },
        { status: 401 }
      ),
    };
  }

  if (user.role !== "ADMIN") {
    return {
      success: false,
      errorResponse: NextResponse.json(
        { error: "Acesso negado. Privilégios de administrador são estritamente necessários." },
        { status: 403 }
      ),
    };
  }

  return {
    success: true,
    admin: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Registra formalmente uma ação administrativa na tabela de auditoria ActivityLog.
 */
export async function logAdminAction(params: {
  adminId: string;
  action: string;
  description: string;
  entityId?: string;
}) {
  try {
    return await prisma.activityLog.create({
      data: {
        userId: params.adminId,
        action: params.action,
        entityId: params.entityId || null,
        description: params.description,
      },
    });
  } catch (err) {
    console.error("Erro ao registrar log administrativo:", err);
    return null;
  }
}
