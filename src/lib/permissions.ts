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
  maxQRCodesYear?: number | null;
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
  qrCodeCount: number; // QRs criados no mês/ciclo atual
  totalQrCodeCount?: number; // QRs totais no acervo
  currentMonthLimit?: number; // Limite mensal aplicável (ex: 5, 15, 50, 999999)
  currentMonthStart?: Date;
  currentMonthEnd?: Date;
  isYearly?: boolean;
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
 * Calcula a porcentagem real de desconto entre a cobrança mensal (12x) e o preço anual
 */
export function calculateAnnualDiscountPercent(priceMonth: number, priceYear: number): number {
  const numMonth = Number(priceMonth) || 0;
  const numYear = Number(priceYear) || 0;
  if (numMonth <= 0 || numYear <= 0) return 0;
  const annualMonthly = numMonth * 12;
  if (numYear >= annualMonthly) return 0;
  const discount = ((annualMonthly - numYear) / annualMonthly) * 100;
  return Math.round(discount);
}

/**
 * Calcula variação e tendência entre período atual e período anterior
 */
export function computeComparison(
  current: number,
  previous: number,
  periodLabel: string
): { change: string; trend: "up" | "down" | "neutral" } {
  if (previous === 0 && current === 0) {
    return { change: "Sem variação", trend: "neutral" };
  }
  if (previous === 0 && current > 0) {
    return { change: "Novo período", trend: "up" };
  }
  if (current === previous) {
    return { change: `0% vs ${periodLabel}`, trend: "neutral" };
  }
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  if (pct > 0) {
    return { change: `+${pct}% vs ${periodLabel}`, trend: "up" };
  } else if (pct < 0) {
    return { change: `${pct}% vs ${periodLabel}`, trend: "down" };
  } else {
    return { change: `0% vs ${periodLabel}`, trend: "neutral" };
  }
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
  maxQRCodesYear: 5,
  dynamicQRs: false,
  analytics: false,
  exportSvg: false,
  exportPdf: false,
  customLogo: false,
  campaigns: false,
};

/**
 * Calcula as datas de início e término da janela mensal do usuário para controle de cota de criação
 */
export function calculateUserMonthlyQuotaWindow(
  createdAt: Date,
  subscription?: { currentPeriodStart?: Date; currentPeriodEnd?: Date; status?: string } | null
): { isYearly: boolean; currentMonthStart: Date; currentMonthEnd: Date } {
  const now = new Date();
  let isYearly = false;
  let currentMonthStart: Date;
  let currentMonthEnd: Date;

  if (subscription?.currentPeriodStart && subscription?.currentPeriodEnd) {
    const subStart = new Date(subscription.currentPeriodStart);
    const subEnd = new Date(subscription.currentPeriodEnd);
    const durationDays = Math.round((subEnd.getTime() - subStart.getTime()) / (1000 * 60 * 60 * 24));

    // Se o período contratado for superior a 60 dias, trata-se de plano anual (~365 dias)
    isYearly = durationDays > 60;

    if (isYearly) {
      // Divide os 365 dias em janelas mensais consecutivas de 30 dias a partir do início
      const elapsedDays = Math.max(0, Math.floor((now.getTime() - subStart.getTime()) / (1000 * 60 * 60 * 24)));
      const monthIndex = Math.min(11, Math.floor(elapsedDays / 30));
      currentMonthStart = new Date(subStart.getTime() + monthIndex * 30 * 24 * 60 * 60 * 1000);
      currentMonthEnd = new Date(subStart.getTime() + (monthIndex + 1) * 30 * 24 * 60 * 60 * 1000);
      if (currentMonthEnd > subEnd) currentMonthEnd = subEnd;
    } else {
      currentMonthStart = subStart;
      currentMonthEnd = subEnd;
    }
  } else {
    // Plano FREE: janela móvel de 30 dias ancorada na data de cadastro
    const userStart = new Date(createdAt);
    const elapsedDays = Math.max(0, Math.floor((now.getTime() - userStart.getTime()) / (1000 * 60 * 60 * 24)));
    const cycleIndex = Math.floor(elapsedDays / 30);
    currentMonthStart = new Date(userStart.getTime() + cycleIndex * 30 * 24 * 60 * 60 * 1000);
    currentMonthEnd = new Date(userStart.getTime() + (cycleIndex + 1) * 30 * 24 * 60 * 60 * 1000);
  }

  return { isYearly, currentMonthStart, currentMonthEnd };
}

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
      createdAt: true,
      plan: true,
      subscription: {
        select: {
          id: true,
          status: true,
          planId: true,
          plan: true,
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

  const totalQrCodeCount = user._count.qrCodes;
  const { isYearly, currentMonthStart, currentMonthEnd } = calculateUserMonthlyQuotaWindow(
    user.createdAt,
    user.subscription
  );

  // Consulta quantidade de QR codes criados no ciclo mensal atual
  const monthQrCodeCount = await prisma.qRCode.count({
    where: {
      userId,
      deletedAt: null,
      createdAt: {
        gte: currentMonthStart,
      },
    },
  });

  // Se o usuário é ADMIN, mantém plano configurado ou PRO/BUSINESS
  if (user.role === "ADMIN") {
    return {
      id: user.id,
      role: user.role,
      planId: user.planId,
      plan: user.plan || DEFAULT_FREE_PLAN,
      qrCodeCount: monthQrCodeCount,
      totalQrCodeCount,
      currentMonthLimit: 999999,
      currentMonthStart,
      currentMonthEnd,
      isYearly,
      subscriptionStatus: "ACTIVE",
      subscription: user.subscription,
    };
  }

  // Resolução rigorosa do plano efetivo:
  // Se houver assinatura ativa com plano associado, utiliza o plano da assinatura
  const active = isSubscriptionActive(user.subscription);
  let plan: PlanDetails = DEFAULT_FREE_PLAN;

  if (active && user.subscription?.plan) {
    plan = user.subscription.plan;
  } else if (user.plan && user.plan.name === "FREE") {
    plan = user.plan;
  } else if (active && user.plan) {
    plan = user.plan;
  } else {
    // Sem assinatura ativa e plano pago -> recai com segurança no FREE
    const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
    plan = freePlan || DEFAULT_FREE_PLAN;
  }

  // Determina o limite mensal aplicável
  let currentMonthLimit = plan.maxQRCodes ?? 5;
  if (plan.name === "PRO") {
    if (isYearly) {
      // Cota mensal para assinantes PRO do plano anual: 15 QR/mês
      currentMonthLimit = plan.maxQRCodesYear ?? 15;
    } else {
      // Cota mensal para assinantes PRO do plano mensal: 50 QR/mês (ou configurado no Admin)
      currentMonthLimit = plan.maxQRCodes ?? 50;
    }
  } else if (plan.name === "BUSINESS") {
    currentMonthLimit = 999999;
  } else if (plan.name === "FREE") {
    currentMonthLimit = plan.maxQRCodes ?? 5;
  }

  const effectivePlan: PlanDetails = {
    ...plan,
    maxQRCodes: currentMonthLimit,
  };

  return {
    id: user.id,
    role: user.role,
    planId: plan.id || user.planId,
    plan: effectivePlan,
    qrCodeCount: monthQrCodeCount,
    totalQrCodeCount,
    currentMonthLimit,
    currentMonthStart,
    currentMonthEnd,
    isYearly,
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
      const limit = user.currentMonthLimit ?? plan.maxQRCodes;
      if (user.qrCodeCount >= limit) {
        const resetDateStr = user.currentMonthEnd
          ? new Date(user.currentMonthEnd).toLocaleDateString("pt-BR")
          : "o próximo ciclo";

        let reason = `Você atingiu o limite mensal de ${limit} QR Codes do plano ${plan.name}. Sua cota renova em ${resetDateStr}.`;
        if (plan.name === "FREE") {
          reason += " Faça upgrade para o plano PRO ou BUSINESS para criar mais QR Codes.";
        } else if (plan.name === "PRO") {
          reason += " Para criar QR Codes sem limites mensais, faça upgrade para o plano BUSINESS.";
        }

        return {
          allowed: false,
          reason,
          code: "LIMIT_REACHED",
          requiredPlan: plan.name === "FREE" ? "PRO" : "BUSINESS",
          limit,
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
