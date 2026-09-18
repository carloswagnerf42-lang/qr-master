export type QRCodeModuleType = "square" | "rounded" | "dots" | "classy";
export type QRCodeEyeType = "square" | "extra-rounded" | "circle";
export type QRCodeFrameType = "none" | "simple" | "scan-me" | "bottom-banner" | "badge";
export type QRCodeErrorLevel = "L" | "M" | "Q" | "H";

export interface QRCodeStyleConfig {
  dotsColor: string;
  dotsType: QRCodeModuleType;
  cornerSquareType: QRCodeEyeType;
  cornerSquareColor: string;
  cornerDotColor: string;
  bgColor: string;
  transparentBg?: boolean;
  gradientEnabled?: boolean;
  gradientType?: "linear" | "radial";
  gradientColor?: string;
  frame: QRCodeFrameType;
  frameText: string;
  frameColor: string;
  frameTextColor?: string;
  errorCorrectionLevel: QRCodeErrorLevel;
  hasLogo?: boolean;
  logoUrl?: string;
  logoSize?: number;
}

export const DEFAULT_STYLE_CONFIG: QRCodeStyleConfig = {
  dotsColor: "#1e1b4b",
  dotsType: "rounded",
  cornerSquareType: "extra-rounded",
  cornerSquareColor: "#4f46e5",
  cornerDotColor: "#4f46e5",
  bgColor: "#ffffff",
  transparentBg: false,
  gradientEnabled: false,
  gradientType: "linear",
  gradientColor: "#6366f1",
  frame: "scan-me",
  frameText: "APONTE A CÂMERA",
  frameColor: "#4f46e5",
  frameTextColor: "#ffffff",
  errorCorrectionLevel: "H",
  hasLogo: false,
  logoSize: 20,
};
