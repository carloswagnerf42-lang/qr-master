"use client";

import React, { useState, useEffect } from "react";
import { FolderDown, Download, Trash2, FileText, Image as ImageIcon, Sparkles, Plus, ExternalLink, HardDrive } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";

interface GeneratedFileItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  createdAt: string;
  qrCode?: {
    id: string;
    name: string;
    type: string;
  } | null;
}

export default function FilesPage() {
  const toast = useToast();
  const [files, setFiles] = useState<GeneratedFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");

  const loadFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?fileType=${typeFilter}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error("Erro ao carregar arquivos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [typeFilter]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deseja excluir o arquivo "${name}" do banco de dados e do disco?`)) return;

    try {
      const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Arquivo excluído", "O registro e o arquivo físico foram removidos.");
        loadFiles();
      }
    } catch {
      toast.error("Erro ao excluir arquivo");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const totalBytes = files.reduce((acc, f) => acc + f.fileSize, 0);

  return (
    <div>
      <Header
        title="Arquivos Gerados & Banco Local"
        subtitle="Repositório local de todos os arquivos PNG, SVG e PDF gerados na plataforma"
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Top summary card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Armazenamento Local Persistente
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {files.length} arquivos salvos • {formatBytes(totalBytes)} utilizados em disco local
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="all">Todos os Formatos</option>
              <option value="png">Apenas PNG</option>
              <option value="svg">Apenas SVG</option>
              <option value="pdf">Apenas PDF</option>
            </select>

            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Gerar Novo QR</span>
            </Link>
          </div>
        </div>

        {/* Files Grid / List */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Carregando arquivos salvos...
            </div>
          ) : files.length === 0 ? (
            <div className="py-16 text-center px-4 max-w-md mx-auto space-y-3">
              <FolderDown className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Nenhum arquivo gerado salvo ainda
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sempre que você baixar um QR Code em PNG, SVG ou PDF na tela de criação, uma cópia será automaticamente gravada no banco de dados e no disco local.
              </p>
              <div className="pt-2">
                <Link
                  href="/create"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold inline-block"
                >
                  Criar e Exportar QR Code
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {files.map((file) => {
                const isPdf = file.fileType === "pdf";
                const isSvg = file.fileType === "svg";
                return (
                  <div
                    key={file.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 uppercase ${
                          isPdf
                            ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                            : isSvg
                            ? "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
                            : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400"
                        }`}
                      >
                        {file.fileType}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {file.fileName}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>{formatBytes(file.fileSize)}</span>
                          <span>•</span>
                          <span>{new Date(file.createdAt).toLocaleString("pt-BR")}</span>
                          {file.qrCode && (
                            <>
                              <span>•</span>
                              <span className="text-indigo-500 font-semibold">{file.qrCode.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <a
                        href={file.downloadUrl?.startsWith("http") ? file.downloadUrl : `/api/files/${file.id}/download`}
                        download={file.fileName}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Baixar</span>
                      </a>

                      <button
                        onClick={() => handleDelete(file.id, file.fileName)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Excluir arquivo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
