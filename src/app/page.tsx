import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  QrCode,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  TrendingUp,
  Download,
  Share2,
  DollarSign,
  Smartphone,
  MessageCircle,
} from "lucide-react";
import { QRCodeRenderer } from "@/components/qr/QRCodeRenderer";
import { PricingAndFaq } from "@/components/landing/PricingAndFaq";
import { BrandLogo } from "@/components/brand/BrandLogo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Navigation */}
      <nav className="border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-50 bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="QR MASTER — Início">
            <BrandLogo variant="horizontal" theme="dark" size="md" />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="#pricing"
              className="hidden sm:inline-block px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Planos & Preços
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
            >
              Fazer Login
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 transition-all hover:scale-105"
            >
              Criar Conta Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-24 px-6">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Plataforma SaaS Profissional de QR Codes</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight sm:leading-[1.15]">
            Crie, personalize e analise seus{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
              QR Codes Dinâmicos
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Tenha controle absoluto dos seus códigos: altere destinos sem precisar reimprimir, gere códigos Pix EMV oficiais com cálculo CRC16, e acompanhe relatórios detalhados de escaneamentos.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/register"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all hover:scale-105"
            >
              <span>Começar Agora Gratuitamente</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Interactive QR Demo Preview Showcase */}
          <div className="pt-12 max-w-md mx-auto">
            <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl shadow-indigo-950/50 backdrop-blur-xl space-y-4">
              <div className="p-4 rounded-2xl bg-white flex items-center justify-center shadow-inner">
                <QRCodeRenderer
                  value="https://qrmaster.app"
                  styleConfig={{
                    dotsColor: "#4338ca",
                    dotsType: "rounded",
                    cornerSquareType: "extra-rounded",
                    cornerSquareColor: "#4338ca",
                    cornerDotColor: "#6366f1",
                    bgColor: "#ffffff",
                    frame: "scan-me",
                    frameText: "APONTE A CÂMERA",
                    frameColor: "#4338ca",
                  }}
                  size={240}
                />
              </div>
              <div className="text-center pt-2">
                <p className="text-xs font-bold text-white">Preview Instantâneo de Alta Resolução</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Exportação disponível em PNG (até 4096px), SVG vetorial e PDF para impressão.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6 Feature Pillars */}
      <section className="py-20 border-t border-slate-800/60 bg-slate-900/30 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Recursos construídos para empresas e negócios
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Tudo o que você precisa para gerenciar campanhas físicas e digitais com confiança.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">QR Codes Dinâmicos</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Mude o link de destino de um QR Code já impresso a qualquer momento através do seu painel sem custos adicionais.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Padrão Pix EMV Oficial</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Geração de BR Code com cálculo polinomial exato de CRC16-CCITT em conformidade com as diretrizes do Banco Central.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Métricas & Analytics LGPD</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Saiba quais cidades, dispositivos (Android, iPhone), horários de pico e sistemas operacionais mais escaneiam seus códigos.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center">
                <Download className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Exportação para Gráfica</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Baixe em PNG de 512px a 4096px (300 DPI), SVG vetorial sem perda de resolução e PDF profissional A4 pronto para imprimir.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Share2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Multi-Link & Bio</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Crie mini-páginas responsivas intermediárias reunindo seus links de WhatsApp, Instagram, catálogo e site em um único QR.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Segurança & Lixeira</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Soft-delete com recuperação, auditoria com activity logs e autenticação blindada com hash bcrypt e sessões criptografadas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing, Comparison & FAQ */}
      <PricingAndFaq />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-8 px-6 text-center text-xs text-slate-500 space-y-2">
        <p>© 2026 QR MASTER. Plataforma profissional de gerenciamento e análise de QR Codes.</p>
        <p>
          <a
            href="https://wa.me/5531985029353?text=Ol%C3%A1!%20Gostaria%20de%20falar%20com%20o%20QR%20MASTER."
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Falar com o QR MASTER pelo WhatsApp"
            className="text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1.5 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span>Fale com o QR MASTER pelo WhatsApp</span>
          </a>
        </p>
      </footer>
    </div>
  );
}
