"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  Plus,
  QrCode,
  Copy,
  ExternalLink,
  MoreVertical,
  Trash2,
  Copy as DuplicateIcon,
  ToggleLeft,
  ToggleRight,
  BarChart2,
  Download,
  Star,
  ChevronLeft,
  ChevronRight,
  Check,
  Edit,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { QRCodeRenderer } from "@/components/qr/QRCodeRenderer";
import { downloadPng, downloadSvg, downloadPdf } from "@/lib/export";
import { getAppUrl } from "@/lib/app-url";
import { useToast } from "@/components/ui/Toast";
import { UpgradeModal, UpgradeReason } from "@/components/UpgradeModal";

interface QRItem {
  id: string;
  name: string;
  description: string | null;
  type: string;
  isDynamic: boolean;
  shortCode: string | null;
  destination: string;
  status: string;
  favorite: boolean;
  scanCount: number;
  lastScanAt: string | null;
  createdAt: string;
  styleConfig: string;
  category?: { id: string; name: string; color: string } | null;
  campaign?: { id: string; name: string } | null;
}

export default function MyQRsPage() {
  const router = useRouter();
  const toast = useToast();

  const [qrs, setQrs] = useState<QRItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Categories and Campaigns for dropdowns
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);

  // Selected QR for Preview / Download Modal
  const [activeModalQr, setActiveModalQr] = useState<QRItem | null>(null);

  // Edit QR Modal state
  const [editingQr, setEditingQr] = useState<QRItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editDestination, setEditDestination] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editCampaignId, setEditCampaignId] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("SVG_EXPORT");

  useEffect(() => {
    async function loadPermissions() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const d = await res.json();
          if (d.permissions) setPermissions(d.permissions);
        }
      } catch (err) {
        console.error("Erro ao carregar permissões:", err);
      }
    }
    loadPermissions();
  }, []);

  const loadQRs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        categoryId: categoryFilter,
        status: statusFilter,
        isDynamic: typeFilter === "dynamic" ? "true" : typeFilter === "static" ? "false" : "all",
        sortBy,
        page: page.toString(),
        limit: "8",
      });

      const res = await fetch(`/api/qr?${params}`);
      if (res.ok) {
        const data = await res.json();
        setQrs(data.qrCodes || []);
        setTotalPages(data.pagination.totalPages || 1);
        setTotalCount(data.pagination.total || 0);
      }
    } catch (err) {
      console.error("Erro ao carregar lista de QR Codes:", err);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, statusFilter, typeFilter, sortBy, page]);

  useEffect(() => {
    loadQRs();
  }, [loadQRs]);

  useEffect(() => {
    async function fetchFilterOptions() {
      try {
        const [catsRes, campsRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/campaigns"),
        ]);
        if (catsRes.ok) {
          const d = await catsRes.json();
          setCategories(d.categories || []);
        }
        if (campsRes.ok) {
          const d = await campsRes.json();
          setCampaigns(d.campaigns || []);
        }
      } catch (e) {
        console.error("Erro ao carregar opções de filtro e edição:", e);
      }
    }
    fetchFilterOptions();
  }, []);

  const handleOpenEdit = (qr: QRItem) => {
    setEditingQr(qr);
    setEditName(qr.name || "");
    setEditDestination(qr.destination || "");
    setEditDescription(qr.description || "");
    setEditCategoryId(qr.category?.id || "");
    setEditCampaignId(qr.campaign?.id || "");
    setEditStatus(qr.status || "ACTIVE");
    setEditError("");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQr) return;
    if (!editName.trim()) {
      setEditError("O nome do QR Code é obrigatório.");
      return;
    }
    if (!editDestination.trim()) {
      setEditError("O destino do QR Code é obrigatório.");
      return;
    }

    setIsSavingEdit(true);
    setEditError("");
    try {
      const payload = {
        name: editName.trim(),
        destination: editDestination.trim(),
        description: editDescription.trim() || null,
        categoryId: editCategoryId || null,
        campaignId: editCampaignId || null,
        status: editStatus,
      };

      const res = await fetch(`/api/qr/${editingQr.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Falha ao atualizar QR Code.");
        return;
      }

      toast.success(
        "QR Code Atualizado!",
        editingQr.isDynamic && editingQr.shortCode
          ? `Destino alterado com sucesso mantendo o mesmo shortCode (/q/${editingQr.shortCode}).`
          : "Alterações salvas com sucesso."
      );

      setEditingQr(null);
      loadQRs();
    } catch (err: any) {
      setEditError(err?.message || "Erro de conexão ao salvar alterações.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const res = await fetch(`/api/qr/${id}/toggle`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setQrs((prev) =>
          prev.map((q) => (q.id === id ? { ...q, status: data.status } : q))
        );
        toast.success("Status atualizado", `QR Code agora está ${data.status === "ACTIVE" ? "Ativo" : "Pausado"}.`);
      }
    } catch {
      toast.error("Erro", "Não foi possível alternar o status.");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/qr/${id}/duplicate`, { method: "POST" });
      if (res.ok) {
        toast.success("Duplicado com sucesso", "Uma cópia foi adicionada à lista.");
        loadQRs();
      }
    } catch {
      toast.error("Erro", "Não foi possível duplicar o QR Code.");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deseja mover o QR Code "${name}" para a lixeira?`)) return;

    try {
      const res = await fetch(`/api/qr/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Movido para a lixeira", "Você pode restaurá-lo na aba Lixeira a qualquer momento.");
        loadQRs();
      }
    } catch {
      toast.error("Erro", "Não foi possível excluir.");
    }
  };

  const handleCopyLink = (qr: QRItem) => {
    const origin = getAppUrl();
    const url = qr.isDynamic && qr.shortCode ? `${origin}/q/${qr.shortCode}` : qr.destination;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!", "URL copiada para a área de transferência.");
  };

  return (
    <div>
      <Header
        title="Meus QR Codes"
        subtitle={`Gerenciamento completo de todos os seus ${totalCount} códigos cadastrados`}
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Barra Superior: Busca & Filtros (Sections 22 & 23) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            {/* Input de Busca */}
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Pesquisar por nome, URL, tipo ou shortcode..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-colors shrink-0 w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4" />
              <span>Criar QR Code</span>
            </Link>
          </div>

          {/* Filtros em Linha */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            {/* Categoria */}
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="w-full min-w-0 truncate px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="all">Todas Categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Status */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full min-w-0 truncate px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="all">Todos os Status</option>
              <option value="ACTIVE">Apenas Ativos</option>
              <option value="INACTIVE">Apenas Inativos</option>
            </select>

            {/* Tipo */}
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full min-w-0 truncate px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="all">Estáticos e Dinâmicos</option>
              <option value="dynamic">Apenas Dinâmicos</option>
              <option value="static">Apenas Estáticos</option>
            </select>

            {/* Ordenação */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="w-full min-w-0 truncate px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="newest">Mais recentes</option>
              <option value="oldest">Mais antigos</option>
              <option value="mostScanned">Mais acessados</option>
              <option value="leastScanned">Menos acessados</option>
              <option value="nameAsc">Nome A-Z</option>
              <option value="nameDesc">Nome Z-A</option>
            </select>
          </div>
        </div>

        {/* Tabela de QR Codes (Section 21) */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Carregando seus QR Codes...
            </div>
          ) : qrs.length === 0 ? (
            /* Estado Vazio (Section 38) */
            <div className="py-16 px-4 text-center max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Nenhum QR Code encontrado
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Você ainda não possui nenhum QR Code correspondente aos filtros selecionados. Crie seu primeiro código agora!
              </p>
              <div className="pt-2">
                <Link
                  href="/create"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Criar Primeiro QR Code</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Layout Desktop: Tabela completa (≥ 768px) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4 w-16">Preview</th>
                      <th className="py-3 px-4">Nome & Destino</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Categoria</th>
                      <th className="py-3 px-4 text-center">Scans</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Criado em</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {qrs.map((qr) => {
                      let parsedStyle = {};
                      try {
                        parsedStyle = JSON.parse(qr.styleConfig);
                      } catch {
                        parsedStyle = {};
                      }

                      const origin = getAppUrl();
                      const isVCard = qr.type === "contact" || /^BEGIN:VCARD/i.test(qr.destination || "");
                      const dynamicUrl = !isVCard && qr.isDynamic && qr.shortCode ? `${origin}/q/${qr.shortCode}` : null;
                      const finalDest = dynamicUrl || qr.destination;

                      return (
                        <tr
                          key={qr.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Preview miniatura */}
                          <td className="py-3 px-4">
                            <button
                              onClick={() => setActiveModalQr(qr)}
                              className="w-11 h-11 p-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center hover:scale-105 transition-transform"
                              title="Clique para ampliar e baixar"
                            >
                              <QRCodeRenderer
                                value={finalDest}
                                styleConfig={{ ...parsedStyle, frame: "none" }}
                                size={36}
                              />
                            </button>
                          </td>

                          {/* Nome & Destino */}
                          <td className="py-3 px-4 max-w-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 dark:text-white truncate">
                                {qr.name}
                              </span>
                              {qr.isDynamic && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
                                  DINÂMICO
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5 flex items-center gap-1.5">
                              {qr.isDynamic && qr.shortCode ? (
                                <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1 truncate">
                                  /q/{qr.shortCode}
                                  <span className="text-slate-400 font-sans text-[10px] truncate max-w-[140px]">
                                    → {qr.destination}
                                  </span>
                                </span>
                              ) : (
                                <span className="truncate">{qr.destination}</span>
                              )}
                            </div>
                          </td>

                          {/* Tipo */}
                          <td className="py-3 px-4">
                            <span className="capitalize font-semibold text-slate-700 dark:text-slate-300">
                              {qr.type}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {qr.isDynamic ? "Dinâmico" : "Estático"}
                            </span>
                          </td>

                          {/* Categoria */}
                          <td className="py-3 px-4">
                            {qr.category ? (
                              <span
                                className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold"
                                style={{
                                  backgroundColor: `${qr.category.color}20`,
                                  color: qr.category.color,
                                }}
                              >
                                {qr.category.name}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Scans */}
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white">
                              {qr.scanCount}
                            </span>
                          </td>

                          {/* Status (Ativo / Inativo toggle) */}
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleToggleStatus(qr.id)}
                              className="flex items-center gap-1.5 text-xs font-semibold"
                            >
                              {qr.status === "ACTIVE" ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                  Ativo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-slate-400">
                                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                                  Pausado
                                </span>
                              )}
                            </button>
                          </td>

                          {/* Criado em */}
                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            {new Date(qr.createdAt).toLocaleDateString("pt-BR")}
                          </td>

                          {/* Ações */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Editar QR Code */}
                              <button
                                onClick={() => handleOpenEdit(qr)}
                                className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:scale-105 transition-all font-semibold flex items-center gap-1"
                                title="Editar QR Code (Alterar Destino e Nome)"
                              >
                                <Edit className="w-4 h-4" />
                                <span className="hidden xl:inline text-[11px]">Editar</span>
                              </button>

                              {/* Copiar Link */}
                              <button
                                onClick={() => handleCopyLink(qr)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Copiar link"
                              >
                                <Copy className="w-4 h-4" />
                              </button>

                              {/* Ver Preview & Baixar */}
                              <button
                                onClick={() => setActiveModalQr(qr)}
                                className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                                title="Visualizar e Baixar"
                              >
                                <Download className="w-4 h-4" />
                              </button>

                              {/* Duplicar */}
                              <button
                                onClick={() => handleDuplicate(qr.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Duplicar"
                              >
                                <DuplicateIcon className="w-4 h-4" />
                              </button>

                              {/* Excluir (Lixeira) */}
                              <button
                                onClick={() => handleDelete(qr.id, qr.name)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                title="Mover para lixeira"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Layout Mobile: Cards táteis sem scroll horizontal (< 768px) */}
              <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                {qrs.map((qr) => {
                  let parsedStyle = {};
                  try {
                    parsedStyle = JSON.parse(qr.styleConfig);
                  } catch {
                    parsedStyle = {};
                  }

                  const origin = getAppUrl();
                  const isVCard = qr.type === "contact" || /^BEGIN:VCARD/i.test(qr.destination || "");
                  const dynamicUrl = !isVCard && qr.isDynamic && qr.shortCode ? `${origin}/q/${qr.shortCode}` : null;
                  const finalDest = dynamicUrl || qr.destination;

                  return (
                    <div
                      key={qr.id}
                      className="p-4 space-y-3 bg-white dark:bg-slate-900 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-850"
                    >
                      {/* Topo do Card: Preview + Nome, Badges e Destino */}
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Preview miniatura tátil (44x44px) */}
                        <button
                          onClick={() => setActiveModalQr(qr)}
                          className="w-11 h-11 p-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
                          title="Clique para ampliar e baixar"
                          aria-label={`Visualizar QR Code de ${qr.name}`}
                        >
                          <QRCodeRenderer
                            value={finalDest}
                            styleConfig={{ ...parsedStyle, frame: "none" }}
                            size={36}
                          />
                        </button>

                        {/* Nome, Badge e Destino */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[200px] xs:max-w-none">
                              {qr.name}
                            </h4>
                            {qr.isDynamic ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
                                DINÂMICO
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                                ESTÁTICO
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                            {qr.isDynamic && qr.shortCode ? (
                              <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1 truncate">
                                /q/{qr.shortCode}
                                <span className="text-slate-400 font-sans text-[10px] truncate">
                                  → {qr.destination}
                                </span>
                              </span>
                            ) : (
                              <span className="truncate">{qr.destination}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Metadados / Informações: Scans, Status, Categoria, Data */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                        {/* Status Toggle */}
                        <button
                          onClick={() => handleToggleStatus(qr.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold shrink-0 py-1"
                          aria-label={`Alterar status de ${qr.name}`}
                        >
                          {qr.status === "ACTIVE" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400">
                              <span className="w-2 h-2 rounded-full bg-slate-400" />
                              Pausado
                            </span>
                          )}
                        </button>

                        {/* Metadados à direita: Categoria (se houver), Scans e Data */}
                        <div className="flex items-center gap-2 overflow-hidden shrink-0">
                          {qr.category && (
                            <span
                              className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold truncate max-w-[90px]"
                              style={{
                                backgroundColor: `${qr.category.color}20`,
                                color: qr.category.color,
                              }}
                            >
                              {qr.category.name}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white text-[11px]">
                            {qr.scanCount} scans
                          </span>
                          <span className="text-slate-400 text-[10px] hidden xs:inline">
                            {new Date(qr.createdAt).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>

                      {/* Barra de Ações Táteis: Editar + 4 Botões Secundários */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {/* Botão Primário: Editar */}
                        <button
                          onClick={() => handleOpenEdit(qr)}
                          className="flex-1 py-2 px-3 rounded-xl text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          <span>Editar</span>
                        </button>

                        {/* Copiar Link */}
                        <button
                          onClick={() => handleCopyLink(qr)}
                          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80"
                          title="Copiar link"
                          aria-label="Copiar link"
                        >
                          <Copy className="w-4 h-4" />
                        </button>

                        {/* Ver Preview & Baixar */}
                        <button
                          onClick={() => setActiveModalQr(qr)}
                          className="p-2 rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-800/50"
                          title="Visualizar e Baixar"
                          aria-label="Visualizar e Baixar"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        {/* Duplicar */}
                        <button
                          onClick={() => handleDuplicate(qr.id)}
                          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80"
                          title="Duplicar"
                          aria-label="Duplicar"
                        >
                          <DuplicateIcon className="w-4 h-4" />
                        </button>

                        {/* Excluir (Lixeira) */}
                        <button
                          onClick={() => handleDelete(qr.id, qr.name)}
                          className="p-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-800/50"
                          title="Mover para lixeira"
                          aria-label="Mover para lixeira"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Página {page} de {totalPages} ({totalCount} itens no total)
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE PREVIEW E DOWNLOAD DETALHADO */}
      {activeModalQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in-50">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {activeModalQr.name}
                </h3>
                <p className="text-xs text-slate-400 capitalize">
                  {activeModalQr.type} • {activeModalQr.isDynamic ? "Dinâmico" : "Estático"} • {activeModalQr.scanCount} escaneamentos
                </p>
              </div>
              <button
                onClick={() => setActiveModalQr(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* QR Preview Central */}
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
              <QRCodeRenderer
                id={`modal-qr-${activeModalQr.id}`}
                value={
                  activeModalQr.type === "contact" || /^BEGIN:VCARD/i.test(activeModalQr.destination || "")
                    ? activeModalQr.destination
                    : activeModalQr.isDynamic && activeModalQr.shortCode
                    ? `${getAppUrl()}/q/${activeModalQr.shortCode}`
                    : activeModalQr.destination
                }
                styleConfig={JSON.parse(activeModalQr.styleConfig || "{}")}
                size={220}
              />
            </div>

            {/* Botões de Exportação */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Opções de Download:
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={async () => {
                    await downloadPng(`modal-qr-${activeModalQr.id}`, 1024, `${activeModalQr.name}.png`);
                    toast.success("Download PNG", "Imagem PNG em 1024px gerada com sucesso.");
                  }}
                  className="py-2 px-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition-opacity hover:opacity-90"
                >
                  Baixar PNG
                </button>
                <button
                  onClick={() => {
                    if (permissions && permissions.export_svg === false) {
                      setUpgradeReason("SVG_EXPORT");
                      setUpgradeModalOpen(true);
                      return;
                    }
                    downloadSvg(`modal-qr-${activeModalQr.id}`, `${activeModalQr.name}.svg`);
                    toast.success("Download SVG", "Arquivo SVG vetorial baixado.");
                  }}
                  className="py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5"
                >
                  <span>Baixar SVG</span>
                  {permissions && permissions.export_svg === false && (
                    <span className="px-1 py-0.2 rounded text-[8px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      PRO
                    </span>
                  )}
                </button>
                <button
                  onClick={async () => {
                    if (permissions && permissions.export_pdf === false) {
                      setUpgradeReason("PDF_EXPORT");
                      setUpgradeModalOpen(true);
                      return;
                    }
                    await downloadPdf(`modal-qr-${activeModalQr.id}`, activeModalQr.name, "Aponte a câmera para escanear", `${activeModalQr.name}.pdf`);
                    toast.success("Download PDF", "Documento PDF para impressão baixado.");
                  }}
                  className="py-2 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 flex items-center justify-center gap-1.5"
                >
                  <span>Baixar PDF</span>
                  {permissions && permissions.export_pdf === false && (
                    <span className="px-1 py-0.2 rounded text-[8px] font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      PRO
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE QR CODE */}
      {editingQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in-50">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Edit className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {editingQr.isDynamic ? "Editar QR Code Dinâmico" : "Editar QR Code"}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {editingQr.isDynamic && editingQr.shortCode
                    ? `Código /q/${editingQr.shortCode} • Preserva a mesma imagem do QR Code`
                    : `Tipo: ${editingQr.type} • Estático`}
                </p>
              </div>
              <button
                onClick={() => setEditingQr(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Aviso informativo de preservação do QR Dinâmico */}
            {editingQr.isDynamic && editingQr.shortCode ? (
              <div className="p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 text-xs text-indigo-950 dark:text-indigo-200 flex items-start gap-2.5">
                <span className="text-base">⚡</span>
                <div className="space-y-1">
                  <strong className="block font-bold">Preservação Total do QR Code Impresso:</strong>
                  <p>
                    O código <code className="font-mono font-bold text-indigo-700 dark:text-indigo-300">/q/{editingQr.shortCode}</code> e a imagem física do QR Code <strong>NÃO MUDAM</strong>. Ao alterar a URL de destino abaixo, todos os materiais já impressos e acessos redirecionarão instantaneamente para o novo endereço!
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5">
                <span className="text-base">ℹ️</span>
                <div className="space-y-1">
                  <strong className="block font-bold">QR Code Estático:</strong>
                  <p>
                    Este QR Code grava o destino diretamente nos pixels da imagem. A alteração aqui atualiza seu acervo no painel, mas caso o QR já tenha sido impresso fisicamente, será necessário baixar e imprimir a nova imagem.
                  </p>
                </div>
              </div>
            )}

            {/* Alerta de erro da API */}
            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {editError}
              </div>
            )}

            {/* Formulário de Edição */}
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome de Identificação *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex: Cardápio Principal ou Promoção de Verão"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  URL / Endereço de Destino *
                </label>
                <input
                  type="text"
                  required
                  value={editDestination}
                  onChange={(e) => setEditDestination(e.target.value)}
                  placeholder="https://seusite.com.br/novo-destino ou wa.me/5511..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Endereço final completo para onde o escaneamento será direcionado.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Anotações internas sobre a finalidade deste QR Code..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Categoria */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Categoria
                  </label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Campanha */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Campanha
                  </label>
                  <select
                    value={editCampaignId}
                    onChange={(e) => setEditCampaignId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">Sem campanha</option>
                    {campaigns.map((camp) => (
                      <option key={camp.id} value={camp.id}>
                        {camp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-semibold"
                  >
                    <option value="ACTIVE">🟢 Ativo</option>
                    <option value="INACTIVE">⚪ Pausado</option>
                  </select>
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingQr(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
                >
                  {isSavingEdit ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Upgrade Contextual */}
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        reason={upgradeReason}
      />
    </div>
  );
}
