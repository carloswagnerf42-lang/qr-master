"use client";

import { useEffect, useRef } from "react";
import { trackLogin } from "@/lib/analytics";

/**
 * GoogleAuthTracker — Componente de telemetria para detecção e registro seguro do evento de login Google OAuth.
 * 
 * Arquitetura de Garantias:
 * 1. Client-side exclusivo: Executa exclusivamente no navegador através de useEffect.
 * 2. Gatilho determinístico: Dispara exclusivamente se o parâmetro transitório ?auth=google estiver presente na URL.
 * 3. Limpeza imediata da URL: Remove o parâmetro ?auth da barra de endereço via history.replaceState,
 *    garantindo que recarregamentos de página (F5 / Ctrl+R) nunca redisparem o evento.
 * 4. Anti-duplicação em memória: executedRef impede execuções duplicadas no React StrictMode.
 * 5. Não intercepta navegações internas: Transições normais de rotas no dashboard não contêm ?auth=google.
 * 6. Não afeta usuários previamente autenticados: Acessos normais ao painel não contêm ?auth=google.
 * 7. Zero PII: O payload enviado ao GA4 é estritamente { method: "google" }, sem qualquer identificador pessoal.
 * 8. Respeita o Consent Mode v2: O despacho é submetido ao gate 'qr_master_analytics_consent === granted'.
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
        executedRef.current = true;

        // Limpa o parâmetro transitório da URL imediatamente para que reload/F5 nunca redispare
        url.searchParams.delete("auth");
        const cleanUrl = url.pathname + (url.search ? url.search : "") + url.hash;
        window.history.replaceState({}, "", cleanUrl);

        // Dispara o evento de login comercial para o GA4
        trackLogin({ method: "google" });
      }
    } catch {
      // Fail-safe silencioso
    }
  }, []);

  return null;
}
