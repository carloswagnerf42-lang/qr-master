"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";
import {
  getStoredAnalyticsConsent,
  updateAnalyticsConsent,
  type ConsentStatus,
} from "@/components/analytics/GoogleAnalytics";

export function CookieConsent() {
  const [mounted, setMounted] = useState<boolean>(false);
  const [consent, setConsent] = useState<ConsentStatus | null>(null);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    setConsent(getStoredAnalyticsConsent());

    const handleOpenPreferences = () => {
      setIsPreferencesOpen(true);
    };

    const handleConsentUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ status: ConsentStatus }>;
      setConsent(customEvent.detail?.status ?? null);
    };

    window.addEventListener("qr_master_open_cookie_preferences", handleOpenPreferences);
    window.addEventListener("qr_master_consent_updated", handleConsentUpdated);

    return () => {
      window.removeEventListener("qr_master_open_cookie_preferences", handleOpenPreferences);
      window.removeEventListener("qr_master_consent_updated", handleConsentUpdated);
    };
  }, []);

  if (!mounted) {
    return null;
  }

  // Visível se o visitante ainda não decidiu OU se abriu manualmente o painel de preferências
  const isVisible = consent === null || isPreferencesOpen;
  if (!isVisible) {
    return null;
  }

  const handleAccept = () => {
    updateAnalyticsConsent("granted");
    setIsPreferencesOpen(false);
  };

  const handleDecline = () => {
    updateAnalyticsConsent("denied");
    setIsPreferencesOpen(false);
  };

  const handleClose = () => {
    if (consent !== null) {
      setIsPreferencesOpen(false);
    } else {
      // Fechamento sem escolha prévia é tratado como recusa conservadora
      handleDecline();
    }
  };

  return (
    <aside
      role="dialog"
      aria-label="Cookies e privacidade"
      aria-modal="false"
      className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6 pointer-events-none"
    >
      <div className="pointer-events-auto max-w-3xl mx-auto bg-[#070E1E]/95 border border-slate-800 rounded-2xl shadow-2xl shadow-black/70 backdrop-blur-xl p-5 sm:p-6 text-slate-200 transition-all duration-300">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center flex-shrink-0 text-cyan-400">
              <Cookie className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Cookies e privacidade
              </h2>
              {isPreferencesOpen && consent !== null && (
                <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] font-medium text-slate-400">
                  <span>Status atual:</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      consent === "granted"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-300 border border-slate-700"
                    }`}
                  >
                    {consent === "granted" ? "Analytics Aceito" : "Analytics Recusado"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {consent !== null && (
            <button
              type="button"
              onClick={handleClose}
              aria-label="Fechar painel de preferências de cookies"
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mt-3">
          Usamos cookies analíticos opcionais para entender como o QR MASTER é utilizado e melhorar a experiência. Você pode aceitar ou recusar esses cookies. Cookies essenciais continuam funcionando normalmente.{" "}
          <Link
            href="/privacy"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 font-medium transition-colors"
          >
            Política de Privacidade
          </Link>.
        </p>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 mt-5 pt-3 border-t border-slate-800/80">
          <button
            type="button"
            onClick={handleDecline}
            className="px-4 py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-slate-500 text-center cursor-pointer"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs sm:text-sm font-bold shadow-lg shadow-cyan-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 text-center cursor-pointer"
          >
            Aceitar analytics
          </button>
        </div>
      </div>
    </aside>
  );
}

export function CookiePreferencesButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("qr_master_open_cookie_preferences"));
        }
      }}
      className={className || "hover:text-cyan-400 transition-colors text-left cursor-pointer"}
    >
      {children || "Preferências de cookies"}
    </button>
  );
}
