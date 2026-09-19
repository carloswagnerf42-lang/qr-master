import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";
import { generateUniqueShortCode } from "@/lib/short-code";
import { validateAndNormalizeDestination } from "@/lib/dynamic-redirect";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId") || "";
    const campaignId = searchParams.get("campaignId") || "";
    const status = searchParams.get("status") || "";
    const isDynamic = searchParams.get("isDynamic");
    const favorite = searchParams.get("favorite");
    const trash = searchParams.get("trash") === "true";
    const sortBy = searchParams.get("sortBy") || "newest";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      userId: session.id,
      deletedAt: trash ? { not: null } : null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { destination: { contains: search } },
        { shortCode: { contains: search } },
      ];
    }

    if (categoryId && categoryId !== "all") {
      where.categoryId = categoryId;
    }

    if (campaignId && campaignId !== "all") {
      where.campaignId = campaignId;
    }

    if (status && status !== "all") {
      where.status = status;
    }

    if (isDynamic !== null && isDynamic !== undefined && isDynamic !== "all") {
      where.isDynamic = isDynamic === "true";
    }

    if (favorite === "true") {
      where.favorite = true;
    }

    let orderBy: Record<string, string> = { createdAt: "desc" };
    if (sortBy === "oldest") orderBy = { createdAt: "asc" };
    if (sortBy === "mostScanned") orderBy = { scanCount: "desc" };
    if (sortBy === "leastScanned") orderBy = { scanCount: "asc" };
    if (sortBy === "nameAsc") orderBy = { name: "asc" };
    if (sortBy === "nameDesc") orderBy = { name: "desc" };

    const [total, qrCodes] = await Promise.all([
      prisma.qRCode.count({ where }),
      prisma.qRCode.findMany({
        where,
        include: {
          category: true,
          campaign: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      qrCodes,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Erro ao listar QR Codes:", error);
    return NextResponse.json({ error: "Erro ao buscar QR codes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      description,
      type,
      isDynamic,
      destination,
      content,
      styleConfig,
      categoryId,
      campaignId,
      logoUrl,
    } = body;

    if (!name || !destination) {
      return NextResponse.json(
        { error: "Nome e destino do QR Code são obrigatórios." },
        { status: 400 }
      );
    }

    // Validação central de limites e plano do usuário
    const userContext = await getUserPlanAndUsage(session.id);
    if (!userContext) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    // 1. Limite máximo de QR Codes
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

    // 2. Permissão para QR Code Dinâmico
    if (isDynamic) {
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

    // 3. Permissão para Logotipo Personalizado
    const hasCustomLogo = !!(logoUrl || (typeof styleConfig === "object" && styleConfig?.logoUrl));
    if (hasCustomLogo) {
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

    // 4. Permissão para Campanhas
    if (campaignId) {
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

    // 5. Validação de formato e segurança do destino
    const destValidation = validateAndNormalizeDestination(destination);
    if (!destValidation.valid || !destValidation.sanitizedUrl) {
      return NextResponse.json(
        { error: destValidation.error || "Destino inválido." },
        { status: 400 }
      );
    }
    const finalDestination = destValidation.sanitizedUrl;

    let shortCode = null;
    if (isDynamic) {
      shortCode = await generateUniqueShortCode(prisma);
    }

    const qrCode = await prisma.qRCode.create({
      data: {
        userId: session.id,
        name: name.trim(),
        description: description ? description.trim() : null,
        type: type || "url",
        isDynamic: !!isDynamic,
        shortCode,
        destination: finalDestination,
        content: typeof content === "string" ? content : JSON.stringify(content || {}),
        styleConfig: typeof styleConfig === "string" ? styleConfig : JSON.stringify(styleConfig || {}),
        categoryId: categoryId || null,
        campaignId: campaignId || null,
        logoUrl: logoUrl || null,
        status: "ACTIVE",
      },
      include: {
        category: true,
        campaign: true,
      },
    });

    // Registra log
    await prisma.activityLog.create({
      data: {
        userId: session.id,
        action: "CREATE_QR",
        entityId: qrCode.id,
        description: `QR Code "${qrCode.name}" (${isDynamic ? "Dinâmico" : "Estático"}) foi criado.`,
      },
    });

    return NextResponse.json({ success: true, qrCode });
  } catch (error) {
    console.error("Erro ao criar QR Code:", error);
    return NextResponse.json({ error: "Erro ao salvar QR Code" }, { status: 500 });
  }
}
