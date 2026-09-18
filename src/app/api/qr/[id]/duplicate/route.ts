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
    const session = await getSession();
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

    let newShortCode = null;
    if (original.isDynamic) {
      newShortCode = await generateUniqueShortCode(prisma);
    }

    const duplicated = await prisma.qRCode.create({
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

    await prisma.activityLog.create({
      data: {
        userId: session.id,
        action: "CREATE_QR",
        entityId: duplicated.id,
        description: `QR Code "${duplicated.name}" duplicado a partir de "${original.name}".`,
      },
    });

    return NextResponse.json({ success: true, qrCode: duplicated });
  } catch (error) {
    console.error("Erro ao duplicar:", error);
    return NextResponse.json({ error: "Erro ao duplicar QR Code" }, { status: 500 });
  }
}
