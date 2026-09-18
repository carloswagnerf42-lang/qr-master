"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sun, Moon, Laptop, ChevronDown } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs font-medium"
        aria-label="Alternar tema"
      >
        {theme === "light" && <Sun className="w-4 h-4 text-amber-500" />}
        {theme === "dark" && <Moon className="w-4 h-4 text-indigo-400" />}
        {theme === "system" && <Laptop className="w-4 h-4 text-slate-500" />}
        <span className="capitalize hidden sm:inline">{theme === "system" ? "Sistema" : theme === "dark" ? "Escuro" : "Claro"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1 z-50 animate-in fade-in-50 zoom-in-95">
          <button
            onClick={() => {
              setTheme("light");
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left ${
              theme === "light"
                ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 font-semibold"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Sun className="w-4 h-4 text-amber-500" />
            Modo Claro
          </button>
          <button
            onClick={() => {
              setTheme("dark");
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left ${
              theme === "dark"
                ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-400 font-semibold"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Moon className="w-4 h-4 text-indigo-400" />
            Modo Escuro
          </button>
          <button
            onClick={() => {
              setTheme("system");
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left ${
              theme === "system"
                ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 font-semibold"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Laptop className="w-4 h-4 text-slate-500" />
            Sistema
          </button>
        </div>
      )}
    </div>
  );
}
