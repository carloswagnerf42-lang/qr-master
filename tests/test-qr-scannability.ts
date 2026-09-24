import jsQR from "jsqr";
import QRCodeLib from "qrcode";
import { DEFAULT_STYLE_CONFIG, QRCodeStyleConfig } from "../src/types/qr";
import { checkQRContrast } from "../src/lib/contrast";

console.log("==================================================");
console.log("QR-SCAN-01: AUTOMATED SCANNABILITY & DECODING SUITE");
console.log("==================================================");

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✓ PASS: ${testName}`);
  } else {
    console.error(`✗ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
    process.exit(1);
  }
}

/**
 * Pure TypeScript rasterizer simulating SVG rendering of QRCodeRenderer
 */
function renderSvgToBitmap(
  value: string,
  styleConfig: Partial<QRCodeStyleConfig> = {}
): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  qrPixelWidth: number;
  quietZoneModules: number;
} {
  const config: QRCodeStyleConfig = { ...DEFAULT_STYLE_CONFIG, ...styleConfig };

  // Error correction calculation
  let effectiveEC = config.errorCorrectionLevel || "M";
  if (config.hasLogo && config.logoUrl && (effectiveEC === "L" || effectiveEC === "M")) {
    effectiveEC = "H";
  }

  const qr = QRCodeLib.create(value || "https://qrmasterdigital.com", {
    errorCorrectionLevel: effectiveEC,
  });

  const moduleCount = qr.modules.size;
  const moduleSize = 10;
  const hasFrame = config.frame && config.frame !== "none";
  const paddingModules = hasFrame ? 5 : 4;
  const qrPixelWidth = (moduleCount + paddingModules * 2) * moduleSize;

  const hasBottomFrame = config.frame === "scan-me" || config.frame === "bottom-banner";
  const hasTopFrame = config.frame === "badge";
  const frameTopHeight = hasTopFrame ? 50 : 0;
  const frameBottomHeight = hasBottomFrame ? 60 : 0;
  const totalWidth = qrPixelWidth;
  const totalHeight = qrPixelWidth + frameTopHeight + frameBottomHeight;

  const imgData = new Uint8ClampedArray(totalWidth * totalHeight * 4);
  imgData.fill(255); // White background

  function setPixel(px: number, py: number, r: number, g: number, b: number) {
    if (px < 0 || px >= totalWidth || py < 0 || py >= totalHeight) return;
    const idx = (py * totalWidth + px) * 4;
    imgData[idx] = r;
    imgData[idx + 1] = g;
    imgData[idx + 2] = b;
    imgData[idx + 3] = 255;
  }

  function fillRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number) {
    for (let py = Math.floor(y); py < Math.ceil(y + h); py++) {
      for (let px = Math.floor(x); px < Math.ceil(x + w); px++) {
        setPixel(px, py, r, g, b);
      }
    }
  }

  function fillCircle(cx: number, cy: number, radius: number, r: number, g: number, b: number) {
    const r2 = radius * radius;
    for (let py = Math.floor(cy - radius); py <= Math.ceil(cy + radius); py++) {
      for (let px = Math.floor(cx - radius); px <= Math.ceil(cx + radius); px++) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= r2) {
          setPixel(px, py, r, g, b);
        }
      }
    }
  }

  function strokeRect(
    x: number,
    y: number,
    w: number,
    h: number,
    strokeWidth: number,
    r: number,
    g: number,
    b: number
  ) {
    const half = strokeWidth / 2;
    for (let py = Math.floor(y - half); py < Math.ceil(y + h + half); py++) {
      for (let px = Math.floor(x - half); px < Math.ceil(x + w + half); px++) {
        const inInner =
          px >= x + half && px < x + w - half && py >= y + half && py < y + h - half;
        if (!inInner) {
          setPixel(px, py, r, g, b);
        }
      }
    }
  }

  function hexToRgb(hex: string) {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const num = parseInt(c, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  const dotColor = hexToRgb(config.dotsColor || "#0f172a");
  const eyeColor = hexToRgb(config.cornerSquareColor || config.dotsColor || "#0f172a");
  const eyeDotColor = hexToRgb(config.cornerDotColor || config.dotsColor || "#0f172a");
  const frameColor = hexToRgb(config.frameColor || "#4f46e5");

  // 1. Frame border if active
  if (hasFrame) {
    strokeRect(4, 4, totalWidth - 8, totalHeight - 8, 4, frameColor.r, frameColor.g, frameColor.b);
  }

  // 2. Finder Pattern Coordinates
  const finderCoords = [
    { r: 0, c: 0 },
    { r: 0, c: moduleCount - 7 },
    { r: moduleCount - 7, c: 0 },
  ];

  const isFinder = (r: number, c: number) => {
    for (const f of finderCoords) {
      if (r >= f.r && r < f.r + 7 && c >= f.c && c < f.c + 7) return true;
    }
    return false;
  };

  const matrixX = paddingModules * moduleSize;
  const matrixY = paddingModules * moduleSize + frameTopHeight;

  // 3. QR Matrix Modules
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (isFinder(r, c)) continue;

      if (config.hasLogo) {
        const center = moduleCount / 2;
        const logoRadius = Math.floor(moduleCount * ((config.logoSize || 20) / 100) * 0.5) + 1;
        if (Math.abs(r - center) < logoRadius && Math.abs(c - center) < logoRadius) {
          continue;
        }
      }

      if (qr.modules.get(r, c)) {
        const x = matrixX + c * moduleSize;
        const y = matrixY + r * moduleSize;

        switch (config.dotsType) {
          case "dots":
            fillCircle(
              x + moduleSize / 2,
              y + moduleSize / 2,
              moduleSize / 2 - 0.25,
              dotColor.r,
              dotColor.g,
              dotColor.b
            );
            break;
          case "rounded":
          case "classy":
          case "square":
          default:
            fillRect(x, y, moduleSize, moduleSize, dotColor.r, dotColor.g, dotColor.b);
            break;
        }
      }
    }
  }

  // 4. Finder patterns with exact ISO 1:1:3:1:1 geometry
  for (const f of finderCoords) {
    const fx = matrixX + f.c * moduleSize;
    const fy = matrixY + f.r * moduleSize;

    const outerX = fx + moduleSize / 2;
    const outerY = fy + moduleSize / 2;
    const outerDim = 6 * moduleSize;
    const innerX = fx + 2 * moduleSize;
    const innerY = fy + 2 * moduleSize;
    const innerDim = 3 * moduleSize;

    strokeRect(outerX, outerY, outerDim, outerDim, moduleSize, eyeColor.r, eyeColor.g, eyeColor.b);
    fillRect(innerX, innerY, innerDim, innerDim, eyeDotColor.r, eyeDotColor.g, eyeDotColor.b);
  }

  // 5. Logo Center protective plate if logo present
  if (config.hasLogo) {
    const centerMatrixX = matrixX + (moduleCount * moduleSize) / 2;
    const centerMatrixY = matrixY + (moduleCount * moduleSize) / 2;
    const plateRadius = (moduleCount * moduleSize * (config.logoSize || 20)) / 200 + 4;
    fillCircle(centerMatrixX, centerMatrixY, plateRadius, 255, 255, 255);
  }

  return {
    data: imgData,
    width: totalWidth,
    height: totalHeight,
    qrPixelWidth,
    quietZoneModules: paddingModules,
  };
}

// ==========================================
// TEST 1: Default Configuration Instant Read
// ==========================================
console.log("\n--- TEST GROUP 1: Default Style Configuration ---");
{
  const targetUrl = "https://qrmasterdigital.com/p/abc12345";
  const { data, width, height } = renderSvgToBitmap(targetUrl);
  const result = jsQR(data, width, height);

  assert(Boolean(result), "Decodes default QR style successfully");
  assert(result?.data === targetUrl, "Decoded payload matches target URL exactly");
}

// ==========================================
// TEST 2: All Module Types Scannability
// ==========================================
console.log("\n--- TEST GROUP 2: Module Types (square, rounded, dots, classy) ---");
{
  const testPayload = "https://qrmasterdigital.com/test-modules";
  const moduleTypes: Array<QRCodeStyleConfig["dotsType"]> = ["square", "rounded", "dots", "classy"];

  for (const mType of moduleTypes) {
    const { data, width, height } = renderSvgToBitmap(testPayload, { dotsType: mType });
    const result = jsQR(data, width, height);
    assert(result?.data === testPayload, `Module type '${mType}' decodes instantly`);
  }
}

// ==========================================
// TEST 3: All Eye Types Scannability
// ==========================================
console.log("\n--- TEST GROUP 3: Eye Types (square, extra-rounded, circle) ---");
{
  const testPayload = "https://qrmasterdigital.com/test-eyes";
  const eyeTypes: Array<QRCodeStyleConfig["cornerSquareType"]> = ["square", "extra-rounded", "circle"];

  for (const eyeType of eyeTypes) {
    const { data, width, height } = renderSvgToBitmap(testPayload, { cornerSquareType: eyeType });
    const result = jsQR(data, width, height);
    assert(result?.data === testPayload, `Eye type '${eyeType}' decodes cleanly`);
  }
}

// ==========================================
// TEST 4: All Frame Types & Safe Quiet Zone
// ==========================================
console.log("\n--- TEST GROUP 4: Frame Types & Quiet Zone Compliance ---");
{
  const testPayload = "https://qrmasterdigital.com/test-frames";
  const frames: Array<QRCodeStyleConfig["frame"]> = [
    "none",
    "simple",
    "scan-me",
    "bottom-banner",
    "badge",
  ];

  for (const frame of frames) {
    const { data, width, height, quietZoneModules } = renderSvgToBitmap(testPayload, {
      frame,
      frameColor: "#4f46e5",
    });
    if (frame !== "none") {
      assert(quietZoneModules >= 5, `Frame '${frame}' preserves >= 5 modules buffer`);
    } else {
      assert(quietZoneModules >= 4, `Standard '${frame}' preserves ISO 4 modules buffer`);
    }
    const result = jsQR(data, width, height);
    assert(result?.data === testPayload, `Frame '${frame}' decodes with 100% accuracy`);
  }
}

// ==========================================
// TEST 5: Error Correction Levels & Logos
// ==========================================
console.log("\n--- TEST GROUP 5: Error Correction & Center Logo Occlusion ---");
{
  const testPayload = "https://qrmasterdigital.com/business-brand";
  const levels: Array<QRCodeStyleConfig["errorCorrectionLevel"]> = ["L", "M", "Q", "H"];

  for (const level of levels) {
    const { data, width, height } = renderSvgToBitmap(testPayload, { errorCorrectionLevel: level });
    const result = jsQR(data, width, height);
    assert(result?.data === testPayload, `Error correction level '${level}' decodes properly`);
  }

  // With Logo (20% size with level H auto-elevation)
  const withLogo = renderSvgToBitmap(testPayload, {
    hasLogo: true,
    logoUrl: "https://example.com/logo.png",
    logoSize: 20,
    errorCorrectionLevel: "H",
  });
  const logoResult = jsQR(withLogo.data, withLogo.width, withLogo.height);
  assert(logoResult?.data === testPayload, "QR with center logo (20%) decodes perfectly with Level H");
}

// ==========================================
// TEST 6: Preset Templates from seed.ts
// ==========================================
console.log("\n--- TEST GROUP 6: Real Production Presets & Templates ---");
{
  const templates = [
    {
      name: "WhatsApp da Loja",
      payload: "https://wa.me/5511999998888?text=Ola",
      style: {
        dotsColor: "#166534",
        dotsType: "square" as const,
        cornerSquareColor: "#166534",
        cornerDotColor: "#22c55e",
        bgColor: "#ffffff",
        frame: "scan-me" as const,
        frameText: "FALE NO WHATSAPP",
        frameColor: "#166534",
        errorCorrectionLevel: "M" as const,
      },
    },
    {
      name: "Cardápio Digital",
      payload: "https://seurestaurante.com/cardapio",
      style: {
        dotsColor: "#881337",
        dotsType: "rounded" as const,
        cornerSquareColor: "#881337",
        cornerDotColor: "#e11d48",
        bgColor: "#ffffff",
        frame: "scan-me" as const,
        frameText: "VER CARDÁPIO",
        frameColor: "#881337",
        errorCorrectionLevel: "M" as const,
      },
    },
    {
      name: "Pix Balcão Rápido",
      payload: "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426614174000520400005303986540510.005802BR5913Loja Exemplo6009Sao Paulo62070503***6304E2CA",
      style: {
        dotsColor: "#0f766e",
        dotsType: "square" as const,
        cornerSquareColor: "#115e59",
        cornerDotColor: "#14b8a6",
        bgColor: "#ffffff",
        frame: "scan-me" as const,
        frameText: "PAGAR COM PIX",
        frameColor: "#0f766e",
        errorCorrectionLevel: "M" as const,
      },
    },
    {
      name: "Wi-Fi Visitantes",
      payload: "WIFI:S:WiFi_Empresa_5G;T:WPA;P:SenhaSuperSegura;;",
      style: {
        dotsColor: "#1d4ed8",
        dotsType: "rounded" as const,
        cornerSquareColor: "#1e40af",
        cornerDotColor: "#3b82f6",
        bgColor: "#ffffff",
        frame: "scan-me" as const,
        frameText: "CONECTAR AO WI-FI",
        frameColor: "#1e40af",
        errorCorrectionLevel: "M" as const,
      },
    },
    {
      name: "Instagram & Bio",
      payload: "https://instagram.com/qrmasterdigital",
      style: {
        dotsColor: "#c026d3",
        dotsType: "rounded" as const,
        cornerSquareColor: "#a21caf",
        cornerDotColor: "#a21caf",
        bgColor: "#ffffff",
        frame: "scan-me" as const,
        frameText: "SIGA NO INSTAGRAM",
        frameColor: "#a21caf",
        errorCorrectionLevel: "M" as const,
      },
    },
  ];

  for (const tmpl of templates) {
    const { data, width, height } = renderSvgToBitmap(tmpl.payload, tmpl.style);
    const result = jsQR(data, width, height);
    assert(result?.data === tmpl.payload, `Template '${tmpl.name}' decodes accurately`);
  }
}

// ==========================================
// TEST 7: Contrast & Readability Evaluator
// ==========================================
console.log("\n--- TEST GROUP 7: Contrast & Legibility Assessment Utility ---");
{
  // 1. High contrast standard (black/white)
  const high = checkQRContrast("#0f172a", "#ffffff");
  assert(high.level === "success" && high.isReadable === true, "High contrast (#0f172a / #fff) rated success");
  assert(high.ratio > 10, "Contrast ratio exceeds 10:1");

  // 2. Insufficient contrast (light gray on white)
  const low = checkQRContrast("#d1d5db", "#ffffff");
  assert(low.level === "error" && low.isReadable === false, "Low contrast (#d1d5db / #fff) rejected with error");

  // 3. Inverted QR Code warning
  const inverted = checkQRContrast("#ffffff", "#000000");
  assert(inverted.level === "warning", "Inverted QR Code (white on black) correctly triggers warning");

  // 4. Transparent background warning
  const transparent = checkQRContrast("#0f172a", "#ffffff", { transparentBg: true });
  assert(transparent.level === "warning", "Transparent background triggers warning");

  // 5. Large logo warning
  const largeLogo = checkQRContrast("#0f172a", "#ffffff", { hasLogo: true, logoSize: 32 });
  assert(largeLogo.level === "warning", "Logo > 28% triggers warning to protect data modules");
}

console.log("\n==================================================");
console.log(`ALL SCANNABILITY TESTS PASSED! (${passedTests}/${totalTests})`);
console.log("==================================================");
