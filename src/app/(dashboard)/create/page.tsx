"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Link as LinkIcon,
  MessageCircle,
  FileText,
  Mail,
  Phone,
  MessageSquare,
  Wifi,
  MapPin,
  User,
  Calendar,
  DollarSign,
  Share2,
  ListPlus,
  Palette,
  Eye,
  Sliders,
  Sparkles,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Save,
  Image as ImageIcon,
  Check,
  Tag,
  Megaphone,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { QRCodeRenderer } from "@/components/qr/QRCodeRenderer";
import { QRCodeType, QRCodeContentPayload, formatQRDestination } from "@/lib/qr-generator";
import { QRCodeStyleConfig, DEFAULT_STYLE_CONFIG, QRCodeModuleType, QRCodeEyeType, QRCodeFrameType } from "@/types/qr";
import { checkQRContrast } from "@/lib/contrast";
import { downloadPng, downloadSvg, downloadPdf, ExportResolution } from "@/lib/export";
import { UpgradeModal, UpgradeReason } from "@/components/UpgradeModal";
import { getAppUrl } from "@/lib/app-url";
import { useToast } from "@/components/ui/Toast";

export default function CreateQRCodePage() {
  const router = useRouter();
  const toast = useToast();

  // Active step / main tabs
  const [activeTab, setActiveTab] = useState<"type" | "content" | "style" | "details">("type");
  const [selectedType, setSelectedType] = useState<QRCodeType>("url");
  const [isDynamic, setIsDynamic] = useState(true);

  // QR Meta
  const [name, setName] = useState("Meu Novo QR Code");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [userPlan, setUserPlan] = useState<{ name: string; maxQRCodes: number } | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  // Payload Content State
  const [content, setContent] = useState<QRCodeContentPayload>({
    url: "https://minhaempresa.com.br",
    phone: "5511999999999",
    message: "Olá! Gostaria de mais informações.",
    text: "Texto de exemplo para o QR Code.",
    email: "contato@empresa.com",
    subject: "Atendimento",
    body: "Olá, gostaria de tirar uma dúvida.",
    ssid: "WiFi_Escritorio_5G",
    password: "SenhaSegura123",
    encryption: "WPA2",
    hidden: false,
    latitude: -23.55052,
    longitude: -46.633308,
    firstName: "Carlos",
    lastName: "Silva",
    company: "Nexus Digital",
    title: "Diretor Comercial",
    cellPhone: "+55 (11) 98765-4321",
    contactEmail: "carlos@nexusdigital.com.br",
    website: "https://nexusdigital.com.br",
    eventTitle: "Workshop de Inovação",
    eventLocation: "Auditório Central",
    eventDescription: "Apresentação de novos produtos e networking.",
    startDate: "2026-10-15T14:00",
    endDate: "2026-10-15T18:00",
    pixKey: "carlos@nexusdigital.com.br",
    merchantName: "CARLOS SILVA",
    merchantCity: "SAO PAULO",
    amount: 99.9,
    txId: "PAG1234",
    infoMessage: "Inscrição Workshop",
    socialPlatform: "instagram",
    socialUrl: "https://instagram.com/nexusdigital",
  });

  // Style State
  const [style, setStyle] = useState<QRCodeStyleConfig>({
    ...DEFAULT_STYLE_CONFIG,
  });

  // Preview Controls
  const [zoom, setZoom] = useState(280);
  const [saving, setSaving] = useState(false);
  const [createdQr, setCreatedQr] = useState<{ id: string; shortCode?: string } | null>(null);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<ExportResolution>(1024);

  // Upgrade Modal State
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("DYNAMIC_QR");
  const [upgradeLimit, setUpgradeLimit] = useState<number>(5);

  // Load user categories, campaigns & plan permissions
  useEffect(() => {
    async function loadMeta() {
      try {
        const [catRes, campRes, meRes] = await Promise.all([
          fetch("/api/categories", { cache: "no-store", headers: { "Cache-Control": "no-cache" } }),
          fetch("/api/campaigns", { cache: "no-store", headers: { "Cache-Control": "no-cache" } }),
          fetch("/api/auth/me", { cache: "no-store", headers: { "Cache-Control": "no-cache" } }),
        ]);
        if (catRes.ok) {
          const c = await catRes.json();
          setCategories(c.categories || []);
        }
        if (campRes.ok) {
          const cp = await campRes.json();
          setCampaigns(cp.campaigns || []);
        }
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.plan) {
            setUserPlan(me.plan);
          }
          if (me.permissions) {
            setPermissions(me.permissions);
            if (me.permissions.dynamic_qr === false) {
              setIsDynamic(false);
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar metadados e permissões:", err);
      }
    }

    loadMeta();

    const handleFocus = () => loadMeta();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadMeta();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Compute Destination String based on type & content
  const destinationString = useMemo(() => {
    return formatQRDestination(selectedType, content);
  }, [selectedType, content]);

  // Contrast & Readability validation
  const contrastCheck = useMemo(() => {
    return checkQRContrast(style.dotsColor, style.bgColor);
  }, [style.dotsColor, style.bgColor]);

  // Update field helper
  const updateContent = (field: keyof QRCodeContentPayload, val: unknown) => {
    setContent((prev) => ({ ...prev, [field]: val }));
    if (createdQr) setCreatedQr(null);
  };

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (permissions && (permissions.custom_logo === false || permissions.customLogo === false)) {
      setUpgradeReason("LOGO");
      setUpgradeModalOpen(true);
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Arquivo muito grande", "O logo deve ter no máximo 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      setStyle((prev) => ({
        ...prev,
        hasLogo: true,
        logoUrl: url,
        errorCorrectionLevel: "H", // Recomenda automaticamente nível H
      }));
      toast.info("Logo carregado", "Nível de correção ajustado para H para garantir legibilidade.");
    };
    reader.readAsDataURL(file);
  };

  // Save QR Code
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nome obrigatório", "Dê um nome ao seu QR Code.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        description,
        type: selectedType,
        isDynamic,
        destination: destinationString,
        content,
        styleConfig: style,
        categoryId: categoryId || null,
        campaignId: campaignId || null,
        logoUrl: style.logoUrl || null,
      };

      const res = await fetch("/api/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        // Interpretação específica de limite comercial (LIMIT_REACHED)
        if (res.status === 403 && data.code === "LIMIT_REACHED") {
          setUpgradeReason("LIMIT_REACHED");
          setUpgradeLimit(data.limit || 5);
          setUpgradeModalOpen(true);
          setSaving(false);
          return;
        }

        // Interpretação específica de upgrade exigido para recursos pagos (UPGRADE_REQUIRED)
        if (res.status === 403 && data.code === "UPGRADE_REQUIRED") {
          if (data.requiredPlan === "BUSINESS") {
            setUpgradeReason("CAMPAIGNS");
          } else {
            setUpgradeReason(data.reason?.includes("dinâmico") ? "DYNAMIC_QR" : "LOGO");
          }
          setUpgradeModalOpen(true);
          setSaving(false);
          return;
        }

        // Outros 403 (anti-IDOR, segurança, admin) e erros técnicos (400, 429, 500) permanecem como erro
        toast.error("Erro ao salvar", data.error || "Não foi possível criar o QR Code.");
        setSaving(false);
        return;
      }

      setCreatedQr({ id: data.qrCode.id, shortCode: data.qrCode.shortCode });
      toast.success("✓ QR Code criado com sucesso!", "Você já pode baixar e compartilhar.");
      setSaving(false);
    } catch {
      toast.error("Erro de conexão", "Falha ao salvar no banco de dados.");
      setSaving(false);
    }
  };

  // Test QR Destination in new tab
  const handleTestDestination = () => {
    if (isDynamic && createdQr?.shortCode) {
      window.open(`/q/${createdQr.shortCode}`, "_blank");
    } else {
      if (selectedType === "pix") {
        navigator.clipboard.writeText(destinationString);
        toast.info("Chave Pix Copiada", "O código Pix Copia e Cola foi copiado para a área de transferência!");
      } else {
        window.open(destinationString, "_blank");
      }
    }
  };

  const typesList = [
    { id: "url", name: "URL", icon: LinkIcon, desc: "Link para site ou página web" },
    { id: "whatsapp", name: "WhatsApp", icon: MessageCircle, desc: "Conversa direta com mensagem" },
    { id: "pix", name: "Pix", icon: DollarSign, desc: "Pagamento imediato BR Code" },
    { id: "wifi", name: "Wi-Fi", icon: Wifi, desc: "Conexão sem digitar senha" },
    { id: "contact", name: "Contato", icon: User, desc: "Cartão de visita digital (vCard)" },
    { id: "social", name: "Redes Sociais", icon: Share2, desc: "Instagram, YouTube, TikTok" },
    { id: "location", name: "Localização", icon: MapPin, desc: "Coordenadas no Google Maps" },
    { id: "event", name: "Evento", icon: Calendar, desc: "Compromisso no calendário" },
    { id: "text", name: "Texto Livre", icon: FileText, desc: "Mensagem ou nota de texto" },
    { id: "email", name: "E-mail", icon: Mail, desc: "Envio de email pré-formatado" },
    { id: "phone", name: "Telefone", icon: Phone, desc: "Ligação telefônica direta" },
    { id: "sms", name: "SMS", icon: MessageSquare, desc: "Mensagem de texto celular" },
    { id: "multilink", name: "Multi-Link", icon: ListPlus, desc: "Página de biografia com links" },
  ];

  return (
    <div>
      <Header
        title="Criar QR Code"
        subtitle="Configure o conteúdo, personalize o visual e gere seu código em alta resolução"
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto">
        {/* Layout em 2 Colunas (Section 10 & Section 62) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* COLUNA DA ESQUERDA: CONFIGURAÇÕES (7 Colunas) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Abas Superiores do Gerador */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2 text-sm font-semibold">
              <button
                onClick={() => setActiveTab("type")}
                className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-2 ${
                  activeTab === "type"
                    ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <span>1. Tipo</span>
              </button>
              <button
                onClick={() => setActiveTab("content")}
                className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-2 ${
                  activeTab === "content"
                    ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <span>2. Conteúdo</span>
              </button>
              <button
                onClick={() => setActiveTab("style")}
                className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-2 ${
                  activeTab === "style"
                    ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <span>3. Personalizar</span>
              </button>
              <button
                onClick={() => setActiveTab("details")}
                className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-2 ${
                  activeTab === "details"
                    ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <span>4. Detalhes & Salvar</span>
              </button>
            </div>

            {/* ABA 1: ESCOLHER TIPO DE QR CODE */}
            {activeTab === "type" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {typesList.map((t) => {
                    const Icon = t.icon;
                    const isSelected = selectedType === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelectedType(t.id as QRCodeType);
                          if (t.id === "pix") {
                            setName("Pix Cobrança");
                          } else if (t.id === "whatsapp") {
                            setName("WhatsApp Comercial");
                          } else if (t.id === "wifi") {
                            setName("Wi-Fi Visitantes");
                          }
                        }}
                        className={`p-3.5 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-900 dark:text-indigo-100 shadow-sm ring-2 ring-indigo-500/20"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2.5 ${
                            isSelected
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-bold leading-tight">{t.name}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1 leading-snug">
                          {t.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Dinâmico vs Estático Toggle (Section 15) */}
                <div className="mt-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        QR Code Dinâmico
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-extrabold uppercase tracking-wide">
                        Recomendado
                      </span>
                      {permissions && permissions.dynamic_qr === false && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-extrabold uppercase tracking-wide border border-amber-500/20">
                          PRO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-md">
                      Permite alterar o link de destino quando quiser sem precisar reimprimir o código, além de registrar telemetria e gráficos de scans.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (permissions && permissions.dynamic_qr === false && !isDynamic) {
                        setUpgradeReason("DYNAMIC_QR");
                        setUpgradeModalOpen(true);
                        return;
                      }
                      setIsDynamic(!isDynamic);
                    }}
                    className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-300 shrink-0 ${
                      isDynamic ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                        isDynamic ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setActiveTab("content")}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
                  >
                    Avançar para Conteúdo →
                  </button>
                </div>
              </div>
            )}

            {/* ABA 2: CONTEÚDO ESPECÍFICO */}
            {activeTab === "content" && (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white capitalize flex items-center gap-2">
                    <span>Configuração de {selectedType}</span>
                  </h3>
                  <span className="text-xs text-slate-400">Campos validados automaticamente</span>
                </div>

                {/* URL */}
                {selectedType === "url" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      URL de Destino
                    </label>
                    <input
                      type="url"
                      value={content.url || ""}
                      onChange={(e) => updateContent("url", e.target.value)}
                      placeholder="https://meusite.com.br"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* WhatsApp */}
                {selectedType === "whatsapp" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Número com DDD (ex: 5511999999999)
                      </label>
                      <input
                        type="tel"
                        value={content.phone || ""}
                        onChange={(e) => updateContent("phone", e.target.value)}
                        placeholder="5511999999999"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Mensagem Automática Inicial
                      </label>
                      <textarea
                        rows={3}
                        value={content.message || ""}
                        onChange={(e) => updateContent("message", e.target.value)}
                        placeholder="Olá! Gostaria de saber mais sobre seus produtos."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Pix (EMV BR Code) */}
                {selectedType === "pix" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Chave Pix (CPF, CNPJ, Email ou Telefone)
                        </label>
                        <input
                          type="text"
                          value={content.pixKey || ""}
                          onChange={(e) => updateContent("pixKey", e.target.value)}
                          placeholder="chave@empresa.com"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Valor (R$) — Opcional
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={content.amount ?? ""}
                          onChange={(e) =>
                            updateContent("amount", e.target.value ? parseFloat(e.target.value) : null)
                          }
                          placeholder="Sem valor fixo"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Nome do Beneficiário (máx 25)
                        </label>
                        <input
                          type="text"
                          maxLength={25}
                          value={content.merchantName || ""}
                          onChange={(e) => updateContent("merchantName", e.target.value)}
                          placeholder="EMPRESA EXEMPLO"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Cidade do Beneficiário (máx 15)
                        </label>
                        <input
                          type="text"
                          maxLength={15}
                          value={content.merchantCity || ""}
                          onChange={(e) => updateContent("merchantCity", e.target.value)}
                          placeholder="SAO PAULO"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Identificador da Transação (TxID)
                        </label>
                        <input
                          type="text"
                          value={content.txId || ""}
                          onChange={(e) => updateContent("txId", e.target.value)}
                          placeholder="PEDIDO123 ou ***"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Mensagem no Extrato (Opcional)
                        </label>
                        <input
                          type="text"
                          maxLength={25}
                          value={content.infoMessage || ""}
                          onChange={(e) => updateContent("infoMessage", e.target.value)}
                          placeholder="Pagamento Servico"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900/50 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Padrão oficial BR Code / EMV com cálculo exato de CRC16-CCITT em conformidade com o Banco Central do Brasil.
                      </span>
                    </div>
                  </div>
                )}

                {/* Wi-Fi */}
                {selectedType === "wifi" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Nome da Rede Wi-Fi (SSID)
                      </label>
                      <input
                        type="text"
                        value={content.ssid || ""}
                        onChange={(e) => updateContent("ssid", e.target.value)}
                        placeholder="Ex: MinhaRede_5G"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Senha da Rede
                        </label>
                        <input
                          type="text"
                          value={content.password || ""}
                          onChange={(e) => updateContent("password", e.target.value)}
                          placeholder="Senha de acesso"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Criptografia
                        </label>
                        <select
                          value={content.encryption || "WPA"}
                          onChange={(e) => updateContent("encryption", e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        >
                          <option value="WPA">WPA / WPA2</option>
                          <option value="WPA3">WPA3</option>
                          <option value="WEP">WEP</option>
                          <option value="nopass">Sem senha (Aberta)</option>
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={!!content.hidden}
                        onChange={(e) => updateContent("hidden", e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Rede oculta (não transmite SSID)</span>
                    </label>
                  </div>
                )}

                {/* Contato (vCard) */}
                {selectedType === "contact" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Nome
                        </label>
                        <input
                          type="text"
                          value={content.firstName || ""}
                          onChange={(e) => updateContent("firstName", e.target.value)}
                          placeholder="Carlos"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Sobrenome
                        </label>
                        <input
                          type="text"
                          value={content.lastName || ""}
                          onChange={(e) => updateContent("lastName", e.target.value)}
                          placeholder="Silva"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Empresa
                        </label>
                        <input
                          type="text"
                          value={content.company || ""}
                          onChange={(e) => updateContent("company", e.target.value)}
                          placeholder="Nexus Digital"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Cargo
                        </label>
                        <input
                          type="text"
                          value={content.title || ""}
                          onChange={(e) => updateContent("title", e.target.value)}
                          placeholder="Diretor Comercial"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Celular
                        </label>
                        <input
                          type="tel"
                          value={content.cellPhone || ""}
                          onChange={(e) => updateContent("cellPhone", e.target.value)}
                          placeholder="+55 11 98765-4321"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          E-mail de Contato
                        </label>
                        <input
                          type="email"
                          value={content.contactEmail || ""}
                          onChange={(e) => updateContent("contactEmail", e.target.value)}
                          placeholder="carlos@empresa.com"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Redes Sociais */}
                {selectedType === "social" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Plataforma
                      </label>
                      <select
                        value={content.socialPlatform || "instagram"}
                        onChange={(e) => updateContent("socialPlatform", e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="instagram">Instagram</option>
                        <option value="youtube">YouTube</option>
                        <option value="facebook">Facebook</option>
                        <option value="tiktok">TikTok</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="x">X (Twitter)</option>
                        <option value="telegram">Telegram</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        URL do Perfil
                      </label>
                      <input
                        type="url"
                        value={content.socialUrl || ""}
                        onChange={(e) => updateContent("socialUrl", e.target.value)}
                        placeholder="https://instagram.com/seu.perfil"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Localização */}
                {selectedType === "location" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Latitude
                        </label>
                        <input
                          type="text"
                          value={content.latitude || ""}
                          onChange={(e) => updateContent("latitude", e.target.value)}
                          placeholder="-23.55052"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Longitude
                        </label>
                        <input
                          type="text"
                          value={content.longitude || ""}
                          onChange={(e) => updateContent("longitude", e.target.value)}
                          placeholder="-46.633308"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Evento */}
                {selectedType === "event" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Título do Evento
                      </label>
                      <input
                        type="text"
                        value={content.eventTitle || ""}
                        onChange={(e) => updateContent("eventTitle", e.target.value)}
                        placeholder="Ex: Feira de Negócios 2026"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Data e Hora Inicial
                        </label>
                        <input
                          type="datetime-local"
                          value={content.startDate || ""}
                          onChange={(e) => updateContent("startDate", e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Data e Hora Final
                        </label>
                        <input
                          type="datetime-local"
                          value={content.endDate || ""}
                          onChange={(e) => updateContent("endDate", e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setActiveTab("type")}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    ← Voltar aos Tipos
                  </button>
                  <button
                    onClick={() => setActiveTab("style")}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
                  >
                    Avançar para Personalização →
                  </button>
                </div>
              </div>
            )}

            {/* ABA 3: PERSONALIZAÇÃO AVANÇADA (Section 16 & 17) */}
            {activeTab === "style" && (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-indigo-500" />
                  <span>Personalização Visual e Estilos</span>
                </h3>

                {/* 1. Cores e Gradientes */}
                <div className="space-y-3 pt-2">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Cores & Fundo
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Cor dos Módulos</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={style.dotsColor}
                          onChange={(e) => setStyle({ ...style, dotsColor: e.target.value })}
                          className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                        />
                        <span className="text-xs font-mono">{style.dotsColor}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Cantos Externos</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={style.cornerSquareColor}
                          onChange={(e) => setStyle({ ...style, cornerSquareColor: e.target.value })}
                          className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                        />
                        <span className="text-xs font-mono">{style.cornerSquareColor}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Ponto dos Olhos</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={style.cornerDotColor}
                          onChange={(e) => setStyle({ ...style, cornerDotColor: e.target.value })}
                          className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                        />
                        <span className="text-xs font-mono">{style.cornerDotColor}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Cor de Fundo</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          disabled={style.transparentBg}
                          value={style.bgColor}
                          onChange={(e) => setStyle({ ...style, bgColor: e.target.value })}
                          className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-30"
                        />
                        <span className="text-xs font-mono">{style.bgColor}</span>
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={!!style.transparentBg}
                      onChange={(e) => setStyle({ ...style, transparentBg: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Fundo transparente (ideal para compor em peças gráficas)</span>
                  </label>
                </div>

                {/* 2. Estilo dos Módulos & Cantos */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Formato dos Módulos
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {(["square", "rounded", "dots", "classy"] as QRCodeModuleType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setStyle({ ...style, dotsType: t })}
                        className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                          style.dotsType === t
                            ? "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-600 text-indigo-600 dark:text-indigo-400"
                            : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {t === "square" ? "Quadrado" : t === "rounded" ? "Arredondado" : t === "dots" ? "Pontos" : "Classy"}
                      </button>
                    ))}
                  </div>

                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider pt-2">
                    Formato dos Olhos (Cantos)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["square", "extra-rounded", "circle"] as QRCodeEyeType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setStyle({ ...style, cornerSquareType: t })}
                        className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                          style.cornerSquareType === t
                            ? "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-600 text-indigo-600 dark:text-indigo-400"
                            : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {t === "square" ? "Quadrado" : t === "extra-rounded" ? "Arredondado" : "Círculo"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Logotipo Central */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Logotipo Central
                    </p>
                    {permissions && (permissions.custom_logo === false || permissions.customLogo === false) && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-extrabold uppercase tracking-wide border border-purple-500/20">
                        PRO
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors inline-flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-indigo-500" />
                      <span>Fazer upload do logotipo</span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/svg+xml"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>

                    {style.hasLogo && (
                      <button
                        onClick={() => setStyle({ ...style, hasLogo: false, logoUrl: undefined })}
                        className="text-xs text-rose-500 hover:underline font-semibold"
                      >
                        Remover logotipo
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. Molduras & Textos */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Moldura & Chamada para Ação
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["none", "scan-me", "badge"] as QRCodeFrameType[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setStyle({ ...style, frame: f })}
                        className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                          style.frame === f
                            ? "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-600 text-indigo-600 dark:text-indigo-400"
                            : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {f === "none" ? "Sem moldura" : f === "scan-me" ? "Aponte a Câmera" : "Badge Superior"}
                      </button>
                    ))}
                  </div>

                  {style.frame !== "none" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Texto da Moldura</label>
                        <input
                          type="text"
                          value={style.frameText}
                          onChange={(e) => setStyle({ ...style, frameText: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase tracking-wider"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Cor da Moldura</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={style.frameColor}
                            onChange={(e) => setStyle({ ...style, frameColor: e.target.value })}
                            className="w-8 h-8 rounded-lg border cursor-pointer"
                          />
                          <span className="text-xs font-mono">{style.frameColor}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setActiveTab("content")}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    ← Voltar ao Conteúdo
                  </button>
                  <button
                    onClick={() => setActiveTab("details")}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
                  >
                    Avançar para Detalhes →
                  </button>
                </div>
              </div>
            )}

            {/* ABA 4: DETALHES, CATEGORIA, CAMPANHA & SALVAR */}
            {activeTab === "details" && (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Identificação e Organização
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome do QR Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: WhatsApp da Loja"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Descrição (Opcional)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: QR Code impresso no balcão da recepção"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Categoria</span>
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">Sem categoria</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                      <Megaphone className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Campanha</span>
                    </label>
                    <select
                      value={campaignId}
                      onChange={(e) => setCampaignId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">Sem campanha</option>
                      {campaigns.map((cp) => (
                        <option key={cp.id} value={cp.id}>
                          {cp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => setActiveTab("style")}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    ← Voltar ao Visual
                  </button>

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-600/25 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Salvar QR Code</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* COLUNA DA DIREITA: PREVIEW EM TEMPO REAL & EXPORTAÇÃO (5 Colunas) */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col items-center text-center">
              <div className="w-full flex items-center justify-between mb-4">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  Preview Interativo
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setZoom(Math.max(180, zoom - 30))}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Diminuir preview"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-mono text-slate-400">{zoom}px</span>
                  <button
                    onClick={() => setZoom(Math.min(360, zoom + 30))}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Aumentar preview"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Renderizador SVG do QR Code */}
              <div className="my-2 p-4 rounded-2xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 flex items-center justify-center overflow-hidden">
                <QRCodeRenderer
                  id="generator-qr-code"
                  value={
                    isDynamic && createdQr?.shortCode
                      ? `${getAppUrl()}/q/${createdQr.shortCode}`
                      : destinationString
                  }
                  styleConfig={style}
                  size={zoom}
                />
              </div>

              {/* Indicador de Legibilidade & Contraste (Section 56) */}
              <div className="w-full mt-3">
                <div
                  className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 ${
                    contrastCheck.level === "success"
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300"
                      : contrastCheck.level === "warning"
                      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300"
                      : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300"
                  }`}
                >
                  {contrastCheck.level === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{contrastCheck.message}</span>
                </div>
              </div>

              {/* Botões de Ação Imediata: Testar & Baixar (Section 19 & 20) */}
              <div className="grid grid-cols-2 gap-3 w-full mt-5">
                <button
                  onClick={handleTestDestination}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Testar QR Code</span>
                </button>

                <button
                  onClick={() => setDownloadModalOpen(true)}
                  className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Arquivo</span>
                </button>
              </div>

              {createdQr && (
                <div className="w-full mt-4 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 text-left text-xs">
                  <p className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>QR Code Salvo no Painel!</span>
                  </p>
                  {createdQr.shortCode && (
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300 font-mono mt-1">
                      Link Dinâmico: {getAppUrl()}/q/{createdQr.shortCode}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 font-semibold">
                    <button
                      onClick={() => router.push("/my-qrs")}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Ver em Meus QR Codes →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE DOWNLOAD MULTI-FORMATO (PNG, SVG, PDF) */}
      {downloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in-50">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-indigo-600" />
                <span>Exportar QR Code</span>
              </h3>
              <button
                onClick={() => setDownloadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Resolução PNG */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Resolução para PNG
              </label>
              <div className="grid grid-cols-4 gap-2">
                {([512, 1024, 2048, 4096] as ExportResolution[]).map((res) => (
                  <button
                    key={res}
                    onClick={() => setSelectedResolution(res)}
                    className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all ${
                      selectedResolution === res
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {res}px
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">
                2048px e 4096px são ideais para impressão nítida (300 DPI) em cartazes e embalagens.
              </p>
            </div>

            {/* Botões dos 3 Formatos */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={async () => {
                  try {
                    await downloadPng("generator-qr-code", selectedResolution, `${name.toLowerCase().replace(/\s+/g, "_")}_${selectedResolution}px.png`);
                    toast.success("Download Concluído", `PNG em ${selectedResolution}px baixado com sucesso.`);
                    setDownloadModalOpen(false);
                  } catch {
                    toast.error("Erro no download", "Não foi possível gerar a imagem.");
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 text-white dark:text-slate-900 text-xs font-bold flex items-center justify-between transition-colors"
              >
                <span>Baixar Imagem PNG ({selectedResolution}x{selectedResolution}px)</span>
                <Download className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (permissions && permissions.export_svg === false) {
                    setUpgradeReason("SVG_EXPORT");
                    setUpgradeModalOpen(true);
                    return;
                  }
                  try {
                    downloadSvg("generator-qr-code", `${name.toLowerCase().replace(/\s+/g, "_")}.svg`);
                    toast.success("Download Concluído", "Arquivo SVG vetorial baixado com sucesso.");
                    setDownloadModalOpen(false);
                  } catch {
                    toast.error("Erro no download", "Falha ao gerar o arquivo SVG.");
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span>Baixar Vetor SVG (Infinitamente Escalável)</span>
                  {permissions && permissions.export_svg === false && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      PRO
                    </span>
                  )}
                </div>
                <Download className="w-4 h-4" />
              </button>

              <button
                onClick={async () => {
                  if (permissions && permissions.export_pdf === false) {
                    setUpgradeReason("PDF_EXPORT");
                    setUpgradeModalOpen(true);
                    return;
                  }
                  try {
                    await downloadPdf(
                      "generator-qr-code",
                      name,
                      style.frameText || "Aponte a câmera do seu celular para escanear",
                      `${name.toLowerCase().replace(/\s+/g, "_")}.pdf`
                    );
                    toast.success("Download Concluído", "Documento PDF gerado com sucesso.");
                    setDownloadModalOpen(false);
                  } catch {
                    toast.error("Erro no download", "Falha ao compor o documento PDF.");
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span>Baixar Folha PDF Pronta para Impressão (A4)</span>
                  {permissions && permissions.export_pdf === false && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      PRO
                    </span>
                  )}
                </div>
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Upgrade Contextual */}
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        reason={upgradeReason}
        limit={upgradeLimit}
      />
    </div>
  );
}
