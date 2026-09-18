"use client";

import React, { useState, useEffect } from "react";
import { User, Mail, Building, Phone, Globe, Shield, Save, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/components/ui/Toast";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  company: string | null;
  phone: string | null;
  avatarUrl: string | null;
  planId: string | null;
  plan?: {
    name: string;
    displayName: string;
  } | null;
  createdAt: string;
  settings?: {
    language?: string;
  } | null;
}

export default function ProfilePage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser({
              ...data.user,
              plan: data.plan || data.user.plan || null,
            });
            setName(data.user.name || "");
            setEmail(data.user.email || "");
            setCompany(data.user.company || "");
            setPhone(data.user.phone || "");
            setAvatarUrl(data.user.avatarUrl || null);
            if (data.user.settings?.language) {
              setLanguage(data.user.settings.language);
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar perfil:", err);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          company,
          phone,
          settings: { language },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        toast.success("Perfil atualizado!", "Seus dados foram salvos com sucesso no sistema.");
      } else {
        const errorData = await res.json();
        toast.error("Erro ao salvar", errorData.error || "Não foi possível atualizar seus dados.");
      }
    } catch {
      toast.error("Erro de conexão", "Falha na comunicação com o servidor.");
    } finally {
      setSaving(false);
    }
  };

  const initialLetter = (name || user?.name || "U")[0].toUpperCase();
  const memberDate = user?.createdAt
    ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(user.createdAt))
    : "Recente";
  const planLabel = user?.role === "ADMIN"
    ? "Administrador"
    : user?.plan?.displayName ||
      (user?.plan?.name === "FREE"
        ? "Plano Grátis"
        : user?.plan?.name === "PRO"
        ? "Plano Pro"
        : user?.plan?.name === "BUSINESS"
        ? "Plano Business"
        : "Plano Grátis");

  return (
    <div>
      <Header title="Meu Perfil" subtitle="Visualize e edite seus dados cadastrais e preferências" />

      <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
          {/* Avatar & Header */}
          <div className="flex items-center gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={name}
                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shadow-md"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                {initialLetter}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {name || user?.name || "Usuário"}
              </h2>
              <p className="text-xs text-slate-400">
                {email || user?.email || "usuario@qrmaster.com"} • Membro desde {memberDate}
              </p>
              <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 text-[10px] font-extrabold uppercase">
                {planLabel}
              </span>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail de Acesso
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    disabled
                    value={email || user?.email || ""}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/40 text-sm text-slate-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Empresa / Organização
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                    <Building className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Telefone / WhatsApp
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="max-w-xs">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Idioma Preferencial
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <Globe className="w-4 h-4" />
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en">English (US)</option>
                  <option value="es">Español</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Salvar Perfil</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
