"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail, User, Building, ArrowRight, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { LinkGoogleAccountModal } from "@/components/auth/LinkGoogleAccountModal";

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [linkingModal, setLinkingModal] = useState<{
    isOpen: boolean;
    email: string;
    credential: string;
  }>({
    isOpen: false,
    email: "",
    credential: "",
  });

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
        toast.error("Erro no cadastro com Google", data.error || "Tente novamente.");
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

      toast.success("Conta criada com sucesso!", "Redirecionando para o seu dashboard...");
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error("Erro no cadastro", data.error || "Tente novamente.");
        setLoading(false);
        return;
      }

      toast.success("Conta criada com sucesso!", "Redirecionando para o seu dashboard...");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Erro de conexão", "Não foi possível conectar ao servidor.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#050A16] text-slate-100 relative overflow-hidden">
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-[#006CFF]/15 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 rounded-full bg-[#00E0FF]/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 bg-slate-900/90 backdrop-blur-xl p-8 rounded-2xl border border-slate-800 shadow-2xl relative z-10">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <BrandLogo variant="horizontal" theme="dark" size="md" withSlogan={true} />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 text-[10px] font-bold tracking-wider uppercase mb-2">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>CONECTA O SEU MUNDO</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white font-brand">
            Criar conta gratuita
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Comece a gerar e rastrear seus QR Codes em segundos.
          </p>
        </div>

        {/* Botão de Cadastro com Google */}
        <div className="space-y-4">
          <GoogleSignInButton
            text="signup_with"
            disabled={loading || googleLoading}
          />

          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-slate-800" />
            <span className="absolute px-3 bg-[#0c1427] text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              ou cadastre-se com seu e-mail
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nome Completo
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0084FF] transition-colors"
                placeholder="Ex: Carlos Silva"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              E-mail Comercial
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
                placeholder="carlos@empresa.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Empresa / Projeto (Opcional)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Building className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0084FF] transition-colors"
                placeholder="Nome da sua empresa"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Senha (mínimo 6 caracteres)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                minLength={6}
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
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#006CFF] to-[#0084FF] hover:from-[#006CFF] hover:to-[#00E0FF] text-white font-bold text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 mt-4"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Cadastrar e Começar</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-800 text-xs text-slate-400">
          Já possui uma conta?{" "}
          <Link href="/login" className="font-semibold text-cyan-400 hover:text-cyan-300 hover:underline">
            Fazer login
          </Link>
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
