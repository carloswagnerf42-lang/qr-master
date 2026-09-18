import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileType = searchParams.get("fileType");
    const qrCodeId = searchParams.get("qrCodeId");

    const where: Record<string, unknown> = {
      userId: session.id,
    };

    if (fileType && fileType !== "all") {
      where.fileType = fileType;
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
