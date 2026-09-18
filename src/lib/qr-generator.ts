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
  // WhatsApp
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
 * Formata os dados no formato de texto/URI oficial do tipo correspondente
 */
export function formatQRDestination(type: QRCodeType, data: QRCodeContentPayload): string {
  switch (type) {
    case "url": {
      let rawUrl = (data.url || "").trim();
      if (!rawUrl) return "https://qrmaster.app";
      if (!/^https?:\/\//i.test(rawUrl)) {
        rawUrl = "https://" + rawUrl;
      }
      return rawUrl;
    }

    case "whatsapp": {
      const cleanPhone = (data.phone || "").replace(/\D/g, "");
      const msg = encodeURIComponent(data.message || "");
      return `https://wa.me/${cleanPhone}${msg ? `?text=${msg}` : ""}`;
    }

    case "text":
      return data.text || "";

    case "email": {
      const email = (data.email || "").trim();
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
      const cleanPhone = (data.phone || "").replace(/\D/g, "");
      return `tel:${cleanPhone}`;
    }

    case "sms": {
      const cleanPhone = (data.phone || "").replace(/\D/g, "");
      const msg = encodeURIComponent(data.message || "");
      return `sms:${cleanPhone}${msg ? `?body=${msg}` : ""}`;
    }

    case "wifi": {
      const enc = data.encryption || "WPA";
      const ssid = data.ssid || "";
      const pass = data.password || "";
      const hidden = data.hidden ? "true" : "false";
      return `WIFI:T:${enc};S:${ssid};P:${pass};H:${hidden};;`;
    }

    case "location": {
      const lat = data.latitude || 0;
      const lng = data.longitude || 0;
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    case "contact": {
      const fn = `${data.firstName || ""} ${data.lastName || ""}`.trim();
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${data.lastName || ""};${data.firstName || ""};;;`,
        `FN:${fn}`,
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
      const formatIcsDate = (dateStr?: string) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
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
      return generatePixPayload({
        pixKey: data.pixKey || "",
        merchantName: data.merchantName || "QR MASTER RECEBEDOR",
        merchantCity: data.merchantCity || "SAO PAULO",
        amount: data.amount,
        txId: data.txId,
        infoMessage: data.infoMessage,
      });
    }

    case "social": {
      let url = (data.socialUrl || "").trim();
      if (!url) return "https://instagram.com";
      if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
      }
      return url;
    }

    case "multilink": {
      return data.url || `https://qrmaster.app/m/${data.multiLinkId || ""}`;
    }

    default:
      return data.url || "https://qrmaster.app";
  }
}
