"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";

export function LandingHeader() {
  const [isOpen, setIsOpen] = useState(false);

  const closeMenu = () => setIsOpen(false);

  return (
    <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" aria-label="QR MASTER — Início" onClick={closeMenu}>
          <BrandLogo variant="horizontal" theme="dark" size="md" />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-300">
          <a
            href="#features"
            className="hover:text-cyan-400 transition-colors"
          >
            Recursos
          </a>
          <a
            href="#how-it-works"
            className="hover:text-cyan-400 transition-colors"
          >
            Como Funciona
          </a>
          <a
            href="#pricing"
            className="hover:text-cyan-400 transition-colors"
          >
            Preços
          </a>
          <a
            href="#faq"
            className="hover:text-cyan-400 transition-colors"
          >
            FAQ
          </a>
        </nav>

        {/* Desktop Action Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all hover:scale-105"
          >
            Criar conta grátis
          </Link>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex sm:hidden items-center gap-2">
          <Link
            href="/login"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white"
          >
            Entrar
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={isOpen}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800 transition-colors"
          >
            {isOpen ? <X className="w-5 h-5 text-cyan-400" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer / Overlay Menu */}
      {isOpen && (
        <div className="md:hidden border-b border-slate-800 bg-slate-950/98 px-6 py-6 space-y-5 animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col space-y-4 text-sm font-semibold text-slate-200">
            <a
              href="#features"
              onClick={closeMenu}
              className="py-2 border-b border-slate-900 hover:text-cyan-400 transition-colors"
            >
              Recursos
            </a>
            <a
              href="#how-it-works"
              onClick={closeMenu}
              className="py-2 border-b border-slate-900 hover:text-cyan-400 transition-colors"
            >
              Como Funciona
            </a>
            <a
              href="#pricing"
              onClick={closeMenu}
              className="py-2 border-b border-slate-900 hover:text-cyan-400 transition-colors"
            >
              Preços
            </a>
            <a
              href="#faq"
              onClick={closeMenu}
              className="py-2 border-b border-slate-900 hover:text-cyan-400 transition-colors"
            >
              FAQ
            </a>
          </nav>

          <div className="pt-2 flex flex-col gap-3">
            <Link
              href="/register"
              onClick={closeMenu}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold text-xs text-center shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
            >
              <span>Criar conta grátis</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              onClick={closeMenu}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs text-center border border-slate-800"
            >
              Entrar na minha conta
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
