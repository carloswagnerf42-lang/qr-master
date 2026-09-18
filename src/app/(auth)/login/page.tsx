"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QrCode, Lock, Mail, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      {/* Esquerda: Branding & Apresentação */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 p-12 flex-col justify-between text-white border-r border-indigo-800/30">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 rounded-full bg-violet-600/15 blur-3xl" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <QrCode className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-xl tracking-tight">QR MASTER</span>
        </div>

        {/* Hero Copy */}
        <div className="relative z-10 my-auto space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-400/20 text-indigo-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>SaaS de Próxima Geração</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
            Gere, personalize e rastreie QR Codes profissionais em tempo real.
          </h1>

          <p className="text-slate-300 text-base leading-relaxed">
            Tenha controle absoluto dos seus códigos estáticos e dinâmicos, métricas detalhadas de escaneamento, gerador oficial de Pix e exportação em alta resolução (PNG, SVG, PDF).
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2.5 text-sm text-slate-300">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>QR Dinâmico Editável</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-300">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>Pix EMV / BR Code</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-300">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>Analytics LGPD</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-300">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>Exportação até 4096px</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-slate-400">
          © 2026 QR MASTER. Plataforma profissional segura.
        </div>
      </div>

      {/* Direita: Formulário de Login */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8 bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl">
          <div className="text-center sm:text-left">
            <div className="lg:hidden inline-flex items-center gap-2 mb-6">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                <QrCode className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-lg text-slate-900 dark:text-white">QR MASTER</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Bem-vindo novamente
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Entre com suas credenciais para gerenciar seus códigos.
            </p>
          </div>

          {/* Dica de DEMO DATA (apenas em desenvolvimento) */}
          {process.env.NODE_ENV === "development" && (
            <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 p-3 rounded-xl text-xs text-indigo-700 dark:text-indigo-300">
              <p className="font-semibold">Credenciais de Demonstração (Modo Dev):</p>
              <p className="mt-0.5">Usuário: <code className="bg-white/80 dark:bg-slate-900 px-1 py-0.5 rounded">carlos@qrmaster.com</code> | Senha: <code className="bg-white/80 dark:bg-slate-900 px-1 py-0.5 rounded">senha123</code></p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Senha
                </label>
                <Link
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    toast.info("Recuperação de Senha", "O link de redefinição foi enviado para seu e-mail.");
                  }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 mt-2"
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

          <div className="text-center pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            Ainda não tem uma conta?{" "}
            <Link href="/register" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              Criar conta gratuita
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
