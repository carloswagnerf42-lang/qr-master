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
  dotsColor: "#0f172a",
  dotsType: "square",
  cornerSquareType: "square",
  cornerSquareColor: "#0f172a",
  cornerDotColor: "#0f172a",
  bgColor: "#ffffff",
  transparentBg: false,
  gradientEnabled: false,
  gradientType: "linear",
  gradientColor: "#0f172a",
  frame: "none",
  frameText: "APONTE A CÂMERA",
  frameColor: "#4f46e5",
  frameTextColor: "#ffffff",
  errorCorrectionLevel: "M",
  hasLogo: false,
  logoSize: 20,
};
