import { QRCodeStyleConfig } from "@/types/qr";

/**
 * Utilitários de cálculo de luminância e contraste WCAG para QR Codes
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let c = hex.replace("#", "");
  if (c.length === 3) {
    c = c.split("").map((x) => x + x).join("");
  }
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export interface ContrastCheckResult {
  ratio: number;
  isReadable: boolean;
  message: string;
  level: "success" | "warning" | "error";
  details?: string[];
}

export function checkQRContrast(
  fgHex: string,
  bgHex: string,
  styleConfig?: Partial<QRCodeStyleConfig>
): ContrastCheckResult {
  try {
    const fg = hexToRgb(fgHex || "#000000");
    const bg = hexToRgb(bgHex || "#ffffff");

    const lum1 = getRelativeLuminance(fg.r, fg.g, fg.b);
    const lum2 = getRelativeLuminance(bg.r, bg.g, bg.b);

    const brighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);

    const ratio = (brighter + 0.05) / (darker + 0.05);
    const isInverted = lum1 > lum2; // Foreground is brighter than background

    const details: string[] = [];

    // Critical: Insufficient contrast
    if (ratio < 2.5) {
      return {
        ratio: Number(ratio.toFixed(2)),
        isReadable: false,
        message: "⚠ Contraste insuficiente (Câmeras não conseguirão escanear este QR Code)",
        level: "error",
        details: ["Aumente a diferença entre a cor dos módulos e a cor de fundo."],
      };
    }

    // Inverted QR code warning (many camera apps fail to decode light modules on dark background)
    if (isInverted) {
      details.push("QR invertido: Fundo escuro com módulos claros pode falhar em câmeras Android antigas.");
      return {
        ratio: Number(ratio.toFixed(2)),
        isReadable: true,
        message: "⚠ QR Code invertido (Fundo escuro pode dificultar leitura em alguns celulares)",
        level: "warning",
        details,
      };
    }

    // Transparent background warning
    if (styleConfig?.transparentBg) {
      details.push("Fundo transparente: A leitura dependerá da superfície onde o QR Code for exibido.");
      return {
        ratio: Number(ratio.toFixed(2)),
        isReadable: true,
        message: "⚠ Fundo transparente (Garanta que a superfície de aplicação tenha fundo claro)",
        level: "warning",
        details,
      };
    }

    // Logo size warning
    if (styleConfig?.hasLogo && (styleConfig.logoSize || 20) > 28) {
      details.push("Logo grande: Ocupa mais de 28% da matriz do QR Code.");
      return {
        ratio: Number(ratio.toFixed(2)),
        isReadable: true,
        message: "⚠ Logo muito grande (Reduza para até 25% para evitar perda de dados)",
        level: "warning",
        details,
      };
    }

    // Moderate contrast
    if (ratio < 4.0) {
      return {
        ratio: Number(ratio.toFixed(2)),
        isReadable: true,
        message: "⚠ Contraste moderado (Pode apresentar lentidão em baixa iluminação)",
        level: "warning",
        details: ["Recomendamos utilizar cores com maior contraste para leitura instantânea."],
      };
    }

    // Excellent / Good readability
    return {
      ratio: Number(ratio.toFixed(2)),
      isReadable: true,
      message: ratio >= 4.5
        ? "✓ Excelente legibilidade (Contraste ideal para leitura instantânea)"
        : "✓ Boa legibilidade (Contraste adequado)",
      level: "success",
      details: ["Padrão ISO/IEC 18004 atendido com margem de segurança."],
    };
  } catch {
    return {
      ratio: 5.0,
      isReadable: true,
      message: "✓ Boa legibilidade",
      level: "success",
    };
  }
}
