import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getSession, signToken, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserPlanAndUsage, can } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  const [userContext, availablePlans] = await Promise.all([
    getUserPlanAndUsage(user.id),
    prisma.plan.findMany({
      orderBy: { priceMonth: "asc" },
      select: {
        id: true,
        name: true,
        displayName: true,
        priceMonth: true,
        priceYear: true,
        maxQRCodes: true,
        maxQRCodesYear: true,
        dynamicQRs: true,
        analytics: true,
        exportSvg: true,
        exportPdf: true,
        customLogo: true,
        campaigns: true,
      },
    }),
  ]);

  const maxQRs = userContext?.plan?.maxQRCodes ?? 5;
  const currentQRs = userContext?.qrCodeCount || 0;

  return NextResponse.json(
    {
      authenticated: true,
      user,
      plan: userContext?.plan || null,
      availablePlans,
      usage: {
        qrCodes: currentQRs,
        maxQRCodes: maxQRs,
        remainingQRCodes: Math.max(0, maxQRs - currentQRs),
        totalQrCodes: userContext?.totalQrCodeCount || 0,
        isYearly: Boolean(userContext?.isYearly),
        currentMonthStart: userContext?.currentMonthStart || null,
        currentMonthEnd: userContext?.currentMonthEnd || null,
      },
      permissions: {
        create_qr: can(userContext, "create_qr"),
        dynamic_qr: can(userContext, "dynamic_qr"),
        analytics: can(userContext, "analytics"),
        export_svg: can(userContext, "export_svg"),
        export_pdf: can(userContext, "export_pdf"),
        customLogo: can(userContext, "custom_logo"),
        campaigns: can(userContext, "campaigns"),
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
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { name, email, company, phone, avatarUrl, settings } = body;

    const dataToUpdate: {
      name?: string;
      email?: string;
      company?: string | null;
      phone?: string | null;
      avatarUrl?: string | null;
    } = {};

    if (typeof name === "string" && name.trim()) {
      dataToUpdate.name = name.trim();
    }

    let emailChanged = false;
    if (typeof email === "string" && email.trim()) {
      const cleanEmail = email.toLowerCase().trim();
      const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
      if (!emailRegex.test(cleanEmail)) {
        return NextResponse.json({ error: "Formato de e-mail inválido." }, { status: 400 });
      }

      if (cleanEmail !== session.email) {
        const existing = await prisma.user.findUnique({
          where: { email: cleanEmail },
        });
        if (existing && existing.id !== session.id) {
          return NextResponse.json(
            { error: "Este endereço de e-mail já está sendo utilizado por outra conta." },
            { status: 409 }
          );
        }
        dataToUpdate.email = cleanEmail;
        emailChanged = true;
      }
    }

    if (company !== undefined) {
      dataToUpdate.company = company ? String(company).trim() : null;
    }
    if (phone !== undefined) {
      dataToUpdate.phone = phone ? String(phone).trim() : null;
    }
    if (avatarUrl !== undefined) {
      dataToUpdate.avatarUrl = avatarUrl ? String(avatarUrl).trim() : null;
    }

    // 1. Atualiza dados cadastrais do usuário
    const updatedUser = await prisma.user.update({
      where: { id: session.id },
      data: dataToUpdate,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        company: true,
        phone: true,
        avatarUrl: true,
        planId: true,
        createdAt: true,
        settings: true,
      },
    });

    // 2. Atualiza ou cria as preferências reais de UserSettings caso enviadas
    if (settings && typeof settings === "object") {
      const settingsData: Record<string, unknown> = {};

      if (typeof settings.notifyNewScans === "boolean") {
        settingsData.notifyNewScans = settings.notifyNewScans;
      }
      if (typeof settings.notifyWeeklyReport === "boolean") {
        settingsData.notifyWeeklyReport = settings.notifyWeeklyReport;
      }
      if (typeof settings.notifyLimitAlert === "boolean") {
        settingsData.notifyLimitAlert = settings.notifyLimitAlert;
      }
      if (typeof settings.analyticsConsent === "boolean") {
        settingsData.analyticsConsent = settings.analyticsConsent;
      }
      if (typeof settings.dataRetentionDays === "number") {
        settingsData.dataRetentionDays = settings.dataRetentionDays;
      }
      if (typeof settings.language === "string") {
        settingsData.language = settings.language;
      }
      if (typeof settings.theme === "string") {
        settingsData.theme = settings.theme;
      }

      if (Object.keys(settingsData).length > 0) {
        const updatedSettings = await prisma.userSettings.upsert({
          where: { userId: session.id },
          create: {
            userId: session.id,
            ...settingsData,
          },
          update: settingsData,
        });
        updatedUser.settings = updatedSettings;
      }
    }

    // 3. Se o e-mail ou nome mudou, atualiza o token de sessão JWT
    if (emailChanged || (dataToUpdate.name && dataToUpdate.name !== session.name)) {
      const newToken = signToken({
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        planId: updatedUser.planId,
      });
      setSessionCookie(newToken);
    }

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Erro ao atualizar perfil e preferências:", error);
    return NextResponse.json({ error: "Erro interno ao atualizar perfil." }, { status: 500 });
  }
}
