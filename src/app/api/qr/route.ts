import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";
import { generateUniqueShortCode } from "@/lib/short-code";
import { validateAndNormalizeDestination } from "@/lib/dynamic-redirect";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { validateQRContent, formatQRDestination } from "@/lib/qr-generator";

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

    // Rate Limiting técnico por usuário autenticado (30 requisições por 60 segundos)
    try {
      const rateCheck = await checkRateLimit(session.id, "qr");
      if (!rateCheck.allowed) {
        return createRateLimitResponse("qr", rateCheck.retryAfter, rateCheck.resetAt);
      }
    } catch (rlError) {
      // Fail-open: falhas inesperadas no rate limiter não devem impedir operação legítima
      console.error("[RateLimit:QR] Falha ao verificar rate limit (fail-open):", rlError);
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

    const effectiveDestination =
      type === "contact" && content && typeof content === "object"
        ? formatQRDestination("contact", content) || destination
        : destination;

    if (!name || !effectiveDestination) {
      return NextResponse.json(
        { error: "Nome e destino do QR Code são obrigatórios." },
        { status: 400 }
      );
    }

    // Validação profunda de campos por tipo de QR Code
    if (type && content && typeof content === "object") {
      const contentCheck = validateQRContent(type, content);
      if (!contentCheck.valid) {
        return NextResponse.json(
          { error: contentCheck.error || "Conteúdo do QR Code inválido." },
          { status: 400 }
        );
      }
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

    // Validação estrita de propriedade (Anti-IDOR) de Categoria e Campanha
    let finalCategoryId: string | null = null;
    if (categoryId && typeof categoryId === "string") {
      const cat = await prisma.category.findFirst({
        where: { id: categoryId, userId: session.id },
        select: { id: true },
      });
      if (!cat) {
        return NextResponse.json(
          { error: "Categoria inválida ou não encontrada." },
          { status: 400 }
        );
      }
      finalCategoryId = cat.id;
    }

    let finalCampaignId: string | null = null;
    if (campaignId && typeof campaignId === "string") {
      const camp = await prisma.campaign.findFirst({
        where: { id: campaignId, userId: session.id },
        select: { id: true },
      });
      if (!camp) {
        return NextResponse.json(
          { error: "Campanha inválida ou não encontrada." },
          { status: 400 }
        );
      }
      finalCampaignId = camp.id;
    }

    // 5. Validação de formato e segurança do destino
    const destValidation = validateAndNormalizeDestination(effectiveDestination);
    if (!destValidation.valid || !destValidation.sanitizedUrl) {
      return NextResponse.json(
        { error: destValidation.error || "Destino inválido." },
        { status: 400 }
      );
    }
    const finalDestination = destValidation.sanitizedUrl;

    // Criação transacional protegida por lock transacional contra race conditions
    const createdQrCode = await prisma.$transaction(async (tx) => {
      // 1. Lock transacional por usuário no PostgreSQL para garantir que chamadas simultâneas
      // do mesmo usuário não ultrapassem a cota mensal
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.id}))`;
      } catch {
        // Fallback gracioso para ambientes que não utilizem PostgreSQL direto
      }

      // 2. Re-avaliação da cota mensal dentro da transação protegida
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

      let shortCode = null;
      if (isDynamic) {
        shortCode = await generateUniqueShortCode(tx as any);
      }

      const qrCode = await tx.qRCode.create({
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
          categoryId: finalCategoryId,
          campaignId: finalCampaignId,
          logoUrl: logoUrl || null,
          status: "ACTIVE",
        },
        include: {
          category: true,
          campaign: true,
        },
      });

      // Registra log
      await tx.activityLog.create({
        data: {
          userId: session.id,
          action: "CREATE_QR",
          entityId: qrCode.id,
          description: `QR Code "${qrCode.name}" (${isDynamic ? "Dinâmico" : "Estático"}) foi criado.`,
        },
      });

      return qrCode;
    });

    return NextResponse.json({ success: true, qrCode: createdQrCode });
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
    console.error("Erro ao criar QR Code:", error);
    return NextResponse.json({ error: "Erro ao salvar QR Code" }, { status: 500 });
  }
}
