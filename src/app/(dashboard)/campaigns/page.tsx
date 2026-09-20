"use client";

import React, { useState, useEffect } from "react";
import { Megaphone, Plus, Calendar, QrCode, TrendingUp, CheckCircle2, Lock, Sparkles } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/components/ui/Toast";
import { UpgradeModal } from "@/components/UpgradeModal";

interface CampaignItem {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  totalScans: number;
  _count: { qrCodes: number };
}

export default function CampaignsPage() {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadCampaigns = async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const d = await res.json();
        setCampaigns(d.campaigns || []);
        setIsForbidden(false);
      } else if (res.status === 403) {
        setIsForbidden(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, startDate, endDate }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Campanha criada com sucesso!");
        setName("");
        setDescription("");
        setModalOpen(false);
        loadCampaigns();
      } else {
        if (res.status === 403 && data.code === "UPGRADE_REQUIRED") {
          setModalOpen(false);
          setUpgradeModalOpen(true);
        } else {
          toast.error("Erro ao criar campanha", data.error || "Acesso restrito");
        }
      }
    } catch {
      toast.error("Erro ao criar campanha");
    }
  };

  return (
    <div>
      <Header
        title="Campanhas Promocionais"
        subtitle="Agrupe múltiplos QR Codes para mensurar resultados de campanhas sazonais e promoções"
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Gerencie grupos de QR Codes compartilhando métricas em conjunto.
          </p>
          {!isForbidden && (
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Campanha</span>
            </button>
          )}
        </div>

        {isForbidden ? (
          <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-sm space-y-6 my-8">
            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Recurso Exclusivo PRO e BUSINESS
              </span>
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Módulo de Campanhas Promocionais
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
                Agrupe múltiplos QR Codes para mensurar resultados de campanhas sazonais, lançamentos e promoções com métricas consolidadas.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-md shadow-indigo-600/30 transition-all hover:scale-105"
              >
                <Sparkles className="w-4 h-4" />
                <span>Conhecer Planos com Campanhas</span>
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Carregando campanhas...</div>
        ) : campaigns.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
            <Megaphone className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Nenhuma campanha criada ainda
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
              Crie uma campanha como Black Friday ou Lançamento de Verão para associar seus QR Codes.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
            >
              Criar Primeira Campanha
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {campaigns.map((camp) => (
              <div
                key={camp.id}
                className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center shrink-0">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 text-[10px] font-bold">
                    {camp.status === "ACTIVE" ? "Ativa" : "Pausada"}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-base">
                    {camp.name}
                  </h4>
                  {camp.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {camp.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 text-[11px]">QR Codes</span>
                    <p className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">
                      {camp._count?.qrCodes || 0} códigos
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">Total de Scans</span>
                    <p className="font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {camp.totalScans} scans
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Criar Campanha */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Nova Campanha
            </h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome da Campanha
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Black Friday 2026"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Objetivos e metas da campanha"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Data Inicial
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Data Final
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                >
                  Criar Campanha
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
        reason="CAMPAIGNS"
      />
    </div>
  );
}
