import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const campaigns = await prisma.campaign.findMany({
      where: { userId: session.id },
      include: {
        _count: {
          select: { qrCodes: { where: { deletedAt: null } } },
        },
        qrCodes: {
          select: { scanCount: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = campaigns.map((c) => ({
      ...c,
      totalScans: c.qrCodes.reduce((sum, q) => sum + q.scanCount, 0),
    }));

    return NextResponse.json({ campaigns: formatted });
  } catch (error) {
    console.error("Erro ao buscar campanhas:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    // Validação central de permissão para gerenciamento de campanhas
    const userContext = await getUserPlanAndUsage(session.id);
    if (!userContext) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

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

    const { name, description, startDate, endDate } = await req.json();
    if (!name) return NextResponse.json({ error: "Nome da campanha é obrigatório" }, { status: 400 });

    const campaign = await prisma.campaign.create({
      data: {
        userId: session.id,
        name: name.trim(),
        description: description ? description.trim() : null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: "ACTIVE",
      },
    });

    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    console.error("Erro ao criar campanha:", error);
    return NextResponse.json({ error: "Erro ao criar campanha" }, { status: 500 });
  }
}
