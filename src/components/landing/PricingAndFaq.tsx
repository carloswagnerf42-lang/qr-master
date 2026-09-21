"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, X, Sparkles, ArrowRight, HelpCircle, ChevronDown, MessageCircle } from "lucide-react";
import { calculateAnnualDiscountPercent } from "@/lib/permissions";

export function PricingAndFaq() {
  const [billingCycle, setBillingCycle] = useState<"month" | "year">("month");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const proDiscount = calculateAnnualDiscountPercent(19.9, 99.0);
  const bizDiscount = calculateAnnualDiscountPercent(29.9, 199.0);
  const maxDiscount = Math.max(proDiscount, bizDiscount);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  const faqItems = [
    {
      question: "O que é um QR Code Dinâmico?",
      answer:
        "É um QR Code cujo destino pode ser alterado a qualquer momento pelo painel, sem que você precise gerar ou imprimir um novo código. Ele utiliza um link inteligente que redireciona o usuário para a URL atualizada.",
    },
    {
      question: "Os QR Codes expiram se eu parar de pagar?",
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
        "Cada vez que alguém escaneia seu QR Code dinâmico, registramos o acesso de forma agregada com anonimização de IP via hash SHA-256 (100% LGPD). Você acompanha total de scans, visitantes únicos, dispositivos, cidades e horários de pico.",
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
      question: "Posso cancelar ou deixar de renovar?",
      answer:
        "Sim. Nosso modelo comercial é pré-pago por 30 ou 365 dias, sem contratos de fidelidade forçada. Você decide quando renovar sem surpresas de cobranças automáticas indesejadas.",
    },
    {
      question: "Como funciona o pagamento?",
      answer:
        "Todos os pagamentos são processados com segurança pelo Mercado Pago via Pix ou cartão de crédito. A ativação dos recursos do seu plano é realizada imediatamente após a confirmação do pagamento pelo gateway.",
    },
  ];

  return (
    <>
      {/* ================================================================ */}
      {/* SEÇÃO 1: PLANOS E PREÇOS REAIS                                  */}
      {/* ================================================================ */}
      <section id="pricing" className="py-24 px-6 border-t border-slate-800/80 bg-slate-950 relative">
        <div className="max-w-6xl mx-auto space-y-12">
          {/* Cabeçalho de Preços */}
          <div className="text-center max-w-2xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Transparência de Preços</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Planos claros e acessíveis para o seu negócio
            </h2>
            <p className="text-sm text-slate-400">
              Comece gratuitamente no plano FREE ou escolha o plano PRO para recursos dinâmicos e vetoriais.
            </p>

            {/* Toggle Mensal / Anual */}
            <div className="pt-4 flex items-center justify-center">
              <div className="inline-flex p-1 bg-slate-900 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setBillingCycle("month")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    billingCycle === "month"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Cobrança Mensal
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle("year")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    billingCycle === "year"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>Cobrança Anual</span>
                  {maxDiscount > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500 text-white font-extrabold">
                      Economize até {maxDiscount}%
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Cards de Preços */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* Card 1: FREE */}
            <div className="p-8 rounded-3xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Para Iniciar
                  </span>
                  <h3 className="text-2xl font-extrabold text-white mt-1">Plano FREE</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Para testes rápidos e necessidades pontuais com QR Codes estáticos.
                  </p>
                </div>

                <div className="flex items-baseline gap-1 py-2">
                  <span className="text-4xl font-black text-white">R$ 0</span>
                  <span className="text-xs text-slate-400">/mês</span>
                </div>

                <ul className="space-y-3 text-xs text-slate-300 pt-2 border-t border-slate-800">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>5 QR Codes</strong> por ciclo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>QR Codes estáticos com alta nitidez</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Download em PNG até 4096px (300 DPI)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Organização em categorias e histórico</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-500">
                    <X className="w-4 h-4 text-slate-600 shrink-0" />
                    <span>Sem alteração de link (QR dinâmico)</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-500">
                    <X className="w-4 h-4 text-slate-600 shrink-0" />
                    <span>Sem gráficos de Analytics</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-500">
                    <X className="w-4 h-4 text-slate-600 shrink-0" />
                    <span>Sem exportação vetorial SVG/PDF</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/register"
                className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs text-center transition-colors shadow-sm"
              >
                Criar Conta Grátis
              </Link>
            </div>

            {/* Card 2: PRO */}
            <div className="p-8 rounded-3xl bg-slate-900 border-2 border-indigo-500/80 shadow-2xl shadow-indigo-950/50 flex flex-col justify-between space-y-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold uppercase tracking-wide shadow-md">
                Plano PRO
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                    Profissionais & Negócios
                  </span>
                  <h3 className="text-2xl font-extrabold text-white mt-1">Plano PRO</h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Para quem precisa de QR Codes dinâmicos com alteração de link e alta resolução gráfica.
                  </p>
                </div>

                <div className="py-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">
                      R$ {billingCycle === "year" ? "99,00" : "19,90"}
                    </span>
                    <span className="text-xs text-slate-400">
                      {billingCycle === "year" ? "/ano" : "/mês"}
                    </span>
                  </div>
                  {billingCycle === "year" && (
                    <p className="text-[11px] text-emerald-400 mt-0.5 font-semibold">
                      Equivalente a R$ 8,25/mês (58% de economia real)
                    </p>
                  )}
                </div>

                <ul className="space-y-3 text-xs text-slate-200 pt-2 border-t border-slate-800">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>15 QR Codes</strong> por ciclo (dinâmicos ou estáticos)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>QR Dinâmico:</strong> mude o link sem reimprimir</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>Analytics LGPD:</strong> scans, dispositivos e horários</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>Vetor Gráfico:</strong> exportação em SVG e PDF</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Logotipo personalizado no centro do código</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Módulo de Campanhas e agrupamento</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/register?plan=PRO"
                className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs text-center shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 flex items-center justify-center gap-2"
              >
                <span>Assinar Plano PRO</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Card 3: BUSINESS */}
            <div className="p-8 rounded-3xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-violet-400">
                    Empresas & Agências
                  </span>
                  <h3 className="text-2xl font-extrabold text-white mt-1">Plano BUSINESS</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Para redes, franquias e alta demanda de códigos sem restrições mensais.
                  </p>
                </div>

                <div className="py-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">
                      R$ {billingCycle === "year" ? "199,00" : "29,90"}
                    </span>
                    <span className="text-xs text-slate-400">
                      {billingCycle === "year" ? "/ano" : "/mês"}
                    </span>
                  </div>
                  {billingCycle === "year" && (
                    <p className="text-[11px] text-emerald-400 mt-0.5 font-semibold">
                      Equivalente a R$ 16,58/mês (44% de economia real)
                    </p>
                  )}
                </div>

                <ul className="space-y-3 text-xs text-slate-300 pt-2 border-t border-slate-800">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>QR Codes Ilimitados</strong> (sem limite mensal)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Todas as funcionalidades do plano PRO</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>QR Codes dinâmicos com alteração quando precisar</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Exportação em lote e alta resolução</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Módulo de Campanhas e agrupamento</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Suporte prioritário</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/register?plan=BUSINESS"
                className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs text-center transition-colors shadow-sm"
              >
                Assinar Plano BUSINESS
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SEÇÃO 2: COMPARAÇÃO DETALHADA E OBJETIVA                        */}
      {/* ================================================================ */}
      <section className="py-20 px-6 border-t border-slate-800/60 bg-slate-900/20">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <h3 className="text-2xl font-extrabold text-white">
              Comparativo de Recursos entre os Planos
            </h3>
            <p className="text-xs text-slate-400">
              Diferenças técnicas e comerciais baseadas rigorosamente nas regras do sistema.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-4 px-5">Recurso</th>
                  <th className="py-4 px-4 text-center">FREE</th>
                  <th className="py-4 px-4 text-center bg-indigo-950/30 text-indigo-300">PRO</th>
                  <th className="py-4 px-4 text-center">BUSINESS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-white">Cota de Criação por Ciclo</td>
                  <td className="py-3.5 px-4 text-center">5 QRs</td>
                  <td className="py-3.5 px-4 text-center bg-indigo-950/20 font-bold text-indigo-300">15 QRs</td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400">Ilimitado</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-white">QR Code Dinâmico (link editável)</td>
                  <td className="py-3.5 px-4 text-center text-slate-500">—</td>
                  <td className="py-3.5 px-4 text-center bg-indigo-950/20 font-bold text-emerald-400">✓ Sim</td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400">✓ Sim</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-white">Métricas & Analytics LGPD</td>
                  <td className="py-3.5 px-4 text-center text-slate-500">—</td>
                  <td className="py-3.5 px-4 text-center bg-indigo-950/20 font-bold text-emerald-400">✓ Sim</td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400">✓ Sim</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-white">Logotipo Central Personalizado</td>
                  <td className="py-3.5 px-4 text-center text-slate-500">—</td>
                  <td className="py-3.5 px-4 text-center bg-indigo-950/20 font-bold text-emerald-400">✓ Sim</td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400">✓ Sim</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-white">Exportação Vetorial SVG</td>
                  <td className="py-3.5 px-4 text-center text-slate-500">—</td>
                  <td className="py-3.5 px-4 text-center bg-indigo-950/20 font-bold text-emerald-400">✓ Sim</td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400">✓ Sim</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-white">Exportação em PDF para Gráfica</td>
                  <td className="py-3.5 px-4 text-center text-slate-500">—</td>
                  <td className="py-3.5 px-4 text-center bg-indigo-950/20 font-bold text-emerald-400">✓ Sim</td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400">✓ Sim</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-white">Módulo de Campanhas</td>
                  <td className="py-3.5 px-4 text-center text-slate-500">—</td>
                  <td className="py-3.5 px-4 text-center bg-indigo-950/20 font-bold text-emerald-400">✓ Sim</td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400">✓ Sim</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-white">Download em Imagem PNG (até 4096px)</td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400">✓ Sim</td>
                  <td className="py-3.5 px-4 text-center bg-indigo-950/20 font-bold text-emerald-400">✓ Sim</td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400">✓ Sim</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-white">Validade dos QR Codes Estáticos</td>
                  <td className="py-3.5 px-4 text-center">Vitalícia</td>
                  <td className="py-3.5 px-4 text-center bg-indigo-950/20">Vitalícia</td>
                  <td className="py-3.5 px-4 text-center">Vitalícia</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SEÇÃO 3: PERGUNTAS FREQUENTES (FAQ)                              */}
      {/* ================================================================ */}
      <section id="faq" className="py-20 px-6 border-t border-slate-800/60 bg-slate-950">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold">
              <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dúvidas Frequentes</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
              Perguntas e Respostas
            </h3>
            <p className="text-xs text-slate-400">
              Informações objetivas e verificadas sobre o funcionamento do QR MASTER.
            </p>
          </div>

          <div className="space-y-3">
            {faqItems.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    aria-expanded={isOpen}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 text-white font-bold text-sm hover:text-indigo-400 transition-colors"
                  >
                    <span>{item.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-indigo-400" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3 animate-in fade-in duration-150">
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ponto discreto de contato via WhatsApp */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 text-center space-y-3">
            <h4 className="text-base font-bold text-white">
              Precisa falar com a gente?
            </h4>
            <p className="text-xs text-slate-400">
              Fale com o QR MASTER pelo WhatsApp.
            </p>
            <div className="pt-1">
              <a
                href="https://wa.me/5531985029353?text=Ol%C3%A1!%20Gostaria%20de%20tirar%20uma%20d%C3%BAvida%20sobre%20o%20QR%20MASTER."
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Falar com o QR MASTER pelo WhatsApp"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all hover:scale-[1.02]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Falar pelo WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SEÇÃO 4: BANNER FINAL DE CONVERSÃO PRÉ-FOOTER                   */}
      {/* ================================================================ */}
      <section className="py-16 px-6 border-t border-slate-800/80 bg-gradient-to-b from-slate-950 to-indigo-950/40">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
            Pronto para criar seus primeiros QR Codes profissionais?
          </h3>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Crie sua conta gratuita em menos de 1 minuto e comece a gerar seus códigos com alta resolução e personalização.
          </p>
          <div className="pt-2">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all hover:scale-105"
            >
              <span>Começar Gratuitamente</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
