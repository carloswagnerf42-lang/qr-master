"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail, ArrowRight, ArrowLeft, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default function ForgotPasswordPage() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error("Erro na solicitação", data.error || "Tente novamente mais tarde.");
        setLoading(false);
        return;
      }

      setSubmitted(true);
      toast.success("Solicitação processada", "Verifique sua caixa de entrada.");
    } catch {
      toast.error("Erro de conexão", "Não foi possível conectar ao servidor.");
    } finally {
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
            <span>RECUPERAÇÃO SEGURA</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white font-brand">
            Esqueci minha senha
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Informe seu e-mail para receber um link seguro de redefinição.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-5 text-center py-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-semibold text-white">
                Instruções Enviadas!
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Se o e-mail <strong>{email}</strong> estiver cadastrado em nossa plataforma, você receberá um link seguro de recuperação em instantes.
              </p>
              <p className="text-[11px] text-slate-400">
                Não se esqueça de checar a sua pasta de spam ou lixo eletrônico. O link é de uso único e expira em 1 hora.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar para o Login</span>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                E-mail cadastrado
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

            <div className="flex items-center gap-2 p-3 rounded-lg bg-cyan-950/20 border border-cyan-800/30 text-[11px] text-cyan-300">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>O link enviado é de uso único, com expiração automática em 1 hora.</span>
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
                  <span>Enviar link de recuperação</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="text-center pt-2 border-t border-slate-800 text-xs text-slate-400">
          Lembrou sua senha?{" "}
          <Link href="/login" className="font-semibold text-cyan-400 hover:text-cyan-300 hover:underline">
            Entrar agora
          </Link>
        </div>
      </div>
    </div>
  );
}
