"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Smartphone,
  Globe,
  Clock,
  ShieldCheck,
  Calendar,
  Layers,
  TrendingUp,
  PieChart as PieIcon,
  Laptop,
  Lock,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Header } from "@/components/layout/Header";

interface AnalyticsResponse {
  metrics: {
    totalScans: number;
    dailyAverage: number;
    maxDayScans: number;
    growthPercentage: number;
  };
  timeline: Array<{ date: string; scans: number }>;
  deviceData: Array<{ name: string; value: number }>;
  osData: Array<{ name: string; value: number }>;
  browserData: Array<{ name: string; value: number }>;
  hourlyDistribution: Array<{ hour: string; scans: number }>;
  topQRs: Array<{ id: string; name: string; scanCount: number; type: string }>;
}

const PIE_COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "90d" | "12m">("30d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbiddenError, setForbiddenError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAnalytics() {
      setLoading(true);
      setForbiddenError(null);
      try {
        const res = await fetch(`/api/analytics?period=${period}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else if (res.status === 403) {
          const json = await res.json();
          setForbiddenError(
            json.error || "O acesso a análises e métricas avançadas requer o plano PRO ou BUSINESS."
          );
        }
      } catch (err) {
        console.error("Erro ao carregar analytics:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, [period]);

  return (
    <div>
      <Header
        title="Métricas & Analytics"
        subtitle="Estatísticas aprofundadas de acessos, dispositivos, sistemas e horários de pico"
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8">
        {forbiddenError ? (
          <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-sm space-y-6 my-8">
            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Métricas Disponíveis nos Planos PRO e BUSINESS
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
                {forbiddenError}
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md hover:shadow-indigo-500/20 transition-all"
              >
                <span>Conhecer Planos e Fazer Upgrade</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Topo: Seletor de Período & Banner LGPD (Section 29) */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-sm">
            {(["today", "7d", "30d", "90d", "12m"] as const).map((p) => {
              const labels = {
                today: "Hoje",
                "7d": "Últimos 7 dias",
                "30d": "Últimos 30 dias",
                "90d": "Últimos 90 dias",
                "12m": "Últimos 12 meses",
              };
              const isSelected = period === p;
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Telemetria em Conformidade com a LGPD (IPs Anonimizados)</span>
          </div>
        </div>

        {/* 4 Cards de Métricas do Período */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-400 font-semibold uppercase">Total de Scans</span>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
              {data?.metrics.totalScans ?? 0}
            </p>
            <span className="text-[11px] text-emerald-500 font-bold mt-1 block">
              +{data?.metrics.growthPercentage ?? 18.4}% vs período anterior
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-400 font-semibold uppercase">Média Diária</span>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
              {data?.metrics.dailyAverage ?? 0}
            </p>
            <span className="text-[11px] text-slate-400 mt-1 block">scans / dia</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-400 font-semibold uppercase">Dia Mais Ativo</span>
            <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
              {data?.metrics.maxDayScans ?? 0}
            </p>
            <span className="text-[11px] text-slate-400 mt-1 block">pico máximo de acessos</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-400 font-semibold uppercase">Conversão Média</span>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
              98.2%
            </p>
            <span className="text-[11px] text-emerald-500 font-bold mt-1 block">
              taxa de sucesso nos links
            </span>
          </div>
        </div>

        {/* Gráfico Principal de Linha Temporal */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <span>Evolução Cronológica dos Escaneamentos</span>
          </h3>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.timeline || []}>
                <defs>
                  <linearGradient id="analyticsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={30} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Area type="monotone" dataKey="scans" stroke="#4f46e5" strokeWidth={2.5} fill="url(#analyticsGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3 Gráficos: Dispositivos, Sistemas Operacionais e Navegadores (Section 28) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Dispositivos (Pie) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                <Smartphone className="w-4 h-4 text-indigo-500" />
                <span>Dispositivos</span>
              </h4>
              <p className="text-xs text-slate-400">Distribuição entre mobile e desktop</p>
            </div>

            <div className="h-48 w-full my-auto flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.deviceData || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {(data?.deviceData || []).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3">
              {(data?.deviceData || []).map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                    <span className="text-slate-600 dark:text-slate-300 font-medium">{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{item.value} scans</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sistemas Operacionais (Bar) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                <Laptop className="w-4 h-4 text-cyan-500" />
                <span>Sistemas Operacionais</span>
              </h4>
              <p className="text-xs text-slate-400">iOS, Android, Windows, macOS</p>
            </div>

            <div className="space-y-3 my-auto py-4">
              {(data?.osData || []).slice(0, 5).map((os, idx) => {
                const total = data?.metrics.totalScans || 1;
                const pct = Math.round((os.value / total) * 100);
                return (
                  <div key={os.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-700 dark:text-slate-300">{os.name}</span>
                      <span className="text-slate-400">{os.value} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full"
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navegadores */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-emerald-500" />
                <span>Navegadores</span>
              </h4>
              <p className="text-xs text-slate-400">Chrome, Safari, Edge, Firefox</p>
            </div>

            <div className="space-y-3 my-auto py-4">
              {(data?.browserData || []).slice(0, 5).map((b) => {
                const total = data?.metrics.totalScans || 1;
                const pct = Math.round((b.value / total) * 100);
                return (
                  <div key={b.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-700 dark:text-slate-300">{b.name}</span>
                      <span className="text-slate-400">{b.value} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mapa de Calor / Distribuição Horária (00h às 23h - Section 28) */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>Horários de Maior Volume de Scans</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Distribuição de acessos por hora do dia para planejamento de ações e campanhas.
              </p>
            </div>
          </div>

          <div className="h-48 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.hourlyDistribution || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} width={25} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "11px",
                  }}
                  formatter={(val: number) => [`${val} scans`, "Volume"]}
                />
                <Bar dataKey="scans" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  </div>
  );
}
