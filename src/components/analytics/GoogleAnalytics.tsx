"use client";

import React, { useEffect, useState } from "react";
import Script from "next/script";

export const CONSENT_STORAGE_KEY = "qr_master_analytics_consent";
export type ConsentStatus = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

/**
 * Remove cookies analíticos primários criados pelo Google Analytics (_ga, _gid, _gat, _ga_*)
 * preservando integralmente os cookies de funcionamento da plataforma.
 */
export function removeGaCookies() {
  if (typeof document === "undefined") return;

  try {
    const hostname = window.location.hostname;
    const domainParts = hostname.split(".");
    const domains = [
      "",
      hostname,
      `.${hostname}`,
      domainParts.length > 1 ? `.${domainParts.slice(-2).join(".")}` : "",
    ].filter(Boolean);

    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf("=");
      const name = (eqPos > -1 ? cookie.slice(0, eqPos) : cookie).trim();
      if (name.startsWith("_ga") || name.startsWith("_gid") || name.startsWith("_gat")) {
        for (const domain of domains) {
          document.cookie = `${name}=; Path=/; Domain=${domain}; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0; SameSite=Lax`;
          document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0; SameSite=Lax`;
        }
      }
    }
  } catch {
    // Falha silenciosa em caso de restrição de cookie
  }
}

/**
 * Atualiza o Google Consent Mode v2 e salva a escolha no localStorage.
 */
export function updateAnalyticsConsent(status: ConsentStatus) {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, status);
  } catch {
    // Falha silenciosa em ambientes com localStorage bloqueado
  }

  // Atualização do Consent Mode v2
  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", {
      analytics_storage: status,
      // Publicidade permanece permanentemente denied
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }

  if (status === "denied") {
    removeGaCookies();
  }

  // Notifica componentes ouvintes
  window.dispatchEvent(
    new CustomEvent("qr_master_consent_updated", { detail: { status } })
  );
}

/**
 * Recupera o status de consentimento salvo ('granted' | 'denied' | null).
 */
export function getStoredAnalyticsConsent(): ConsentStatus | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const val = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (val === "granted" || val === "denied") {
      return val;
    }
    return null;
  } catch {
    return null;
  }
}

interface GoogleAnalyticsProps {
  gaId: string;
}

export function GoogleAnalytics({ gaId }: GoogleAnalyticsProps) {
  const [isGranted, setIsGranted] = useState<boolean>(false);

  useEffect(() => {
    const current = getStoredAnalyticsConsent();
    if (current === "granted") {
      setIsGranted(true);
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          analytics_storage: "granted",
        });
      }
    } else {
      setIsGranted(false);
      if (current === "denied") {
        removeGaCookies();
      }
    }

    const handleConsentUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ status: ConsentStatus }>;
      const status = customEvent.detail?.status;
      if (status === "granted") {
        setIsGranted(true);
      } else if (status === "denied") {
        setIsGranted(false);
        removeGaCookies();
      }
    };

    window.addEventListener("qr_master_consent_updated", handleConsentUpdate);
    return () => {
      window.removeEventListener("qr_master_consent_updated", handleConsentUpdate);
    };
  }, []);

  // Se o usuário não concedeu permissão, NENHUM script de rastreamento é injetado
  if (!isGranted) {
    return null;
  }

  return (
    <>
      <Script
        id="ga4-script"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
      />
      <Script
        id="ga4-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaId}', {
              send_page_view: true
            });
            window.__qr_master_ga4_ready = true;
            window.dispatchEvent(new CustomEvent('qr_master_ga4_ready'));
          `,
        }}
      />
    </>
  );
}
