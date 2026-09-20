"use client";

import React from "react";
import Link from "next/link";

export interface BrandLogoProps {
  variant?: "symbol" | "horizontal" | "full";
  theme?: "auto" | "dark" | "light";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  withSlogan?: boolean;
  className?: string;
  asLink?: boolean;
  href?: string;
  ariaLabel?: string;
}

/**
 * Símbolo Oficial QR MASTER
 * Letra 'Q' geométrica integrada aos 4 cantos de leitura/escaneamento de um QR Code.
 * Gradiente oficial: #006CFF -> #00E0FF
 */
export function BrandSymbol({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="qmBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#006CFF" />
          <stop offset="50%" stopColor="#0084FF" />
          <stop offset="100%" stopColor="#00E0FF" />
        </linearGradient>
        <linearGradient id="qmCornerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#006CFF" />
          <stop offset="100%" stopColor="#00E0FF" />
        </linearGradient>
      </defs>

      {/* 4 Cantos de Escaneamento QR (Corner Brackets) */}
      {/* Top-Left */}
      <path
        d="M 14 36 L 14 20 A 6 6 0 0 1 20 14 L 36 14"
        stroke="url(#qmCornerGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="23" y="23" width="7" height="7" rx="2" fill="url(#qmBrandGrad)" />

      {/* Top-Right */}
      <path
        d="M 84 14 L 100 14 A 6 6 0 0 1 106 20 L 106 36"
        stroke="url(#qmCornerGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="90" y="23" width="7" height="7" rx="2" fill="url(#qmBrandGrad)" />

      {/* Bottom-Left */}
      <path
        d="M 14 84 L 14 100 A 6 6 0 0 0 20 106 L 36 106"
        stroke="url(#qmCornerGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="23" y="90" width="7" height="7" rx="2" fill="url(#qmBrandGrad)" />

      {/* Bottom-Right (Canto dinâmico onde a cauda do Q se conecta) */}
      <path
        d="M 84 106 L 100 106 A 6 6 0 0 0 106 100 L 106 84"
        stroke="url(#qmCornerGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Corpo Central: Letra "Q" Geométrica */}
      {/* Círculo Principal do Q */}
      <circle
        cx="58"
        cy="58"
        r="27"
        stroke="url(#qmBrandGrad)"
        strokeWidth="8"
        strokeLinecap="round"
      />

      {/* Ponto focal de leitura / núcleo */}
      <circle cx="58" cy="58" r="7" fill="url(#qmBrandGrad)" />

      {/* Cauda Conectora do "Q" que se projeta em direção ao canto de escaneamento inferior direito */}
      <path
        d="M 69 69 L 98 98"
        stroke="url(#qmBrandGrad)"
        strokeWidth="9"
        strokeLinecap="round"
      />
    </svg>
  );
}

const SIZE_MAP = {
  xs: { symbol: 22, text: "text-sm", slogan: "text-[8px]", gap: "gap-2" },
  sm: { symbol: 28, text: "text-base", slogan: "text-[9px]", gap: "gap-2.5" },
  md: { symbol: 36, text: "text-lg", slogan: "text-[10px]", gap: "gap-3" },
  lg: { symbol: 44, text: "text-xl", slogan: "text-[11px]", gap: "gap-3.5" },
  xl: { symbol: 56, text: "text-2xl", slogan: "text-[12px]", gap: "gap-4" },
};

export function BrandLogo({
  variant = "horizontal",
  theme = "auto",
  size = "md",
  withSlogan = false,
  className = "",
  asLink = false,
  href = "/dashboard",
  ariaLabel = "QR MASTER — Início",
}: BrandLogoProps) {
  const currentSize = SIZE_MAP[size] || SIZE_MAP.md;

  // Resolução de cores de texto baseada no tema
  const getTextColor = () => {
    if (theme === "dark") {
      return {
        primary: "text-white",
        accent: "bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent",
        slogan: "text-cyan-300/80",
      };
    }
    if (theme === "light") {
      return {
        primary: "text-[#0A1F44]",
        accent: "bg-gradient-to-r from-[#006CFF] to-[#0084FF] bg-clip-text text-transparent",
        slogan: "text-slate-500",
      };
    }
    // auto: adaptável ao tema claro/escuro
    return {
      primary: "text-slate-900 dark:text-white",
      accent: "bg-gradient-to-r from-[#006CFF] via-[#0084FF] to-[#00E0FF] bg-clip-text text-transparent",
      slogan: "text-slate-500 dark:text-cyan-300/80",
    };
  };

  const colors = getTextColor();

  const renderContent = () => {
    if (variant === "symbol") {
      return (
        <div className={`inline-flex items-center justify-center ${className}`}>
          <BrandSymbol size={currentSize.symbol} />
        </div>
      );
    }

    if (variant === "full") {
      return (
        <div className={`flex flex-col items-center text-center ${currentSize.gap} ${className}`}>
          <div className="p-3 rounded-2xl bg-[#0A1F44]/10 dark:bg-[#0A1F44]/40 border border-cyan-500/20 shadow-lg shadow-cyan-500/10">
            <BrandSymbol size={currentSize.symbol * 1.3} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5 font-extrabold tracking-tight font-brand">
              <span className={colors.primary}>QR</span>
              <span className={colors.accent}>MASTER</span>
            </div>
            {withSlogan && (
              <span
                className={`block font-bold tracking-[0.2em] uppercase ${colors.slogan} ${currentSize.slogan}`}
              >
                CONECTA O SEU MUNDO
              </span>
            )}
          </div>
        </div>
      );
    }

    // Horizontal (padrão)
    return (
      <div className={`inline-flex items-center ${currentSize.gap} ${className}`}>
        <BrandSymbol size={currentSize.symbol} />
        <div className="flex flex-col select-none">
          <div className={`flex items-center gap-1 font-extrabold tracking-tight font-brand ${currentSize.text} leading-none`}>
            <span className={colors.primary}>QR</span>
            <span className={colors.accent}>MASTER</span>
          </div>
          {withSlogan && (
            <span
              className={`font-semibold tracking-[0.18em] uppercase mt-1 ${colors.slogan} ${currentSize.slogan} leading-none`}
            >
              CONECTA O SEU MUNDO
            </span>
          )}
        </div>
      </div>
    );
  };

  if (asLink) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className="inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg group transition-opacity hover:opacity-95"
      >
        {renderContent()}
      </Link>
    );
  }

  return renderContent();
}
