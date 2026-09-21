"use client";

import { useState } from "react";
import { QRCodeRenderer } from "@/components/qr/QRCodeRenderer";
import { Zap, RefreshCw, CheckCircle2, ArrowRight, ExternalLink } from "lucide-react";

const DEMO_PRESETS = [
  {
    label: "Cardápio Almoço",
    url: "https://meunegocio.com.br/almoco",
    updated: false,
  },
  {
    label: "Promoção Jantar (Novo Destino)",
    url: "https://meunegocio.com.br/promocao-especial-jantar",
    updated: true,
  },
];

const COLOR_OPTIONS = [
  { name: "Electric Blue", value: "#0084FF" },
  { name: "Cyan Tech", value: "#00B4D8" },
  { name: "Deep Navy", value: "#0A1F44" },
  { name: "Emerald", value: "#059669" },
];

export function HeroDemo() {
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState("#0084FF");
  const [justSwitched, setJustSwitched] = useState(false);

  const activePreset = DEMO_PRESETS[activePresetIndex];

  const handleSwitchDestination = () => {
    setActivePresetIndex((prev) => (prev === 0 ? 1 : 0));
    setJustSwitched(true);
    setTimeout(() => setJustSwitched(false), 2000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl shadow-blue-950/40 backdrop-blur-xl">
      {/* Top Bar / Mockup Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          <span className="text-xs font-semibold text-slate-400 ml-2">
            Painel QR MASTER • Demonstração Interativa
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[11px] font-extrabold tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            DINÂMICO
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[11px] font-bold">
            <CheckCircle2 className="w-3 h-3" />
            Ativo
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left Side: QR Preview & Style Customizer */}
        <div className="lg:col-span-5 flex flex-col items-center space-y-4">
          <div className="p-4 rounded-2xl bg-white shadow-xl flex items-center justify-center transition-all duration-300">
            <QRCodeRenderer
              value={activePreset.url}
              styleConfig={{
                dotsColor: selectedColor,
                dotsType: "rounded",
                cornerSquareType: "extra-rounded",
                cornerSquareColor: selectedColor,
                cornerDotColor: selectedColor,
                bgColor: "#ffffff",
                frame: "scan-me",
                frameText: "APONTE A CÂMERA",
                frameColor: selectedColor,
              }}
              size={200}
            />
          </div>

          {/* Color Selector */}
          <div className="flex items-center gap-2.5 pt-1">
            <span className="text-[11px] font-medium text-slate-400">Cor do QR:</span>
            <div className="flex items-center gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setSelectedColor(c.value)}
                  title={c.name}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    selectedColor === c.value
                      ? "border-white scale-110 shadow-md"
                      : "border-transparent opacity-75 hover:opacity-100 hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Dynamic Redirection Simulation */}
        <div className="lg:col-span-7 space-y-4 text-left">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400 mb-1">
              <Zap className="w-3.5 h-3.5" />
              <span>Simulação de Edição em Tempo Real</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white">
              O mesmo QR Code impresso aponta para onde você quiser
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Altere o destino da sua campanha em segundos sem precisar recolher panfletos, trocar cardápios de mesa ou reimprimir embalagens.
            </p>
          </div>

          {/* Link Status Box */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Destino impresso / inicial:</span>
              <span className="font-mono text-slate-500 line-through">
                https://meunegocio.com.br/almoco
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase font-bold tracking-wider text-cyan-400">
                  Destino ativo no momento
                </div>
                <div className="font-mono text-xs font-bold text-white truncate flex items-center gap-1.5 mt-0.5">
                  <ExternalLink className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="truncate">{activePreset.url}</span>
                </div>
              </div>
            </div>

            {justSwitched && (
              <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Destino atualizado no painel! O QR Code físico permanece o mesmo.</span>
              </div>
            )}
          </div>

          {/* Interactive Toggle Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={handleSwitchDestination}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Simular troca de link agora</span>
            </button>
            <div className="text-[11px] text-slate-400 text-center sm:text-left">
              Clique para ver o destino mudar instantaneamente.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
