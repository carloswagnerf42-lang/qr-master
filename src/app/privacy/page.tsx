import React from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";

export const metadata = {
  title: "Política de Privacidade — QR MASTER",
  description: "Política de Privacidade e conformidade com a LGPD da plataforma QR MASTER (Master Digital).",
};

export default function PrivacyPage() {
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
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Conformidade LGPD & Privacidade</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-brand">
            Política de Privacidade
          </h1>
          <p className="text-xs text-slate-400">
            Última atualização: Setembro de 2026 • Operado por Master Digital
          </p>
        </div>

        <div className="space-y-8 text-sm text-slate-300 leading-relaxed border-t border-slate-800 pt-8">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">1. Princípios de Privacidade</h2>
            <p>
              A <strong>Master Digital</strong>, desenvolvedora da plataforma <strong>QR MASTER</strong>, adota como princípio basilar o respeito à privacidade e a proteção de dados pessoais, em estrita conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">2. Dados Coletados dos Usuários Cadastrados</h2>
            <p>
              Para a criação e operação da sua conta, coletamos apenas os dados estritamente necessários:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>Nome e sobrenome para identificação da conta;</li>
              <li>Endereço de e-mail comercial para autenticação e comunicações transacionais;</li>
              <li>Senha protegida com criptografia irreversível por hash (bcrypt salt);</li>
              <li>Nome da empresa ou projeto (opcional).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">3. Telemetria de Escaneamento e Anonimização de IP</h2>
            <p>
              O sistema de escaneamento do QR MASTER foi arquitetado sob o conceito de <em>Privacy by Design</em>. Quando um usuário final escaneia um QR Code dinâmico:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li><strong>Não armazenamos o endereço IP puro:</strong> O IP é imediatamente submetido a uma função de dispersão criptográfica (hash SHA-256) unidirecional com rotação, impedindo a identificação física ou civil do portador do dispositivo.</li>
              <li><strong>Não rastreamos geolocalização exata por GPS:</strong> Apenas métricas genéricas de país/região aproximada, tipo de dispositivo (mobile vs desktop), sistema operacional e navegador são contabilizadas para os relatórios analíticos do titular.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">4. Segurança de Pagamentos</h2>
            <p>
              O QR MASTER não processa nem armazena números de cartões de crédito ou dados bancários sensíveis em seus servidores. Toda a captura e liquidação financeira é realizada em ambiente certificado PCI-DSS pelo gateway <strong>Mercado Pago</strong>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">5. Seus Direitos (LGPD)</h2>
            <p>
              Em cumprimento ao Artigo 18 da LGPD, você possui o direito de confirmar a existência de tratamento, acessar seus dados, solicitar a correção de dados incompletos ou a exclusão definitiva da sua conta e de todos os seus QR Codes gerados diretamente pelas configurações do painel ou mediante solicitação ao nosso canal oficial:{" "}
              <a
                href="https://wa.me/5531985029353?text=Ol%C3%A1!%20Solicito%20informa%C3%A7%C3%B5es%20sobre%20meus%20dados%20pessoais%20no%20QR%20MASTER."
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
