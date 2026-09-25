import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";
import { validateAndNormalizeDestination } from "@/lib/dynamic-redirect";
import { updateUserQRCode, deleteUserQRCode, QRCodeNotFoundError } from "@/lib/qr-service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(req);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const qr = await prisma.qRCode.findFirst({
      where: {
        id: params.id,
        userId: session.id,
      },
      include: {
        category: true,
        campaign: true,
      },
    });

    if (!qr) return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });

    return NextResponse.json({ qrCode: qr });
  } catch (error) {
    console.error("Erro ao buscar QR:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(req);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const existing = await prisma.qRCode.findFirst({
      where: { id: params.id, userId: session.id },
    });

    if (!existing) return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });

    const body = await req.json();
    const {
      name,
      description,
      destination,
      content,
      styleConfig,
      categoryId,
      campaignId,
      status,
      favorite,
      logoUrl,
    } = body;

    // Validação de permissões para recursos PRO/BUSINESS
    const isAddingLogo = Boolean(
      (logoUrl && logoUrl !== existing.logoUrl) ||
      (styleConfig && typeof styleConfig === "object" && styleConfig.logoUrl && styleConfig.logoUrl !== existing.logoUrl)
    );
    const isAddingCampaign = Boolean(campaignId && campaignId !== existing.campaignId);
    const isEditingDynamicDestination = Boolean(
      existing.isDynamic && destination !== undefined && destination !== existing.destination
    );

    if (isAddingLogo || isAddingCampaign || isEditingDynamicDestination) {
      const userContext = await getUserPlanAndUsage(session.id);
      if (!userContext) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

      if (isEditingDynamicDestination) {
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

      if (isAddingLogo) {
        const canLogo = checkPermission(userContext, "custom_logo");
        if (!canLogo.allowed) {
          return NextResponse.json(
            {
              error: canLogo.reason,
              code: canLogo.code,
              requiredPlan: canLogo.requiredPlan,
            },
            { status: 403 }
          );
        }
      }

      if (isAddingCampaign) {
        const canCampaign = checkPermission(userContext, "campaigns");
        if (!canCampaign.allowed) {
          return NextResponse.json(
            {
              error: canCampaign.reason,
              code: canCampaign.code,
              requiredPlan: canCampaign.requiredPlan,
            },
            { status: 403 }
          );
        }
      }
    }

    // Validação de destino contra URLs perigosas e detecção de loops
    let finalDestination = existing.destination;
    if (destination !== undefined) {
      const destValidation = validateAndNormalizeDestination(destination, existing.shortCode);
      if (!destValidation.valid || !destValidation.sanitizedUrl) {
        return NextResponse.json(
          { error: destValidation.error || "Destino inválido." },
          { status: 400 }
        );
      }
      finalDestination = destValidation.sanitizedUrl;
    }

    // Validação de propriedade de categoria e campanha pertencentes ao mesmo usuário
    let finalCategoryId = existing.categoryId;
    if (categoryId !== undefined) {
      if (categoryId) {
        const cat = await prisma.category.findFirst({
          where: { id: categoryId, userId: session.id },
          select: { id: true },
        });
        finalCategoryId = cat ? cat.id : null;
      } else {
        finalCategoryId = null;
      }
    }

    let finalCampaignId = existing.campaignId;
    if (campaignId !== undefined) {
      if (campaignId) {
        const camp = await prisma.campaign.findFirst({
          where: { id: campaignId, userId: session.id },
          select: { id: true },
        });
        finalCampaignId = camp ? camp.id : null;
      } else {
        finalCampaignId = null;
      }
    }

    let finalContent = existing.content;
    if (content !== undefined) {
      finalContent = typeof content === "string" ? content : JSON.stringify(content);
    } else if (destination !== undefined) {
      try {
        const parsed = JSON.parse(existing.content);
        if (typeof parsed === "object" && parsed !== null) {
          if (parsed.url !== undefined) parsed.url = finalDestination;
          if (parsed.website !== undefined) parsed.website = finalDestination;
          finalContent = JSON.stringify(parsed);
        }
      } catch {
        // If not JSON, leave existing
      }
    }

    const updated = await updateUserQRCode({
      qrId: params.id,
      userId: session.id,
      data: {
        name: name !== undefined ? name.trim() : existing.name,
        description: description !== undefined ? (description ? description.trim() : null) : existing.description,
        destination: finalDestination,
        content: finalContent,
        styleConfig: styleConfig !== undefined ? (typeof styleConfig === "string" ? styleConfig : JSON.stringify(styleConfig)) : existing.styleConfig,
        categoryId: finalCategoryId,
        campaignId: finalCampaignId,
        status: status !== undefined ? status : existing.status,
        favorite: favorite !== undefined ? !!favorite : existing.favorite,
        logoUrl: logoUrl !== undefined ? logoUrl : existing.logoUrl,
      },
    });

    // Registra atividade
    await prisma.activityLog.create({
      data: {
        userId: session.id,
        action: "UPDATE_QR",
        entityId: updated.id,
        description: `QR Code "${updated.name}" foi atualizado.`,
      },
    });

    return NextResponse.json({ success: true, qrCode: updated });
  } catch (error: any) {
    if (error?.status === 404 || error instanceof QRCodeNotFoundError) {
      return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });
    }
    console.error("Erro ao atualizar QR:", error);
    return NextResponse.json({ error: "Erro ao atualizar QR Code" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(req);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const existing = await prisma.qRCode.findFirst({
      where: { id: params.id, userId: session.id },
    });

    if (!existing) return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const permanent = searchParams.get("permanent") === "true";

    const result = await deleteUserQRCode({
      qrId: params.id,
      userId: session.id,
      permanent,
    });

    await prisma.activityLog.create({
      data: {
        userId: session.id,
        action: result.permanent ? "DELETE_PERMANENT" : "DELETE_QR",
        entityId: result.permanent ? undefined : result.qr.id,
        description: result.permanent
          ? `QR Code "${result.qr.name}" foi excluído definitivamente.`
          : `QR Code "${result.qr.name}" movido para a lixeira.`,
      },
    });

    return NextResponse.json({
      success: true,
      message: result.permanent ? "Excluído permanentemente." : "Movido para a lixeira com sucesso.",
    });
  } catch (error: any) {
    if (error?.status === 404 || error instanceof QRCodeNotFoundError) {
      return NextResponse.json({ error: "QR Code não encontrado" }, { status: 404 });
    }
    console.error("Erro ao deletar QR:", error);
    return NextResponse.json({ error: "Erro ao deletar QR Code" }, { status: 500 });
  }
}
