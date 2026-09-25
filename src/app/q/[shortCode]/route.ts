import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseUserAgent } from "@/lib/user-agent";
import { isValidShortCode } from "@/lib/short-code";
import { validateAndNormalizeDestination, checkShortCodeRateLimit } from "@/lib/dynamic-redirect";
import { normalizeVCardPayload } from "@/lib/qr-generator";
import { isSubscriptionActive } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Renderiza uma página de aviso profissional com design limpo e responsivo
 */
function renderStatusPage(
  status: number,
  title: string,
  message: string,
  badge: string = "QR MASTER",
  badgeColor: string = "#6366f1"
): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} — QR MASTER</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: #090d16;
        color: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 20px;
      }
      .card {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 20px;
        max-width: 440px;
        width: 100%;
        padding: 40px 32px;
        text-align: center;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      }
      .badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: ${badgeColor};
        background: rgba(99, 102, 241, 0.1);
        padding: 4px 12px;
        border-radius: 9999px;
        margin-bottom: 20px;
      }
      .icon-box {
        width: 64px;
        height: 64px;
        margin: 0 auto 20px;
        background: #1e293b;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      h1 {
        font-size: 22px;
        font-weight: 700;
        color: #ffffff;
        margin-bottom: 12px;
      }
      p {
        font-size: 14px;
        color: #94a3b8;
        line-height: 1.6;
        margin-bottom: 24px;
      }
      .footer {
        font-size: 12px;
        color: #64748b;
        border-top: 1px solid #1e293b;
        padding-top: 20px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <span class="badge">${badge}</span>
      <div class="icon-box">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${badgeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h1>${title}</h1>
      <p>${message}</p>
      <div class="footer">QR MASTER • Plataforma Profissional de QR Codes</div>
    </div>
  </body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { shortCode: string } }
) {
  try {
    const { shortCode } = params;

    // 1. Validação estrutural do shortCode
    if (!isValidShortCode(shortCode)) {
      return renderStatusPage(
        404,
        "QR Code Não Encontrado",
        "O código solicitado é inválido ou não foi reconhecido.",
        "404 NOT FOUND",
        "#f43f5e"
      );
    }

    // 2. Localização no banco de dados com usuário, plano, assinatura e campanha
    const qr = await prisma.qRCode.findFirst({
      where: {
        shortCode,
        deletedAt: null, // Exclui itens da lixeira
      },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            plan: true,
            subscription: {
              select: {
                status: true,
                currentPeriodEnd: true,
                cancelAtPeriodEnd: true,
              },
            },
          },
        },
        campaign: true,
      },
    });

    // 3. QR Inexistente ou excluído
    if (!qr) {
      return renderStatusPage(
        404,
        "QR Code Não Encontrado",
        "O código solicitado não existe ou foi excluído definitivamente pelo proprietário.",
        "404 NOT FOUND",
        "#f43f5e"
      );
    }

    // 4. Verificação de Ativação / Desativação
    if (qr.status !== "ACTIVE") {
      return renderStatusPage(
        403,
        "QR Code Pausado",
        "Este QR Code está temporariamente inativo ou pausado pelo proprietário.",
        "STATUS: PAUSADO",
        "#f59e0b"
      );
    }

    // 5. Verificação de Expiração por Campanha
    if (qr.campaign) {
      const now = new Date();
      if (qr.campaign.status !== "ACTIVE") {
        return renderStatusPage(
          410,
          "Campanha Pausada",
          "A campanha promocional vinculada a este QR Code está temporariamente pausada.",
          "CAMPANHA INATIVA",
          "#f59e0b"
        );
      }

      if (qr.campaign.endDate && new Date(qr.campaign.endDate) < now) {
        return renderStatusPage(
          410,
          "Campanha Encerrada",
          "O período de validade desta campanha promocional foi finalizado.",
          "EXPIRADO",
          "#64748b"
        );
      }

      if (qr.campaign.startDate && new Date(qr.campaign.startDate) > now) {
        return renderStatusPage(
          403,
          "Campanha Em Breve",
          "Esta campanha promocional ainda não foi iniciada. Tente novamente em breve.",
          "AGUARDANDO INÍCIO",
          "#6366f1"
        );
      }
    }

    // 6. Verificação de Plano e Assinatura do Proprietário (incluindo Grace Period)
    // Nota: QR Codes do tipo Cartão de Visita (vCard) e Evento (vCalendar) são payloads nativos
    // de contato/agenda e devem sempre entregar o arquivo .vcf/.ics mesmo que tenham sido salvos com shortCode.
    const isNativeStaticPayload =
      qr.type === "contact" ||
      qr.type === "event" ||
      /^BEGIN:(VCARD|VCALENDAR)/i.test(qr.destination || "");

    if (qr.user.role !== "ADMIN" && !isNativeStaticPayload) {
      const planSupportsDynamic = qr.user.plan?.dynamicQRs ?? false;

      if (!planSupportsDynamic) {
        return renderStatusPage(
          403,
          "QR Code Indisponível",
          "O redirecionamento dinâmico deste QR Code está suspenso devido ao plano do proprietário.",
          "PLANO SUSPENSO",
          "#f43f5e"
        );
      }

      // Se o plano suporta dinâmico (PRO ou BUSINESS), valida se a assinatura está ativa
      // ou dentro da carência (Grace Period de 5 dias para PAST_DUE ou cancelamento no fim do período)
      const activeSubscription = isSubscriptionActive(qr.user.subscription);

      if (!activeSubscription) {
        return renderStatusPage(
          403,
          "Assinatura Expirada",
          "O redirecionamento deste QR Code dinâmico está suspenso porque a assinatura do proprietário expirou ou ultrapassou o período de carência.",
          "ASSINATURA EXPIRADA",
          "#f43f5e"
        );
      }
    }

    // 7. Validação de Destino, Anti-Loop e Esquemas Perigosos
    const validation = validateAndNormalizeDestination(qr.destination, shortCode);
    if (!validation.valid || !validation.sanitizedUrl) {
      return renderStatusPage(
        400,
        "Destino Inválido",
        validation.error || "O endereço de destino deste QR Code não é válido ou foi bloqueado por segurança.",
        "DESTINO INVÁLIDO",
        "#ef4444"
      );
    }

    const finalDestination = validation.sanitizedUrl;

    // 8. Registro de Analytics com Rate-Limiter Anti-Abuso
    const ua = req.headers.get("user-agent");
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const referrer = req.headers.get("referer");
    const clientInfo = parseUserAgent(ua, ip);

    const rateCheck = await checkShortCodeRateLimit(clientInfo.ipHash, shortCode, 60);

    // Registra scan de forma confiável em Serverless (Vercel) com fallback defensivo
    if (rateCheck.allowed) {
      try {
        await Promise.all([
          prisma.qRCodeScan.create({
            data: {
              qrCodeId: qr.id,
              device: clientInfo.device,
              browser: clientInfo.browser,
              os: clientInfo.os,
              referrer: referrer || "camera_scan",
              ipHash: clientInfo.ipHash,
            },
          }),
          prisma.qRCode.update({
            where: { id: qr.id },
            data: {
              scanCount: { increment: 1 },
              lastScanAt: new Date(),
            },
          }),
        ]);
      } catch (err) {
        console.error("Falha ao registrar telemetria de scan em segundo plano:", err);
      }
    }

    // 9. Entrega nativa para vCard (Cartão de Visita) e vCalendar (Evento)
    // Redirecionamento HTTP 307 para "BEGIN:VCARD..." falha porque não é uma URL válida
    // e contém quebras de linha. O navegador/SO móvel exige resposta direta text/vcard (.vcf).
    if (qr.type === "contact" || /^BEGIN:VCARD/i.test(finalDestination)) {
      const vcardPayload = normalizeVCardPayload(finalDestination);
      return new NextResponse(vcardPayload, {
        status: 200,
        headers: {
          "Content-Type": "text/vcard; charset=utf-8",
          "Content-Disposition": 'inline; filename="contato.vcf"',
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (qr.type === "event" || /^BEGIN:VCALENDAR/i.test(finalDestination)) {
      const icsPayload = finalDestination.replace(/\r?\n/g, "\r\n");
      return new NextResponse(icsPayload, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'inline; filename="evento.ics"',
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // 10. Redirecionamento 307 (Temporary Redirect) com Headers Rígidos Anti-Cache
    return NextResponse.redirect(finalDestination, {
      status: 307,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Erro interno no redirecionamento dinâmico:", error);
    return renderStatusPage(
      500,
      "Erro no Redirecionamento",
      "Ocorreu uma falha temporária ao processar o redirecionamento. Tente novamente em instantes.",
      "ERRO INTERNO",
      "#ef4444"
    );
  }
}
