import type { UpgradeReason } from "@/components/UpgradeModal";

export interface QuotaPlanInfo {
  name?: string;
  displayName?: string;
  maxQRCodes?: number | null;
}

export interface QuotaGateDecision {
  allowed: boolean;
  canCreate: boolean;
  isUnlimited: boolean;
  limit: number;
  current: number;
  remaining: number;
  currentPlan: string;
  requiredPlan?: "PRO" | "BUSINESS";
  reason?: UpgradeReason;
  message?: string;

  // Propriedades complementares / aliases de conveniência
  maxQRCodes: number;
  usedQRCodes: number;
  remainingQRCodes: number;
  reasonIfBlocked?: UpgradeReason;
  limitIfBlocked?: number;
}

/**
 * Avaliação centralizada e reutilizável da cota de criação de QR Codes.
 * Regras oficiais:
 * - FREE: limite padrão de 5 QR Codes por ciclo.
 * - PRO: limite padrão de 15 QR Codes por ciclo.
 * - BUSINESS: ilimitado (maxQRCodes >= 999999).
 * - ADMIN: sempre permitido.
 */
export function evalQuotaCanCreate(
  planInput: QuotaPlanInfo | string | null | undefined,
  usedCount: number = 0,
  role?: string
): QuotaGateDecision {
  const plan: QuotaPlanInfo =
    typeof planInput === "string"
      ? { name: planInput }
      : planInput || { name: "FREE" };

  const safeUsed = Number.isFinite(usedCount) ? Math.max(0, usedCount) : 0;

  // Administrador possui acesso irrestrito
  if (role === "ADMIN") {
    return {
      allowed: true,
      canCreate: true,
      isUnlimited: true,
      limit: 999999,
      maxQRCodes: 999999,
      current: safeUsed,
      usedQRCodes: safeUsed,
      remaining: 999999,
      remainingQRCodes: 999999,
      currentPlan: plan.name || "ADMIN",
    };
  }

  const rawPlanName = (plan.name || "FREE").toUpperCase().trim();
  const isBusiness =
    rawPlanName === "BUSINESS" || (plan.maxQRCodes != null && plan.maxQRCodes > 9999);

  if (isBusiness) {
    return {
      allowed: true,
      canCreate: true,
      isUnlimited: true,
      limit: 999999,
      maxQRCodes: 999999,
      current: safeUsed,
      usedQRCodes: safeUsed,
      remaining: 999999,
      remainingQRCodes: 999999,
      currentPlan: "BUSINESS",
    };
  }

  const isPro = rawPlanName === "PRO";
  const limit =
    plan.maxQRCodes != null && plan.maxQRCodes > 0
      ? plan.maxQRCodes
      : isPro
      ? 15
      : 5;

  const remaining = Math.max(0, limit - safeUsed);

  // Se o uso atual for menor que o limite estrito do plano, criação é permitida
  if (safeUsed < limit) {
    return {
      allowed: true,
      canCreate: true,
      isUnlimited: false,
      limit,
      maxQRCodes: limit,
      current: safeUsed,
      usedQRCodes: safeUsed,
      remaining,
      remainingQRCodes: remaining,
      currentPlan: isPro ? "PRO" : "FREE",
    };
  }

  // Cota esgotada (ou estado legado inconsistente >= limite): FAIL-CLOSED
  const requiredPlan = isPro ? "BUSINESS" : "PRO";
  const message = isPro
    ? `Você atingiu o limite de ${limit} criações do plano Pro neste ciclo.`
    : `Você atingiu o limite de ${limit} criações do plano Free neste ciclo.`;

  return {
    allowed: false,
    canCreate: false,
    isUnlimited: false,
    limit,
    maxQRCodes: limit,
    current: safeUsed,
    usedQRCodes: safeUsed,
    remaining: 0,
    remainingQRCodes: 0,
    currentPlan: isPro ? "PRO" : "FREE",
    requiredPlan,
    reason: "LIMIT_REACHED",
    reasonIfBlocked: "LIMIT_REACHED",
    limitIfBlocked: limit,
    message,
  };
}

/**
 * Helper de pluralização para contagem de QR Codes:
 * - 0 -> "0 QR Codes"
 * - 1 -> "1 QR Code"
 * - 2+ -> "X QR Codes"
 */
export function formatQRCount(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, count) : 0;
  return `${n} ${n === 1 ? "QR Code" : "QR Codes"}`;
}
