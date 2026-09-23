"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Lock, ShieldAlert, ArrowRight, X, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface LinkGoogleAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  credential: string;
  onSuccess: () => void;
}

export function LinkGoogleAccountModal({
  isOpen,
  onClose,
  email,
  credential,
  onSuccess,
}: LinkGoogleAccountModalProps) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/google/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error("Falha na vinculação", data.error || "Senha incorreta.");
        setLoading(false);
        return;
      }

      toast.success("Conta vinculada!", "Você agora pode entrar com Google ou com sua senha.");
      onSuccess();
    } catch {
      toast.error("Erro de conexão", "Não foi possível conectar ao servidor.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Vincular Conta Google</h3>
            <p className="text-xs text-slate-400">Proteção de Identidade e Segurança</p>
          </div>
        </div>

        <div className="space-y-3 mb-5 text-xs text-slate-300">
          <p>
            Identificamos que já existe uma conta no QR MASTER com o e-mail:
          </p>
          <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-center font-semibold text-cyan-300">
            {email}
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Para garantir que ninguém além de você vincule essa conta, confirme a senha cadastrada no QR MASTER. Todos os seus QR Codes, assinaturas e dados serão mantidos intactos.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Sua senha atual no QR MASTER
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
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

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#006CFF] to-[#0084FF] hover:from-[#006CFF] hover:to-[#00E0FF] text-white font-bold text-xs shadow-md shadow-blue-500/25 flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Confirmar e Vincular</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
