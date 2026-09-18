"use client";

import React, { useState, useEffect } from "react";
import { Trash2, RotateCcw, AlertTriangle, QrCode } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/components/ui/Toast";

interface TrashItem {
  id: string;
  name: string;
  type: string;
  destination: string;
  deletedAt: string;
  scanCount: number;
}

export default function TrashPage() {
  const toast = useToast();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrash = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/qr?trash=true");
      if (res.ok) {
        const d = await res.json();
        setItems(d.qrCodes || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const handleRestore = async (id: string, name: string) => {
    try {
      const res = await fetch("/api/qr/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        toast.success("Restaurado!", `O QR Code "${name}" voltou para sua lista ativa.`);
        loadTrash();
      }
    } catch {
      toast.error("Erro ao restaurar");
    }
  };

  const handlePermanentDelete = async (id: string, name: string) => {
    if (!confirm(`ATENÇÃO: Esta ação é irreversível. Deseja excluir permanentemente "${name}"?`)) return;

    try {
      const res = await fetch(`/api/qr/${id}?permanent=true`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Excluído definitivamente", "O registro e seus dados foram apagados.");
        loadTrash();
      }
    } catch {
      toast.error("Erro ao excluir permanentemente");
    }
  };

  return (
    <div>
      <Header
        title="Lixeira"
        subtitle="Gerencie códigos removidos. Restaure-os para sua conta ou remova definitivamente"
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center gap-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
          <span>
            Os QR Codes na lixeira ficam desativados e não redirecionam escaneamentos. Você pode restaurá-los a qualquer momento com todos os históricos preservados.
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Carregando lixeira...</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Trash2 className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold">Sua lixeira está vazia</p>
              <p className="text-xs">Nenhum QR Code foi excluído recentemente.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        Excluído em: {new Date(item.deletedAt).toLocaleDateString("pt-BR")} • {item.scanCount} scans
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleRestore(item.id, item.name)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Restaurar</span>
                    </button>

                    <button
                      onClick={() => handlePermanentDelete(item.id, item.name)}
                      className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Definitivamente</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
