import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";

export const metadata = {
  title: "Termos de Uso — QR MASTER",
  description: "Termos e condições de uso da plataforma SaaS QR MASTER (Master Digital).",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#050A16] text-slate-100 flex flex-col justify-between selection:bg-[#0084FF] selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-50 bg-[#050A16]/80">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="QR MASTER — Início">
            <BrandLogo variant="horizontal" theme="dark" size="md" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao início</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-16 space-y-10 flex-1">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 text-[11px] font-bold tracking-wider uppercase">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Documento Legal Oficial</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-brand">
            Termos de Uso do Serviço
          </h1>
          <p className="text-xs text-slate-400">
            Última atualização: Setembro de 2026 • Operado por Master Digital
          </p>
        </div>

        <div className="space-y-8 text-sm text-slate-300 leading-relaxed border-t border-slate-800 pt-8">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">1. Objeto e Aceitação</h2>
            <p>
              Estes Termos de Uso regulam a utilização da plataforma online <strong>QR MASTER</strong>, desenvolvida e disponibilizada comercialmente por <strong>Master Digital</strong>. Ao criar uma conta ou utilizar quaisquer serviços de geração, personalização, redirecionamento dinâmico ou análise de QR Codes, o usuário concorda expressamente com as disposições aqui previstas.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">2. Descrição dos Planos e Serviços</h2>
            <p>
              O QR MASTER oferece planos de assinatura em modelo pré-pago por períodos determinados:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li><strong>Plano FREE:</strong> Acesso gratuito para criação de até 5 QR Codes por ciclo mensal, limitados a códigos estáticos e exportação em PNG.</li>
              <li><strong>Plano PRO:</strong> Disponibiliza até 15 QR Codes por ciclo mensal, incluindo QR Codes dinâmicos com alteração ilimitada de link de destino, relatórios de Analytics, exportação gráfica vetorial (SVG e PDF) e logotipo central personalizado.</li>
              <li><strong>Plano BUSINESS:</strong> Concede criação comercialmente ilimitada de QR Codes, suporte corporativo prioritário e organização avançada em Campanhas.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">3. QR Codes Dinâmicos e Vigência</h2>
            <p>
              A funcionalidade de redirecionamento dinâmico depende da manutenção de uma assinatura ativa nos planos pagos (PRO ou BUSINESS). Caso o período pré-pago expire sem nova contratação, a plataforma reverte a conta para o plano FREE, preservando os códigos criados, porém suspendendo temporariamente os recursos exclusivos de edição e telemetria avançada até a regularização.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">4. Pagamentos e Cobrança</h2>
            <p>
              As transações financeiras são processadas de forma segura e criptografada pelo gateway parceiro <strong>Mercado Pago</strong> via Pix ou cartão de crédito. O serviço opera exclusivamente sob a modalidade pré-paga para os períodos de 30 dias (mensal) ou 365 dias (anual), não realizando cobranças automáticas ocultas sem o consentimento do cliente.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">5. Uso Aceitável</h2>
            <p>
              É expressamente proibido utilizar o QR MASTER para veicular, redirecionar ou distribuir conteúdo malicioso (phishing, malware), fraudulentos, difamatórios, materiais que violem direitos de propriedade intelectual ou leis em vigor no Brasil. Contas identificadas em atividades ilícitas serão imediatamente suspensas sem reembolso.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">6. Contato e Suporte</h2>
            <p>
              Dúvidas ou solicitações relacionadas a estes Termos de Uso podem ser enviadas diretamente ao suporte comercial oficial da Master Digital pelo WhatsApp:{" "}
              <a
                href="https://wa.me/5531985029353?text=Ol%C3%A1!%20Gostaria%20de%20esclarecer%20d%C3%BAvidas%20sobre%20os%20Termos%20de%20Uso%20do%20QR%20MASTER."
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline font-semibold"
              >
                +55 31 98502-9353
              </a>.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 QR MASTER • Master Digital. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
