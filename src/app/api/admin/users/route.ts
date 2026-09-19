import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.success) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const role = searchParams.get("role");
    const planId = searchParams.get("planId");

    const whereClause: Record<string, unknown> = {};

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    if (role && (role === "USER" || role === "ADMIN")) {
      whereClause.role = role;
    }

    if (planId) {
      whereClause.planId = planId;
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        company: true,
        phone: true,
        planId: true,
        createdAt: true,
        plan: {
          select: {
            id: true,
            name: true,
            displayName: true,
            priceMonth: true,
            priceYear: true,
          },
        },
        subscription: {
          select: {
            id: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
          },
        },
        _count: {
          select: {
            qrCodes: true,
            campaigns: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      {
        success: true,
        users,
        total: users.length,
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
    console.error("Erro ao listar usuários no painel administrativo:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao listar usuários." },
      { status: 500 }
    );
  }
}
