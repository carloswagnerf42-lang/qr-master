import { prisma } from "./db";

export type PermissionAction =
  | "create_qr"
  | "dynamic_qr"
  | "analytics"
  | "export_svg"
  | "export_pdf"
  | "custom_logo"
  | "campaigns";

export interface PlanDetails {
  id?: string;
  name: string;
  displayName?: string;
  priceMonth?: number;
  priceYear?: number;
  maxQRCodes: number;
  dynamicQRs: boolean;
  analytics: boolean;
  exportSvg: boolean;
  exportPdf: boolean;
  customLogo: boolean;
  campaigns: boolean;
}

export interface SubscriptionDetails {
  id?: string;
  status: string;
  gateway?: string;
  gatewayCustomerId?: string | null;
  gatewaySubscriptionId?: string | null;
  currentPeriodStart?: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
}

export interface UserPlanContext {
  id: string;
  role: string;
  planId?: string | null;
  plan?: PlanDetails | null;
  qrCodeCount: number;
  subscriptionStatus?: string | null;
  subscription?: SubscriptionDetails | null;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  code?: "LIMIT_REACHED" | "UPGRADE_REQUIRED" | "UNAUTHORIZED";
  requiredPlan?: "PRO" | "BUSINESS";
  limit?: number;
  current?: number;
}

/**
 * Determina se uma assinatura confere acesso ativo aos recursos pagos:
 * 1. Status ACTIVE com data de término no futuro.
 * 2. Status PAST_DUE com tolerância de até 5 dias (Grace Period).
 * 3. Cancelamento agendado (cancelAtPeriodEnd) preserva acesso até o fim do ciclo pago.
 */
export function isSubscriptionActive(sub: {
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
} | null | undefined): boolean {
  if (!sub) return false;

  const now = new Date();

  // 1. Assinatura ativa com período válido
  if (sub.status === "ACTIVE") {
    return new Date(sub.currentPeriodEnd) > now;
  }

  // 2. Período de tolerância de 5 dias em caso de falha de pagamento (PAST_DUE)
  if (sub.status === "PAST_DUE") {
    const graceEnd = new Date(new Date(sub.currentPeriodEnd).getTime() + 5 * 24 * 60 * 60 * 1000);
    return graceEnd > now;
  }

  // 3. Se foi cancelada mas ainda está antes do término do período já pago
  if (sub.status === "CANCELED" && new Date(sub.currentPeriodEnd) > now) {
    return true;
  }

  return false;
}

/**
 * Definição padrão dos limites caso o plano não seja encontrado no banco
 */
export const DEFAULT_FREE_PLAN: PlanDetails = {
  name: "FREE",
  displayName: "Plano Grátis",
  priceMonth: 0,
  priceYear: 0,
  maxQRCodes: 5,
  dynamicQRs: false,
  analytics: false,
  exportSvg: false,
  exportPdf: false,
  customLogo: false,
  campaigns: false,
};

/**
 * Busca o usuário com seu plano ativo e contagem real de QR codes ativos
 */
export async function getUserPlanAndUsage(userId: string): Promise<UserPlanContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      planId: true,
      plan: true,
      subscription: {
        select: {
          id: true,
          status: true,
          gateway: true,
          gatewayCustomerId: true,
          gatewaySubscriptionId: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
        },
      },
      _count: {
        select: {
          qrCodes: {
            where: { deletedAt: null },
          },
        },
      },
    },
  });

  if (!user) return null;

  // Se o usuário é ADMIN, mantém plano configurado ou PRO/BUSINESS
  if (user.role === "ADMIN") {
    return {
      id: user.id,
      role: user.role,
      planId: user.planId,
      plan: user.plan || DEFAULT_FREE_PLAN,
      qrCodeCount: user._count.qrCodes,
      subscriptionStatus: "ACTIVE",
      subscription: user.subscription,
    };
  }

  // Se o plano for pago (não FREE), exige assinatura ativa no ciclo
  let plan: PlanDetails = user.plan || DEFAULT_FREE_PLAN;

  if (plan.name !== "FREE") {
    const active = isSubscriptionActive(user.subscription);
    if (!active) {
      // Assinatura inexistente, expirada ou suspensa -> recai com segurança no FREE
      const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
      plan = freePlan || DEFAULT_FREE_PLAN;
    }
  }

  return {
    id: user.id,
    role: user.role,
    planId: plan.id || user.planId,
    plan,
    qrCodeCount: user._count.qrCodes,
    subscriptionStatus: user.subscription?.status || null,
    subscription: user.subscription,
  };
}

/**
 * Validação centralizada de permissões e limites
 */
export function checkPermission(
  user: UserPlanContext | null | undefined,
  action: PermissionAction
): PermissionCheckResult {
  if (!user) {
    return {
      allowed: false,
      reason: "Usuário não autenticado ou inexistente.",
      code: "UNAUTHORIZED",
    };
  }

  // Administrador possui acesso total
  if (user.role === "ADMIN") {
    return { allowed: true };
  }

  const plan = user.plan || DEFAULT_FREE_PLAN;

  switch (action) {
    case "create_qr": {
      if (user.qrCodeCount >= plan.maxQRCodes) {
        return {
          allowed: false,
          reason: `Você atingiu o limite de ${plan.maxQRCodes} QR Codes do plano ${plan.name}. Faça upgrade para o plano PRO para criar até 100 QR Codes.`,
          code: "LIMIT_REACHED",
          requiredPlan: "PRO",
          limit: plan.maxQRCodes,
          current: user.qrCodeCount,
        };
      }
      return { allowed: true };
    }

    case "dynamic_qr": {
      if (!plan.dynamicQRs) {
        return {
          allowed: false,
          reason: `QR Codes dinâmicos com edição de destino e estatísticas não estão disponíveis no plano ${plan.name}. Faça upgrade para o plano PRO ou BUSINESS.`,
          code: "UPGRADE_REQUIRED",
          requiredPlan: "PRO",
        };
      }
      return { allowed: true };
    }

    case "analytics": {
      if (!plan.analytics) {
        return {
          allowed: false,
          reason: `O acesso a métricas e estatísticas de escaneamento em tempo real requer o plano PRO ou BUSINESS.`,
          code: "UPGRADE_REQUIRED",
          requiredPlan: "PRO",
        };
      }
      return { allowed: true };
    }

    case "export_svg": {
      if (!plan.exportSvg) {
        return {
          allowed: false,
          reason: `Exportação em vetor SVG de alta fidelidade é um recurso exclusivo dos planos PRO e BUSINESS.`,
          code: "UPGRADE_REQUIRED",
          requiredPlan: "PRO",
        };
      }
      return { allowed: true };
    }

    case "export_pdf": {
      if (!plan.exportPdf) {
        return {
          allowed: false,
          reason: `Exportação em PDF pronta para impressão é um recurso exclusivo dos planos PRO e BUSINESS.`,
          code: "UPGRADE_REQUIRED",
          requiredPlan: "PRO",
        };
      }
      return { allowed: true };
    }

    case "custom_logo": {
      if (!plan.customLogo) {
        return {
          allowed: false,
          reason: `A inclusão de logotipos personalizados no centro do QR Code é permitida apenas nos planos PRO e BUSINESS.`,
          code: "UPGRADE_REQUIRED",
          requiredPlan: "PRO",
        };
      }
      return { allowed: true };
    }

    case "campaigns": {
      if (!plan.campaigns) {
        return {
          allowed: false,
          reason: `O gerenciamento de campanhas promocionais e agrupamento de links requer o plano PRO ou BUSINESS.`,
          code: "UPGRADE_REQUIRED",
          requiredPlan: "PRO",
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: false, reason: "Ação não reconhecida.", code: "UNAUTHORIZED" };
  }
}

/**
 * Função can() conceitual para checagem booleana simplificada
 */
export function can(
  user: UserPlanContext | null | undefined,
  action: PermissionAction
): boolean {
  return checkPermission(user, action).allowed;
}
