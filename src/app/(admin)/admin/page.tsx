import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AdminUserManagement } from "./AdminUserManagement";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [
    totalUsers,
    totalQRs,
    totalScans,
    totalCampaigns,
    usersList,
    plansList,
    qrcodesList,
    campaignsList,
    logsList,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.qRCode.count({ where: { deletedAt: null } }),
    prisma.qRCodeScan.count(),
    prisma.campaign.count(),
    prisma.user.findMany({
      include: {
        _count: { select: { qrCodes: true, campaigns: true } },
        plan: true,
        subscription: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.plan.findMany({
      select: {
        id: true,
        name: true,
        displayName: true,
        priceMonth: true,
        priceYear: true,
        maxQRCodes: true,
        dynamicQRs: true,
        analytics: true,
        exportSvg: true,
        exportPdf: true,
        customLogo: true,
        campaigns: true,
        _count: { select: { users: true } },
      },
      orderBy: { priceMonth: "asc" },
    }),
    prisma.qRCode.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        isDynamic: true,
        shortCode: true,
        destination: true,
        status: true,
        scanCount: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.campaign.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: { select: { qrCodes: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.activityLog.findMany({
      select: {
        id: true,
        action: true,
        description: true,
        entityId: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/dashboard" aria-label="QR MASTER — Ir para o Painel" className="hover:opacity-90 transition-opacity">
              <BrandLogo variant="horizontal" theme="dark" size="md" />
            </Link>
            <div className="h-8 w-px bg-slate-800 hidden sm:block" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight font-brand">
                  Painel de Controle Administrativo
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  MASTER ADMIN
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Gestão central do SaaS: Usuários, Planos, Status, QR Codes, Métricas, Campanhas, Logs e Configurações
              </p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold transition-colors border border-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao App</span>
          </Link>
        </div>

        {/* 4 KPI Cards Globais no topo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase">Usuários Cadastrados</span>
            <p className="text-3xl font-extrabold text-white">{totalUsers}</p>
            <span className="text-[11px] text-emerald-400 font-medium">Contas registradas</span>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase">Total de QR Codes</span>
            <p className="text-3xl font-extrabold text-indigo-400">{totalQRs}</p>
            <span className="text-[11px] text-slate-400 font-medium">Estáticos e Dinâmicos</span>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase">Total de Scans</span>
            <p className="text-3xl font-extrabold text-emerald-400">{totalScans}</p>
            <span className="text-[11px] text-slate-400 font-medium">Leituras registradas</span>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase">Campanhas Globais</span>
            <p className="text-3xl font-extrabold text-amber-400">{totalCampaigns}</p>
            <span className="text-[11px] text-slate-400 font-medium">Em atividade na plataforma</span>
          </div>
        </div>

        {/* Painel Central com Navegação de Funções */}
        <AdminUserManagement
          initialUsers={usersList}
          plans={plansList}
          initialQRCodes={qrcodesList}
          initialCampaigns={campaignsList}
          initialLogs={logsList}
          currentAdminId={user.id}
        />
      </div>
    </div>
  );
}
