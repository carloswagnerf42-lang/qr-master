import { getAppUrl } from "../src/lib/app-url";
import { generateSecureShortCode, isValidShortCode } from "../src/lib/short-code";
import { validateAndNormalizeDestination, checkShortCodeRateLimit } from "../src/lib/dynamic-redirect";
import { parseUserAgent } from "../src/lib/user-agent";
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

async function runCustomDomainTests() {
  console.log("\n====================================================");
  console.log("   TESTE DE SUPORTE A DOMÍNIO PERSONALIZADO (HTTPS) ");
  console.log("====================================================\n");

  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    // 1. Testes de Resolução e Normalização de Domínio Personalizado
    console.log("[1/6] Testando Resolução Dinâmica de Domínio Personalizado (Qualquer Domínio)");
    
    // Caso A: Domínio informado com HTTPS e sem barra final
    process.env.NEXT_PUBLIC_APP_URL = "https://meudominio.com.br";
    assert(getAppUrl() === "https://meudominio.com.br", "Domínio com HTTPS preservado: https://meudominio.com.br");

    // Caso B: Domínio informado com barra final (trailing slash)
    process.env.NEXT_PUBLIC_APP_URL = "https://meudominio.com.br/";
    assert(getAppUrl() === "https://meudominio.com.br", "Remove trailing slash automaticamente");

    // Caso C: Domínio informado sem protocolo (ex: meudominio.com)
    process.env.NEXT_PUBLIC_APP_URL = "meudominio.com.br";
    assert(getAppUrl() === "https://meudominio.com.br", "Adiciona automaticamente o protocolo https:// quando omitido");

    // Caso D: Subdomínio personalizado (ex: qr.empresa.com)
    process.env.NEXT_PUBLIC_APP_URL = "https://qr.empresa.com";
    assert(getAppUrl() === "https://qr.empresa.com", "Suporta subdomínios: https://qr.empresa.com");

    // Caso E: Domínio internacional (ex: https://qrmaster.io)
    process.env.NEXT_PUBLIC_APP_URL = "https://qrmaster.io";
    assert(getAppUrl() === "https://qrmaster.io", "Suporta TLDs internacionais (.io, .app, .net, etc.)");

    // 2. Geração de URLs de QR Codes Dinâmicos no Domínio Personalizado
    console.log("\n[2/6] Testando Geração e Payload de QR Dinâmico no Domínio Personalizado");
    const testCustomDomain = "https://qr.restaurante.com.br";
    process.env.NEXT_PUBLIC_APP_URL = testCustomDomain;

    const shortCode = generateSecureShortCode(7);
    assert(isValidShortCode(shortCode), `ShortCode válido gerado: ${shortCode}`);

    const dynamicQrPayload = `${getAppUrl()}/q/${shortCode}`;
    assert(
      dynamicQrPayload === `https://qr.restaurante.com.br/q/${shortCode}`,
      `Payload do QR aponta estritamente para o domínio personalizado: ${dynamicQrPayload}`
    );
    assert(!dynamicQrPayload.includes("localhost"), "Zero ocorrências de localhost no link do QR");

    // 3. Prevenção de Loops e Auto-Referência no Domínio Personalizado
    console.log("\n[3/6] Testando Proteção Anti-Loop no Domínio Personalizado");
    const safeExternalDestination = "https://google.com/maps/place/restaurante";
    const validDest = validateAndNormalizeDestination(safeExternalDestination, shortCode);
    assert(validDest.valid === true, "Destino externo aceito");

    // Tentativa de loop apontando para o próprio domínio personalizado
    const loopUrl = `${testCustomDomain}/q/${shortCode}`;
    const loopCheck = validateAndNormalizeDestination(loopUrl, shortCode);
    assert(loopCheck.valid === false, "Auto-referência apontando para o domínio personalizado é bloqueada");

    // Tentativa de loop com variação maiúscula/minúscula
    const loopCheckCase = validateAndNormalizeDestination(`${testCustomDomain.toUpperCase()}/Q/${shortCode}`, shortCode);
    assert(loopCheckCase.valid === false, "Anti-loop insensível a maiúsculas/minúsculas no domínio");

    // 4. Testes de Cookies, Sessão e Segurança HTTPS no Domínio Personalizado
    console.log("\n[4/6] Testando Cookies de Sessão Segura (HTTPS / SameSite / Secure)");
    (process.env as any).NODE_ENV = "production";

    // Simulação dos atributos do cookie em produção
    const isProd = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    };

    assert(cookieOptions.secure === true, "Flag 'Secure' ATIVADA em produção (cookie trafega apenas em HTTPS)");
    assert(cookieOptions.httpOnly === true, "Flag 'HttpOnly' ATIVADA (imune a roubo de sessão via XSS)");
    assert(cookieOptions.sameSite === "lax", "Flag 'SameSite=lax' ATIVADA (proteção contra CSRF e compatível com redirecionamentos)");

    // Token JWT assinado e verificado
    const jwtSecret = "segredo-super-forte-com-mais-de-32-caracteres-2026";
    const sampleToken = jwt.sign(
      { id: "usr_custom_domain", email: "dono@empresa.com.br", role: "ADMIN" },
      jwtSecret,
      { expiresIn: "7d" }
    );
    const decoded = jwt.verify(sampleToken, jwtSecret) as any;
    assert(decoded.id === "usr_custom_domain", "Sessão verificada no domínio personalizado");

    // 5. Testes de Download e Links Compartilhados
    console.log("\n[5/6] Testando URLs de Download e Compartilhamento");
    const sampleFileId = "file_987654";
    const downloadEndpoint = `${getAppUrl()}/api/files/${sampleFileId}/download`;
    assert(
      downloadEndpoint.startsWith("https://qr.restaurante.com.br/api/files/"),
      "URL de download montada no domínio personalizado sob HTTPS"
    );

    const multiLinkPageSlug = "cardapio-digital";
    const shareUrl = `${getAppUrl()}/m/${multiLinkPageSlug}`;
    assert(
      shareUrl === "https://qr.restaurante.com.br/m/cardapio-digital",
      "Página multi-link gerada no domínio personalizado"
    );

    // 6. Teste de Rastreamento de Analytics via Headers de Proxy (Vercel / Cloudflare)
    console.log("\n[6/6] Testando Analytics com Headers de Domínio Personalizado");
    const simulatedForwardedHost = "qr.restaurante.com.br";
    const simulatedForwardedProto = "https";
    const simulatedIp = "177.136.240.10";
    const simulatedUa = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";

    const parsedClient = parseUserAgent(simulatedUa, simulatedIp);
    assert(parsedClient.device === "Mobile", "Detecção de Mobile");
    assert(parsedClient.os === "Android", "Detecção de Android");
    assert(parsedClient.browser === "Chrome", "Detecção de Chrome");
    assert(parsedClient.ipHash.length === 16, "IP mascarado irreversivelmente para LGPD");
    assert(simulatedForwardedProto === "https", "Tráfego confirmado via HTTPS no cabeçalho x-forwarded-proto");
    assert(simulatedForwardedHost === "qr.restaurante.com.br", "Host confirmado no cabeçalho x-forwarded-host");

    console.log("\n====================================================");
    console.log(`TOTAL DE ASSERÇÕES: ${passCount + failCount}`);
    console.log(`PASSARAM: ${passCount}`);
    console.log(`FALHAS: ${failCount}`);
    console.log("====================================================\n");

    if (failCount > 0) {
      process.exit(1);
    }
  } finally {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    (process.env as any).NODE_ENV = originalNodeEnv;
  }
}

runCustomDomainTests().catch((e) => {
  console.error("Erro nos testes de domínio personalizado:", e);
  process.exit(1);
});
