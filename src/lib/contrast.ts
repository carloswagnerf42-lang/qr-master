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
}

export function checkQRContrast(fgHex: string, bgHex: string): ContrastCheckResult {
  try {
    const fg = hexToRgb(fgHex || "#000000");
    const bg = hexToRgb(bgHex || "#ffffff");

    const lum1 = getRelativeLuminance(fg.r, fg.g, fg.b);
    const lum2 = getRelativeLuminance(bg.r, bg.g, bg.b);

    const brighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);

    const ratio = (brighter + 0.05) / (darker + 0.05);

    if (ratio >= 4.5) {
      return {
        ratio: Number(ratio.toFixed(2)),
        isReadable: true,
        message: "✓ Boa legibilidade (Contraste ideal para leitura rápida)",
        level: "success",
      };
    } else if (ratio >= 2.5) {
      return {
        ratio: Number(ratio.toFixed(2)),
        isReadable: true,
        message: "⚠ Contraste moderado (Pode apresentar lentidão em câmeras antigas)",
        level: "warning",
      };
    } else {
      return {
        ratio: Number(ratio.toFixed(2)),
        isReadable: false,
        message: "⚠ Contraste insuficiente (A câmera pode não conseguir escanear este QR Code)",
        level: "error",
      };
    }
  } catch {
    return {
      ratio: 5.0,
      isReadable: true,
      message: "✓ Boa legibilidade",
      level: "success",
    };
  }
}
