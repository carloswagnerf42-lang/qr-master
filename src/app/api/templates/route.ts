import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await prisma.template.findMany({
      orderBy: [{ isPopular: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Erro ao buscar templates:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
