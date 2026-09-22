"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  HelpCircle,
  ChevronDown,
  ShieldCheck,
  FileText,
  ArrowRight,
  MessageCircle,
  BookOpen,
} from "lucide-react";
import { Header } from "@/components/layout/Header";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "O que é um QR Code Dinâmico?",
    answer:
      "É um QR Code cujo destino pode ser alterado a qualquer momento pelo painel, sem que você precise gerar ou imprimir um novo código. Ele utiliza um link inteligente que redireciona o usuário para a URL atualizada.",
  },
  {
    question: "Os QR Codes expiram?",
    answer:
      "Os QR Codes estáticos nunca expiram. Os QR Codes dinâmicos dependem de uma assinatura ativa (PRO ou BUSINESS) para manter o redirecionamento. Caso a assinatura termine sem renovação, seus códigos continuam salvos na sua conta e são reativados assim que uma nova contratação for realizada.",
  },
  {
    question: "Qual a diferença entre QR estático e dinâmico?",
    answer:
      "O QR estático grava as informações diretamente no padrão gráfico e não permite edições posteriores nem relatórios. O QR dinâmico armazena um link curto inteligente gerenciável, permitindo edição de destino a qualquer hora e métricas de escaneamento.",
  },
  {
    question: "Como funciona o Analytics?",
    answer:
      "Cada vez que alguém escaneia seu QR Code dinâmico, registramos o acesso de forma agregada com anonimização técnica de IP via hash SHA-256 sem armazenar o IP bruto. Você acompanha total de scans, visitantes únicos, dispositivos, sistemas operacionais, navegadores e horários de pico.",
  },
  {
    question: "O plano FREE precisa de cartão?",
    answer:
      "Não. O plano FREE é totalmente gratuito e não exige nenhum dado de cartão de crédito. Você pode criar sua conta apenas com nome e e-mail e começar a usar imediatamente.",
  },
  {
    question: "Como funciona o limite de QR Codes?",
    answer:
      "O limite de criação é contado por ciclo de 30 dias: até 5 QR Codes no FREE e até 15 QR Codes no PRO. No plano BUSINESS, a criação é comercialmente ilimitada para o seu negócio. Os QR Codes criados em ciclos anteriores continuam salvos no seu acervo e funcionando normalmente.",
  },
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Sim. Nosso modelo comercial é pré-pago por 30 ou 365 dias, sem contratos de fidelidade forçada. Você decide quando renovar sem surpresas de cobranças automáticas indesejadas.",
  },
  {
    question: "Como funciona o pagamento?",
    answer:
      "Todos os pagamentos são processados com segurança pelo Mercado Pago via Pix ou cartão de crédito. A ativação dos recursos do seu plano é realizada imediatamente após a confirmação do pagamento pelo gateway.",
  },
];

export default function HelpPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className="min-h-screen">
      {/* Header do Dashboard */}
      <Header
        title="Ajuda & Documentação"
        subtitle="Encontre respostas rápidas, políticas e informações oficiais do QR MASTER."
      />

      {/* Conteúdo Principal */}
      <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-10">
        {/* ================================================================ */}
        {/* SEÇÃO 1: PERGUNTAS FREQUENTES (FAQ ACCORDION)                     */}
        {/* ================================================================ */}
        <section aria-labelledby="faq-heading" className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200/60 dark:border-indigo-800/60">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="faq-heading"
                className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white"
              >
                Perguntas Frequentes
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Respostas práticas sobre criação, funcionamento e gestão dos seus QR Codes.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {FAQ_ITEMS.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    aria-expanded={isOpen}
                    className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 text-slate-900 dark:text-white font-semibold text-sm hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <span>{item.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-indigo-600 dark:text-indigo-400" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800/60 pt-3 animate-in fade-in duration-150">
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ================================================================ */}
        {/* SEÇÃO 2: POLÍTICAS                                                */}
        {/* ================================================================ */}
        <section aria-labelledby="policies-heading" className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-200/60 dark:border-purple-800/60">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="policies-heading"
                className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white"
              >
                Políticas e Termos Oficiais
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Documentação legal sobre proteção de dados, privacidade e regras de uso.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-2">
            {/* Card 1: Política de Privacidade */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-5">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/50">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Política de Privacidade
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Como protegemos seus dados e informações de escaneamento.
                </p>
              </div>

              <Link
                href="/privacy"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-semibold transition-colors"
              >
                <span>Ler Política</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Card 2: Termos de Uso */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-5">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Termos de Uso
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Regras de utilização da plataforma QR MASTER.
                </p>
              </div>

              <Link
                href="/terms"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-semibold transition-colors"
              >
                <span>Ler Termos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* SEÇÃO 3: SUPORTE                                                  */}
        {/* ================================================================ */}
        <section aria-labelledby="support-heading">
          <div className="p-6 sm:p-8 rounded-2xl bg-emerald-950 border border-emerald-800/80 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-700/60 text-emerald-300 text-[11px] font-semibold">
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Atendimento Direto</span>
              </div>
              <h3
                id="support-heading"
                className="text-xl sm:text-2xl font-black text-white tracking-tight"
              >
                Precisa de ajuda?
              </h3>
              <p className="text-xs sm:text-sm text-emerald-200/90 leading-relaxed">
                Nossa equipe responde diretamente pelo WhatsApp.
              </p>
            </div>

            <div className="shrink-0">
              <a
                href="https://wa.me/5531985029353"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Falar com o suporte no WhatsApp"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-emerald-950/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <MessageCircle className="w-4 h-4 text-slate-950" />
                <span>Falar no WhatsApp</span>
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
