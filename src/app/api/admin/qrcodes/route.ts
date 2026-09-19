import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.success) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const status = searchParams.get("status");
    const type = searchParams.get("type");

    const whereClause: Record<string, unknown> = {
      deletedAt: null,
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { shortCode: { contains: search, mode: "insensitive" } },
        { destination: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (status && (status === "ACTIVE" || status === "INACTIVE")) {
      whereClause.status = status;
    }

    if (type) {
      whereClause.type = type;
    }

    const qrcodes = await prisma.qRCode.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        type: true,
        isDynamic: true,
        shortCode: true,
        destination: true,
        status: true,
        scanCount: true,
        lastScanAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100, // Limite de visualização para performance
    });

    return NextResponse.json({
      success: true,
      qrcodes,
      total: qrcodes.length,
    });
  } catch (error) {
    console.error("Erro ao listar QR Codes no painel administrativo:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao listar QR Codes." },
      { status: 500 }
    );
  }
}
