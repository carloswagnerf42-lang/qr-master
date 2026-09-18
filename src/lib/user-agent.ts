import crypto from "crypto";

export interface ParsedClientInfo {
  device: "Mobile" | "Tablet" | "Desktop";
  browser: "Chrome" | "Safari" | "Firefox" | "Edge" | "Opera" | "Samsung" | "Other";
  os: "Android" | "iOS" | "Windows" | "macOS" | "Linux" | "Other";
  ipHash: string;
}

export function parseUserAgent(uaString: string | null = "", ip: string | null = ""): ParsedClientInfo {
  const ua = (uaString || "").toLowerCase();

  // 1. Detect Device
  let device: ParsedClientInfo["device"] = "Desktop";
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
    device = "Tablet";
  } else if (/mobi|iphone|ipod|android.*mobile|blackberry|windows phone/i.test(ua)) {
    device = "Mobile";
  }

  // 2. Detect OS
  let os: ParsedClientInfo["os"] = "Other";
  if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/windows nt/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  // 3. Detect Browser
  let browser: ParsedClientInfo["browser"] = "Other";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/samsungbrowser/i.test(ua)) browser = "Samsung";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Safari";

  // 4. LGPD Compliant IP Anonymization (SHA-256 with static salt, irreversível)
  const salt = process.env.AUTH_SECRET || "qrmaster-privacy-salt";
  const rawIp = ip || "127.0.0.1";
  const ipHash = crypto.createHmac("sha256", salt).update(rawIp).digest("hex").substring(0, 16);

  return { device, os, browser, ipHash };
}
