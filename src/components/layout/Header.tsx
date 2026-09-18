"use client";

import React from "react";
import Link from "next/link";
import { Plus, Bell } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  user?: {
    name: string;
    email: string;
    role: string;
  };
}

export function Header({ title, subtitle, user }: HeaderProps) {
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

        <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 rounded-full bg-indigo-600/10 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-200 dark:border-indigo-800/40">
            {user?.name ? user.name[0].toUpperCase() : "C"}
          </div>
          <div className="text-left text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200 block leading-tight">
              {user?.name || "Carlos Silva"}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {user?.role === "ADMIN" ? "Administrador" : "Plano Pro"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
