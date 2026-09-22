import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  Sparkles,
  ArrowRight,
  Zap,
  RefreshCw,
  BarChart3,
  Palette,
  Download,
  ShieldCheck,
  Layers,
  CheckCircle2,
  Lock,
  Server,
  CreditCard,
  Utensils,
  Package,
  Calendar,
  ShoppingBag,
  Contact,
  Megaphone,
  Home,
  Share2,
  Smartphone,
  Check,
  MessageCircle,
} from "lucide-react";
import { PricingAndFaq } from "@/components/landing/PricingAndFaq";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroDemo } from "@/components/landing/HeroDemo";
import { BrandLogo } from "@/components/brand/BrandLogo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Top Header / Navigation */}
      <LandingHeader />

      {/* ================================================================ */}
      {/* 1. HERO SECTION                                                  */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden pt-12 sm:pt-16 pb-20 px-4 sm:px-6">
        {/* Subtle Ambient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] sm:w-[700px] h-[500px] sm:h-[700px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-cyan-400 text-xs font-bold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Plataforma Profissional de QR Codes</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight sm:leading-[1.15] text-white">
            QR Codes inteligentes para{" "}
            <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-300 bg-clip-text text-transparent">
              conectar, editar e medir resultados.
            </span>
          </h1>

          <p className="text-sm sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Crie QR Codes estáticos e dinâmicos com a sua marca, acompanhe métricas de acesso em tempo real e altere o destino do link sempre que precisar — sem reimprimir nada.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              href="/register"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-sm shadow-xl shadow-blue-600/25 flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95"
            >
              <span>Começar grátis</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <a
              href="#pricing"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 font-semibold text-sm border border-slate-800 transition-colors flex items-center justify-center"
            >
              Ver planos
            </a>
          </div>

          <p className="text-xs font-medium text-slate-400 pt-1">
            Sem cartão • Até 5 QR Codes no plano FREE
          </p>

          {/* Interactive Product Showcase Demo */}
          <div className="pt-8 sm:pt-10">
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 2. PILARES DE BENEFÍCIO (#features)                              */}
      {/* ================================================================ */}
      <section id="features" className="py-20 px-4 sm:px-6 border-t border-slate-800/80 bg-slate-900/40">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-cyan-400 text-xs font-bold uppercase">
              Recursos Essenciais
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Mais que um QR Code: uma ferramenta de conexão com o seu público
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Recursos pensados para negócios de todos os tamanhos, desde autônomos até empresas consolidadas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">QR Codes Dinâmicos</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Altere o link de destino a qualquer momento pelo painel, sem precisar gerar ou imprimir um novo código.
              </p>
            </div>

            {/* Card 2 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Edição em Tempo Real</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Atualizações instantâneas no redirecionamento. Seu público sempre acessará a informação mais recente.
              </p>
            </div>

            {/* Card 3 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Analytics de Acesso</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Acompanhe total de scans, visitantes únicos, dispositivos (iOS, Android), navegadores e horários de pico com proteção de privacidade.
              </p>
            </div>

            {/* Card 4 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Palette className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Personalização Visual</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Escolha cores personalizadas, estilos de pontos, molduras com chamada para ação e insira a logomarca da sua empresa.
              </p>
            </div>

            {/* Card 5 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Download className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Alta Resolução (SVG e PNG)</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Exporte em PNG de até 4096px para mídias digitais e vetor SVG ou PDF para impressão gráfica em grandes formatos sem pixelar.
              </p>
            </div>

            {/* Card 6 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Segurança e Privacidade</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Proteção com hash unidirecional SHA-256 para anonimização técnica de IPs sem armazenamento de dados brutos e infraestrutura em nuvem na Vercel.
              </p>
            </div>

            {/* Card 7 (Módulo de Campanhas) */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-cyan-500/30 hover:border-cyan-500/50 transition-colors space-y-3 relative">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                  Exclusivo BUSINESS
                </span>
              </div>
              <h3 className="font-bold text-base text-white">Módulo de Campanhas</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Crie QR Codes sem limites mensais e organize seus códigos em campanhas estruturadas com agendamento de datas.
              </p>
            </div>

            {/* Card 8 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Criação Imediata</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Comece agora mesmo sem burocracia. Até 5 QR Codes no plano FREE, sem necessidade de cadastrar cartão de crédito.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 3. EXPLICAÇÃO DO QR DINÂMICO                                     */}
      {/* ================================================================ */}
      <section className="py-20 px-4 sm:px-6 border-t border-slate-800/80 bg-slate-950">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase">
              Economia e Flexibilidade
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Mude o destino sem trocar o QR Code
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Economize custos de reimpressão e nunca mais perca um cliente com link quebrado.
            </p>
          </div>

          {/* 4-Step Visual Workflow */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 relative space-y-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center">
                1
              </div>
              <h4 className="font-bold text-sm text-white">Crie seu QR Code Dinâmico</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Defina o link inicial, personalize com a cor e logotipo da sua empresa no painel.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 relative space-y-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center">
                2
              </div>
              <h4 className="font-bold text-sm text-white">Imprima ou divulgue</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Aplique em embalagens, cardápios, vitrines, cartões de visita ou materiais de evento.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 relative space-y-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center">
                3
              </div>
              <h4 className="font-bold text-sm text-white">Precisa mudar a promoção?</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Acesse o painel do QR MASTER e troque o endereço de destino em segundos.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 relative space-y-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500 text-slate-950 font-bold text-sm flex items-center justify-center">
                4
              </div>
              <h4 className="font-bold text-sm text-white">O QR impresso continua o mesmo</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Quem escanear o material impresso já é redirecionado para o novo link sem nova impressão.
              </p>
            </div>
          </div>

          {/* Comparativo Didático: Estático vs Dinâmico */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                QR Code Estático
              </div>
              <h3 className="font-bold text-base text-slate-200">
                Destino fixo para sempre
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                O link é gravado diretamente no código gerado. Se o link mudar ou expirar, todo o material físico impresso é perdido.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-950/40 to-cyan-950/20 border border-cyan-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wide">
                  QR Code Dinâmico
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
                  Recomendado
                </span>
              </div>
              <h3 className="font-bold text-base text-white">
                Destino editável a qualquer momento
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Um único QR Code, infinitas possibilidades de uso. Mude a URL quantas vezes quiser sem descartar materiais gráficos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 4. SEÇÃO ANALYTICS                                               */}
      {/* ================================================================ */}
      <section className="py-20 px-4 sm:px-6 border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-cyan-400 text-xs font-bold uppercase">
                Inteligência de Dados
              </div>
              <span className="text-[11px] font-medium text-slate-400 bg-slate-800/80 px-2.5 py-0.5 rounded-full border border-slate-700/60">
                Demonstração ilustrativa
              </span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Saiba o que acontece depois do scan
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Exemplo de visualização das métricas disponíveis no painel para entender o comportamento de acesso aos seus QR Codes.
            </p>
          </div>

          {/* Demonstration Analytics Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Card 1: Total & Uniques */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-400">Total de Escaneamentos</div>
                <span className="text-[10px] text-slate-400">Dados de exemplo</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">3.842</span>
                <span className="text-xs font-semibold text-emerald-400">scans registrados</span>
              </div>
              <p className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                2.910 visitantes únicos contabilizados com proteção de privacidade.
              </p>
            </div>

            {/* Card 2: Dispositivos */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-400">Dispositivos mais usados</div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
                    <span>Mobile (Smartphones)</span>
                    <span className="font-bold text-cyan-400">82%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-cyan-400 rounded-full w-[82%]" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
                    <span>Desktop</span>
                    <span className="font-bold text-blue-400">15%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full w-[15%]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Navegadores e SO */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-400">Sistemas & Navegadores</div>
              <div className="space-y-1.5 text-xs text-slate-300">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span>iOS (Safari Mobile)</span>
                  <span className="font-mono font-bold text-slate-200">54%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span>Android (Chrome Mobile)</span>
                  <span className="font-mono font-bold text-slate-200">32%</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Outros (Desktop / Webview)</span>
                  <span className="font-mono font-bold text-slate-200">14%</span>
                </div>
              </div>
            </div>

            {/* Card 4: Navegadores mais usados */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-400">Navegadores mais usados</div>
              <div className="space-y-1.5 text-xs text-slate-300">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span>Safari Mobile</span>
                  <span className="font-mono font-bold text-slate-200">52%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span>Google Chrome</span>
                  <span className="font-mono font-bold text-slate-200">36%</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Outros navegadores</span>
                  <span className="font-mono font-bold text-slate-200">12%</span>
                </div>
              </div>
            </div>

            {/* Card 5: Linha do Tempo e Horários de Pico */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-400">Linha do Tempo & Picos</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Descubra os dias da semana e horários com maior volume de leituras para planejar o lançamento de novas ofertas.
              </p>
              <div className="text-[11px] font-medium text-cyan-400 pt-1">
                Pico identificado: 12h às 14h e 19h às 21h
              </div>
            </div>

            {/* Card 6: Média Diária & Comparativo */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-400">Média Diária & Comparativo</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Acompanhe a média diária de scans e a evolução do engajamento em comparação com o período anterior no painel.
              </p>
              <div className="text-[11px] font-semibold text-emerald-400 pt-1">
                Média de 128 scans/dia (+14% vs período anterior)
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 5. CASOS DE USO                                                  */}
      {/* ================================================================ */}
      <section className="py-20 px-4 sm:px-6 border-t border-slate-800/80 bg-slate-950">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-cyan-400 text-xs font-bold uppercase">
              Aplicações Práticas
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Um QR MASTER para cada ideia
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Descubra como diferentes setores utilizam o QR MASTER para conectar o mundo físico ao digital.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* 1. Restaurantes */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Utensils className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white">Restaurantes e Bares</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Cardápios digitais, promoções do dia e conexão Wi-Fi imediata sem digitar senhas longas.
              </p>
            </div>

            {/* 2. Embalagens */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white">Embalagens e Produtos</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Links diretos para manual em PDF, vídeo demonstrativo do produto e canais oficiais de suporte.
              </p>
            </div>

            {/* 3. Eventos */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white">Eventos e Ingressos</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Acesso rápido à página de credenciamento, programação digital atualizada e mapa do local.
              </p>
            </div>

            {/* 4. Varejo */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white">Comércio e Varejo</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                QR Code para chave Pix no balcão, vitrines com catálogo virtual e cupons promocionais para clientes.
              </p>
            </div>

            {/* 5. Networking */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Contact className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white">Cartões de Visita</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                vCard digital para salvar nome, telefone, cargo e redes sociais direto na agenda do smartphone.
              </p>
            </div>

            {/* 6. Campanhas */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-pink-500/10 text-pink-400 flex items-center justify-center">
                <Megaphone className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white">Campanhas de Marketing</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rastreio de acessos em panfletos, outdoors, folhetos e banners com métricas de cliques por período.
              </p>
            </div>

            {/* 7. Imobiliárias */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Home className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white">Imobiliárias e Corretores</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Placas de venda com tour virtual 360°, galeria de fotos e botão direto para o corretor responsável.
              </p>
            </div>

            {/* 8. Criadores */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Share2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white">Criadores de Conteúdo</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Página Bio moderna centralizando canais do YouTube, Instagram, TikTok e links de produtos afiliados.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 6. COMO FUNCIONA (#how-it-works)                                 */}
      {/* ================================================================ */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 border-t border-slate-800/80 bg-slate-900/40">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-cyan-400 text-xs font-bold uppercase">
              Simples e Rápido
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Comece a usar em menos de 2 minutos
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Um fluxo simples e direto para colocar seus QR Codes no ar hoje mesmo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 text-center sm:text-left">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold text-base flex items-center justify-center mx-auto sm:mx-0">
                1
              </div>
              <h3 className="font-bold text-base text-white">Crie seu QR Code</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Escolha o tipo de conteúdo (URL, Pix, Bio, Wi-Fi), insira os dados e personalize visualmente com sua marca.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 text-center sm:text-left">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold text-base flex items-center justify-center mx-auto sm:mx-0">
                2
              </div>
              <h3 className="font-bold text-base text-white">Publique onde quiser</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Baixe em alta resolução (PNG ou SVG) e aplique em materiais físicos ou compartilhe em mídias digitais.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 text-center sm:text-left">
              <div className="w-10 h-10 rounded-xl bg-cyan-500 text-slate-950 font-bold text-base flex items-center justify-center mx-auto sm:mx-0">
                3
              </div>
              <h3 className="font-bold text-base text-white">Acompanhe os resultados</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Veja relatórios de escaneamentos no painel e altere o destino do link a qualquer momento sem reimprimir.
              </p>
            </div>
          </div>

          <div className="text-center pt-2">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-sm shadow-xl shadow-blue-600/25 transition-all hover:scale-105"
            >
              <span>Criar meu primeiro QR Code agora</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 7. PLANOS, PREÇOS E FAQ (#pricing e #faq)                        */}
      {/* ================================================================ */}
      <PricingAndFaq />

      {/* ================================================================ */}
      {/* 8. SEÇÃO DE CONFIANÇA E SEGURANÇA                                */}
      {/* ================================================================ */}
      <section className="py-20 px-4 sm:px-6 border-t border-slate-800/80 bg-slate-950">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase">
              Infraestrutura & Privacidade
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Segurança, privacidade e estabilidade em primeiro lugar
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Arquitetura projetada para garantir que seus links permaneçam rápidos, protegidos e com respeito à privacidade.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Mercado Pago</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pagamentos processados com a segurança e certificação SSL do Mercado Pago. Suporte a Pix e cartões de crédito.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Privacidade por Design</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Proteção de dados e minimização de informações: identificadores técnicos protegidos por hash SHA-256 sem armazenamento do IP bruto.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Server className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Infraestrutura em Nuvem</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Hospedagem em nuvem na Vercel com distribuição Edge e tempo de resposta otimizado para redirecionamentos rápidos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 9. CTA FINAL DE CONVERSÃO                                        */}
      {/* ================================================================ */}
      <section className="py-20 px-4 sm:px-6 border-t border-slate-800/80 bg-gradient-to-b from-slate-950 to-blue-950/20">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Seu próximo QR Code começa aqui.
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
            Crie sua conta gratuita em menos de 1 minuto e comece a gerar conexões reais com o seu público.
          </p>

          <div className="pt-2">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-sm shadow-xl shadow-blue-600/30 transition-all hover:scale-105 active:scale-95"
            >
              <span>Criar conta grátis</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <p className="text-xs text-slate-400 pt-1">
            Plano FREE disponível • Sem necessidade de cartão de crédito
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 10. FOOTER COMPLETO                                              */}
      {/* ================================================================ */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-12 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 pb-12 border-b border-slate-800/60">
          {/* Brand & Slogan */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" aria-label="QR MASTER — Início">
              <BrandLogo variant="horizontal" theme="dark" size="md" />
            </Link>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Plataforma profissional de QR Codes estáticos e dinâmicos para conectar o mundo físico ao digital com inteligência e métricas de acesso.
            </p>
            <p className="text-xs font-semibold text-slate-500">
              QR MASTER é uma marca da Master Digital. Todos os direitos reservados.
            </p>
          </div>

          {/* Coluna 1: Produto */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Produto
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <a href="#features" className="hover:text-cyan-400 transition-colors">
                  Recursos
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">
                  Como Funciona
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-cyan-400 transition-colors">
                  Planos e Preços
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-cyan-400 transition-colors">
                  Perguntas Frequentes
                </a>
              </li>
            </ul>
          </div>

          {/* Coluna 2: Conta */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Conta
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link href="/login" className="hover:text-cyan-400 transition-colors">
                  Fazer Login
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-cyan-400 transition-colors">
                  Criar Conta Grátis
                </Link>
              </li>
              <li>
                <a href="#pricing" className="hover:text-cyan-400 transition-colors">
                  Atualizar para PRO
                </a>
              </li>
            </ul>
          </div>

          {/* Coluna 3: Suporte & Legal */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Suporte & Legal
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <a
                  href="https://wa.me/5531985029353?text=Ol%C3%A1!%20Gostaria%20de%20falar%20com%20o%20QR%20MASTER."
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Falar com o QR MASTER pelo WhatsApp"
                  className="hover:text-emerald-400 inline-flex items-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Central WhatsApp</span>
                </a>
              </li>
              <li>
                <Link href="/terms" className="hover:text-cyan-400 transition-colors">
                  Termos de Uso
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-cyan-400 transition-colors">
                  Política de Privacidade
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} QR MASTER • Master Digital. Operação no Brasil.</p>
          <p className="text-[11px] text-slate-500">
            Pagamentos protegidos via Mercado Pago • Privacidade por design sem armazenamento de IP original.
          </p>
        </div>
      </footer>
    </div>
  );
}
