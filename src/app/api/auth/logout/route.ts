import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  extractTokenFromRequest,
  verifyToken,
  revokeServerSession,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const token = extractTokenFromRequest(req);
    if (token) {
      const decoded = verifyToken(token);
      if (decoded?.sid) {
        await revokeServerSession(decoded.sid);
      }
    }
  } catch (error) {
    console.error("Erro ao revogar sessão no logout:", error);
  }

  clearSessionCookie();
  return NextResponse.json({ success: true, message: "Sessão encerrada com sucesso." });
}
