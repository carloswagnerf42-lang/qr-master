"use client";

import React, { useState } from "react";
import {
  Users,
  Search,
  Zap,
  CheckCircle2,
  Calendar,
  CreditCard,
  Sparkles,
  DollarSign,
  Clock,
  Shield,
  FileText,
  AlertCircle,
  X,
  QrCode,
  BarChart3,
  Target,
  History,
  Settings as SettingsIcon,
  ToggleLeft,
  ToggleRight,
  UserCheck,
  UserX,
  ExternalLink,
  ShieldAlert,
  Server,
  Database,
  Lock,
  Trash2,
  Edit3,
  Copy,
  Check,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string | Date;
  planId: string | null;
  plan?: {
    id: string;
    name: string;
    displayName: string;
    priceMonth: number;
    priceYear?: number;
  } | null;
  subscription?: {
    id: string;
    status: string;
    currentPeriodStart: string | Date;
    currentPeriodEnd: string | Date;
  } | null;
  _count: {
    qrCodes: number;
    campaigns?: number;
  };
}

interface PlanItem {
  id: string;
  name: string;
  displayName: string;
  priceMonth: number;
  priceYear: number;
  maxQRCodes?: number;
  dynamicQRs?: boolean;
  analytics?: boolean;
  exportSvg?: boolean;
  exportPdf?: boolean;
  customLogo?: boolean;
  campaigns?: boolean;
  _count?: { users: number };
}

interface QRCodeItem {
  id: string;
  name: string;
  type: string;
  isDynamic: boolean;
  shortCode: string | null;
  destination: string;
  status: string;
  scanCount: number;
  createdAt: string | Date;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface CampaignItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | Date | null;
  endDate: string | Date | null;
  createdAt: string | Date;
  user: {
    id: string;
    name: string;
    email: string;
  };
  _count: { qrCodes: number };
}

interface LogItem {
  id: string;
  action: string;
  description: string;
  entityId: string | null;
  createdAt: string | Date;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

interface AdminUserManagementProps {
  initialUsers: UserItem[];
  plans: PlanItem[];
  initialQRCodes?: QRCodeItem[];
  initialCampaigns?: CampaignItem[];
  initialLogs?: LogItem[];
  currentAdminId?: string;
}

type TabType = "users" | "plans" | "metrics" | "qrcodes" | "campaigns" | "logs" | "settings";

export function AdminUserManagement({
  initialUsers,
  plans,
  initialQRCodes = [],
  initialCampaigns = [],
  initialLogs = [],
  currentAdminId,
}: AdminUserManagementProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>("users");

  // State: Users
  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  const [searchUsers, setSearchUsers] = useState("");
  const [selectedUserForPlan, setSelectedUserForPlan] = useState<UserItem | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  // State: Plan Pricing & Edit Modal
  const [planItems, setPlanItems] = useState<PlanItem[]>(plans);
  const [selectedPlanForEdit, setSelectedPlanForEdit] = useState<PlanItem | null>(null);
  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState(false);
  const [editPriceMonth, setEditPriceMonth] = useState<number>(0);
  const [editPriceYear, setEditPriceYear] = useState<number>(0);
  const [editDisplayName, setEditDisplayName] = useState<string>("");
  const [editMaxQRCodes, setEditMaxQRCodes] = useState<number>(5);
  const [editDynamicQRs, setEditDynamicQRs] = useState<boolean>(false);
  const [editAnalytics, setEditAnalytics] = useState<boolean>(false);
  const [editExportSvg, setEditExportSvg] = useState<boolean>(false);
  const [editExportPdf, setEditExportPdf] = useState<boolean>(false);
  const [editCustomLogo, setEditCustomLogo] = useState<boolean>(false);
  const [editCampaigns, setEditCampaigns] = useState<boolean>(false);
  const [savingPlan, setSavingPlan] = useState(false);

  // State: Maintenance Clean Demo
  const [cleaningDemo, setCleaningDemo] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // State: User Status / Role Modal
  const [selectedUserForStatus, setSelectedUserForStatus] = useState<UserItem | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [targetAccountStatus, setTargetAccountStatus] = useState<string>("ACTIVE");
  const [targetRole, setTargetRole] = useState<string>("USER");

  // Form State for Manual Activation
  const [targetPlanId, setTargetPlanId] = useState<string>("");
  const [durationDays, setDurationDays] = useState<number>(30);
  const [paymentChannel, setPaymentChannel] = useState<string>("Venda Externa via Pix");
  const [customNote, setCustomNote] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // State: QR Codes
  const [qrcodes, setQrcodes] = useState<QRCodeItem[]>(initialQRCodes);
  const [searchQrs, setSearchQrs] = useState("");
  const [togglingQrId, setTogglingQrId] = useState<string | null>(null);

  // State: Campaigns
  const [campaigns] = useState<CampaignItem[]>(initialCampaigns);
  const [searchCampaigns, setSearchCampaigns] = useState("");

  // State: Logs
  const [logs] = useState<LogItem[]>(initialLogs);
  const [searchLogs, setSearchLogs] = useState("");
  const [filterAction, setFilterAction] = useState<string>("ALL");

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const q = searchUsers.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.plan?.displayName || "").toLowerCase().includes(q)
    );
  });

  // Filtered QR Codes
  const filteredQrs = qrcodes.filter((qr) => {
    const q = searchQrs.toLowerCase();
    return (
      qr.name.toLowerCase().includes(q) ||
      (qr.shortCode || "").toLowerCase().includes(q) ||
      qr.destination.toLowerCase().includes(q) ||
      qr.user.name.toLowerCase().includes(q) ||
      qr.user.email.toLowerCase().includes(q)
    );
  });

  // Filtered Campaigns
  const filteredCampaigns = campaigns.filter((c) => {
    const q = searchCampaigns.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.description || "").toLowerCase().includes(q) ||
      c.user.name.toLowerCase().includes(q) ||
      c.user.email.toLowerCase().includes(q)
    );
  });

  // Filtered Logs
  const filteredLogs = logs.filter((l) => {
    const q = searchLogs.toLowerCase();
    const matchesSearch =
      l.description.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.user.name.toLowerCase().includes(q) ||
      l.user.email.toLowerCase().includes(q);
    const matchesAction = filterAction === "ALL" || l.action === filterAction;
    return matchesSearch && matchesAction;
  });

  // Modal handlers
  const openActivationModal = (user: UserItem) => {
    setSelectedUserForPlan(user);
    const defaultPlan = plans.find((p) => p.name === "PRO") || plans[0];
    setTargetPlanId(user.planId || defaultPlan?.id || "");
    setDurationDays(30);
    setPaymentChannel("Venda Externa via Pix");
    setCustomNote("");
    setIsPlanModalOpen(true);
  };

  const openStatusModal = (user: UserItem) => {
    setSelectedUserForStatus(user);
    setTargetAccountStatus(user.subscription?.status || "ACTIVE");
    setTargetRole(user.role || "USER");
    setIsStatusModalOpen(true);
  };

  const handleActivatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPlan) return;

    setSaving(true);
    try {
      const fullNote = customNote ? `${paymentChannel} - ${customNote}` : paymentChannel;

      const res = await fetch("/api/admin/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserForPlan.id,
          planId: targetPlanId,
          durationDays,
          paymentNote: fullNote,
          status: "ACTIVE",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error("Erro ao ativar plano", data.error || "Tente novamente.");
        setSaving(false);
        return;
      }

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === selectedUserForPlan.id) {
            return {
              ...u,
              planId: data.user.plan.id,
              plan: data.user.plan,
              subscription: data.user.subscription,
            };
          }
          return u;
        })
      );

      toast.success(
        "✓ Plano ativado com sucesso!",
        `O plano ${data.user.plan.displayName} está ativo para ${selectedUserForPlan.name}.`
      );
      setIsPlanModalOpen(false);
      setSaving(false);
    } catch (err) {
      console.error(err);
      toast.error("Erro de conexão", "Não foi possível conectar ao servidor.");
      setSaving(false);
    }
  };

  const handleUpdateStatusAndRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForStatus) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserForStatus.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountStatus: targetAccountStatus,
          role: targetRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error("Erro ao atualizar", data.error || "Falha na requisição.");
        setSaving(false);
        return;
      }

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === selectedUserForStatus.id) {
            return {
              ...u,
              role: data.user.role,
              subscription: u.subscription
                ? { ...u.subscription, status: data.user.accountStatus }
                : {
                    id: "sub-temp",
                    status: data.user.accountStatus,
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: new Date(),
                  },
            };
          }
          return u;
        })
      );

      toast.success("✓ Conta atualizada!", data.message);
      setIsStatusModalOpen(false);
      setSaving(false);
    } catch (err) {
      console.error(err);
      toast.error("Erro", "Erro ao conectar ao servidor.");
      setSaving(false);
    }
  };

  const handleToggleQrStatus = async (qr: QRCodeItem) => {
    const newStatus = qr.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setTogglingQrId(qr.id);

    try {
      const res = await fetch(`/api/admin/qrcodes/${qr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error("Erro", data.error || "Falha ao alterar status.");
        setTogglingQrId(null);
        return;
      }

      setQrcodes((prev) =>
        prev.map((item) => (item.id === qr.id ? { ...item, status: newStatus } : item))
      );
      toast.success(
        `QR Code ${newStatus === "ACTIVE" ? "ativado" : "desativado"}!`,
        `O QR "${qr.name}" agora está ${newStatus === "ACTIVE" ? "ativo" : "pausado"}.`
      );
    } catch (err) {
      console.error(err);
      toast.error("Erro de conexão", "Não foi possível alterar o status do QR Code.");
    } finally {
      setTogglingQrId(null);
    }
  };

  // Plan Edit Handlers
  const handleOpenEditPlan = (plan: PlanItem) => {
    setSelectedPlanForEdit(plan);
    setEditPriceMonth(Number(plan.priceMonth) || 0);
    setEditPriceYear(Number(plan.priceYear) || 0);
    setEditDisplayName(plan.displayName);
    setEditMaxQRCodes(plan.maxQRCodes ?? 5);
    setEditDynamicQRs(Boolean(plan.dynamicQRs));
    setEditAnalytics(Boolean(plan.analytics));
    setEditExportSvg(Boolean(plan.exportSvg));
    setEditExportPdf(Boolean(plan.exportPdf));
    setEditCustomLogo(Boolean(plan.customLogo));
    setEditCampaigns(Boolean(plan.campaigns));
    setIsEditPlanModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanForEdit) return;

    setSavingPlan(true);
    try {
      const res = await fetch("/api/admin/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlanForEdit.id,
          priceMonth: editPriceMonth,
          priceYear: editPriceYear,
          displayName: editDisplayName,
          maxQRCodes: editMaxQRCodes,
          dynamicQRs: editDynamicQRs,
          analytics: editAnalytics,
          exportSvg: editExportSvg,
          exportPdf: editExportPdf,
          customLogo: editCustomLogo,
          campaigns: editCampaigns,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error("Erro ao salvar", data.error || "Não foi possível atualizar o plano.");
        return;
      }

      toast.success(
        "Plano atualizado!",
        `${data.plan.displayName} agora custa R$ ${Number(data.plan.priceMonth).toFixed(2)}/mês | R$ ${Number(data.plan.priceYear || 0).toFixed(2)}/ano.`
      );
      setPlanItems((prev) =>
        prev.map((p) => (p.id === data.plan.id ? { ...p, ...data.plan } : p))
      );
      setIsEditPlanModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Erro de conexão", "Falha ao se comunicar com o servidor.");
    } finally {
      setSavingPlan(false);
    }
  };

  // Clean Demo Data Handler
  const handleCleanDemoData = async () => {
    if (
      !confirm(
        "Atenção: Deseja limpar todos os dados não reais / demo do banco de dados? Usuários reais serão preservados rigorosamente."
      )
    ) {
      return;
    }

    setCleaningDemo(true);
    try {
      const res = await fetch("/api/admin/maintenance/clean-demo", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Erro na limpeza", data.error || "Falha ao executar limpeza.");
        return;
      }

      toast.success(
        "Limpeza concluída!",
        `${data.deletedCount.users} usuário(s), ${data.deletedCount.qrCodes} QR(s) e ${data.deletedCount.scans} scan(s) removidos com sucesso.`
      );
      setUsers((prev) => prev.filter((u) => u.email !== "carlos@qrmaster.com"));
      setQrcodes((prev) =>
        prev.filter((q) => !q.name.includes("[DEMO DATA]") && q.user.email !== "carlos@qrmaster.com")
      );
    } catch (err) {
      console.error(err);
      toast.error("Erro de conexão", "Falha ao conectar com o servidor.");
    } finally {
      setCleaningDemo(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation Menu */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "users"
              ? "bg-rose-600 text-white shadow-md shadow-rose-950"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Usuários & Contas ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("plans")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "plans"
              ? "bg-rose-600 text-white shadow-md shadow-rose-950"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Planos & Preços ({planItems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("metrics")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "metrics"
              ? "bg-rose-600 text-white shadow-md shadow-rose-950"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Métricas Gerais</span>
        </button>

        <button
          onClick={() => setActiveTab("qrcodes")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "qrcodes"
              ? "bg-rose-600 text-white shadow-md shadow-rose-950"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>QR Codes Globais ({qrcodes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("campaigns")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "campaigns"
              ? "bg-rose-600 text-white shadow-md shadow-rose-950"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Target className="w-4 h-4" />
          <span>Campanhas ({campaigns.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "logs"
              ? "bg-rose-600 text-white shadow-md shadow-rose-950"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <History className="w-4 h-4" />
          <span>Logs de Auditoria ({logs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "settings"
              ? "bg-rose-600 text-white shadow-md shadow-rose-950"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          <span>Configurações & Diagnóstico</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* ABA 1: USUÁRIOS, CONTAS E ATIVAÇÃO DE PLANOS                         */}
      {/* ==================================================================== */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Buscar usuário por nome, e-mail ou plano..."
                value={searchUsers}
                onChange={(e) => setSearchUsers(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span>Exibindo:</span>
              <strong className="text-white">{filteredUsers.length}</strong> de{" "}
              <span>{users.length} usuários</span>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Usuário</th>
                    <th className="py-3.5 px-4 font-semibold">Papel / Role</th>
                    <th className="py-3.5 px-4 font-semibold">Plano Atual</th>
                    <th className="py-3.5 px-4 font-semibold">Status Conta</th>
                    <th className="py-3.5 px-4 font-semibold text-center">QRs</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Nenhum usuário encontrado para o filtro digitado.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const planName = u.plan?.name || "FREE";
                      const isPro = planName === "PRO";
                      const isBiz = planName === "BUSINESS";
                      const subStatus = u.subscription?.status || "ACTIVE";
                      const isSuspended = subStatus === "SUSPENDED";

                      return (
                        <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                          {/* Nome & Email */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white">{u.name}</div>
                            <div className="text-[11px] text-slate-500">{u.email}</div>
                          </td>

                          {/* Role Badge */}
                          <td className="py-3.5 px-4">
                            {u.role === "ADMIN" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                <Shield className="w-3 h-3" />
                                ADMIN
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-400">
                                USER
                              </span>
                            )}
                          </td>

                          {/* Plano Badge */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                isBiz
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                  : isPro
                                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                                  : "bg-slate-800 text-slate-400 border border-slate-700"
                              }`}
                            >
                              <Sparkles className="w-3 h-3" />
                              {u.plan?.displayName || "Plano Free"}
                            </span>
                          </td>

                          {/* Status da Conta */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                isSuspended
                                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                  : subStatus === "CANCELED"
                                  ? "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30"
                                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              }`}
                            >
                              {subStatus}
                            </span>
                          </td>

                          {/* QRs Criados */}
                          <td className="py-3.5 px-4 text-center">
                            <span className="font-bold text-white">{u._count.qrCodes}</span>
                          </td>

                          {/* Botões de Ação */}
                          <td className="py-3.5 px-4 text-right space-x-2">
                            <button
                              onClick={() => openActivationModal(u)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-[11px] font-semibold border border-indigo-500/30 transition-colors"
                            >
                              <Zap className="w-3 h-3" />
                              <span>Ativar Plano</span>
                            </button>

                            <button
                              onClick={() => openStatusModal(u)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700 transition-colors"
                            >
                              <Shield className="w-3 h-3" />
                              <span>Status / Role</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ABA: PLANOS & PREÇOS                                                 */}
      {/* ==================================================================== */}
      {activeTab === "plans" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-rose-500" />
                <h3 className="text-base font-bold text-white">
                  Gestão Comercial dos Planos & Precificação
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Altere os valores de cobrança em R$, limites de QR Codes e recursos disponíveis para cada plano do SaaS em tempo real.
              </p>
            </div>
            <div className="text-xs text-slate-400">
              Total de Planos Ativos: <strong className="text-white">{planItems.length}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {planItems.map((plan) => {
              const isFree = plan.name === "FREE";
              const isPro = plan.name === "PRO";
              const isBiz = plan.name === "BUSINESS";

              return (
                <div
                  key={plan.id}
                  className={`p-6 rounded-3xl bg-slate-900 border flex flex-col justify-between space-y-6 relative overflow-hidden transition-all ${
                    isBiz
                      ? "border-amber-500/40 shadow-lg shadow-amber-950/20"
                      : isPro
                      ? "border-indigo-500/40 shadow-lg shadow-indigo-950/20"
                      : "border-slate-800"
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          isBiz
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : isPro
                            ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                            : "bg-slate-800 text-slate-300 border border-slate-700"
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {plan.name}
                      </span>
                      <span className="text-xs text-slate-400">
                        {users.filter((u) => (u.plan?.name || "FREE") === plan.name).length} assinante(s)
                      </span>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold text-white">{plan.displayName}</h4>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-extrabold text-white">
                            R$ {Number(plan.priceMonth).toFixed(2)}
                          </span>
                          <span className="text-xs text-slate-400">/mês</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold text-emerald-400">
                            R$ {Number(plan.priceYear || 0).toFixed(2)}/ano
                          </span>
                          {plan.name !== "FREE" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                              Economize ~17%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800/80 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">Limite de QR Codes:</span>
                        <strong className="text-white">
                          {plan.maxQRCodes && plan.maxQRCodes > 9999 ? "Ilimitado" : `${plan.maxQRCodes ?? 5} QRs`}
                        </strong>
                      </div>

                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">QR Codes Dinâmicos:</span>
                        <span className={plan.dynamicQRs ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                          {plan.dynamicQRs ? "✓ Habilitado" : "✗ Bloqueado"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">Métricas & Analytics:</span>
                        <span className={plan.analytics ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                          {plan.analytics ? "✓ Habilitado" : "✗ Bloqueado"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">Exportação SVG/PDF:</span>
                        <span className={plan.exportSvg || plan.exportPdf ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                          {plan.exportSvg || plan.exportPdf ? "✓ Vetorial HD" : "✗ Bloqueado"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">Logotipo Central:</span>
                        <span className={plan.customLogo ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                          {plan.customLogo ? "✓ Customizável" : "✗ Bloqueado"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">Módulo Campanhas:</span>
                        <span className={plan.campaigns ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                          {plan.campaigns ? "✓ Habilitado" : "✗ Bloqueado"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenEditPlan(plan)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-600 hover:text-white text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar Preço & Limites</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ABA 2: MÉTRICAS GERAIS CONSOLIDADAS                                  */}
      {/* ==================================================================== */}
      {activeTab === "metrics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {plans.map((p) => (
              <div
                key={p.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-400">{p.displayName}</span>
                  <span className="text-xs text-emerald-400 font-bold">
                    R$ {p.priceMonth.toFixed(2)}/mês
                  </span>
                </div>
                <div className="text-3xl font-extrabold text-white">
                  {users.filter((u) => (u.plan?.name || "FREE") === p.name).length}
                </div>
                <p className="text-[11px] text-slate-500">
                  Usuários ativos neste plano na plataforma
                </p>
              </div>
            ))}
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Resumo Operacional do SaaS
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-500">Administradores</span>
                <p className="text-xl font-bold text-rose-400">
                  {users.filter((u) => u.role === "ADMIN").length}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-500">Usuários Comuns</span>
                <p className="text-xl font-bold text-white">
                  {users.filter((u) => u.role === "USER").length}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-500">Contas Suspensas</span>
                <p className="text-xl font-bold text-amber-400">
                  {users.filter((u) => u.subscription?.status === "SUSPENDED").length}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-500">QR Codes Ativos</span>
                <p className="text-xl font-bold text-emerald-400">
                  {qrcodes.filter((q) => q.status === "ACTIVE").length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ABA 3: QR CODES GLOBAIS DA PLATAFORMA                                */}
      {/* ==================================================================== */}
      {activeTab === "qrcodes" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Buscar por nome, destino, shortCode ou criador..."
                value={searchQrs}
                onChange={(e) => setSearchQrs(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="text-xs text-slate-400">
              Total listado: <strong className="text-white">{filteredQrs.length}</strong>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">QR Code</th>
                    <th className="py-3.5 px-4 font-semibold">Tipo</th>
                    <th className="py-3.5 px-4 font-semibold">Proprietário</th>
                    <th className="py-3.5 px-4 font-semibold">Destino</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Scans</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Moderação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredQrs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Nenhum QR Code encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredQrs.map((qr) => (
                      <tr key={qr.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-white">
                          <div>{qr.name}</div>
                          {qr.shortCode && (
                            <span className="text-[10px] text-indigo-400 font-mono">
                              /q/{qr.shortCode}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] uppercase font-bold text-slate-300">
                            {qr.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-white font-medium">{qr.user.name}</div>
                          <div className="text-[10px] text-slate-500">{qr.user.email}</div>
                        </td>
                        <td className="py-3.5 px-4 max-w-[200px] truncate text-slate-400 font-mono text-[11px]">
                          {qr.destination}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                          {qr.scanCount}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              qr.status === "ACTIVE"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {qr.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleToggleQrStatus(qr)}
                            disabled={togglingQrId === qr.id}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                              qr.status === "ACTIVE"
                                ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30"
                                : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30"
                            }`}
                          >
                            {qr.status === "ACTIVE" ? "Desativar" : "Ativar"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ABA 4: CAMPANHAS GLOBAIS                                             */}
      {/* ==================================================================== */}
      {activeTab === "campaigns" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Buscar campanha por nome ou criador..."
                value={searchCampaigns}
                onChange={(e) => setSearchCampaigns(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="text-xs text-slate-400">
              Campanhas cadastradas: <strong className="text-white">{filteredCampaigns.length}</strong>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Campanha</th>
                    <th className="py-3.5 px-4 font-semibold">Proprietário</th>
                    <th className="py-3.5 px-4 font-semibold text-center">QRs Vinculados</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">Criada em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Nenhuma campanha cadastrada no momento.
                      </td>
                    </tr>
                  ) : (
                    filteredCampaigns.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-white">
                          <div>{c.name}</div>
                          {c.description && (
                            <div className="text-[11px] text-slate-500">{c.description}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-white font-medium">{c.user.name}</div>
                          <div className="text-[10px] text-slate-500">{c.user.email}</div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-indigo-400">
                          {c._count.qrCodes}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {c.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                          {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ABA 5: LOGS DE AUDITORIA (ActivityLog)                               */}
      {/* ==================================================================== */}
      {activeTab === "logs" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Filtrar logs por descrição, usuário ou ação..."
                value={searchLogs}
                onChange={(e) => setSearchLogs(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-rose-500"
              >
                <option value="ALL">Todas as Ações</option>
                <option value="ADMIN_PLAN_ACTIVATION">Ativação de Plano</option>
                <option value="ADMIN_ROLE_CHANGE">Mudança de Role</option>
                <option value="ADMIN_ACCOUNT_STATUS_CHANGE">Status da Conta</option>
                <option value="ADMIN_ACTIVATE_QR">Ativação de QR</option>
                <option value="ADMIN_DEACTIVATE_QR">Desativação de QR</option>
                <option value="LOGIN">Login</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Data / Hora</th>
                    <th className="py-3.5 px-4 font-semibold">Ação</th>
                    <th className="py-3.5 px-4 font-semibold">Usuário / Autor</th>
                    <th className="py-3.5 px-4 font-semibold">Detalhes do Evento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500">
                        Nenhum log encontrado para o critério selecionado.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          {new Date(l.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-indigo-300 border border-slate-700">
                            {l.action}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-white font-medium">{l.user.name}</div>
                          <div className="text-[10px] text-slate-500">{l.user.email}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">{l.description}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ABA 6: CONFIGURAÇÕES & DIAGNÓSTICO DO SAAS                           */}
      {/* ==================================================================== */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
              <Server className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Infraestrutura & Ambiente Técnico
                </h3>
                <p className="text-xs text-slate-400">
                  Parâmetros de produção e estado dos subsistemas do QR MASTER
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400 font-medium">Banco de Dados</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    PostgreSQL / Supabase (Ativo)
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400 font-medium">Armazenamento de Arquivos</span>
                  <span className="font-bold text-indigo-400">
                    Supabase Storage & Fallback Local
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400 font-medium">Isolamento Multi-Tenant</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    100% no Servidor por userId
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400 font-medium">Proteção de Sessão</span>
                  <span className="font-bold text-white">
                    Cookies HttpOnly + JWT Seguro
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400 font-medium">Rate Limiting de Telemetria</span>
                  <span className="font-bold text-emerald-400">
                    60 scans/minuto por hash LGPD
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400 font-medium">Privilégios Administrativos</span>
                  <span className="font-bold text-rose-400">
                    Restrito a role === &quot;ADMIN&quot; no Servidor
                  </span>
                </div>
              </div>
            </div>

            {/* Card Mercado Pago */}
            <div className="pt-6 border-t border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CreditCard className="w-5 h-5 text-sky-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white">Mercado Pago (Gateway Nacional)</h4>
                    <p className="text-xs text-slate-400">
                      Suporte completo a pagamentos instantâneos via Pix e Cartão de Crédito
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  Pronto para Produção
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400">URL do Webhook Oficial para Cadastrar no Mercado Pago:</span>
                  <div className="flex items-center gap-2">
                    <code className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-sky-300 font-mono text-[11px]">
                      {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/mercadopago
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/api/webhooks/mercadopago`;
                        navigator.clipboard.writeText(url);
                        setCopiedWebhook(true);
                        setTimeout(() => setCopiedWebhook(false), 2000);
                        toast.success("Copiado!", "URL do Webhook copiada para a área de transferência.");
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                      title="Copiar URL do Webhook"
                    >
                      {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  💡 Para ativar as cobranças em tempo real pelo Mercado Pago, basta cadastrar a chave <code className="text-slate-300">MP_ACCESS_TOKEN</code> nas variáveis de ambiente na Vercel.
                </p>
              </div>
            </div>

            {/* Card Manutenção & Limpeza de Dados Demo */}
            <div className="pt-6 border-t border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Trash2 className="w-5 h-5 text-rose-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white">Manutenção & Purga de Registros Demo</h4>
                    <p className="text-xs text-slate-400">
                      Remove dados de demonstração, QR codes de teste e histórico simulado de scans
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-rose-950/40 space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Esta operação varre o banco de dados e remove definitivamente contas de demonstração (ex: <code className="text-slate-400">carlos@qrmaster.com</code>), QR codes marcados como demo e scans gerados artificialmente. Contas reais criadas por usuários (como <strong className="text-white">joaolucas</strong> e administradores) e os planos oficiais são 100% preservados.
                </p>

                <div className="pt-1 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleCleanDemoData}
                    disabled={cleaningDemo}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 hover:text-white text-xs font-bold border border-rose-500/30 transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{cleaningDemo ? "Executando Limpeza..." : "Limpar Dados Não Reais / Demo"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDITAR VALOR E CONFIGURAÇÃO DO PLANO                          */}
      {/* ==================================================================== */}
      {isEditPlanModalOpen && selectedPlanForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Editar Valor e Recursos do Plano</h3>
                  <p className="text-xs text-slate-400">
                    Plano: <strong className="text-white">{selectedPlanForEdit.name}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditPlanModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">
                  Nome de Exibição:
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">
                    Preço Mensal (R$):
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editPriceMonth}
                      onChange={(e) => setEditPriceMonth(Number(e.target.value))}
                      disabled={selectedPlanForEdit.name === "FREE"}
                      required
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold focus:outline-none focus:border-rose-500 disabled:opacity-50"
                    />
                  </div>
                  {selectedPlanForEdit.name === "FREE" && (
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      O plano FREE é sempre gratuito (R$ 0,00).
                    </span>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">
                    Preço Anual (R$):
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editPriceYear}
                      onChange={(e) => setEditPriceYear(Number(e.target.value))}
                      disabled={selectedPlanForEdit.name === "FREE"}
                      required
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold focus:outline-none focus:border-rose-500 disabled:opacity-50"
                    />
                  </div>
                  {selectedPlanForEdit.name === "FREE" ? (
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      O plano FREE não possui cobrança anual.
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-400 mt-1 block">
                      Eq. a R$ {(editPriceYear / 12).toFixed(2)}/mês
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">
                  Limite Máximo de QR Codes:
                </label>
                <input
                  type="number"
                  min="1"
                  value={editMaxQRCodes}
                  onChange={(e) => setEditMaxQRCodes(Number(e.target.value))}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-rose-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Use valores altos como 999999 para plano Ilimitado.
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <span className="block font-semibold text-slate-300 mb-1">
                  Recursos Habilitados no Plano:
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={editDynamicQRs}
                      onChange={(e) => setEditDynamicQRs(e.target.checked)}
                      className="rounded border-slate-700 text-rose-600 focus:ring-rose-500"
                    />
                    <span>QR Codes Dinâmicos</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={editAnalytics}
                      onChange={(e) => setEditAnalytics(e.target.checked)}
                      className="rounded border-slate-700 text-rose-600 focus:ring-rose-500"
                    />
                    <span>Analytics / Métricas</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={editExportSvg}
                      onChange={(e) => setEditExportSvg(e.target.checked)}
                      className="rounded border-slate-700 text-rose-600 focus:ring-rose-500"
                    />
                    <span>Exportação SVG</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={editExportPdf}
                      onChange={(e) => setEditExportPdf(e.target.checked)}
                      className="rounded border-slate-700 text-rose-600 focus:ring-rose-500"
                    />
                    <span>Exportação PDF A4</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={editCustomLogo}
                      onChange={(e) => setEditCustomLogo(e.target.checked)}
                      className="rounded border-slate-700 text-rose-600 focus:ring-rose-500"
                    />
                    <span>Logotipo Customizado</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={editCampaigns}
                      onChange={(e) => setEditCampaigns(e.target.checked)}
                      className="rounded border-slate-700 text-rose-600 focus:ring-rose-500"
                    />
                    <span>Módulo Campanhas</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditPlanModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPlan}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-lg shadow-rose-950 disabled:opacity-50"
                >
                  {savingPlan ? "Salvando..." : "Salvar Preço & Configurações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ATIVAÇÃO MANUAL DE PLANO                                      */}
      {/* ==================================================================== */}
      {isPlanModalOpen && selectedUserForPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Ativação Manual de Plano</h3>
                  <p className="text-xs text-slate-400">
                    Usuário: <strong className="text-white">{selectedUserForPlan.name}</strong> (
                    {selectedUserForPlan.email})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPlanModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleActivatePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Selecione o Plano:
                </label>
                <select
                  value={targetPlanId}
                  onChange={(e) => setTargetPlanId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} — R$ {p.priceMonth.toFixed(2)}/mês
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Duração da Ativação (Dias):
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Canal de Venda / Origem:
                </label>
                <input
                  type="text"
                  value={paymentChannel}
                  onChange={(e) => setPaymentChannel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  placeholder="Ex: Venda Externa via Pix, Parceria, Boca a boca..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Observações de Auditoria (Opcional):
                </label>
                <textarea
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  placeholder="Ex: Comprovante Pix enviado pelo WhatsApp, liberação autorizada."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-lg shadow-rose-950 disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Confirmar Ativação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDITAR STATUS DA CONTA & PAPEL (ROLE)                          */}
      {/* ==================================================================== */}
      {isStatusModalOpen && selectedUserForStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Gerenciar Conta & Papel</h3>
                  <p className="text-xs text-slate-400">
                    Usuário: <strong className="text-white">{selectedUserForStatus.name}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsStatusModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStatusAndRole} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Status da Conta:
                </label>
                <select
                  value={targetAccountStatus}
                  onChange={(e) => setTargetAccountStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                >
                  <option value="ACTIVE">ACTIVE (Conta ativa e liberada)</option>
                  <option value="SUSPENDED">SUSPENDED (Conta suspensa/bloqueada)</option>
                  <option value="CANCELED">CANCELED (Conta cancelada)</option>
                  <option value="PAST_DUE">PAST_DUE (Pagamento pendente)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Papel de Acesso (Role):
                </label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                >
                  <option value="USER">USER (Usuário Comum)</option>
                  <option value="ADMIN">ADMIN (Acesso Administrativo Total)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Nota: O sistema impede automaticamente a remoção do papel do único administrador do SaaS.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-lg shadow-rose-950 disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
