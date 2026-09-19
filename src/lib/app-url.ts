/**
 * Resolves the base public application URL for custom domains.
 * 1. Prioritizes NEXT_PUBLIC_APP_URL (e.g. https://seudominio.com or seudominio.com).
 * 2. In client runtime, uses window.location.origin (automatically matches current custom domain).
 * 3. In Vercel deployments, falls back to process.env.VERCEL_URL.
 * 4. In local development SSR fallback, returns http://localhost:3000.
 */
export function getAppUrl(): string {
  // 1. In client runtime, window.location.origin is the absolute ground truth
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  // 2. Prioritize explicit production environment variables (excluding localhost)
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim() !== "" && !envUrl.includes("localhost")) {
    let clean = envUrl.trim().replace(/\/$/, "");
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    return clean;
  }

  // 3. Vercel production deployment URLs
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  // 4. Localhost development fallback
  if (envUrl && envUrl.trim() !== "") {
    let clean = envUrl.trim().replace(/\/$/, "");
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    return clean;
  }

  return "http://localhost:3000";
}
