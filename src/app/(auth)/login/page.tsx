"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { LinkGoogleAccountModal } from "@/components/auth/LinkGoogleAccountModal";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Estado para o modal de vinculação segura (Cenário C)
  const [linkingModal, setLinkingModal] = useState<{
    isOpen: boolean;
    email: string;
    credential: string;
  }>({
    isOpen: false,
    email: "",
    credential: "",
  });

  useEffect(() => {
    const linkEmail = searchParams.get("link_email");
    const googleCredential = searchParams.get("google_credential");
    const error = searchParams.get("error");

    if (linkEmail && googleCredential) {
      setLinkingModal({
        isOpen: true,
        email: linkEmail,
        credential: googleCredential,
      });
    }

    if (error) {
      toast.error("Erro na autenticação", decodeURIComponent(error));
    }
  }, [searchParams, toast]);

  const handleGoogleSuccess = async (credential: string) => {
    setGoogleLoading(true);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error("Erro no login com Google", data.error || "Tente novamente.");
        setGoogleLoading(false);
        return;
      }

      if (data.requiresLink) {
        setLinkingModal({
          isOpen: true,
          email: data.email,
          credential,
        });
        setGoogleLoading(false);
        return;
      }

      toast.success("Bem-vindo ao QR MASTER!", "Redirecionando para o painel...");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Erro de conexão", "Não foi possível conectar ao servidor.");
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error("Erro ao entrar", data.error || "Verifique seus dados.");
        setLoading(false);
        return;
      }

      toast.success("Bem-vindo ao QR MASTER!", "Redirecionando para o painel...");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Erro de conexão", "Não foi possível conectar ao servidor.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#050A16] text-slate-100">
      {/* Esquerda: Branding Oficial & Apresentação */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-[#0A1F44] via-[#050A16] to-[#0A1F44] p-12 flex-col justify-between text-white border-r border-cyan-500/10">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-[#006CFF]/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 rounded-full bg-[#00E0FF]/10 blur-3xl pointer-events-none" />

        {/* Logo Oficial */}
        <div className="relative z-10">
          <BrandLogo variant="horizontal" theme="dark" size="lg" withSlogan={false} />
        </div>

        {/* Hero Copy */}
        <div className="relative z-10 my-auto space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 text-xs font-bold tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>CONECTA O SEU MUNDO</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight leading-tight font-brand">
            Gere, personalize e rastreie QR Codes profissionais.
          </h1>

          <p className="text-slate-300 text-base leading-relaxed">
            Tenha controle absoluto dos seus códigos estáticos e dinâmicos, métricas detalhadas de escaneamento, gerador oficial de Pix e exportação em alta resolução (PNG, SVG, PDF).
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/80">
            <div className="flex items-center gap-2.5 text-sm text-slate-300">
              <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0" />
              <span>QR Dinâmico Editável</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-300">
              <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0" />
              <span>Pix EMV / BR Code</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-300">
              <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0" />
              <span>Analytics LGPD</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-300">
              <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0" />
              <span>Exportação até 4096px</span>
            </div>
          </div>
        </div>

        {/* Footer Obrigatório */}
        <div className="relative z-10 text-xs text-slate-400">
          © 2026 QR MASTER. Plataforma profissional segura.
        </div>
      </div>

      {/* Direita: Formulário de Login */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="w-full max-w-md space-y-8 bg-slate-900/90 dark:bg-slate-900/90 backdrop-blur-xl p-8 sm:p-10 rounded-2xl border border-slate-800 shadow-2xl">
          <div className="text-center sm:text-left">
            <div className="lg:hidden flex justify-center mb-6">
              <BrandLogo variant="horizontal" theme="dark" size="md" withSlogan={true} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white font-brand">
              Bem-vindo novamente
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Entre com suas credenciais para gerenciar seus códigos.
            </p>
          </div>

          {/* Botão de Autenticação com Google */}
          <div className="space-y-4">
            <GoogleSignInButton
              text="continue_with"
              onSuccess={handleGoogleSuccess}
              disabled={loading || googleLoading}
            />

            <div className="relative flex items-center justify-center">
              <div className="w-full border-t border-slate-800" />
              <span className="absolute px-3 bg-[#0c1427] text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                ou entre com seu e-mail
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0084FF] transition-colors"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Senha
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0084FF] transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#006CFF] to-[#0084FF] hover:from-[#006CFF] hover:to-[#00E0FF] text-white font-bold text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Entrar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-slate-800 text-xs text-slate-400">
            Ainda não tem uma conta?{" "}
            <Link href="/register" className="font-semibold text-cyan-400 hover:text-cyan-300 hover:underline">
              Criar conta gratuita
            </Link>
          </div>
        </div>
      </div>

      {/* Modal de confirmação para vincular Google a conta existente (Cenário C) */}
      <LinkGoogleAccountModal
        isOpen={linkingModal.isOpen}
        email={linkingModal.email}
        credential={linkingModal.credential}
        onClose={() => setLinkingModal((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={() => {
          setLinkingModal((prev) => ({ ...prev, isOpen: false }));
          router.push("/dashboard");
          router.refresh();
        }}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050A16] flex items-center justify-center text-xs text-slate-400">Carregando login...</div>}>
      <LoginForm />
    </Suspense>
  );
}

