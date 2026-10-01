import { getStoredAnalyticsConsent } from "@/components/analytics/GoogleAnalytics";

/**
 * QR MASTER — GA4 Analytics Module
 * Camada de eventos comerciais determinística com tipagem estrita e allowlists por evento.
 * 
 * Garantias de Segurança:
 * 1. Zero PII: Cada função constrói seu payload explicitamente com allowlist estrita de propriedades.
 * 2. Valores comerciais íntegros: Sem remoção heurística ou regex de substrings em valores legítimos.
 * 3. Função de envio interna (não exportada): Impede injeção de eventos ou dados arbitrários.
 * 4. Consent Mode v2: Execução condicionada estritamente a 'qr_master_analytics_consent === granted'.
 * 5. Fail-safe: Nunca interrompe a execução das rotas ou componentes em caso de falha externa.
 */

// Tipos permitidos por evento
export type SignUpMethod = "email";
export type LoginMethod = "email" | "google";
export type QrType = "static" | "dynamic";
export type PlanTier = "free" | "pro" | "business";
export type UpgradePlanTier = "pro" | "business";
export type BillingCycle = "monthly" | "annual";

export interface SignUpParams {
  method: SignUpMethod;
}

export interface LoginParams {
  method: LoginMethod;
}

export interface QrCreatedParams {
  qr_type: QrType;
  plan_tier: PlanTier;
}

export interface UpgradeIntentParams {
  plan_tier: UpgradePlanTier;
  billing_cycle: BillingCycle;
}

export interface CheckoutItem {
  item_id: string;
  item_name: string;
}

export interface BeginCheckoutParams {
  currency: "BRL";
  value: number;
  items: CheckoutItem[];
}

type CommercialEventName =
  | "sign_up"
  | "login"
  | "qr_created"
  | "upgrade_intent"
  | "begin_checkout";

/**
 * Allowlist estrita de propriedades autorizadas por evento comercial.
 */
const ALLOWED_EVENT_KEYS: Record<CommercialEventName, ReadonlySet<string>> = {
  sign_up: new Set(["method"]),
  login: new Set(["method"]),
  qr_created: new Set(["qr_type", "plan_tier"]),
  upgrade_intent: new Set(["plan_tier", "billing_cycle"]),
  begin_checkout: new Set(["currency", "value", "items"]),
};

/**
 * Allowlist estrita de propriedades de cada item no checkout.
 */
const ALLOWED_ITEM_KEYS: ReadonlySet<string> = new Set(["item_id", "item_name"]);

/**
 * Despachador interno de eventos para o Google Analytics 4.
 * 
 * Função privada e interna (NÃO exportada) para impedir que código externo
 * dispare eventos arbitrários ou injete propriedades contendo PII.
 */
function dispatchGaEvent(
  eventName: CommercialEventName,
  eventPayload: Record<string, any>,
  onComplete?: () => void
): boolean {
  let executed = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

  const safeComplete = () => {
    if (!executed) {
      executed = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      try {
        onComplete?.();
      } catch {
        // Fail-safe silencioso
      }
    }
  };

  if (typeof window === "undefined") {
    safeComplete();
    return false;
  }

  try {
    const consent = getStoredAnalyticsConsent();
    if (consent !== "granted") {
      // Bloqueio fail-closed: consentimento não concedido
      safeComplete();
      return false;
    }

    if (typeof window.gtag !== "function") {
      safeComplete();
      return false;
    }

    const allowedKeys = ALLOWED_EVENT_KEYS[eventName];
    if (!allowedKeys) {
      safeComplete();
      return false;
    }

    // Filtragem defensiva final por allowlist
    const finalPayload: Record<string, any> = {};
    for (const key of Object.keys(eventPayload)) {
      if (allowedKeys.has(key)) {
        if (key === "items" && Array.isArray(eventPayload[key])) {
          finalPayload[key] = eventPayload[key].map((item: any) => {
            const cleanItem: Record<string, any> = {};
            if (item && typeof item === "object") {
              for (const itemKey of Object.keys(item)) {
                if (ALLOWED_ITEM_KEYS.has(itemKey)) {
                  cleanItem[itemKey] = item[itemKey];
                }
              }
            }
            return cleanItem;
          });
        } else {
          finalPayload[key] = eventPayload[key];
        }
      }
    }

    if (onComplete) {
      // Fallback curto de 400ms para resiliência contra lentidão ou extensões
      fallbackTimer = setTimeout(safeComplete, 400);

      const gtagPayload: Record<string, any> = {
        ...finalPayload,
        event_callback: safeComplete,
        event_timeout: 400,
      };

      window.gtag("event", eventName, gtagPayload);
    } else {
      window.gtag("event", eventName, finalPayload);
    }

    return true;
  } catch {
    // Fail-safe silencioso: nunca impacta a execução do produto
    safeComplete();
    return false;
  }
}

/**
 * 1. sign_up — Disparado exclusivamente após cadastro concluído com sucesso.
 * Allowlist: { method: "email" }
 */
export function trackSignUp(params: SignUpParams = { method: "email" }): void {
  const method: SignUpMethod = params?.method === "email" ? "email" : "email";
  dispatchGaEvent("sign_up", { method });
}

/**
 * 2. login — Disparado exclusivamente após autenticação confirmada pelo backend.
 * Allowlist: { method: "email" | "google" }
 * Suporta callback de coordenação com a navegação pós-login.
 */
export function trackLogin(
  params: LoginParams = { method: "email" },
  onComplete?: () => void
): void {
  const method: LoginMethod = params?.method === "google" ? "google" : "email";
  dispatchGaEvent("login", { method }, onComplete);
}

/**
 * 3. qr_created — Disparado após criação confirmada pelo backend e ledger atômico.
 * Allowlist: { qr_type: "static" | "dynamic", plan_tier: "free" | "pro" | "business" }
 */
export function trackQrCreated(params: QrCreatedParams): void {
  const qr_type: QrType = params?.qr_type === "dynamic" ? "dynamic" : "static";
  const plan_tier: PlanTier =
    params?.plan_tier === "pro"
      ? "pro"
      : params?.plan_tier === "business"
      ? "business"
      : "free";

  dispatchGaEvent("qr_created", {
    qr_type,
    plan_tier,
  });
}

/**
 * 4. upgrade_intent — Disparado na seleção inequívoca de plano para upgrade.
 * Allowlist: { plan_tier: "pro" | "business", billing_cycle: "monthly" | "annual" }
 */
export function trackUpgradeIntent(params: UpgradeIntentParams): void {
  const plan_tier: UpgradePlanTier = params?.plan_tier === "business" ? "business" : "pro";
  const billing_cycle: BillingCycle = params?.billing_cycle === "annual" ? "annual" : "monthly";

  dispatchGaEvent("upgrade_intent", {
    plan_tier,
    billing_cycle,
  });
}

/**
 * 5. begin_checkout — Disparado quando o backend aceita a geração da sessão de checkout.
 * Allowlist: { currency: "BRL", value: number, items: [{ item_id, item_name }] }
 */
export function trackBeginCheckout(params: BeginCheckoutParams): void {
  const currency: "BRL" = "BRL";
  const numValue =
    typeof params?.value === "number" && Number.isFinite(params.value) && params.value >= 0
      ? Number(params.value.toFixed(2))
      : 0;

  const rawItems = Array.isArray(params?.items) ? params.items : [];
  const cleanItems: CheckoutItem[] = rawItems.map((item) => ({
    item_id: String(item?.item_id ?? ""),
    item_name: String(item?.item_name ?? ""),
  }));

  dispatchGaEvent("begin_checkout", {
    currency,
    value: numValue,
    items: cleanItems,
  });
}
