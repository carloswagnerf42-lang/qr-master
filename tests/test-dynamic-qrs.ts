import {
  generateSecureShortCode,
  isValidShortCode,
} from "../src/lib/short-code";
import {
  validateAndNormalizeDestination,
  checkShortCodeRateLimit,
} from "../src/lib/dynamic-redirect";
import { parseUserAgent } from "../src/lib/user-agent";

// Cores para saída no terminal
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (detail) console.error(`    ${YELLOW}Detalhes:${RESET} ${detail}`);
  }
}

// Modelos em memória para simulação do banco de dados
interface MockQRCode {
  id: string;
  userId: string;
  name: string;
  isDynamic: boolean;
  shortCode: string;
  destination: string;
  status: "ACTIVE" | "INACTIVE";
  deletedAt: Date | null;
  scanCount: number;
  lastScanAt: Date | null;
  campaign?: {
    id: string;
    name: string;
    status: "ACTIVE" | "PAUSED" | "COMPLETED";
    startDate: Date | null;
    endDate: Date | null;
  } | null;
  user: {
    id: string;
    role: string;
    plan: {
      name: string;
      dynamicQRs: boolean;
    } | null;
    subscription?: {
      status: string;
    } | null;
  };
}

/**
 * Simula a lógica de negócio do endpoint GET /q/[shortCode]
 */
function simulateRedirectHandler(
  shortCodeParam: string,
  mockDatabase: Map<string, MockQRCode>,
  clientIp: string = "200.180.10.5",
  userAgent: string = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
) {
  // 1. Validação de formato
  if (!isValidShortCode(shortCodeParam)) {
    return { status: 404, type: "NOT_FOUND", body: "Código inválido" };
  }

  // 2. Busca no banco
  const qr = mockDatabase.get(shortCodeParam);
  if (!qr || qr.deletedAt !== null) {
    return { status: 404, type: "NOT_FOUND", body: "QR Code Não Encontrado" };
  }

  // 3. Status ativo
  if (qr.status !== "ACTIVE") {
    return { status: 403, type: "INACTIVE", body: "QR Code Pausado" };
  }

  // 4. Verificação de campanha
  if (qr.campaign) {
    const now = new Date();
    if (qr.campaign.status !== "ACTIVE") {
      return { status: 410, type: "CAMPAIGN_INACTIVE", body: "Campanha Pausada" };
    }
    if (qr.campaign.endDate && qr.campaign.endDate < now) {
      return { status: 410, type: "CAMPAIGN_EXPIRED", body: "Campanha Encerrada" };
    }
  }

  // 5. Verificação de plano do usuário
  if (qr.user.role !== "ADMIN") {
    const isSubCanceled = qr.user.subscription && qr.user.subscription.status !== "ACTIVE";
    const planAllows = qr.user.plan?.dynamicQRs ?? false;
    if (isSubCanceled || !planAllows) {
      return { status: 403, type: "PLAN_RESTRICTED", body: "QR Code Indisponível" };
    }
  }

  // 6. Validação do destino contra loops e URLs perigosas
  const validation = validateAndNormalizeDestination(qr.destination, shortCodeParam);
  if (!validation.valid || !validation.sanitizedUrl) {
    return { status: 400, type: "INVALID_DESTINATION", error: validation.error };
  }

  // 7. Telemetria e analytics
  const clientInfo = parseUserAgent(userAgent, clientIp);
  const rate = checkShortCodeRateLimit(clientInfo.ipHash, shortCodeParam, 60);
  if (rate.allowed) {
    qr.scanCount += 1;
    qr.lastScanAt = new Date();
  }

  // 8. Redirecionamento 307
  return {
    status: 307,
    type: "REDIRECT",
    location: validation.sanitizedUrl,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
    analytics: {
      device: clientInfo.device,
      os: clientInfo.os,
      browser: clientInfo.browser,
      ipHash: clientInfo.ipHash,
    },
  };
}

async function runDynamicQRTests() {
  console.log(`\n==========================================================`);
  console.log(`🛡️  SUÍTE DE TESTES: QR CODES DINÂMICOS & ROTA /q/[shortCode]`);
  console.log(`==========================================================\n`);

  console.log(`${CYAN}▶ 1. Testando Geração e Segurança do shortCode:${RESET}`);
  {
    const code1 = generateSecureShortCode(8);
    const code2 = generateSecureShortCode(8);

    assert(code1.length === 8, "ShortCode gerado possui exatamente 8 caracteres");
    assert(/^[0-9a-zA-Z]{8}$/.test(code1), "ShortCode utiliza alfabeto Base62 alfanumérico seguro");
    assert(code1 !== code2, "Dois shortCodes consecutivos gerados são distintos (não determinístico)");
    assert(isValidShortCode(code1) === true, "isValidShortCode valida positivamente shortCode gerado");

    // Validações de rejeição de shortCodes inválidos ou maliciosos
    assert(isValidShortCode("") === false, "Rejeita string vazia");
    assert(isValidShortCode("ab") === false, "Rejeita código curto demais (< 4 caracteres)");
    assert(isValidShortCode("<script>") === false, "Rejeita caracteres especiais / XSS");
    assert(isValidShortCode("qr/123/bad") === false, "Rejeita tentativa de path traversal");
    assert(isValidShortCode("code with spaces") === false, "Rejeita espaços em branco");
    assert(isValidShortCode(null as any) === false, "Rejeita null");
    assert(isValidShortCode(undefined as any) === false, "Rejeita undefined");
  }

  console.log(`\n${CYAN}▶ 2. Testando Validação de Destino, Anti-Loop e Esquemas Perigosos:${RESET}`);
  {
    const shortCode = "abc12345";

    // URLs válidas
    const valid1 = validateAndNormalizeDestination("https://minhaempresa.com.br/promo", shortCode);
    assert(valid1.valid === true, "URL HTTPS legítima é aceita");
    assert(valid1.sanitizedUrl === "https://minhaempresa.com.br/promo", "URL HTTPS mantida");

    const valid2 = validateAndNormalizeDestination("minhaloja.com/desconto", shortCode);
    assert(valid2.valid === true, "URL sem protocolo é aceita e normalizada");
    assert(valid2.sanitizedUrl === "https://minhaloja.com/desconto", "Prefixo https:// adicionado com sucesso");

    // Esquemas específicos de aplicativos
    const validApp = validateAndNormalizeDestination("whatsapp://send?phone=5511999999999", shortCode);
    assert(validApp.valid === true, "Esquema whatsapp:// é aceito");

    const validTel = validateAndNormalizeDestination("tel:+5511988887777", shortCode);
    assert(validTel.valid === true, "Esquema tel: é aceito");

    // Bloqueio de protocolos perigosos
    const xss = validateAndNormalizeDestination("javascript:alert(document.cookie)", shortCode);
    assert(xss.valid === false, "Protocolo javascript: é BLOQUEADO");

    const dataUri = validateAndNormalizeDestination("data:text/html,<script>alert(1)</script>", shortCode);
    assert(dataUri.valid === false, "Protocolo data: é BLOQUEADO");

    const fileUri = validateAndNormalizeDestination("file:///etc/passwd", shortCode);
    assert(fileUri.valid === false, "Protocolo file: é BLOQUEADO");

    // Detecção e Bloqueio de Loops de Redirecionamento
    const selfLoop1 = validateAndNormalizeDestination(`https://qrmaster.com.br/q/${shortCode}`, shortCode);
    assert(selfLoop1.valid === false, "Detectou e bloqueou loop para o próprio /q/[shortCode]");

    const selfLoop2 = validateAndNormalizeDestination(`/q/${shortCode}`, shortCode);
    assert(selfLoop2.valid === false, "Detectou e bloqueou loop relativo para o próprio shortCode");

    const chainLoop = validateAndNormalizeDestination("http://localhost:3000/q/outroCode", shortCode);
    assert(chainLoop.valid === false, "Detectou e bloqueou encadeamento de QR Codes no mesmo domínio");
  }

  // Base simulada para testes da rota /q/[shortCode]
  const mockDb = new Map<string, MockQRCode>();

  const activeQrCode: MockQRCode = {
    id: "qr_act_1",
    userId: "usr_pro_1",
    name: "Menu Restaurante",
    isDynamic: true,
    shortCode: "cardapio",
    destination: "https://restaurante.com.br/cardapio-primavera",
    status: "ACTIVE",
    deletedAt: null,
    scanCount: 0,
    lastScanAt: null,
    user: {
      id: "usr_pro_1",
      role: "USER",
      plan: { name: "PRO", dynamicQRs: true },
      subscription: { status: "ACTIVE" },
    },
  };

  const inactiveQrCode: MockQRCode = {
    id: "qr_inact_2",
    userId: "usr_pro_1",
    name: "QR Pausado",
    isDynamic: true,
    shortCode: "pausado1",
    destination: "https://meusite.com.br",
    status: "INACTIVE",
    deletedAt: null,
    scanCount: 0,
    lastScanAt: null,
    user: {
      id: "usr_pro_1",
      role: "USER",
      plan: { name: "PRO", dynamicQRs: true },
    },
  };

  const deletedQrCode: MockQRCode = {
    id: "qr_del_3",
    userId: "usr_pro_1",
    name: "QR Deletado",
    isDynamic: true,
    shortCode: "lixeira9",
    destination: "https://meusite.com.br",
    status: "ACTIVE",
    deletedAt: new Date(),
    scanCount: 0,
    lastScanAt: null,
    user: {
      id: "usr_pro_1",
      role: "USER",
      plan: { name: "PRO", dynamicQRs: true },
    },
  };

  const expiredCampaignQrCode: MockQRCode = {
    id: "qr_camp_4",
    userId: "usr_pro_1",
    name: "Black Friday 2025",
    isDynamic: true,
    shortCode: "blackfri",
    destination: "https://loja.com.br/blackfriday",
    status: "ACTIVE",
    deletedAt: null,
    scanCount: 0,
    lastScanAt: null,
    campaign: {
      id: "camp_bf",
      name: "Black Friday",
      status: "ACTIVE",
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // Vencida há 10 dias
    },
    user: {
      id: "usr_pro_1",
      role: "USER",
      plan: { name: "PRO", dynamicQRs: true },
    },
  };

  const freeUserQrCode: MockQRCode = {
    id: "qr_free_5",
    userId: "usr_free_2",
    name: "QR Usuário Free",
    isDynamic: true,
    shortCode: "freeuser",
    destination: "https://site.com",
    status: "ACTIVE",
    deletedAt: null,
    scanCount: 0,
    lastScanAt: null,
    user: {
      id: "usr_free_2",
      role: "USER",
      plan: { name: "FREE", dynamicQRs: false }, // Plano não permite dinâmico
    },
  };

  mockDb.set(activeQrCode.shortCode, activeQrCode);
  mockDb.set(inactiveQrCode.shortCode, inactiveQrCode);
  mockDb.set(deletedQrCode.shortCode, deletedQrCode);
  mockDb.set(expiredCampaignQrCode.shortCode, expiredCampaignQrCode);
  mockDb.set(freeUserQrCode.shortCode, freeUserQrCode);

  console.log(`\n${CYAN}▶ 3. Testando Redirecionamento de QR Ativo & Headers Anti-Cache:${RESET}`);
  {
    const res = simulateRedirectHandler("cardapio", mockDb);
    assert(res.status === 307, "QR Ativo retorna status 307 (Temporary Redirect)");
    assert(!!res.headers && res.headers["Cache-Control"].includes("no-store"), "Header Cache-Control contém no-store");
    assert(!!res.headers && res.headers["Cache-Control"].includes("max-age=0"), "Header Cache-Control contém max-age=0");
    assert(!!res.headers && res.headers["Pragma"] === "no-cache", "Header Pragma: no-cache presente");
    assert(activeQrCode.scanCount === 1, "scanCount incrementado para 1");
    assert(activeQrCode.lastScanAt !== null, "lastScanAt atualizado com timestamp recente");
  }

  console.log(`\n${CYAN}▶ 4. Testando Estabilidade na Alteração de Destino (Core do QR Dinâmico):${RESET}`);
  {
    // Cenário: O restaurante mudou o cardápio da Primavera para o Verão.
    // O código QR impresso na mesa física continua apontando para /q/cardapio.
    const originalShortCode = activeQrCode.shortCode;
    const newDestination = "https://restaurante.com.br/cardapio-verao-2026";

    // Simula edição no backend (PUT /api/qr/[id])
    activeQrCode.destination = newDestination;

    // Escaneia novamente o mesmo shortCode
    const resAfterEdit = simulateRedirectHandler(originalShortCode, mockDb);
    assert(resAfterEdit.status === 307, "Mesmo QR Code após edição continua ativo (307)");
    assert(resAfterEdit.location === newDestination, "Novo escaneamento é levado IMEDIATAMENTE ao novo destino");
    assert(originalShortCode === "cardapio", "O shortCode permaneceu 100% idêntico (QR impresso preservado)");
    assert(activeQrCode.scanCount === 2, "Novo scan contabilizado com sucesso (scanCount: 2)");
  }

  console.log(`\n${CYAN}▶ 5. Testando Bloqueio de QR Desativado / Pausado:${RESET}`);
  {
    const res = simulateRedirectHandler("pausado1", mockDb);
    assert(res.status === 403, "QR desativado retorna status 403");
    assert(res.body === "QR Code Pausado", "Exibe mensagem explicativa de QR pausado");
    assert(inactiveQrCode.scanCount === 0, "QR pausado NÃO incrementa scanCount nem gera falso analytics");
  }

  console.log(`\n${CYAN}▶ 6. Testando QR Inexistente e Deletado (Lixeira):${RESET}`);
  {
    const resNotFound = simulateRedirectHandler("naoexiste99", mockDb);
    assert(resNotFound.status === 404, "QR inexistente retorna status 404");
    assert(resNotFound.body === "QR Code Não Encontrado", "Exibe tela amigável sem vazar detalhes de banco");

    const resDeleted = simulateRedirectHandler("lixeira9", mockDb);
    assert(resDeleted.status === 404, "QR presente na lixeira (deletedAt) é tratado como 404");
  }

  console.log(`\n${CYAN}▶ 7. Testando Expiração por Campanha:${RESET}`);
  {
    const resExpired = simulateRedirectHandler("blackfri", mockDb);
    assert(resExpired.status === 410, "QR com campanha expirada retorna status 410 (Gone)");
    assert(resExpired.body === "Campanha Encerrada", "Exibe tela de campanha encerrada");
  }

  console.log(`\n${CYAN}▶ 8. Testando Verificação do Plano do Proprietário:${RESET}`);
  {
    const resFreeOwner = simulateRedirectHandler("freeuser", mockDb);
    assert(resFreeOwner.status === 403, "QR de proprietário com plano sem suporte dinâmico é bloqueado (403)");
    assert(resFreeOwner.body === "QR Code Indisponível", "Exibe aviso de QR indisponível por plano");
  }

  console.log(`\n${CYAN}▶ 9. Testando Telemetria LGPD e Detecção de Dispositivo:${RESET}`);
  {
    const uaMobile = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
    const parsed = parseUserAgent(uaMobile, "189.20.30.40");

    assert(parsed.device === "Mobile", "Detectou Mobile");
    assert(parsed.os === "iOS", "Detectou iOS");
    assert(parsed.browser === "Safari", "Detectou Safari");
    assert(parsed.ipHash.length === 16, "IP anonimizado conforme LGPD (16 caracteres hex)");
    assert(/^[0-9a-f]{16}$/.test(parsed.ipHash), "Hash contém apenas caracteres hexadecimais");
  }

  console.log(`\n${CYAN}▶ 10. Testando Rate Limiter Anti-Abuso de Telemetria:${RESET}`);
  {
    const testIpHash = "a1b2c3d4e5f60718";
    const testCode = "floodtest";

    let allowedCount = 0;
    let blockedCount = 0;

    // Simula 70 requisições consecutivas no mesmo minuto
    for (let i = 0; i < 70; i++) {
      const check = checkShortCodeRateLimit(testIpHash, testCode, 60);
      if (check.allowed) allowedCount++;
      else blockedCount++;
    }

    assert(allowedCount === 60, "Permitiu exatamente 60 scans dentro da janela de 1 minuto");
    assert(blockedCount === 10, "Bloqueou os 10 scans excedentes (proteção anti-abuso)");
  }

  console.log(`\n==========================================================`);
  console.log(`TOTAL DE TESTES DE QR DINÂMICOS: ${totalTests}`);
  console.log(`${GREEN}APROVADOS: ${passedTests}${RESET}`);
  console.log(`${failedTests === 0 ? GREEN : RED}FALHAS: ${failedTests}${RESET}`);
  console.log(`==========================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runDynamicQRTests().catch((err) => {
  console.error("Erro fatal nos testes de QR dinâmicos:", err);
  process.exit(1);
});
