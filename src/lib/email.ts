/**
 * Serviço de e-mail seguro para QR MASTER.
 * Utiliza a API do Resend quando RESEND_API_KEY estiver configurada.
 * Caso contrário, opera em modo seguro com log controlado para desenvolvimento/testes,
 * sem disparar erros 500 não tratados na aplicação.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<{ success: boolean; error?: string; mode: "resend" | "fallback" }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "QR MASTER <suporte@qrmaster.com.br>";

  if (!apiKey) {
    // Modo seguro/fallback quando chave não estiver configurada no ambiente
    if (process.env.NODE_ENV !== "production") {
      console.log(`[EMAIL FALLBACK] Para: ${to} | Assunto: ${subject}`);
    }
    return {
      success: true,
      mode: "fallback",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[EMAIL ERROR] Falha ao enviar via Resend:", errorData);
      return {
        success: false,
        error: errorData.message || "Falha ao enviar e-mail pelo provedor.",
        mode: "resend",
      };
    }

    return {
      success: true,
      mode: "resend",
    };
  } catch (error) {
    console.error("[EMAIL EXCEPTION] Erro de conexão com Resend:", error);
    return {
      success: false,
      error: "Falha de conexão com o serviço de envio de e-mails.",
      mode: "resend",
    };
  }
}

/**
 * Envia o e-mail oficial com o link de recuperação de senha.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string, userName?: string): Promise<{ success: boolean; error?: string; mode: "resend" | "fallback" }> {
  const greeting = userName ? `Olá, ${userName}!` : "Olá!";
  const subject = "Recuperação de Senha — QR MASTER";

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Recuperação de Senha — QR MASTER</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #050A16; color: #F1F5F9; margin: 0; padding: 40px 20px; }
    .container { max-width: 560px; margin: 0 auto; background-color: #0A1F44; border: 1px solid rgba(0, 224, 255, 0.2); border-radius: 16px; padding: 36px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .brand { text-align: center; margin-bottom: 28px; }
    .brand h1 { color: #00E0FF; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -0.5px; }
    .brand span { color: #94A3B8; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; }
    h2 { font-size: 20px; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; }
    p { color: #CBD5E1; font-size: 15px; line-height: 1.6; margin: 0 0 20px; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #006CFF 0%, #0084FF 100%); color: #FFFFFF !important; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(0, 108, 255, 0.4); }
    .alert { background-color: rgba(245, 158, 11, 0.1); border-left: 4px solid #F59E0B; padding: 14px; border-radius: 8px; margin: 24px 0; font-size: 13px; color: #FCD34D; }
    .footer { text-align: center; margin-top: 36px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #64748B; }
    .link-alt { word-break: break-all; color: #38BDF8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <h1>QR MASTER</h1>
      <span>Conecta o seu mundo</span>
    </div>

    <h2>${greeting}</h2>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta no QR MASTER.</p>
    <p>Para criar uma nova senha com segurança, clique no botão abaixo:</p>

    <div class="btn-container">
      <a href="${resetUrl}" class="btn" target="_blank" rel="noopener noreferrer">Redefinir Minha Senha</a>
    </div>

    <div class="alert">
      <strong>Atenção:</strong> Este link é seguro, de uso único e expira em <strong>1 hora</strong>. Se você não solicitou a redefinição de senha, nenhuma ação é necessária e sua conta permanece totalmente protegida.
    </div>

    <p style="font-size: 13px; color: #94A3B8;">Se o botão não funcionar, copie e cole o endereço abaixo no seu navegador:</p>
    <p class="link-alt">${resetUrl}</p>

    <div class="footer">
      © 2026 QR MASTER. Plataforma profissional de gestão de QR Codes.<br>
      Este é um e-mail transacional automático. Por favor, não responda diretamente a esta mensagem.
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({
    to,
    subject,
    html,
  });
}
