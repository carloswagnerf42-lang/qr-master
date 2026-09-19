"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Settings,
  User,
  Palette,
  Bell,
  Shield,
  CreditCard,
  Check,
  Sparkles,
  Loader2,
  Lock,
  LogOut,
  Trash2,
  AlertTriangle,
  Upload,
  Mail,
  Info,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useToast } from "@/components/ui/Toast";

export default function SettingsPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<
    "account" | "appearance" | "notifications" | "privacy" | "security" | "plan"
  >("account");

  const [loading, setLoading] = useState(true);

  // 1. User account state
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userCompany, setUserCompany] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userRole, setUserRole] = useState("USER");
  const [userPlan, setUserPlan] = useState<{
    id: string;
    name: string;
    displayName: string;
    priceMonth: number;
    priceYear?: number;
    maxQRCodes: number;
    dynamicQRs: boolean;
    analytics: boolean;
    exportSvg: boolean;
    exportPdf: boolean;
    customLogo: boolean;
    campaigns: boolean;
  } | null>(null);
  const [billingCycle, setBillingCycle] = useState<"month" | "year">("month");
  const [usage, setUsage] = useState<{ qrCodes: number; maxQRCodes: number; remainingQRCodes: number } | null>(null);
  const [subscription, setSubscription] = useState<{
    id?: string;
    status: string;
    gateway?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: string | null;
    isActive?: boolean;
    hasCustomerPortal?: boolean;
  } | null>(null);
  const [startingCheckout, setStartingCheckout] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  // Saving spinners
  const [savingAccount, setSavingAccount] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // 2. Settings preferences state (carregados do banco)
  const [notifyScans, setNotifyScans] = useState(true);
  const [notifyWeekly, setNotifyWeekly] = useState(true);
  const [notifyLimits, setNotifyLimits] = useState(true);
  const [retentionDays, setRetentionDays] = useState(365);
  const [consent, setConsent] = useState(true);
  const [language, setLanguage] = useState("pt-BR");

  // 3. Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // 4. Delete account state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  // Carrega os dados reais do usuário autenticado e suas configurações
  useEffect(() => {
    async function loadUserData() {
      setLoading(true);
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUserName(data.user.name || "");
            setUserEmail(data.user.email || "");
            setUserCompany(data.user.company || "");
            setUserPhone(data.user.phone || "");
            setUserAvatarUrl(data.user.avatarUrl || null);
            setUserRole(data.user.role || "USER");

            if (data.plan) {
              setUserPlan(data.plan);
            }
            if (data.usage) {
              setUsage(data.usage);
            }

            // Popula preferências reais do UserSettings
            if (data.user.settings) {
              setNotifyScans(data.user.settings.notifyNewScans ?? true);
              setNotifyWeekly(data.user.settings.notifyWeeklyReport ?? true);
              setNotifyLimits(data.user.settings.notifyLimitAlert ?? true);
              setConsent(data.user.settings.analyticsConsent ?? true);
              setRetentionDays(data.user.settings.dataRetentionDays ?? 365);
              setLanguage(data.user.settings.language || "pt-BR");
            }
          }
        }
        // Carrega status detalhado de assinatura
        try {
          const billingRes = await fetch("/api/billing/subscription");
          if (billingRes.ok) {
            const billingData = await billingRes.json();
            if (billingData.subscription) {
              setSubscription(billingData.subscription);
            }
            if (billingData.plan) {
              setUserPlan(billingData.plan);
            }
            if (billingData.usage) {
              setUsage(billingData.usage);
            }
          }
        } catch {
          // Fallback silencioso
        }
      } catch (err) {
        console.error("Erro ao carregar dados do usuário:", err);
      } finally {
        setLoading(false);
      }
    }

    loadUserData();
  }, []);

  // Handlers de Assinatura e Pagamentos
  const handleUpgrade = async (planName: "PRO" | "BUSINESS") => {
    setStartingCheckout(planName);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planName, billingCycle }),
      });
      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast.error("Erro no checkout", data.error || "Não foi possível iniciar o checkout.");
      }
    } catch {
      toast.error("Erro de conexão", "Falha de comunicação com o servidor de pagamentos.");
    } finally {
      setStartingCheckout(null);
    }
  };

  const handleOpenPortal = async () => {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.portalUrl) {
        window.location.href = data.portalUrl;
      } else {
        toast.error("Portal indisponível", data.error || "Não foi possível abrir o portal de faturamento.");
      }
    } catch {
      toast.error("Erro de conexão", "Falha ao conectar com o portal de faturamento.");
    } finally {
      setOpeningPortal(false);
    }
  };

  // 1. Salvar Dados da Conta (Nome, E-mail, Empresa, Telefone, Avatar)
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccount(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName,
          email: userEmail,
          company: userCompany,
          phone: userPhone,
          avatarUrl: userAvatarUrl,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Conta atualizada!", "Seus dados foram salvos com sucesso no banco de dados.");
      } else {
        toast.error("Erro ao salvar", data.error || "Não foi possível atualizar seus dados.");
      }
    } catch {
      toast.error("Erro de conexão", "Falha na comunicação com o servidor.");
    } finally {
      setSavingAccount(false);
    }
  };

  // Upload de Foto / Avatar
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "logos");

      const uploadRes = await fetch("/api/storage/upload", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        toast.error("Falha no upload", uploadData.error || "Não foi possível enviar a imagem.");
        setUploadingAvatar(false);
        return;
      }

      // Atualiza no usuário imediatamente
      const newAvatarUrl = uploadData.downloadUrl || uploadData.url;
      setUserAvatarUrl(newAvatarUrl);

      const meRes = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: newAvatarUrl }),
      });

      if (meRes.ok) {
        toast.success("Foto atualizada!", "Sua foto de perfil foi salva com sucesso.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro", "Erro ao fazer upload da imagem.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // 2. Salvar Notificações (UserSettings persistente)
  const handleSaveNotifications = async () => {
    setSavingPreferences(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            notifyNewScans: notifyScans,
            notifyWeeklyReport: notifyWeekly,
            notifyLimitAlert: notifyLimits,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Notificações salvas!", "Suas preferências foram persistidas com sucesso no banco de dados.");
      } else {
        toast.error("Erro ao salvar", data.error || "Falha ao salvar configurações.");
      }
    } catch {
      toast.error("Erro de conexão", "Falha de conexão com o servidor.");
    } finally {
      setSavingPreferences(false);
    }
  };

  // 3. Salvar Privacidade & LGPD (UserSettings persistente)
  const handleSavePrivacy = async () => {
    setSavingPrivacy(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            dataRetentionDays: Number(retentionDays),
            analyticsConsent: consent,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Política atualizada!", "Período de retenção e consentimento salvos com sucesso.");
      } else {
        toast.error("Erro ao salvar", data.error || "Falha ao atualizar privacidade.");
      }
    } catch {
      toast.error("Erro de conexão", "Falha de conexão com o servidor.");
    } finally {
      setSavingPrivacy(false);
    }
  };

  // 4. Salvar Idioma & Aparência
  const handleSaveAppearance = async () => {
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { language },
        }),
      });
      if (res.ok) {
        toast.success("Preferência salva!", "Idioma preferencial atualizado no seu perfil.");
      }
    } catch {
      toast.error("Erro", "Não foi possível salvar o idioma.");
    }
  };

  // 5. Alteração Segura de Senha
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Campos obrigatórios", "Preencha todos os campos de senha.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Senhas não coincidem", "A nova senha e a confirmação estão diferentes.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Senha curta", "A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Senha atualizada!", "Sua senha de acesso foi alterada com sucesso.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error("Erro ao alterar senha", data.error || "Verifique a senha atual informada.");
      }
    } catch {
      toast.error("Erro de conexão", "Não foi possível comunicar com o servidor.");
    } finally {
      setSavingPassword(false);
    }
  };

  // 6. Exclusão Segura de Conta
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletePassword) {
      toast.error("Senha obrigatória", "Informe sua senha atual para confirmar a exclusão.");
      return;
    }

    if (deleteConfirmationText !== "EXCLUIR") {
      toast.error("Confirmação obrigatória", "Digite a palavra 'EXCLUIR' exatamente em maiúsculas.");
      return;
    }

    setDeletingAccount(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: deletePassword,
          confirmationText: deleteConfirmationText,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Conta excluída", "Sua conta e dados foram removidos definitivamente.");
        window.location.href = "/register";
      } else {
        toast.error("Erro ao excluir", data.error || "Não foi possível excluir a conta.");
        setDeletingAccount(false);
      }
    } catch {
      toast.error("Erro de conexão", "Falha de comunicação.");
      setDeletingAccount(false);
    }
  };

  // 7. Logout Oficial
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <div>
      <Header
        title="Configurações da Plataforma"
        subtitle="Gerencie seus dados pessoais, preferências, segurança, limites e plano contratado"
      />

      <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
        {/* Abas */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2 text-xs sm:text-sm font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab("account")}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "account"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <User className="w-4 h-4" />
            <span>Conta</span>
          </button>

          <button
            onClick={() => setActiveTab("appearance")}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "appearance"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Aparência & Idioma</span>
          </button>

          <button
            onClick={() => setActiveTab("notifications")}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "notifications"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Notificações</span>
          </button>

          <button
            onClick={() => setActiveTab("privacy")}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "privacy"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Privacidade & LGPD</span>
          </button>

          <button
            onClick={() => setActiveTab("security")}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "security"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Segurança & Acesso</span>
          </button>

          <button
            onClick={() => setActiveTab("plan")}
            className={`pb-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "plan"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Plano & Limites</span>
          </button>
        </div>

        {/* CONTEÚDO DAS SEÇÕES */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
          {/* ================================================================ */}
          {/* ABA 1: CONTA & FOTO                                              */}
          {/* ================================================================ */}
          {activeTab === "account" && (
            <div className="space-y-6 max-w-xl">
              <div className="flex items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="relative">
                  {userAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={userAvatarUrl}
                      alt={userName}
                      className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                      {(userName || "U")[0]?.toUpperCase()}
                    </div>
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Foto de Perfil / Logo</h4>
                  <p className="text-xs text-slate-500 mb-2">PNG, JPG ou WEBP até 5MB</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{userAvatarUrl ? "Alterar Imagem" : "Carregar Foto"}</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveAccount} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Seu nome completo"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail de Acesso (Login)
                  </label>
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="seu.email@empresa.com"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    A alteração do e-mail atualiza imediatamente sua credencial de acesso ao sistema.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Empresa
                    </label>
                    <input
                      type="text"
                      value={userCompany}
                      onChange={(e) => setUserCompany(e.target.value)}
                      placeholder="Nome da sua empresa"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={userPhone}
                      onChange={(e) => setUserPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingAccount}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
                  >
                    {savingAccount && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Salvar Dados da Conta</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ================================================================ */}
          {/* ABA 2: APARÊNCIA & IDIOMA                                        */}
          {/* ================================================================ */}
          {activeTab === "appearance" && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Tema da Interface
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Alterne entre Modo Claro, Modo Escuro ou sincronize com as preferências do seu sistema.
                </p>
                <div className="pt-3">
                  <ThemeToggle />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Idioma da Plataforma
                </h3>
                <select
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en">English (US)</option>
                  <option value="es">Español</option>
                </select>
                <button
                  type="button"
                  onClick={handleSaveAppearance}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-sm hover:bg-indigo-700"
                >
                  Salvar Idioma Preferencial
                </button>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* ABA 3: NOTIFICAÇÕES (PERSISTÊNCIA REAL NO BANCO)                  */}
          {/* ================================================================ */}
          {activeTab === "notifications" && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Notificações e Alertas
              </h3>
              <p className="text-xs text-slate-500">
                Estas preferências são armazenadas no banco de dados e controlam os alertas emitidos pela plataforma.
              </p>
              <div className="space-y-3">
                <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs font-medium cursor-pointer">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Alertas de Novos Scans</p>
                    <p className="text-slate-400">Receba notificações quando seus códigos atingirem novos marcos de leitura.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyScans}
                    onChange={(e) => setNotifyScans(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs font-medium cursor-pointer">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Relatório Semanal Consolidado</p>
                    <p className="text-slate-400">Resumo com total de scans, países e dispositivos de maior acesso.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyWeekly}
                    onChange={(e) => setNotifyWeekly(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs font-medium cursor-pointer">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Alerta de Limite do Plano</p>
                    <p className="text-slate-400">Aviso preventivo quando estiver próximo do limite de QR Codes contratado.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyLimits}
                    onChange={(e) => setNotifyLimits(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSaveNotifications}
                  disabled={savingPreferences}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
                >
                  {savingPreferences && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Salvar Notificações no Banco</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* ABA 4: PRIVACIDADE & LGPD (PERSISTÊNCIA REAL NO BANCO)            */}
          {/* ================================================================ */}
          {activeTab === "privacy" && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Privacidade & Conformidade LGPD
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                A plataforma QR MASTER não armazena dados de geolocalização exata nem IPs puros. Os endereços IP coletados nos escaneamentos são submetidos a hash anônimo (SHA-256) imediatamente.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Período de Retenção dos Dados de Acessos
                </label>
                <select
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value={90}>90 dias</option>
                  <option value={180}>180 dias</option>
                  <option value={365}>365 dias (1 ano)</option>
                  <option value={730}>730 dias (2 anos)</option>
                </select>
              </div>

              <label className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  Autorizo o processamento analítico dos eventos de escaneamento para geração de gráficos estatísticos.
                </span>
              </label>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSavePrivacy}
                  disabled={savingPrivacy}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
                >
                  {savingPrivacy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Atualizar Política de Retenção</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* ABA 5: SEGURANÇA, SENHA, LOGOUT E EXCLUSÃO DE CONTA              */}
          {/* ================================================================ */}
          {activeTab === "security" && (
            <div className="space-y-8 max-w-2xl">
              {/* Alterar Senha */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <KeyRound className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Alteração Segura de Senha
                  </h3>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Senha Atual
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Nova Senha
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Confirmar Nova Senha
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2 mt-2"
                  >
                    {savingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Salvar Nova Senha</span>
                  </button>
                </form>
              </div>

              {/* Informação Técnica: Recuperação de Senha */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                  <Info className="w-4 h-4 text-indigo-400" />
                  <span>Documentação: Recuperação de Senha por E-mail</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Para habilitar o fluxo público de &quot;Esqueci minha senha&quot; em produção sem riscos de segurança,
                  é obrigatória a configuração de um provedor SMTP transacional (ex: Resend, Postmark ou SendGrid),
                  com geração de <strong>token criptográfico efêmero</strong> (32 bytes hex), <strong>expiração de 30 minutos</strong> e tela de confirmação com validação de hash.
                </p>
              </div>

              {/* Logout & Sessão */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Encerrar Sessão</h4>
                  <p className="text-xs text-slate-500">Desconecta sua conta com segurança deste dispositivo.</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sair da Conta</span>
                </button>
              </div>

              {/* Zona de Perigo: Exclusão de Conta */}
              <div className="pt-6 border-t border-red-500/20 space-y-3">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Zona de Perigo — Exclusão Definitiva de Conta</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  A exclusão de conta remove permanentemente todos os seus QR Codes gerados, métricas analíticas, arquivos físicos, campanhas e histórico de acessos. Esta operação não pode ser desfeita.
                </p>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-500/30 font-bold text-xs transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Minha Conta Permanentemente</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* ABA 6: PLANO & LIMITES REAIS DO USUÁRIO                          */}
          {/* ================================================================ */}
          {activeTab === "plan" && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-900 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 text-[10px] font-extrabold uppercase">
                    Plano Ativo no Servidor
                  </span>
                  <h4 className="text-2xl font-extrabold mt-1">
                    {userPlan?.displayName || "Plano Free"}
                  </h4>
                  <p className="text-xs text-indigo-200 mt-1">
                    {userPlan?.dynamicQRs
                      ? "QR Codes dinâmicos com alteração de destino em tempo real e analytics completo."
                      : "QR Codes estáticos com personalização e exportação direta em alta resolução."}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-extrabold">
                    R$ {(userPlan?.priceMonth || 0).toFixed(2)}
                  </span>
                  <span className="text-xs text-indigo-200 block">/mês</span>
                </div>
              </div>

              {/* Medidor de Uso Real de QR Codes */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span>Utilização de Códigos:</span>
                  <span>
                    {usage?.qrCodes || 0} de {usage?.maxQRCodes || 5} códigos criados
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(((usage?.qrCodes || 0) / (usage?.maxQRCodes || 5)) * 100)
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  {usage?.remainingQRCodes || 0} slots restantes para criação de novos QR Codes.
                </p>
              </div>

              {/* Tabela de Recursos Liberados no seu Plano */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Recursos Habilitados no seu Plano:
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <Check className={`w-4 h-4 ${userPlan?.dynamicQRs ? "text-emerald-500" : "text-slate-400"}`} />
                    <span className={userPlan?.dynamicQRs ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-400"}>
                      QR Codes Dinâmicos
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <Check className={`w-4 h-4 ${userPlan?.analytics ? "text-emerald-500" : "text-slate-400"}`} />
                    <span className={userPlan?.analytics ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-400"}>
                      Gráficos de Analytics
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <Check className={`w-4 h-4 ${userPlan?.exportSvg ? "text-emerald-500" : "text-slate-400"}`} />
                    <span className={userPlan?.exportSvg ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-400"}>
                      Exportação em Vetor SVG
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <Check className={`w-4 h-4 ${userPlan?.exportPdf ? "text-emerald-500" : "text-slate-400"}`} />
                    <span className={userPlan?.exportPdf ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-400"}>
                      Exportação em PDF Vetorial
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <Check className={`w-4 h-4 ${userPlan?.customLogo ? "text-emerald-500" : "text-slate-400"}`} />
                    <span className={userPlan?.customLogo ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-400"}>
                      Logotipo Central Customizado
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <Check className={`w-4 h-4 ${userPlan?.campaigns ? "text-emerald-500" : "text-slate-400"}`} />
                    <span className={userPlan?.campaigns ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-400"}>
                      Campanhas Promocionais
                    </span>
                  </div>
                </div>
              </div>

              {/* Detalhes da Assinatura & Gerenciamento Stripe */}
              {subscription && (
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-indigo-500" />
                        <h5 className="text-sm font-bold text-slate-900 dark:text-white">
                          Status da Assinatura
                        </h5>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            subscription.status === "ACTIVE"
                              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                              : subscription.status === "PAST_DUE"
                              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                              : "bg-red-500/20 text-red-600 dark:text-red-400"
                          }`}
                        >
                          {subscription.status === "ACTIVE"
                            ? "Ativa"
                            : subscription.status === "PAST_DUE"
                            ? "Pagamento Pendente (Tolerância)"
                            : "Cancelada"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {subscription.cancelAtPeriodEnd
                          ? `Cancelamento agendado. Seu acesso permanecerá liberado até ${new Date(
                              subscription.currentPeriodEnd || Date.now()
                            ).toLocaleDateString("pt-BR")}.`
                          : subscription.status === "PAST_DUE"
                          ? "Houve uma falha na renovação da sua assinatura. Você está no período de tolerância de 5 dias."
                          : `Próxima renovação automática em: ${new Date(
                              subscription.currentPeriodEnd || Date.now()
                            ).toLocaleDateString("pt-BR")}.`}
                      </p>
                    </div>

                    {subscription.hasCustomerPortal && (
                      <button
                        type="button"
                        onClick={handleOpenPortal}
                        disabled={openingPortal}
                        className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-indigo-600 dark:text-indigo-400 shadow-sm flex items-center gap-2 disabled:opacity-60 transition-colors"
                      >
                        {openingPortal ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="w-3.5 h-3.5" />
                        )}
                        <span>Gerenciar Faturas & Cartão</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Cards de Upgrade de Plano (quando no FREE ou sem assinatura ativa) */}
              {(!userPlan || userPlan.name === "FREE" || !subscription?.isActive) && (
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Faça Upgrade e Desbloqueie Todo o Potencial:
                      </h5>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Escolha entre cobrança mensal ou anual com desconto exclusivo de 2 meses grátis.
                      </p>
                    </div>

                    {/* Toggle Seletor Mensal / Anual */}
                    <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl border border-slate-200 dark:border-slate-700/80 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setBillingCycle("month")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          billingCycle === "month"
                            ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Mensal
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingCycle("year")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                          billingCycle === "year"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <span>Anual</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500 text-white font-extrabold tracking-tight">
                          2 Meses Grátis
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Card Plano PRO */}
                    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-indigo-600/60 dark:border-indigo-500/60 shadow-md flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-extrabold uppercase">
                            Mais Popular
                          </span>
                          <span className="text-xs text-slate-400 font-medium">
                            {billingCycle === "year" ? "Anual (~17% OFF)" : "Mensal"}
                          </span>
                        </div>
                        <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">
                          Plano PRO
                        </h4>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-slate-900 dark:text-white">
                            {billingCycle === "year" ? "R$ 399,00" : "R$ 39,90"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {billingCycle === "year" ? "/ano (equiv. a R$ 33,25/mês)" : "/mês"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Ideal para negócios, restaurantes e profissionais liberais que precisam de QR Codes dinâmicos com alteração de link em tempo real.
                        </p>
                        <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 pt-2">
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500" />
                            <span>Até <strong>100 QR Codes</strong> dinâmicos e estáticos</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500" />
                            <span>Alteração de destino em tempo real (/q/code)</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500" />
                            <span>Métricas e Analytics completo por dispositivo/SO</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500" />
                            <span>Exportação em alta definição SVG e PDF para gráfica</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500" />
                            <span>Inserção de Logotipo personalizado</span>
                          </li>
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUpgrade("PRO")}
                        disabled={startingCheckout !== null}
                        className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {startingCheckout === "PRO" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        <span>
                          Assinar Plano PRO {billingCycle === "year" ? "Anual" : "Mensal"}
                        </span>
                      </button>
                    </div>

                    {/* Card Plano BUSINESS */}
                    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-extrabold uppercase">
                            Para Empresas
                          </span>
                          <span className="text-xs text-slate-400 font-medium">
                            {billingCycle === "year" ? "Anual (~17% OFF)" : "Mensal"}
                          </span>
                        </div>
                        <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">
                          Plano BUSINESS
                        </h4>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-slate-900 dark:text-white">
                            {billingCycle === "year" ? "R$ 999,00" : "R$ 99,90"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {billingCycle === "year" ? "/ano (equiv. a R$ 83,25/mês)" : "/mês"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Para redes, agências e franquias com alto volume de campanhas e gestão em grande escala.
                        </p>
                        <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 pt-2">
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500" />
                            <span><strong>QR Codes Ilimitados</strong></span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500" />
                            <span>Todas as funcionalidades do plano PRO</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500" />
                            <span>Módulo de Campanhas e Agrupamento</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500" />
                            <span>Exportação em lote e suporte prioritário</span>
                          </li>
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUpgrade("BUSINESS")}
                        disabled={startingCheckout !== null}
                        className="w-full py-3 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {startingCheckout === "BUSINESS" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        <span>
                          Assinar Plano BUSINESS {billingCycle === "year" ? "Anual" : "Mensal"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE CONTA                            */}
      {/* ==================================================================== */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Exclusão de Conta</h3>
                <p className="text-xs text-slate-500">Confirme para prosseguir</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Para sua segurança, informe sua senha e digite a palavra <strong>EXCLUIR</strong> em maiúsculas:
            </p>

            <form onSubmit={handleDeleteAccount} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Sua Senha de Acesso:
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Digite &quot;EXCLUIR&quot;:
                </label>
                <input
                  type="text"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="EXCLUIR"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={deletingAccount}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deletingAccount}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {deletingAccount && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirmar Exclusão</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
