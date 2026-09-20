"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  QrCode,
  Megaphone,
  BarChart3,
  Layers,
  Star,
  Trash2,
  Settings,
  HelpCircle,
  User,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  Sparkles,
  FolderDown,
  MessageCircle,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface SidebarProps {
  user?: {
    name: string;
    email: string;
    role: string;
    company?: string | null;
    plan?: {
      name?: string;
      displayName?: string;
      maxQRCodes?: number;
    } | null;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quota, setQuota] = useState<{
    planName: string;
    used: number;
    max: number;
    isUnlimited: boolean;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchQuota() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.plan) {
            const planName = data.plan.name || "FREE";
            const max = data.usage?.maxQRCodes ?? 5;
            const isUnlimited = planName === "BUSINESS" || max >= 999999;
            setQuota({
              planName,
              used: data.usage?.qrCodes ?? 0,
              max,
              isUnlimited,
            });
          }
        }
      } catch {
        // Silently fallback to prop data
      }
    }
    fetchQuota();
    return () => {
      isMounted = false;
    };
  }, [pathname]);

  const mainNav = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Criar QR Code", href: "/create", icon: PlusCircle, highlight: true },
    { name: "Meus QR Codes", href: "/my-qrs", icon: QrCode },
    { name: "Arquivos Salvos", href: "/files", icon: FolderDown },
    { name: "Campanhas", href: "/campaigns", icon: Megaphone },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Modelos", href: "/templates", icon: Layers },
    { name: "Favoritos", href: "/favorites", icon: Star },
    { name: "Lixeira", href: "/trash", icon: Trash2 },
    { name: "Configurações", href: "/settings", icon: Settings },
  ];

  if (user?.role === "ADMIN") {
    mainNav.push({ name: "Administração", href: "/admin", icon: ShieldCheck });
  }

  const bottomNav = [
    { name: "Ajuda & Docs", href: "#", icon: HelpCircle },
    { name: "Perfil", href: "/profile", icon: User },
  ];

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      window.location.href = "/login";
    }
  };

  const navContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100 dark:border-slate-800/80">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-600 dark:from-white dark:via-indigo-200 dark:to-indigo-400 bg-clip-text text-transparent">
              QR MASTER
            </span>
            <span className="block text-[10px] text-slate-400 font-semibold tracking-wider uppercase -mt-1">
              SaaS Platform
            </span>
          </div>
        </Link>
        {mobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {mainNav.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;

          if (item.highlight) {
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3.5 py-2.5 my-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/25 hover:from-indigo-500 hover:to-indigo-600 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{item.name}</span>
                <Sparkles className="w-3.5 h-3.5 ml-auto opacity-70 animate-pulse" />
              </Link>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-semibold shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Bottom Area */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
        {/* Compact Quota Widget */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold tracking-wide uppercase text-slate-500 dark:text-slate-400">
              {quota ? `Plano ${quota.planName}` : (user?.plan?.name ? `Plano ${user.plan.name}` : "Plano FREE")}
            </span>
            {quota?.planName === "PRO" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                PRO
              </span>
            )}
            {quota?.planName === "BUSINESS" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                BUSINESS
              </span>
            )}
          </div>

          {quota?.isUnlimited ? (
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Uso ilimitado
              </p>
              <p className="text-[11px] text-slate-400">
                {quota.used} QRs criados no ciclo
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>QRs criados</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {quota?.used ?? 0} / {quota?.max ?? 5}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    (quota?.used ?? 0) >= (quota?.max ?? 5)
                      ? "bg-amber-500"
                      : "bg-indigo-600 dark:bg-indigo-500"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.round(((quota?.used ?? 0) / (quota?.max ?? 5)) * 100))}%`,
                  }}
                />
              </div>
              {(!quota || quota.planName === "FREE") && (
                <Link
                  href="/settings?tab=plan"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 block w-full text-center text-xs font-semibold py-1 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
                >
                  Conhecer PRO
                </Link>
              )}
              {quota?.planName === "PRO" && (
                <Link
                  href="/settings?tab=plan"
                  onClick={() => setMobileOpen(false)}
                  className="mt-1 block text-right text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Gerenciar plano →
                </Link>
              )}
            </div>
          )}
        </div>
        {bottomNav.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                isActive
                  ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              <Icon className="w-4 h-4 text-slate-400" />
              <span>{item.name}</span>
            </Link>
          );
        })}

        {/* Item de Suporte via WhatsApp exclusivo para assinantes PRO e BUSINESS */}
        {(quota?.planName === "PRO" || quota?.planName === "BUSINESS" || user?.plan?.name === "PRO" || user?.plan?.name === "BUSINESS") && (
          <a
            href="https://wa.me/5531985029353?text=Ol%C3%A1!%20Sou%20cliente%20do%20QR%20MASTER%20e%20preciso%20de%20ajuda."
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Falar com o suporte do QR MASTER pelo WhatsApp"
            className="flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
          >
            <MessageCircle className="w-4 h-4 text-emerald-500" />
            <span>Suporte WhatsApp</span>
          </a>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>

        {/* User preview card */}
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
            {user?.name ? user.name[0].toUpperCase() : "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              {user?.name || "Usuário"}
            </p>
            <p className="text-[10px] text-slate-400 truncate">
              {user?.email || "usuario@qrmaster.com"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30">
        {navContent}
      </aside>

      {/* Mobile Top Header Toggle */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <QrCode className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white">
            QR MASTER
          </span>
        </div>

        <ThemeToggle />
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-slate-900 shadow-2xl">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
