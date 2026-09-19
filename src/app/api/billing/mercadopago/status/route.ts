import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMercadoPagoPaymentStatus } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get("paymentId");

    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId é obrigatório para consultar o status." },
        { status: 400 }
      );
    }

    const statusData = await getMercadoPagoPaymentStatus(paymentId, session.id);

    return NextResponse.json(
      {
        success: true,
        ...statusData,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error: any) {
    if (error?.status === 403 || error?.message?.includes("Acesso negado")) {
      return NextResponse.json(
        { error: "Acesso negado: você não tem permissão para consultar este pagamento." },
        { status: 403 }
      );
    }
    console.error("Erro ao verificar status do pagamento Pix:", error);
    return NextResponse.json(
      { error: error?.message || "Falha ao consultar status do pagamento." },
      { status: 500 }
    );
  }
}
