"use client";

import React, { useMemo } from "react";
import QRCodeLib from "qrcode";
import { QRCodeStyleConfig, DEFAULT_STYLE_CONFIG } from "@/types/qr";

interface QRCodeRendererProps {
  value: string;
  styleConfig?: Partial<QRCodeStyleConfig>;
  size?: number; // visual size in px
  id?: string;
  className?: string;
}

export const QRCodeRenderer: React.FC<QRCodeRendererProps> = ({
  value,
  styleConfig = {},
  size = 280,
  id = "qr-code-svg",
  className = "",
}) => {
  const config: QRCodeStyleConfig = { ...DEFAULT_STYLE_CONFIG, ...styleConfig };

  const qrData = useMemo(() => {
    try {
      const qr = QRCodeLib.create(value || "https://qrmaster.app", {
        errorCorrectionLevel: config.errorCorrectionLevel || "H",
      });
      return qr;
    } catch {
      return QRCodeLib.create("https://qrmaster.app", { errorCorrectionLevel: "M" });
    }
  }, [value, config.errorCorrectionLevel]);

  const { moduleCount, moduleSize, finderPatternCoords, isFinderPattern } = useMemo(() => {
    const count = qrData.modules.size;
    const mSize = 10; // internal coordinate unit per module

    // Coordinates of the 3 finder patterns (each is 7x7 modules)
    // Top-Left: (0, 0), Top-Right: (count - 7, 0), Bottom-Left: (0, count - 7)
    const finderCoords = [
      { r: 0, c: 0 },
      { r: 0, c: count - 7 },
      { r: count - 7, c: 0 },
    ];

    const checkFinder = (r: number, c: number) => {
      for (const f of finderCoords) {
        if (r >= f.r && r < f.r + 7 && c >= f.c && c < f.c + 7) {
          return true;
        }
      }
      return false;
    };

    return {
      moduleCount: count,
      moduleSize: mSize,
      finderPatternCoords: finderCoords,
      isFinderPattern: checkFinder,
    };
  }, [qrData]);

  // Dimensions
  const paddingModules = 4;
  const qrPixelWidth = (moduleCount + paddingModules * 2) * moduleSize;

  // Frame heights
  const hasBottomFrame = config.frame === "scan-me" || config.frame === "bottom-banner";
  const hasTopFrame = config.frame === "badge";
  const frameTopHeight = hasTopFrame ? 50 : 0;
  const frameBottomHeight = hasBottomFrame ? 60 : 0;
  const totalSvgHeight = qrPixelWidth + frameTopHeight + frameBottomHeight;
  const totalSvgWidth = qrPixelWidth;

  // Background color
  const effectiveBg = config.transparentBg ? "transparent" : config.bgColor || "#ffffff";

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-center select-none ${className}`}
      style={{ maxWidth: "100%" }}
    >
      <svg
        id={id}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${totalSvgWidth} ${totalSvgHeight}`}
        width={size}
        height={(size * totalSvgHeight) / totalSvgWidth}
        className="rounded-xl transition-all duration-300 drop-shadow-sm"
      >
        <defs>
          {config.gradientEnabled && (
            <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={config.dotsColor} />
              <stop offset="100%" stopColor={config.gradientColor || config.dotsColor} />
            </linearGradient>
          )}
        </defs>

        {/* Base Background */}
        <rect width={totalSvgWidth} height={totalSvgHeight} fill={effectiveBg} rx={16} />

        {/* Frame: Outer border if frame is active */}
        {config.frame !== "none" && (
          <rect
            x={4}
            y={4}
            width={totalSvgWidth - 8}
            height={totalSvgHeight - 8}
            fill="none"
            stroke={config.frameColor || "#4f46e5"}
            strokeWidth={6}
            rx={14}
          />
        )}

        {/* Frame: Top Badge */}
        {hasTopFrame && (
          <g>
            <rect
              x={4}
              y={4}
              width={totalSvgWidth - 8}
              height={frameTopHeight}
              fill={config.frameColor || "#4f46e5"}
              rx={12}
            />
            <text
              x={totalSvgWidth / 2}
              y={frameTopHeight / 2 + 10}
              textAnchor="middle"
              fill={config.frameTextColor || "#ffffff"}
              fontSize={18}
              fontWeight="bold"
              fontFamily="sans-serif"
              letterSpacing="1.5"
            >
              {config.frameText || "APONTE A CÂMERA"}
            </text>
          </g>
        )}

        {/* QR Matrix Modules */}
        <g transform={`translate(${paddingModules * moduleSize}, ${paddingModules * moduleSize + frameTopHeight})`}>
          {Array.from({ length: moduleCount }).map((_, r) =>
            Array.from({ length: moduleCount }).map((_, c) => {
              const isDark = qrData.modules.get(r, c);
              if (!isDark) return null;

              // Don't draw regular modules inside finder patterns (they are custom-drawn)
              if (isFinderPattern(r, c)) return null;

              // Center logo avoidance if logo is present
              if (config.hasLogo) {
                const center = moduleCount / 2;
                const logoRadiusModules = Math.floor(moduleCount * ((config.logoSize || 20) / 100) * 0.5) + 1;
                if (Math.abs(r - center) < logoRadiusModules && Math.abs(c - center) < logoRadiusModules) {
                  return null;
                }
              }

              const x = c * moduleSize;
              const y = r * moduleSize;
              const fill = config.gradientEnabled ? `url(#${id}-grad)` : config.dotsColor;

              switch (config.dotsType) {
                case "rounded":
                  return (
                    <rect
                      key={`${r}-${c}`}
                      x={x + 0.5}
                      y={y + 0.5}
                      width={moduleSize - 1}
                      height={moduleSize - 1}
                      rx={3}
                      fill={fill}
                    />
                  );
                case "dots":
                  return (
                    <circle
                      key={`${r}-${c}`}
                      cx={x + moduleSize / 2}
                      cy={y + moduleSize / 2}
                      r={moduleSize / 2 - 0.75}
                      fill={fill}
                    />
                  );
                case "classy":
                  return (
                    <rect
                      key={`${r}-${c}`}
                      x={x + 0.5}
                      y={y + 0.5}
                      width={moduleSize - 1}
                      height={moduleSize - 1}
                      rx={moduleSize * 0.35}
                      fill={fill}
                    />
                  );
                case "square":
                default:
                  return (
                    <rect
                      key={`${r}-${c}`}
                      x={x}
                      y={y}
                      width={moduleSize}
                      height={moduleSize}
                      fill={fill}
                    />
                  );
              }
            })
          )}

          {/* Custom Finder Patterns (Corner Eyes) */}
          {finderPatternCoords.map((coord, idx) => {
            const x = coord.c * moduleSize;
            const y = coord.r * moduleSize;
            const eyeSize = 7 * moduleSize;
            const eyeSquareColor = config.cornerSquareColor || config.dotsColor;
            const eyeDotColor = config.cornerDotColor || config.dotsColor;

            // Outer eye style
            let outerRx = 0;
            if (config.cornerSquareType === "extra-rounded") outerRx = 14;
            if (config.cornerSquareType === "circle") outerRx = eyeSize / 2;

            // Inner eye style
            let innerRx = 0;
            if (config.cornerSquareType === "extra-rounded") innerRx = 6;
            if (config.cornerSquareType === "circle") innerRx = (3 * moduleSize) / 2;

            return (
              <g key={`finder-${idx}`}>
                {/* Outer frame 7x7 */}
                <rect
                  x={x}
                  y={y}
                  width={eyeSize}
                  height={eyeSize}
                  fill="none"
                  stroke={eyeSquareColor}
                  strokeWidth={moduleSize}
                  rx={outerRx}
                />
                {/* Inner center dot 3x3 */}
                <rect
                  x={x + 2 * moduleSize}
                  y={y + 2 * moduleSize}
                  width={3 * moduleSize}
                  height={3 * moduleSize}
                  fill={eyeDotColor}
                  rx={innerRx}
                />
              </g>
            );
          })}

          {/* Logo Center */}
          {config.hasLogo && config.logoUrl && (
            <g>
              {/* White protective background plate */}
              <circle
                cx={(moduleCount * moduleSize) / 2}
                cy={(moduleCount * moduleSize) / 2}
                r={(moduleCount * moduleSize * (config.logoSize || 20)) / 200 + 4}
                fill={effectiveBg}
                stroke={config.cornerSquareColor}
                strokeWidth={2}
              />
              <image
                href={config.logoUrl}
                x={(moduleCount * moduleSize) / 2 - (moduleCount * moduleSize * (config.logoSize || 20)) / 200}
                y={(moduleCount * moduleSize) / 2 - (moduleCount * moduleSize * (config.logoSize || 20)) / 200}
                width={(moduleCount * moduleSize * (config.logoSize || 20)) / 100}
                height={(moduleCount * moduleSize * (config.logoSize || 20)) / 100}
                preserveAspectRatio="xMidYMid meet"
              />
            </g>
          )}
        </g>

        {/* Frame: Bottom Banner / "Scan Me" */}
        {hasBottomFrame && (
          <g>
            <rect
              x={4}
              y={totalSvgHeight - frameBottomHeight}
              width={totalSvgWidth - 8}
              height={frameBottomHeight - 4}
              fill={config.frameColor || "#4f46e5"}
              rx={12}
            />
            <text
              x={totalSvgWidth / 2}
              y={totalSvgHeight - frameBottomHeight / 2 + 6}
              textAnchor="middle"
              fill={config.frameTextColor || "#ffffff"}
              fontSize={18}
              fontWeight="bold"
              fontFamily="sans-serif"
              letterSpacing="1.2"
            >
              {config.frameText || "APONTE A CÂMERA"}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
