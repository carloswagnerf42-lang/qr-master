/**
 * Resolves the base public application URL for custom domains.
 * 1. Prioritizes NEXT_PUBLIC_APP_URL (e.g. https://seudominio.com or seudominio.com).
 * 2. In client runtime, uses window.location.origin (automatically matches current custom domain).
 * 3. In Vercel deployments, falls back to process.env.VERCEL_URL.
 * 4. In local development SSR fallback, returns http://localhost:3000.
 */
export function getAppUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim() !== "") {
    let clean = envUrl.trim().replace(/\/$/, "");
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    return clean;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}
