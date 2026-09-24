/**
 * Utilitários para formatação padronizada de conteúdos de QR Code
 */

import { generatePixPayload, PixPayloadParams } from "./pix";

export type QRCodeType =
  | "url"
  | "whatsapp"
  | "text"
  | "email"
  | "phone"
  | "sms"
  | "wifi"
  | "location"
  | "contact"
  | "event"
  | "pix"
  | "social"
  | "multilink";

export interface QRCodeContentPayload {
  // URL
  url?: string;
  // WhatsApp & Phone & SMS
  phone?: string;
  message?: string;
  // Text
  text?: string;
  // Email
  email?: string;
  subject?: string;
  body?: string;
  // Wi-Fi
  ssid?: string;
  password?: string;
  encryption?: "WPA" | "WPA2" | "WPA3" | "WEP" | "nopass";
  hidden?: boolean;
  // Location
  latitude?: string | number;
  longitude?: string | number;
  address?: string;
  // Contact (vCard)
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  workPhone?: string;
  cellPhone?: string;
  website?: string;
  contactEmail?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  // Event (vCalendar)
  eventTitle?: string;
  eventLocation?: string;
  eventDescription?: string;
  startDate?: string;
  endDate?: string;
  allDay?: boolean;
  // Pix
  pixKey?: string;
  merchantName?: string;
  merchantCity?: string;
  amount?: number | null;
  txId?: string;
  infoMessage?: string;
  // Social
  socialPlatform?: string;
  socialUrl?: string;
  // Multi-link
  multiLinkId?: string;
}

/**
 * Normaliza número de telefone para formato padrão internacional E.164 (+<DDI><DDD><NUMERO>)
 * Exemplos:
 * - "+55 11 99999-9999" -> "+5511999999999"
 * - "(11) 99999-9999"   -> "+5511999999999"
 * - "11999999999"       -> "+5511999999999"
 * - "5511999999999"     -> "+5511999999999"
 * - "+1 (555) 123-4567" -> "+15551234567"
 */
export function normalizeE164Phone(rawPhone?: string): string {
  if (!rawPhone) return "";
  const trimmed = rawPhone.trim();
  if (!trimmed) return "";

  // Se já começar com '+', manter '+' e extrair todos os dígitos
  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  // Se começar com código do Brasil (55) e tiver 12 ou 13 dígitos
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }

  // Se tiver 10 ou 11 dígitos (DDD + número brasileiro, ex: 11999999999 ou 1133334444)
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Outros números sem '+' explícito
  return `+${digits}`;
}

export interface QRContentValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validação rigorosa dos campos de conteúdo de acordo com o tipo de QR Code selecionado
 */
export function validateQRContent(
  type: QRCodeType,
  data: QRCodeContentPayload
): QRContentValidationResult {
  switch (type) {
    case "phone": {
      const formatted = normalizeE164Phone(data.phone);
      const digits = formatted.replace(/\D/g, "");
      if (!digits || digits.length < 8) {
        return { valid: false, error: "Informe um número de telefone válido (mínimo 8 dígitos)." };
      }
      return { valid: true };
    }

    case "sms": {
      const formatted = normalizeE164Phone(data.phone);
      const digits = formatted.replace(/\D/g, "");
      if (!digits || digits.length < 8) {
        return { valid: false, error: "Informe um número de celular válido para envio do SMS." };
      }
      return { valid: true };
    }

    case "url": {
      const raw = (data.url || "").trim();
      if (!raw) {
        return { valid: false, error: "Informe a URL de destino." };
      }
      if (!/^(https?:\/\/|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i.test(raw)) {
        return { valid: false, error: "Informe uma URL válida." };
      }
      return { valid: true };
    }

    case "whatsapp": {
      const clean = (data.phone || "").replace(/\D/g, "");
      if (!clean || clean.length < 8) {
        return { valid: false, error: "Informe o número do WhatsApp com DDD." };
      }
      return { valid: true };
    }

    case "text": {
      if (!(data.text || "").trim()) {
        return { valid: false, error: "Digite o texto para o QR Code." };
      }
      return { valid: true };
    }

    case "email": {
      const email = (data.email || "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { valid: false, error: "Informe um endereço de e-mail válido." };
      }
      return { valid: true };
    }

    case "wifi": {
      if (!(data.ssid || "").trim()) {
        return { valid: false, error: "Informe o nome da rede Wi-Fi (SSID)." };
      }
      if (data.encryption !== "nopass" && !(data.password || "").trim()) {
        return { valid: false, error: "Informe a senha da rede Wi-Fi ou selecione 'Sem senha'." };
      }
      return { valid: true };
    }

    case "pix": {
      if (!(data.pixKey || "").trim()) {
        return { valid: false, error: "Informe a chave Pix do recebedor." };
      }
      if (!(data.merchantName || "").trim()) {
        return { valid: false, error: "Informe o nome do beneficiário Pix." };
      }
      if (!(data.merchantCity || "").trim()) {
        return { valid: false, error: "Informe a cidade do beneficiário Pix." };
      }
      return { valid: true };
    }

    case "contact": {
      const hasName = Boolean((data.firstName || "").trim() || (data.lastName || "").trim());
      const hasCompany = Boolean((data.company || "").trim());
      const hasPhone = Boolean((data.cellPhone || "").trim() || (data.workPhone || "").trim());
      if (!hasName && !hasCompany && !hasPhone) {
        return { valid: false, error: "Informe pelo menos o nome, empresa ou telefone do contato." };
      }
      return { valid: true };
    }

    case "social": {
      if (!(data.socialUrl || "").trim()) {
        return { valid: false, error: "Informe o perfil ou link da rede social." };
      }
      return { valid: true };
    }

    case "location": {
      const lat = parseFloat(String(data.latitude));
      const lng = parseFloat(String(data.longitude));
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return { valid: false, error: "Informe coordenadas de latitude (-90 a 90) e longitude (-180 a 180) válidas." };
      }
      return { valid: true };
    }

    case "event": {
      if (!(data.eventTitle || "").trim()) {
        return { valid: false, error: "Informe o título do evento." };
      }
      if (!(data.startDate || "").trim()) {
        return { valid: false, error: "Informe a data e hora de início do evento." };
      }
      return { valid: true };
    }

    case "multilink": {
      if (!(data.url || data.multiLinkId || "").trim()) {
        return { valid: false, error: "Informe o link ou página do Multi-Link." };
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}

/**
 * Formata os dados no formato de texto/URI oficial do tipo correspondente
 */
export function formatQRDestination(type: QRCodeType, data: QRCodeContentPayload): string {
  switch (type) {
    case "url": {
      let rawUrl = (data.url || "").trim();
      if (!rawUrl) return "";
      if (!/^https?:\/\//i.test(rawUrl)) {
        rawUrl = "https://" + rawUrl;
      }
      return rawUrl;
    }

    case "whatsapp": {
      let cleanPhone = (data.phone || "").replace(/\D/g, "");
      if (!cleanPhone) return "";
      if ((cleanPhone.length === 10 || cleanPhone.length === 11) && !cleanPhone.startsWith("55")) {
        cleanPhone = `55${cleanPhone}`;
      }
      const msg = encodeURIComponent(data.message || "");
      return `https://wa.me/${cleanPhone}${msg ? `?text=${msg}` : ""}`;
    }

    case "text":
      return (data.text || "").trim();

    case "email": {
      const email = (data.email || "").trim();
      if (!email) return "";
      const subject = encodeURIComponent(data.subject || "");
      const body = encodeURIComponent(data.body || "");
      let link = `mailto:${email}`;
      const params: string[] = [];
      if (subject) params.push(`subject=${subject}`);
      if (body) params.push(`body=${body}`);
      if (params.length > 0) link += `?${params.join("&")}`;
      return link;
    }

    case "phone": {
      const formatted = normalizeE164Phone(data.phone);
      return formatted ? `tel:${formatted}` : "";
    }

    case "sms": {
      const formatted = normalizeE164Phone(data.phone);
      if (!formatted) return "";
      const msg = encodeURIComponent(data.message || "");
      return `sms:${formatted}${msg ? `?body=${msg}` : ""}`;
    }

    case "wifi": {
      const ssid = (data.ssid || "").trim();
      if (!ssid) return "";
      const enc = data.encryption || "WPA";
      const pass = data.password || "";
      const hidden = data.hidden ? "true" : "false";
      return `WIFI:T:${enc};S:${ssid};P:${pass};H:${hidden};;`;
    }

    case "location": {
      const lat = data.latitude;
      const lng = data.longitude;
      if (lat === "" || lng === "" || lat === undefined || lng === undefined) return "";
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    case "contact": {
      const fn = `${data.firstName || ""} ${data.lastName || ""}`.trim();
      if (!fn && !data.company && !data.cellPhone && !data.workPhone) return "";
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${data.lastName || ""};${data.firstName || ""};;;`,
        `FN:${fn || data.company || "Contato"}`,
        data.company ? `ORG:${data.company}` : null,
        data.title ? `TITLE:${data.title}` : null,
        data.cellPhone ? `TEL;TYPE=CELL:${data.cellPhone}` : null,
        data.workPhone ? `TEL;TYPE=WORK:${data.workPhone}` : null,
        data.contactEmail ? `EMAIL;TYPE=INTERNET:${data.contactEmail}` : null,
        data.website ? `URL:${data.website}` : null,
        data.street || data.city ? `ADR;TYPE=WORK:;;${data.street || ""};${data.city || ""};${data.state || ""};${data.zip || ""};${data.country || ""}` : null,
        "END:VCARD",
      ];
      return lines.filter(Boolean).join("\n");
    }

    case "event": {
      if (!data.eventTitle && !data.startDate) return "";
      const formatIcsDate = (dateStr?: string) => {
        if (!dateStr) return "";
        try {
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return "";
          return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        } catch {
          return "";
        }
      };

      const dtStart = formatIcsDate(data.startDate);
      const dtEnd = formatIcsDate(data.endDate || data.startDate);

      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//QR MASTER//PT",
        "BEGIN:VEVENT",
        `SUMMARY:${data.eventTitle || "Evento"}`,
        data.eventDescription ? `DESCRIPTION:${data.eventDescription}` : null,
        data.eventLocation ? `LOCATION:${data.eventLocation}` : null,
        dtStart ? `DTSTART:${dtStart}` : null,
        dtEnd ? `DTEND:${dtEnd}` : null,
        "END:VEVENT",
        "END:VCALENDAR",
      ];
      return lines.filter(Boolean).join("\n");
    }

    case "pix": {
      if (!data.pixKey) return "";
      return generatePixPayload({
        pixKey: data.pixKey.trim(),
        merchantName: data.merchantName || "QR MASTER RECEBEDOR",
        merchantCity: data.merchantCity || "SAO PAULO",
        amount: data.amount,
        txId: data.txId,
        infoMessage: data.infoMessage,
      });
    }

    case "social": {
      let url = (data.socialUrl || "").trim();
      if (!url) return "";
      if (!/^https?:\/\//i.test(url)) {
        const clean = url.replace(/^@/, "");
        const platform = data.socialPlatform || "instagram";
        if (platform === "instagram") url = `https://instagram.com/${clean}`;
        else if (platform === "youtube") url = `https://youtube.com/@${clean}`;
        else if (platform === "tiktok") url = `https://tiktok.com/@${clean}`;
        else if (platform === "facebook") url = `https://facebook.com/${clean}`;
        else if (platform === "linkedin") url = `https://linkedin.com/in/${clean}`;
        else if (platform === "x") url = `https://x.com/${clean}`;
        else if (platform === "telegram") url = `https://t.me/${clean}`;
        else url = "https://" + url;
      }
      return url;
    }

    case "multilink": {
      if (data.url) return data.url;
      if (data.multiLinkId) return `https://qrmasterdigital.com/m/${data.multiLinkId}`;
      return "";
    }

    default:
      return data.url || "";
  }
}
