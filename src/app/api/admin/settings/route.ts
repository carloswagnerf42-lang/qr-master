import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.success) return auth.errorResponse;

    const [
      userCount,
      qrCount,
      scanCount,
      planCount,
      campaignCount,
      fileCount,
      logCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.qRCode.count(),
      prisma.qRCodeScan.count(),
      prisma.plan.count(),
      prisma.campaign.count(),
      prisma.generatedFile.count(),
      prisma.activityLog.count(),
    ]);

    // Detecção segura de configurações de ambiente (sem vazar segredos)
    const isSupabaseDb = !!process.env.DATABASE_URL?.includes("supabase");
    const isSupabaseStorage = !!(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    return NextResponse.json({
      success: true,
      settings: {
        platform: {
          name: "QR MASTER",
          version: "1.0.0",
          nodeVersion: process.version,
          environment: process.env.NODE_ENV || "development",
          uptimeSeconds: Math.floor(process.uptime()),
        },
        infrastructure: {
          database: {
            provider: "PostgreSQL",
            hostType: isSupabaseDb ? "Supabase PostgreSQL (Managed)" : "PostgreSQL",
            connected: true,
            tablesStats: {
              users: userCount,
              qrcodes: qrCount,
              scans: scanCount,
              plans: planCount,
              campaigns: campaignCount,
              generatedFiles: fileCount,
              activityLogs: logCount,
            },
          },
          storage: {
            mode: isSupabaseStorage ? "Supabase Storage (Cloud)" : "Local Filesystem Fallback",
            configured: isSupabaseStorage,
            defaultBucket: "qrmaster-files",
          },
          security: {
            multiTenantIsolation: "Enforced by server userId matching",
            jwtCookieHttpOnly: true,
            authSecretConfigured: !!process.env.AUTH_SECRET,
            rateLimitingScans: "60 req/min per IP hash",
          },
        },
      },
    });
  } catch (error) {
    console.error("Erro ao obter configurações administrativas:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao ler configurações." },
      { status: 500 }
    );
  }
}
