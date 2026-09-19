import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.success) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const action = searchParams.get("action");

    const whereClause: Record<string, unknown> = {};

    if (search) {
      whereClause.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { action: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (action && action !== "ALL") {
      whereClause.action = action;
    }

    const logs = await prisma.activityLog.findMany({
      where: whereClause,
      select: {
        id: true,
        action: true,
        entityId: true,
        description: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      logs,
      total: logs.length,
    });
  } catch (error) {
    console.error("Erro ao listar logs no painel administrativo:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao listar logs." },
      { status: 500 }
    );
  }
}
