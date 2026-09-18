"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  QrCode,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Clock,
  ArrowUpRight,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Layers,
  Activity,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Header } from "@/components/layout/Header";

interface DashboardData {
  userName: string;
  cards: {
    totalQRs: { value: number; change: string; trend: string };
    activeQRs: { value: number; change: string; trend: string };
    totalScans: { value: number; change: string; trend: string };
    scansToday: { value: number; change: string; trend: string };
    scans7Days: { value: number; change: string; trend: string };
    scans30Days: { value: number; change: string; trend: string };
  };
  topQRs: Array<{
    id: string;
    name: string;
    type: string;
    scanCount: number;
    status: string;
    lastScanAt: string | null;
    isDynamic: boolean;
    shortCode: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    description: string;
    createdAt: string;
  }>;
}

interface AnalyticsData {
  metrics: {
    totalScans: number;
    dailyAverage: number;
    maxDayScans: number;
    growthPercentage: number;
  };
  timeline: Array<{ date: string; scans: number }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [chartData, setChartData] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "90d" | "12m">("30d");
  const [loading, setLoading] = useState(true);

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  useEffect(() => {
    async function loadDashboard() {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Erro ao carregar dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  useEffect(() => {
    async function loadChart() {
      try {
        const res = await fetch(`/api/analytics?period=${period}`);
        if (res.ok) {
          const json = await res.json();
          setChartData(json);
        }
      } catch (err) {
        console.error("Erro ao carregar gráfico:", err);
      }
    }
    loadChart();
  }, [period]);

  const firstName = data?.userName ? data.userName.split(" ")[0] : "Carlos";

  return (
    <div>
      <Header
        title="Dashboard Geral"
        subtitle="Visão consolidada dos seus QR Codes e métricas de desempenho"
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8">
        {/* Top Greeting & Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-900/10 via-purple-900/5 to-transparent p-6 rounded-2xl border border-indigo-100 dark:border-slate-800/80">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Painel em Tempo Real</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {greeting}, {firstName} 👋
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Aqui está o resumo atualizado dos seus QR Codes e escaneamentos.
            </p>
          </div>

          <Link
            href="/create"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Criar QR Code</span>
          </Link>
        </div>

        {/* 6 KPI Cards (Section 6) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {/* Card 1: Total de QR Codes */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total de QR Codes
              </span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <QrCode className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data?.cards.totalQRs.value ?? (loading ? "..." : 0)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{data?.cards.totalQRs.change ?? "+2 este mês"}</span>
            </div>
          </div>

          {/* Card 2: QR Codes Ativos */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                QR Codes Ativos
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data?.cards.activeQRs.value ?? (loading ? "..." : 0)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
              <span>{data?.cards.activeQRs.change ?? "100% operacionais"}</span>
            </div>
          </div>

          {/* Card 3: Total de Escaneamentos */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total de Escaneamentos
              </span>
              <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data?.cards.totalScans.value?.toLocaleString("pt-BR") ?? (loading ? "..." : 0)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{data?.cards.totalScans.change ?? "+14.2% vs mês anterior"}</span>
            </div>
          </div>

          {/* Card 4: Escaneamentos Hoje */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Escaneamentos Hoje
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data?.cards.scansToday.value ?? (loading ? "..." : 0)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{data?.cards.scansToday.change ?? "+8% vs ontem"}</span>
            </div>
          </div>

          {/* Card 5: Últimos 7 Dias */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Últimos 7 Dias
              </span>
              <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data?.cards.scans7Days.value ?? (loading ? "..." : 0)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{data?.cards.scans7Days.change ?? "+19.5% vs semana anterior"}</span>
            </div>
          </div>

          {/* Card 6: Últimos 30 Dias */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Últimos 30 Dias
              </span>
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data?.cards.scans30Days.value ?? (loading ? "..." : 0)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{data?.cards.scans30Days.change ?? "+24.8% no período"}</span>
            </div>
          </div>
        </div>

        {/* Gráfico Interativo de Escaneamentos (Section 7) */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Volume de Escaneamentos
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Acompanhe o engajamento e a curva de acessos em tempo real.
              </p>
            </div>

            {/* Filtros de Período */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium self-start sm:self-auto">
              {(["today", "7d", "30d", "90d", "12m"] as const).map((p) => {
                const labels = {
                  today: "Hoje",
                  "7d": "7 dias",
                  "30d": "30 dias",
                  "90d": "90 dias",
                  "12m": "12 meses",
                };
                const isSelected = period === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      isSelected
                        ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {labels[p]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Total no período</p>
              <p className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                {chartData?.metrics.totalScans ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Média diária</p>
              <p className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                {chartData?.metrics.dailyAverage ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Pico em um dia</p>
              <p className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
                {chartData?.metrics.maxDayScans ?? 0} scans
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Comparação período</p>
              <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                <ArrowUpRight className="w-4 h-4" />
                <span>+{chartData?.metrics.growthPercentage ?? 18.4}%</span>
              </p>
            </div>
          </div>

          {/* Recharts Area */}
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData?.timeline || []}>
                <defs>
                  <linearGradient id="scansGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.95)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#fff",
                    fontSize: "12px",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
                  }}
                  formatter={(value: number) => [`${value} escaneamentos`, "Scans"]}
                  labelFormatter={(label) => `Data: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="scans"
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#scansGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2 Colunas Inferiores: QR Codes Mais Acessados + Atividade Recente */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Seção 8: QR Codes Mais Acessados (2/3 da largura) */}
          <div className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  QR Codes mais acessados
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Os códigos com maior número de interações registradas.
                </p>
              </div>

              <Link
                href="/my-qrs"
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
              >
                <span>Ver todos</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.topQRs.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  Nenhum QR Code registrado ainda.
                </div>
              ) : (
                data?.topQRs.map((qr) => (
                  <div
                    key={qr.id}
                    className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {qr.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                          <span className="capitalize">{qr.type}</span>
                          <span>•</span>
                          <span>{qr.isDynamic ? "Dinâmico" : "Estático"}</span>
                          {qr.shortCode && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-indigo-500">/q/{qr.shortCode}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-block px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                        {qr.scanCount} scans
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {qr.status === "ACTIVE" ? "Ativo" : "Pausado"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Seção 9: Atividade Recente (1/3 da largura) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Atividade recente
              </h3>
              <Activity className="w-4 h-4 text-indigo-500" />
            </div>

            <div className="space-y-4 pt-1">
              {data?.recentActivity.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Nenhuma atividade recente registrada.</p>
              ) : (
                data?.recentActivity.map((act) => {
                  const dateObj = new Date(act.createdAt);
                  const timeStr = dateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={act.id} className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-700 dark:text-slate-300 font-medium leading-snug">
                          {act.description}
                        </p>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Hoje às {timeStr}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
