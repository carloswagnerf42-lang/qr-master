"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Sparkles,
  Zap,
  ArrowRight,
  Check,
  BarChart3,
  Layers,
  FileCode,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Lock,
  Loader2,
} from "lucide-react";

export type UpgradeReason =
  | "DYNAMIC_QR"
  | "LOGO"
  | "SVG_EXPORT"
  | "PDF_EXPORT"
  | "ANALYTICS"
  | "CAMPAIGNS"
  | "LIMIT_REACHED";

export interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: UpgradeReason;
  currentPlan?: string;
  requiredPlan?: "PRO" | "BUSINESS";
  limit?: number;
  current?: number;
  customTitle?: string;
  customDescription?: string;
}

export interface ReasonContent {
  badge: string;
  badgeColor: string;
  title: string;
  description: string;
  icon: React.ElementType;
  highlights: string[];
  ctaText: string;
  targetTab?: string;
}

export const REASON_CONFIG: Record<UpgradeReason, ReasonContent> = {
  DYNAMIC_QR: {
    badge: "Recurso PRO",
    badgeColor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
    icon: Zap,
    title: "QR Code Dinâmico com Link Editável",
    description:
      "O QR Code dinâmico permite alterar a URL de destino a qualquer momento através do painel, sem precisar reimprimir ou redistribuir os materiais físicos.",
    highlights: [
      "Altere o link de destino sem trocar o QR Code impresso",
      "Evite desperdício com novas impressões de cardápios, panfletos ou placas",
      "Altere o destino do QR sempre que precisar",
    ],
    ctaText: "Ver Plano PRO (R$ 19,90/mês)",
  },
  LOGO: {
    badge: "Recurso PRO",
    badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    icon: ImageIcon,
    title: "Logotipo Central Customizado",
    description:
      "Insira a marca ou logotipo da sua empresa no centro do QR Code para reforçar a identidade visual e transmitir maior confiança a quem escaneia.",
    highlights: [
      "Aplicação de logotipo em PNG ou JPG com correção de nível H",
      "Maior reconhecimento de marca para o seu negócio",
      "Gera mais segurança e credibilidade para os clientes",
    ],
    ctaText: "Ver Plano PRO (R$ 19,90/mês)",
  },
  SVG_EXPORT: {
    badge: "Recurso PRO",
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    icon: FileCode,
    title: "Exportação em Vetor SVG para Gráfica",
    description:
      "O formato SVG oferece resolução infinita, ideal para gráficas, designers, confecção de placas, outdoors e materiais impressos de grande formato.",
    highlights: [
      "Vetor com escala infinita sem perda de nitidez",
      "Padrão profissional compatível com Illustrator, Corel e Figma",
      "Garantia de leitura perfeita em qualquer tamanho de impressão",
    ],
    ctaText: "Ver Plano PRO (R$ 19,90/mês)",
  },
  PDF_EXPORT: {
    badge: "Recurso PRO",
    badgeColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800",
    icon: FileText,
    title: "Exportação em PDF Vetorial de Alta Resolução",
    description:
      "Baixe seu QR Code diagramado em PDF profissional, formatado para impressão direta em alta definição com instruções para escaneamento.",
    highlights: [
      "Documento pronto para envio direto à gráfica",
      "Diagramação limpa com margens de segurança para leitura",
      "Alta definição para folhetos, adesivos e displays de balcão",
    ],
    ctaText: "Ver Plano PRO (R$ 19,90/mês)",
  },
  ANALYTICS: {
    badge: "Recurso PRO",
    badgeColor: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800",
    icon: BarChart3,
    title: "Métricas e Estatísticas de Escaneamentos",
    description:
      "Acompanhe o volume real de acessos, dispositivos utilizados (Android, iPhone, Computadores), horários de pico e sistemas operacionais dos seus QR Codes.",
    highlights: [
      "Gráficos de evolução temporal (Hoje, 7 dias, 30 dias)",
      "Detecção de dispositivos e sistemas operacionais",
      "Privacidade 100% em conformidade com a LGPD (IPs anonimizados)",
    ],
    ctaText: "Conhecer Analytics no Plano PRO",
  },
  CAMPAIGNS: {
    badge: "Recurso PRO / BUSINESS",
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    icon: Layers,
    title: "Módulo de Campanhas e Agrupamento",
    description:
      "Organize múltiplos QR Codes por campanhas temáticas ou sazonais (ex: Cardápio Verão, Promoção Black Friday, Mesas) e acompanhe o desempenho consolidado.",
    highlights: [
      "Agrupamento de múltiplos QR Codes em campanhas",
      "Gestão centralizada de datas de início e término",
      "Ideal para empresas, restaurantes e agências",
    ],
    ctaText: "Ver Planos com Campanhas",
  },
  LIMIT_REACHED: {
    badge: "Limite da Cota FREE Atingido",
    badgeColor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
    icon: CheckCircle2,
    title: "Você atingiu o limite do plano FREE",
    description:
      "O plano FREE permite criar até 5 QR Codes por ciclo. Para continuar gerando novos códigos dinâmicos ou estáticos, faça upgrade para o plano PRO (15 QRs) ou BUSINESS (ilimitado).",
    highlights: [
      "Amplie sua cota para 15 QR Codes (PRO) ou Ilimitados (BUSINESS)",
      "Desbloqueie QR Codes dinâmicos com edição de link quando precisar",
      "Exporte em alta resolução vetorial SVG e PDF para gráfica",
    ],
    ctaText: "Fazer Upgrade Agora",
  },
};

export function UpgradeModal({
  isOpen,
  onClose,
  reason,
  limit = 5,
  customTitle,
  customDescription,
}: UpgradeModalProps) {
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [navigating, setNavigating] = useState(false);

  // Guarda o elemento ativo que abriu o modal para devolver o foco ao fechar
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null;
    }
  }, [isOpen]);

  // Tecla Escape fecha o modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }

      // Focus trap básico
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";

      // Foca no modal logo após abrir
      setTimeout(() => {
        modalRef.current?.focus();
      }, 50);
    } else {
      document.body.style.overflow = "";
      if (triggerRef.current) {
        triggerRef.current.focus();
      }
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const config = REASON_CONFIG[reason] || REASON_CONFIG.LIMIT_REACHED;
  const Icon = config.icon;

  const title = customTitle || (reason === "LIMIT_REACHED" && limit ? `Você atingiu o limite de ${limit} QR Codes do plano FREE` : config.title);
  const description = customDescription || config.description;

  const handleGoToPlans = () => {
    if (navigating) return;
    setNavigating(true);
    onClose();
    router.push("/settings?tab=plan");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      aria-describedby="upgrade-modal-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative w-full max-w-md sm:max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] outline-none"
      >
        {/* Barra superior */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border mb-1.5 ${config.badgeColor}`}
              >
                {config.badge}
              </span>
              <h3
                id="upgrade-modal-title"
                className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-snug"
              >
                {title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo rolável */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          <p
            id="upgrade-modal-description"
            className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
          >
            {description}
          </p>

          {/* Destaques do benefício */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-2.5">
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              O que está incluído no Plano PRO:
            </h4>
            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-200">
              {config.highlights.map((highlight, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Resumo de Preços Reais */}
          <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-slate-900 dark:text-white block">
                Plano PRO
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                15 QR Codes/mês • Dinâmicos • Analytics
              </span>
            </div>
            <div className="text-right">
              <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">
                R$ 19,90/mês
              </span>
              <span className="text-[10px] text-slate-500 block">ou R$ 99/ano</span>
            </div>
          </div>

          {/* Informação sobre Upgrade para usuários PRO */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 text-center leading-snug">
            Em upgrades para o plano BUSINESS, seus dias restantes do PRO serão preservados e adicionados ao período BUSINESS.
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors order-2 sm:order-1"
          >
            Continuar no FREE
          </button>

          <button
            type="button"
            onClick={handleGoToPlans}
            disabled={navigating}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-60 order-1 sm:order-2"
          >
            {navigating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{config.ctaText}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
