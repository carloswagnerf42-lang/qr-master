"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Bell } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  user?: {
    name?: string;
    email?: string;
    role?: string;
    plan?: {
      name?: string;
      displayName?: string;
    } | null;
  };
}

export function Header({ title, subtitle, user: propUser }: HeaderProps) {
  const [userData, setUserData] = useState<{
    name?: string;
    email?: string;
    role?: string;
    planName?: string;
  } | null>(() => {
    if (!propUser) return null;
    return {
      name: propUser.name,
      email: propUser.email,
      role: propUser.role,
      planName: propUser.plan?.displayName || propUser.plan?.name,
    };
  });

  useEffect(() => {
    let isMounted = true;

    const fetchUserData = () => {
      fetch("/api/auth/me", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!isMounted || !data?.authenticated || !data.user) return;
          const u = data.user;
          const p = data.plan || u.plan;
          const resolvedPlanName =
            p?.displayName ||
            (p?.name === "FREE"
              ? "Plano Grátis"
              : p?.name === "PRO"
              ? "Plano Pro"
              : p?.name === "BUSINESS"
              ? "Plano Business"
              : p?.name);

          setUserData({
            name: u.name,
            email: u.email,
            role: u.role,
            planName: resolvedPlanName,
          });
        })
        .catch(() => {});
    };

    fetchUserData();

    const handleFocus = () => fetchUserData();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchUserData();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const displayName = userData?.name || (propUser?.name ?? "");
  const initial = displayName ? displayName.trim()[0].toUpperCase() : "U";

  const displayPlan = () => {
    if (userData?.role === "ADMIN" || propUser?.role === "ADMIN") {
      return "Administrador";
    }
    if (userData?.planName) {
      return userData.planName;
    }
    if (propUser?.plan?.displayName || propUser?.plan?.name) {
      return propUser.plan.displayName || propUser.plan.name;
    }
    // Enquanto carrega os dados reais, mantém neutro
    return userData ? "Plano Grátis" : "";
  };

  return (
    <header className="hidden md:flex items-center justify-between px-8 py-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md sticky top-0 z-20">
      <div>
        {title && (
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3.5">
        <Link
          href="/create"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Criar QR Code</span>
        </Link>

        <ThemeToggle />

        <div className="relative">
          <button
            className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Notificações"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          </button>
        </div>

        <Link
          href="/profile"
          className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-full bg-indigo-600/10 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-200 dark:border-indigo-800/40">
            {initial}
          </div>
          <div className="text-left text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200 block leading-tight">
              {displayName || "..."}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {displayPlan()}
            </span>
          </div>
        </Link>
      </div>
    </header>
  );
}
