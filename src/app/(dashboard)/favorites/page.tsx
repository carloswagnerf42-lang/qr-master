"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Star, QrCode, Plus, ExternalLink, Download } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { QRCodeRenderer } from "@/components/qr/QRCodeRenderer";
import { getAppUrl } from "@/lib/app-url";

interface QRItem {
  id: string;
  name: string;
  type: string;
  isDynamic: boolean;
  shortCode: string | null;
  destination: string;
  styleConfig: string;
  scanCount: number;
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<QRItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFavs() {
      try {
        const res = await fetch("/api/qr?favorite=true");
        if (res.ok) {
          const d = await res.json();
          setFavorites(d.qrCodes || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadFavs();
  }, []);

  return (
    <div>
      <Header
        title="QR Codes Favoritos"
        subtitle="Acesse rapidamente os códigos mais importantes do seu dia a dia"
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Carregando favoritos...</div>
        ) : favorites.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 max-w-md mx-auto space-y-3">
            <Star className="w-10 h-10 text-amber-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Nenhum favorito ainda
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Você pode favoritar QR Codes na lista de Meus QR Codes clicando no ícone de estrela.
            </p>
            <div className="pt-2">
              <Link
                href="/my-qrs"
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold inline-block"
              >
                Ir para Meus QR Codes
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map((qr) => {
              let parsed = {};
              try {
                parsed = JSON.parse(qr.styleConfig);
              } catch {
                parsed = {};
              }

              const origin = getAppUrl();
              const finalUrl = qr.isDynamic && qr.shortCode ? `${origin}/q/${qr.shortCode}` : qr.destination;

              return (
                <div
                  key={qr.id}
                  className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="capitalize text-xs font-bold text-slate-500">
                      {qr.type} • {qr.isDynamic ? "Dinâmico" : "Estático"}
                    </span>
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                    <QRCodeRenderer value={finalUrl} styleConfig={parsed} size={150} />
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                      {qr.name}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                      {finalUrl}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      {qr.scanCount} scans
                    </span>
                    <Link
                      href="/my-qrs"
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                    >
                      Gerenciar →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
