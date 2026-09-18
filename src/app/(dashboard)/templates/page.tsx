"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Sparkles, ArrowRight, MessageCircle, Utensils, DollarSign, Wifi, Share2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { QRCodeRenderer } from "@/components/qr/QRCodeRenderer";

interface TemplateItem {
  id: string;
  name: string;
  category: string;
  type: string;
  description: string;
  content: string;
  styleConfig: string;
  isPopular: boolean;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTemplates() {
      try {
        const res = await fetch("/api/templates");
        if (res.ok) {
          const d = await res.json();
          setTemplates(d.templates || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadTemplates();
  }, []);

  const handleUseTemplate = (t: TemplateItem) => {
    // Stores selected template in sessionStorage for the /create page
    sessionStorage.setItem("qrmaster_selected_template", JSON.stringify(t));
    router.push("/create");
  };

  return (
    <div>
      <Header
        title="Modelos Prontos"
        subtitle="Inicie seu QR Code a partir de templates pré-configurados com alta conversão e estética profissional"
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
        <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-900/10 via-purple-900/10 to-transparent border border-indigo-100 dark:border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Design Testado & Aprovado</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Templates prontos para uso imediato
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              Escolha um modelo e edite apenas as informações da sua empresa. Cores, contraste, molduras e cantos já vêm otimizados.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Carregando modelos...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((t) => {
              let parsedStyle = {};
              try {
                parsedStyle = JSON.parse(t.styleConfig);
              } catch {
                parsedStyle = {};
              }

              return (
                <div
                  key={t.id}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
                        {t.category}
                      </span>
                      {t.isPopular && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-500">
                          <Sparkles className="w-3 h-3" />
                          <span>Popular</span>
                        </span>
                      )}
                    </div>

                    {/* Preview Centered */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                      <QRCodeRenderer
                        value="https://qrmaster.app"
                        styleConfig={parsedStyle}
                        size={160}
                      />
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-indigo-600 transition-colors">
                        {t.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {t.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => handleUseTemplate(t)}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                    >
                      <span>Usar este modelo</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
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
