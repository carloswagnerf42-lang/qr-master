import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: { priceMonth: "asc" },
      select: {
        id: true,
        name: true,
        displayName: true,
        priceMonth: true,
        priceYear: true,
        maxQRCodes: true,
        maxQRCodesYear: true,
        dynamicQRs: true,
        analytics: true,
        exportSvg: true,
        exportPdf: true,
        customLogo: true,
        campaigns: true,
      },
    });

    return NextResponse.json(
      { success: true, plans },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao listar planos públicos:", error);
    return NextResponse.json(
      { error: "Falha ao carregar planos." },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
