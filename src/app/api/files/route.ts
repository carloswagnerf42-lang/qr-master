import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileType = searchParams.get("fileType");
    const qrCodeId = searchParams.get("qrCodeId");

    // "Meus Arquivos" exibe visualmente apenas os tipos de exportação gerados (png, svg, pdf),
    // preservando a separação estrita entre a listagem visual e a contabilidade global de cota.
    const VISUAL_EXPORT_TYPES = ["png", "svg", "pdf"];

    const where: Record<string, unknown> = {
      userId: session.id,
    };

    if (fileType && fileType !== "all") {
      where.fileType = fileType;
    } else {
      where.fileType = { in: VISUAL_EXPORT_TYPES };
    }

    if (qrCodeId && qrCodeId !== "all") {
      where.qrCodeId = qrCodeId;
    }

    const files = await prisma.generatedFile.findMany({
      where,
      include: {
        qrCode: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      files,
      total: files.length,
    });
  } catch (error) {
    console.error("Erro ao listar arquivos:", error);
    return NextResponse.json({ error: "Erro ao buscar arquivos salvos." }, { status: 500 });
  }
}
