"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ArrowRight, CheckCircle2, AlertTriangle, Sparkles, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BrandLogo } from "@/components/brand/BrandLogo";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const toast = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-white">Link Inválido ou Ausente</h3>
        <p className="text-xs text-slate-300">
          O link de recuperação acessado não possui um token válido.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-xs border border-slate-700 transition-colors"
        >
          Solicitar novo link de recuperação
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("Senha muito curta", "A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Senhas não conferem", "A confirmação da senha deve ser idêntica à nova senha.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error("Erro ao redefinir senha", data.error || "Tente novamente.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      toast.success("Senha alterada!", "Sua senha foi redefinida com sucesso.");

      setTimeout(() => {
        router.push("/login");
      }, 2500);
    } catch {
      toast.error("Erro de conexão", "Não foi possível conectar ao servidor.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center space-y-5 py-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white">Senha Redefinida!</h3>
          <p className="text-xs text-slate-300">
            Sua conta está atualizada. Você será redirecionado para o login...
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#006CFF] to-[#0084FF] text-white font-bold text-xs shadow-md shadow-blue-500/25"
        >
          <span>Acessar minha conta</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
          Nova Senha (mínimo 6 caracteres)
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Lock className="w-4 h-4" />
          </div>
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0084FF] transition-colors"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
          Confirmar Nova Senha
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Lock className="w-4 h-4" />
          </div>
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0084FF] transition-colors"
            placeholder="••••••••"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#006CFF] to-[#0084FF] hover:from-[#006CFF] hover:to-[#00E0FF] text-white font-bold text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 mt-2"
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <>
            <span>Salvar Nova Senha</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
            <span>NOVA SENHA</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white font-brand">
            Redefinir Senha
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Crie uma senha forte com no mínimo 6 caracteres.
          </p>
        </div>

        <Suspense fallback={<div className="text-center py-8 text-xs text-slate-400">Carregando formulário...</div>}>
          <ResetPasswordForm />
        </Suspense>

        <div className="text-center pt-2 border-t border-slate-800 text-xs text-slate-400">
          Lembrou sua senha anterior?{" "}
          <Link href="/login" className="font-semibold text-cyan-400 hover:text-cyan-300 hover:underline">
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
