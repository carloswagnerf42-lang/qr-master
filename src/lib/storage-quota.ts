import { prisma } from "./db";
import { UserPlanContext, getUserPlanAndUsage } from "./permissions";

export interface StorageQuotaConfig {
  freeBytes?: number;
  proBytes?: number;
  businessBytes?: number;
  adminBytes?: number;
  defaultBytes?: number;
}

export interface StorageQuotaCheckResult {
  allowed: boolean;
  currentUsageBytes: number;
  quotaBytes: number;
  incomingSizeBytes: number;
  remainingBytes: number;
  reason?: string;
  code?: "STORAGE_QUOTA_EXCEEDED" | "INVALID_INPUT";
}

export interface CheckStorageQuotaOptions {
  userId: string;
  incomingSizeBytes: number;
  userContext?: UserPlanContext | null;
  planName?: string;
  role?: string;
}

let activeQuotaConfig: StorageQuotaConfig | null = null;
let activeUsageResolver: ((userId: string) => Promise<number>) | null = null;

/**
 * Permite injetar configuração de cota de armazenamento para suítes de testes automatizados.
 */
export function setStorageQuotaConfigForTesting(config: StorageQuotaConfig | null) {
  activeQuotaConfig = config;
}

/**
 * Permite injetar um resolvedor de uso de armazenamento para suítes de testes automatizados.
 */
export function setStorageUsageResolverForTesting(fn: ((userId: string) => Promise<number>) | null) {
  activeUsageResolver = fn;
}

/**
 * Determina a cota de armazenamento configurada para o plano do usuário.
 *
 * Regra de Segurança e Comercial:
 * - Se não houver cota explicitamente definida via variável de ambiente ou configuração central,
 *   a cota opera como `Infinity` (sem bloqueio comercial arbitrário não documentado).
 * - Quando configurada (via env var ou config de teste), a cota passa a ser estritamente aplicada.
 * - Administradores (role === "ADMIN") sempre possuem cota ilimitada (Infinity).
 */
export function resolveUserStorageQuota(planName?: string, role?: string): number {
  if (role === "ADMIN") {
    return Infinity;
  }

  // 1. Configuração ativa em testes
  if (activeQuotaConfig) {
    if (planName === "FREE" && activeQuotaConfig.freeBytes !== undefined) {
      return activeQuotaConfig.freeBytes;
    }
    if (planName === "PRO" && activeQuotaConfig.proBytes !== undefined) {
      return activeQuotaConfig.proBytes;
    }
    if (planName === "BUSINESS" && activeQuotaConfig.businessBytes !== undefined) {
      return activeQuotaConfig.businessBytes;
    }
    if (activeQuotaConfig.defaultBytes !== undefined) {
      return activeQuotaConfig.defaultBytes;
    }
  }

  // 2. Variáveis de ambiente server-side
  const normPlan = (planName || "FREE").toUpperCase().trim();

  if (normPlan === "FREE" && process.env.STORAGE_QUOTA_BYTES_FREE) {
    const val = parseInt(process.env.STORAGE_QUOTA_BYTES_FREE, 10);
    if (!isNaN(val) && val >= 0) return val;
  }

  if (normPlan === "PRO" && process.env.STORAGE_QUOTA_BYTES_PRO) {
    const val = parseInt(process.env.STORAGE_QUOTA_BYTES_PRO, 10);
    if (!isNaN(val) && val >= 0) return val;
  }

  if (normPlan === "BUSINESS" && process.env.STORAGE_QUOTA_BYTES_BUSINESS) {
    const val = parseInt(process.env.STORAGE_QUOTA_BYTES_BUSINESS, 10);
    if (!isNaN(val) && val >= 0) return val;
  }

  if (process.env.STORAGE_QUOTA_BYTES_DEFAULT) {
    const val = parseInt(process.env.STORAGE_QUOTA_BYTES_DEFAULT, 10);
    if (!isNaN(val) && val >= 0) return val;
  }

  // 3. Fallback seguro: cota não ativada arbitrariamente em produção
  return Infinity;
}

/**
 * Calcula a utilização atual de armazenamento do usuário em bytes.
 * Realiza agregação sobre a tabela GeneratedFile no banco de dados.
 */
export async function getUserStorageUsageBytes(userId: string): Promise<number> {
  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanUserId || cleanUserId.includes("..") || cleanUserId.includes("/") || cleanUserId.includes("\\")) {
    return 0;
  }

  if (activeUsageResolver) {
    return await activeUsageResolver(cleanUserId);
  }

  try {
    const agg = await prisma.generatedFile.aggregate({
      where: { userId: cleanUserId },
      _sum: { fileSize: true },
    });
    return agg._sum.fileSize || 0;
  } catch (error) {
    console.error(`[StorageQuota] Falha ao calcular uso de armazenamento para ${cleanUserId}:`, error);
    return 0;
  }
}

/**
 * Validação centralizada e fail-closed de cota de armazenamento antes da persistência física de arquivos.
 */
export async function checkStorageQuota(options: CheckStorageQuotaOptions): Promise<StorageQuotaCheckResult> {
  const { userId, incomingSizeBytes, userContext, planName, role } = options;

  // 1. Validação fail-closed dos identificadores de entrada
  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanUserId || cleanUserId.includes("..") || cleanUserId.includes("/") || cleanUserId.includes("\\")) {
    return {
      allowed: false,
      currentUsageBytes: 0,
      quotaBytes: 0,
      incomingSizeBytes: incomingSizeBytes || 0,
      remainingBytes: 0,
      reason: "Identificador de usuário inválido para verificação de cota.",
      code: "INVALID_INPUT",
    };
  }

  if (typeof incomingSizeBytes !== "number" || isNaN(incomingSizeBytes) || incomingSizeBytes < 0) {
    return {
      allowed: false,
      currentUsageBytes: 0,
      quotaBytes: 0,
      incomingSizeBytes: incomingSizeBytes || 0,
      remainingBytes: 0,
      reason: "Tamanho de arquivo inválido para verificação de cota.",
      code: "INVALID_INPUT",
    };
  }

  // 2. Determinação de plano e privilégios
  let effectivePlanName = planName;
  let effectiveRole = role;

  if (userContext) {
    effectivePlanName = effectivePlanName || userContext.plan?.name;
    effectiveRole = effectiveRole || userContext.role;
  } else if (!effectivePlanName || !effectiveRole) {
    try {
      const context = await getUserPlanAndUsage(cleanUserId);
      if (context) {
        effectivePlanName = effectivePlanName || context.plan?.name;
        effectiveRole = effectiveRole || context.role;
      }
    } catch {
      // Falha ao obter plano recai no fallback de role USER e plano FREE
    }
  }

  effectivePlanName = (effectivePlanName || "FREE").toUpperCase().trim();
  effectiveRole = (effectiveRole || "USER").toUpperCase().trim();

  // 3. Resolução da cota configurada
  const quotaBytes = resolveUserStorageQuota(effectivePlanName, effectiveRole);

  // Se a cota for ilimitada (Infinity), permite imediatamente
  if (quotaBytes === Infinity) {
    return {
      allowed: true,
      currentUsageBytes: 0,
      quotaBytes: Infinity,
      incomingSizeBytes,
      remainingBytes: Infinity,
    };
  }

  // 4. Cálculo do uso atual
  const currentUsageBytes = await getUserStorageUsageBytes(cleanUserId);
  const projectedUsage = currentUsageBytes + incomingSizeBytes;

  if (projectedUsage > quotaBytes) {
    const remaining = Math.max(0, quotaBytes - currentUsageBytes);
    return {
      allowed: false,
      currentUsageBytes,
      quotaBytes,
      incomingSizeBytes,
      remainingBytes: remaining,
      reason: "Limite de armazenamento da conta atingido.",
      code: "STORAGE_QUOTA_EXCEEDED",
    };
  }

  return {
    allowed: true,
    currentUsageBytes,
    quotaBytes,
    incomingSizeBytes,
    remainingBytes: quotaBytes - projectedUsage,
  };
}
