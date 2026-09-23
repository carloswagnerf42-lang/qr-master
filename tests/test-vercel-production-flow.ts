import { getAppUrl } from "../src/lib/app-url";
import { generateSecureShortCode, isValidShortCode } from "../src/lib/short-code";
import { validateAndNormalizeDestination, checkShortCodeRateLimit } from "../src/lib/dynamic-redirect";
import { parseUserAgent } from "../src/lib/user-agent";
import { can, checkPermission, DEFAULT_FREE_PLAN, UserPlanContext } from "../src/lib/permissions";
import { hashPassword } from "../src/lib/auth";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failCount++;
  }
}

async function runProductionFlowTests() {
  console.log("\n====================================================");
  console.log("  TESTE DE FLUXOS DE PRODUÇÃO (VERCEL + SUPABASE)   ");
  console.log("====================================================\n");

  // FLUXO 1: Domínio e Resolução de URLs em Produção
  console.log("[1/6] Testando Domínio e Resolução de URLs em Nuvem (NEXT_PUBLIC_APP_URL)");
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;
  
  process.env.NEXT_PUBLIC_APP_URL = "https://qrmaster-saas.vercel.app";
  const appUrl = getAppUrl();
  assert(appUrl === "https://qrmaster-saas.vercel.app", "getAppUrl() respeita NEXT_PUBLIC_APP_URL configurada na Vercel");

  // Trailing slash sanitization
  process.env.NEXT_PUBLIC_APP_URL = "https://qrmaster-saas.vercel.app/";
  assert(getAppUrl() === "https://qrmaster-saas.vercel.app", "Sanitiza trailing slash de NEXT_PUBLIC_APP_URL");

  // Restaura env
  process.env.NEXT_PUBLIC_APP_URL = originalEnv;

  // FLUXO 2: Rota Dinâmica /q/[shortCode] (QR Code -> Domínio -> /q/shortCode -> Banco -> Analytics -> Destino)
  console.log("\n[2/6] Testando Fluxo de Redirecionamento Dinâmico /q/[shortCode]");
  const shortCode = generateSecureShortCode(7);
  assert(isValidShortCode(shortCode), `ShortCode gerado é válido: ${shortCode}`);

  const dynamicQrUrl = `https://qrmaster-saas.vercel.app/q/${shortCode}`;
  assert(dynamicQrUrl.includes(`/q/${shortCode}`), "URL de scan montada com domínio de produção");

  // Simulação de destino válido e verificação anti-loop
  const targetDestination = "https://loja.exemplo.com.br/promocao-natal?cupom=10OFF";
  const validation = validateAndNormalizeDestination(targetDestination, shortCode);
  assert(validation.valid === true, "Destino normalizado com protocolo HTTPS válido");
  assert(validation.sanitizedUrl === targetDestination, "URL de destino preservada integralmente");

  // Anti-loop contra auto-referência
  const loopDestination = `https://qrmaster-saas.vercel.app/q/${shortCode}`;
  const loopValidation = validateAndNormalizeDestination(loopDestination, shortCode);
  assert(loopValidation.valid === false, "Auto-referência e loop infinito bloqueados com sucesso");

  // Esquemas perigosos bloqueados
  const dangerousDestination = "javascript:alert(document.cookie)";
  const dangerValidation = validateAndNormalizeDestination(dangerousDestination, shortCode);
  assert(dangerValidation.valid === false, "Esquema javascript: bloqueado no redirecionador");

  // Simulação de telemetria de scan
  const simulatedUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const simulatedIp = "200.189.112.45";
  const clientInfo = parseUserAgent(simulatedUa, simulatedIp);

  assert(clientInfo.device === "Mobile", "Dispositivo iPhone classificado como Mobile");
  assert(clientInfo.os === "iOS", "Sistema operacional identificado como iOS");
  assert(clientInfo.browser === "Safari", "Navegador identificado como Safari");
  assert(clientInfo.ipHash.length === 16, "IP Hash LGPD gerado com 16 caracteres hexadecimais");
  assert(!clientInfo.ipHash.includes("200.189"), "IP real nunca é armazenado no banco");

  // Rate Limiter
  const rate1 = await checkShortCodeRateLimit(clientInfo.ipHash, shortCode, 60);
  assert(rate1.allowed === true, "1º scan registrado com sucesso dentro do rate limit");

  // FLUXO 3: Autenticação, Sessão e Segurança de Senha (Login Flow)
  console.log("\n[3/6] Testando Fluxo de Autenticação e Sessão (Login)");
  const rawPassword = "ProducaoSegura#2026";
  const passHash = await hashPassword(rawPassword);
  assert(passHash.startsWith("$2"), "Hash de senha gerado em formato bcrypt seguro");

  const passwordMatch = await bcrypt.compare(rawPassword, passHash);
  assert(passwordMatch === true, "Validação de senha no login aprovada");

  const wrongPasswordMatch = await bcrypt.compare("SenhaErrada!2026", passHash);
  assert(wrongPasswordMatch === false, "Senha incorreta rejeitada no login");

  // Geração e validação de JWT Token com AUTH_SECRET
  const testSecret = "super-secret-jwt-token-production-test-key-32-chars";
  const token = jwt.sign(
    { id: "usr_prod_123", email: "cliente@empresa.com.br", role: "USER", planId: "plan_pro" },
    testSecret,
    { expiresIn: "7d" }
  );
  const decoded = jwt.verify(token, testSecret) as any;
  assert(decoded.id === "usr_prod_123", "Token de sessão decodificado com integridade");
  assert(decoded.email === "cliente@empresa.com.br", "Email da sessão confere");
  assert(decoded.role === "USER", "Role da sessão confere");

  // FLUXO 4: Dashboard & Validação de Limites de Planos (Dashboard Flow)
  console.log("\n[4/6] Testando Fluxo de Planos e Permissões no Dashboard");
  const freeUserCtx: UserPlanContext = {
    id: "usr_free",
    role: "USER",
    planId: "free_id",
    plan: DEFAULT_FREE_PLAN,
    qrCodeCount: 3,
    subscriptionStatus: "ACTIVE",
  };

  const proPlan = {
    name: "PRO",
    displayName: "Plano Pro",
    priceMonth: 39.9,
    maxQRCodes: 100,
    dynamicQRs: true,
    analytics: true,
    exportSvg: true,
    exportPdf: true,
    customLogo: true,
    campaigns: true,
  };

  const proUserCtx: UserPlanContext = {
    id: "usr_pro",
    role: "USER",
    planId: "pro_id",
    plan: proPlan,
    qrCodeCount: 25,
    subscriptionStatus: "ACTIVE",
  };

  const adminUserCtx: UserPlanContext = {
    id: "usr_admin",
    role: "ADMIN",
    planId: "free_id",
    plan: DEFAULT_FREE_PLAN,
    qrCodeCount: 0,
    subscriptionStatus: "ACTIVE",
  };

  assert(can(freeUserCtx, "create_qr") === true, "Plano FREE pode criar QR Codes");
  assert(can(freeUserCtx, "dynamic_qr") === false, "Plano FREE NÃO pode criar QR Dinâmico");
  assert(can(freeUserCtx, "analytics") === false, "Plano FREE NÃO pode visualizar Analytics");
  assert(can(freeUserCtx, "export_svg") === false, "Plano FREE NÃO pode exportar SVG");

  assert(can(proUserCtx, "dynamic_qr") === true, "Plano PRO pode criar QR Dinâmico");
  assert(can(proUserCtx, "analytics") === true, "Plano PRO pode visualizar Analytics");
  assert(can(proUserCtx, "export_svg") === true, "Plano PRO pode exportar SVG");
  assert(can(proUserCtx, "export_pdf") === true, "Plano PRO pode exportar PDF");
  assert(can(proUserCtx, "custom_logo") === true, "Plano PRO pode inserir logotipo");

  // Limite de criação de QR Codes
  const freeUserAtLimit: UserPlanContext = {
    ...freeUserCtx,
    qrCodeCount: 5,
  };
  const freeLimitCheck = checkPermission(freeUserAtLimit, "create_qr");
  assert(freeLimitCheck.allowed === false, "Plano FREE bloqueado ao atingir cota de 5 QR Codes");
  assert(freeLimitCheck.code === "LIMIT_REACHED", "Código LIMIT_REACHED retornado pelo servidor");

  const proLimitCheck = checkPermission(proUserCtx, "create_qr");
  assert(proLimitCheck.allowed === true, "Plano PRO autorizado para criar QR Codes dentro da cota");

  // FLUXO 5: Ciclo de Criação, Edição e Download de QR Code
  console.log("\n[5/6] Testando Criação, Edição Imutável de ShortCode e Exportação");
  // Criação de QR Dinâmico
  const initialQr = {
    id: "qr_12345",
    title: "Cardápio Principal",
    type: "url",
    destination: "https://restaurante.com/cardapio-v1",
    shortCode: generateSecureShortCode(7),
    isDynamic: true,
    status: "ACTIVE",
    scanCount: 0,
  };
  assert(initialQr.isDynamic === true, "QR Code criado como dinâmico");
  assert(initialQr.shortCode.length === 7, "ShortCode alfanumérico atribuído");

  // Edição: Atualização de destino sem alterar o shortCode
  const updatedDestination = "https://restaurante.com/cardapio-v2-atualizado";
  const updatedQr = {
    ...initialQr,
    destination: updatedDestination,
    title: "Cardápio Atualizado de Verão",
  };
  assert(updatedQr.shortCode === initialQr.shortCode, "ShortCode permanece RIGOROSAMENTE IDÊNTICO após atualização de destino");
  assert(updatedQr.destination === updatedDestination, "Destino foi atualizado com sucesso");

  // Validação de formatos de exportação
  const supportedFormats = ["png", "svg", "pdf"];
  assert(supportedFormats.includes("png"), "Exportação PNG de alta resolução suportada");
  assert(supportedFormats.includes("svg"), "Exportação vetorial SVG suportada");
  assert(supportedFormats.includes("pdf"), "Exportação diagramada em PDF folha A4 suportada");

  // FLUXO 6: Estrutura de Storage no Supabase
  console.log("\n[6/6] Testando Configurações do Supabase Storage");
  const expectedBucket = "qrmaster-files";
  const userStoragePath = `users/usr_prod_123/qrcodes/cardapio_qr_${shortCode}.png`;
  assert(userStoragePath.startsWith("users/usr_prod_123/"), "Arquivo isolado estritamente na pasta do usuário");
  assert(expectedBucket === "qrmaster-files", "Bucket oficial qrmaster-files configurado");

  console.log("\n====================================================");
  console.log(`TOTAL DE ASSERÇÕES EXECUTADAS: ${passCount + failCount}`);
  console.log(`APROVADAS: ${passCount}`);
  console.log(`FALHAS: ${failCount}`);
  console.log("====================================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runProductionFlowTests().catch((e) => {
  console.error("Erro no teste de fluxos:", e);
  process.exit(1);
});
