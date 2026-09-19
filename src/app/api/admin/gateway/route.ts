import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/admin";
import { getMercadoPagoConfigAsync } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.success) return auth.errorResponse;

    const config = await getMercadoPagoConfigAsync();

    let maskedToken = "";
    if (config.accessToken) {
      if (config.accessToken.length > 12) {
        maskedToken = `${config.accessToken.slice(0, 7)}...${config.accessToken.slice(-4)}`;
      } else {
        maskedToken = "********";
      }
    }

    let maskedWebhookSecret = "";
    if (config.webhookSecret) {
      if (config.webhookSecret.length > 8) {
        maskedWebhookSecret = `${config.webhookSecret.slice(0, 4)}...${config.webhookSecret.slice(-4)}`;
      } else {
        maskedWebhookSecret = "********";
      }
    }

    return NextResponse.json(
      {
        success: true,
        mercadopago: {
          isConfigured: config.isConfigured,
          maskedToken,
          publicKey: config.publicKey ? `${config.publicKey.slice(0, 6)}...` : "",
          hasWebhookSecret: Boolean(config.webhookSecret),
          maskedWebhookSecret,
          hasEnvToken: Boolean(process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao carregar configurações de gateway:", error);
    return NextResponse.json(
      { error: "Erro interno ao carregar configurações de gateway." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.success) return auth.errorResponse;

    const body = await req.json();
    const { accessToken, publicKey, webhookSecret } = body;

    if (accessToken !== undefined) {
      const cleanToken = typeof accessToken === "string" ? accessToken.trim() : "";
      await prisma.systemSetting.upsert({
        where: { key: "MP_ACCESS_TOKEN" },
        create: { key: "MP_ACCESS_TOKEN", value: cleanToken },
        update: { value: cleanToken },
      });
    }

    if (publicKey !== undefined) {
      const cleanKey = typeof publicKey === "string" ? publicKey.trim() : "";
      await prisma.systemSetting.upsert({
        where: { key: "NEXT_PUBLIC_MP_PUBLIC_KEY" },
        create: { key: "NEXT_PUBLIC_MP_PUBLIC_KEY", value: cleanKey },
        update: { value: cleanKey },
      });
    }

    if (webhookSecret !== undefined) {
      const cleanSecret = typeof webhookSecret === "string" ? webhookSecret.trim().replace(/^["']|["']$/g, "").trim() : "";
      await prisma.systemSetting.upsert({
        where: { key: "MP_WEBHOOK_SECRET" },
        create: { key: "MP_WEBHOOK_SECRET", value: cleanSecret },
        update: { value: cleanSecret },
      });
    }

    await logAdminAction({
      adminId: auth.admin.id,
      action: "UPDATE_PAYMENT_GATEWAY",
      description: "Atualizou as credenciais do Mercado Pago no painel administrativo.",
    });

    revalidatePath("/admin");
    revalidatePath("/settings");

    const updatedConfig = await getMercadoPagoConfigAsync();

    return NextResponse.json({
      success: true,
      message: "Credenciais do Mercado Pago salvas com sucesso!",
      isConfigured: updatedConfig.isConfigured,
    });
  } catch (error) {
    console.error("Erro ao salvar configurações de gateway:", error);
    return NextResponse.json(
      { error: "Erro interno ao salvar configurações de gateway." },
      { status: 500 }
    );
  }
}
