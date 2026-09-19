import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";
import { generateUniqueShortCode } from "@/lib/short-code";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(req);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const original = await prisma.qRCode.findFirst({
      where: { id: params.id, userId: session.id },
    });

    if (!original) return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });

    // Validação de limites e permissões
    const userContext = await getUserPlanAndUsage(session.id);
    if (!userContext) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    const canCreate = checkPermission(userContext, "create_qr");
    if (!canCreate.allowed) {
      return NextResponse.json(
        {
          error: canCreate.reason,
          code: canCreate.code,
          requiredPlan: canCreate.requiredPlan,
          limit: canCreate.limit,
          current: canCreate.current,
        },
        { status: 403 }
      );
    }

    if (original.isDynamic) {
      const canDynamic = checkPermission(userContext, "dynamic_qr");
      if (!canDynamic.allowed) {
        return NextResponse.json(
          {
            error: canDynamic.reason,
            code: canDynamic.code,
            requiredPlan: canDynamic.requiredPlan,
          },
          { status: 403 }
        );
      }
    }

    const duplicated = await prisma.$transaction(async (tx) => {
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.id}))`;
      } catch {
        // Fallback para outros ambientes
      }

      if (userContext.role !== "ADMIN") {
        const currentMonthStart = userContext.currentMonthStart || new Date();
        const currentCount = await tx.qRCode.count({
          where: {
            userId: session.id,
            deletedAt: null,
            createdAt: {
              gte: currentMonthStart,
            },
          },
        });

        const effectiveLimit = userContext.currentMonthLimit ?? userContext.plan?.maxQRCodes ?? 5;
        if (currentCount >= effectiveLimit) {
          const resetDateStr = userContext.currentMonthEnd
            ? new Date(userContext.currentMonthEnd).toLocaleDateString("pt-BR")
            : "o próximo ciclo";

          const reason = `Você atingiu o limite mensal de ${effectiveLimit} QR Codes do plano ${userContext.plan?.name || "FREE"}. Sua cota renova em ${resetDateStr}.`;
          const limitErr: any = new Error(reason);
          limitErr.code = "LIMIT_REACHED";
          limitErr.status = 403;
          limitErr.limit = effectiveLimit;
          limitErr.current = currentCount;
          limitErr.requiredPlan = userContext.plan?.name === "FREE" ? "PRO" : "BUSINESS";
          throw limitErr;
        }
      }

      let newShortCode = null;
      if (original.isDynamic) {
        newShortCode = await generateUniqueShortCode(tx as any);
      }

      const copy = await tx.qRCode.create({
        data: {
          userId: session.id,
          name: `${original.name} (Cópia)`,
          description: original.description,
          type: original.type,
          isDynamic: original.isDynamic,
          shortCode: newShortCode,
          destination: original.destination,
          content: original.content,
          styleConfig: original.styleConfig,
          categoryId: original.categoryId,
          campaignId: original.campaignId,
          logoUrl: original.logoUrl,
          status: "ACTIVE",
          favorite: false,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.id,
          action: "CREATE_QR",
          entityId: copy.id,
          description: `QR Code "${copy.name}" duplicado a partir de "${original.name}".`,
        },
      });

      return copy;
    });

    return NextResponse.json({ success: true, qrCode: duplicated });
  } catch (error: any) {
    if (error?.code === "LIMIT_REACHED") {
      return NextResponse.json(
        {
          error: error.message,
          code: "LIMIT_REACHED",
          requiredPlan: error.requiredPlan,
          limit: error.limit,
          current: error.current,
        },
        { status: 403 }
      );
    }
    console.error("Erro ao duplicar:", error);
    return NextResponse.json({ error: "Erro ao duplicar QR Code" }, { status: 500 });
  }
}
