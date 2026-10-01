"use client";

import { useEffect, useRef } from "react";
import { trackLogin, isGa4Configured } from "@/lib/analytics";
import { getStoredAnalyticsConsent } from "@/components/analytics/GoogleAnalytics";

/**
 * GoogleAuthTracker — Componente de telemetria para detecção e registro seguro do evento de login Google OAuth.
 * 
 * Arquitetura de Garantias (GA4-12):
 * 1. Client-side exclusivo: Executa exclusivamente no navegador através de useEffect.
 * 2. Gatilho determinístico: Dispara exclusivamente se o parâmetro transitório ?auth=google estiver presente na URL.
 * 3. Prontidão determinística do GA4: Aguarda a configuração válida do GA4 (gtag 'config' ou evento 'qr_master_ga4_ready')
 *    antes de submeter o evento, garantindo que o login nunca seja enfileirado no vácuo antes do config.
 * 4. Limpeza segura da URL: Remove o parâmetro ?auth da barra de endereço via history.replaceState SOMENTE após a submissão
 *    ou decisão definitiva de consentimento, garantindo que recarregamentos (F5) nunca redisparem.
 * 5. Anti-duplicação em memória: executedRef impede execuções duplicadas no React StrictMode.
 * 6. Governança estrita de consentimento: Se o consentimento for 'denied', o parâmetro é limpo sem envio.
 *    Se o consentimento for desconhecido (banner pendente), aguarda a escolha do usuário sem criar loop.
 * 7. Zero PII: O payload enviado ao GA4 é estritamente { method: "google" } direcionado à Measurement ID oficial.
 */
export function GoogleAuthTracker() {
  const executedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (executedRef.current) return;

    try {
      const url = new URL(window.location.href);
      const authParam = url.searchParams.get("auth");

      if (authParam === "google") {
        const cleanUrl = () => {
          try {
            const url = new URL(window.location.href);
            if (url.searchParams.has("auth")) {
              url.searchParams.delete("auth");
              const clean = url.pathname + (url.search ? url.search : "") + url.hash;
              window.history.replaceState({}, "", clean);
            }
          } catch {
            // Fail-safe silencioso
          }
        };

        const dispatchAndClean = () => {
          if (executedRef.current) return;
          executedRef.current = true;
          trackLogin({ method: "google" });
          cleanUrl();
        };

        const consent = getStoredAnalyticsConsent();

        // Caso 1: Usuário já recusou analytics previamente
        if (consent === "denied") {
          executedRef.current = true;
          cleanUrl();
          return;
        }

        // Caso 2: Consentimento analítico já concedido
        if (consent === "granted") {
          if (isGa4Configured()) {
            dispatchAndClean();
          } else {
            const onGaReady = () => {
              window.removeEventListener("qr_master_ga4_ready", onGaReady);
              dispatchAndClean();
            };
            window.addEventListener("qr_master_ga4_ready", onGaReady);
            return () => {
              window.removeEventListener("qr_master_ga4_ready", onGaReady);
            };
          }
          return;
        }

        // Caso 3: Consentimento ainda pendente (aguarda interação com o banner)
        const onConsentUpdate = (e: Event) => {
          const customEvent = e as CustomEvent<{ status: string }>;
          const status = customEvent.detail?.status;

          if (status === "denied") {
            window.removeEventListener("qr_master_consent_updated", onConsentUpdate);
            executedRef.current = true;
            cleanUrl();
          } else if (status === "granted") {
            window.removeEventListener("qr_master_consent_updated", onConsentUpdate);
            if (isGa4Configured()) {
              dispatchAndClean();
            } else {
              const onGaReady = () => {
                window.removeEventListener("qr_master_ga4_ready", onGaReady);
                dispatchAndClean();
              };
              window.addEventListener("qr_master_ga4_ready", onGaReady);
            }
          }
        };

        window.addEventListener("qr_master_consent_updated", onConsentUpdate);
        return () => {
          window.removeEventListener("qr_master_consent_updated", onConsentUpdate);
        };
      }
    } catch {
      // Fail-safe silencioso
    }
  }, []);

  return null;
}
