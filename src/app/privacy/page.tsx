import React from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CookiePreferencesButton } from "@/components/privacy/CookieConsent";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Política de Privacidade e conformidade com a LGPD da plataforma QR MASTER (Master Digital).",
  alternates: {
    canonical: "/privacy",
  },
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
            <span>Privacidade por Design & Proteção de Dados</span>
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
              <li><strong>Não rastreamos geolocalização exata por GPS nem registramos cidades:</strong> Apenas métricas técnicas de tipo de dispositivo (mobile vs desktop), sistema operacional e navegador são contabilizadas para os relatórios analíticos agregados do titular.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">4. Medição de Audiência e Cookies Analíticos (Google Analytics 4)</h2>
            <p>
              Utilizamos o <strong>Google Analytics 4 (GA4)</strong> para compreender a audiência, o desempenho e a navegação em nosso website institucional e painel de controle. Essa medição estatística nos auxilia a aprimorar a estabilidade, a usabilidade e os recursos da plataforma.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>
                <strong>Consentimento Prévio (Google Consent Mode v2):</strong> Por padrão, nenhuma permissão de medição analítica (<code>analytics_storage</code>) ou publicitária (<code>ad_storage</code>, <code>ad_user_data</code>, <code>ad_personalization</code>) é concedida antes da decisão do usuário. O script externo de medição do GA4 só é ativado se o visitante optar voluntariamente por <em>&ldquo;Aceitar analytics&rdquo;</em>. Caso o visitante recuse ou ainda não tenha escolhido, o rastreamento permanece bloqueado em estado <code>denied</code>.
              </li>
              <li>
                <strong>Cookies analíticos opcionais:</strong> Quando autorizado pelo usuário, o serviço armazena cookies primários no navegador (notadamente <code>_ga</code> e <code>_ga_&lt;container-id&gt;</code>) exclusivamente para distinguir sessões anônimas de navegação e agregar métricas de tráfego. Não realizamos rastreamento para fins de remarketing ou publicidade direcionada.
              </li>
              <li>
                <strong>Gestão e alteração de preferências:</strong> A escolha do visitante é salva localmente no navegador (<code>qr_master_analytics_consent</code>). Você pode alterar ou revogar sua decisão a qualquer momento clicando em{" "}
                <CookiePreferencesButton className="text-cyan-400 hover:underline font-semibold cursor-pointer inline">
                  Preferências de cookies
                </CookiePreferencesButton>
                {" "}ou no rodapé das páginas. Ao revogar o consentimento, o Consent Mode v2 é imediatamente atualizado para <code>denied</code> e os cookies analíticos de medição são limpos do navegador.
              </li>
              <li>
                <strong>Separação de escopos:</strong> A medição do Google Analytics 4 restringe-se à navegação nas interfaces web do QR MASTER e <em>não se confunde</em> com a telemetria dos QR Codes dinâmicos descrita na Seção 3. Os acessos aos links de redirecionamento (<code>/q/[shortCode]</code>) operam de forma isolada, não executam scripts analíticos de terceiros e mantêm a anonimização criptográfica de IP por SHA-256.
              </li>
              <li>
                <strong>Tratamento pelo Google:</strong> Os dados analíticos agregados são processados conforme os termos e salvaguardas da política global da Google. Para saber mais sobre como o Google gerencia dados, consulte a{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline font-semibold"
                >
                  Política de Privacidade do Google
                </a>.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">5. Segurança de Pagamentos</h2>
            <p>
              O QR MASTER não processa nem armazena números de cartões de crédito ou dados bancários sensíveis em seus servidores. Toda a captura e liquidação financeira é realizada em ambiente certificado PCI-DSS pelo gateway <strong>Mercado Pago</strong>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">6. Seus Direitos (LGPD)</h2>
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
      <footer className="border-t border-slate-800 py-6 px-6 text-center text-xs text-slate-500 space-y-2">
        <p>© 2026 QR MASTER • Master Digital. Todos os direitos reservados.</p>
        <p>
          <CookiePreferencesButton className="text-slate-400 hover:text-cyan-400 underline transition-colors cursor-pointer" />
        </p>
      </footer>
    </div>
  );
}
