import assert from "assert";
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/db";
import {
  validateAndNormalizeDestination,
  isSafeImageUrl,
} from "../src/lib/dynamic-redirect";
import {
  validateMultiLinkUrl,
  sanitizeMultiLinkLinks,
} from "../src/lib/multilink";
import { validateFile } from "../src/lib/storage";
import { sendPasswordResetEmail } from "../src/lib/email";
import { createAuthenticatedSessionToken } from "../src/lib/auth";
import { POST as createQrRoute } from "../src/app/api/qr/route";
import { PUT as updateQrRoute } from "../src/app/api/qr/[id]/route";
import { PATCH as updateMeRoute } from "../src/app/api/auth/me/route";
import { GET as resolveQrRoute } from "../src/app/q/[shortCode]/route";
import { NextRequest } from "next/server";

// Cores para saída no terminal
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

let totalAsserts = 0;
let passedAsserts = 0;
let failedAsserts = 0;

function check(condition: unknown, description: string) {
  totalAsserts++;
  if (Boolean(condition)) {
    passedAsserts++;
    console.log(`  ${GREEN}✅ PASS:${RESET} ${description}`);
  } else {
    failedAsserts++;
    console.error(`  ${RED}❌ FAIL:${RESET} ${description}`);
  }
}

async function runTestSuite() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: SECURITY-HARD-14A — ADVERSARIAL XSS & INJECTION DEFENSE");
  console.log("==========================================================================\n");

  // ==========================================================================
  // GRUPO A: Validação e Rejeição de Protocolos Perigosos em Destinos QR
  // ==========================================================================
  console.log("--- GRUPO A: Protocolos Perigosos e Anti-Injeção em Destinos QR ---");

  // A1: Protocolos legítimos aceitos
  const validDestinations = [
    { dest: "https://example.com/pagina", desc: "HTTPS padrão" },
    { dest: "http://example.com/site", desc: "HTTP padrão" },
    { dest: "mailto:contato@exemplo.com", desc: "mailto:" },
    { dest: "tel:+5511999998888", desc: "tel: formato internacional" },
    { dest: "sms:+5511999998888", desc: "sms: celular" },
    { dest: "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:João Silva\r\nEND:VCARD", desc: "vCard nativo" },
    { dest: "WIFI:T:WPA;S:RedeCasa;P:senha123;;", desc: "WiFi" },
    { dest: "00020126580014br.gov.bcb.pix0136test5204000053039865802BR5913QR MASTER6008SAO PAULO62070503***6304E2CA", desc: "Pix EMV" },
  ];

  for (const item of validDestinations) {
    const res = validateAndNormalizeDestination(item.dest, "short1");
    check(res.valid === true && typeof res.sanitizedUrl === "string", `A1. Destino legítimo aceito: ${item.desc}`);
  }

  // A2: Bloqueio estrito de javascript: (e suas variações de caso/espaçamento/encoding)
  const javascriptPayloads = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "JAVASCRIPT:alert(document.cookie)",
    "   javascript:alert(1)  ",
    "javascript :alert(1)",
    "javascript\t:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\rscript:alert(1)",
    "java\0script:alert(1)",
    "javascript:%61lert(1)",
    "javascript:prompt(1)",
    "javascript:confirm(1)",
    "javascript:void(0)",
    "javascript:/*comment*/alert(1)",
  ];

  for (let i = 0; i < javascriptPayloads.length; i++) {
    const p = javascriptPayloads[i];
    const res = validateAndNormalizeDestination(p, "short1");
    check(res.valid === false, `A2.${i + 1}. Esquema javascript rejeitado: ${JSON.stringify(p)}`);
  }

  // A3: Bloqueio estrito de data: URI perigosos
  const dataPayloads = [
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "DATA:text/html,test",
    "data:application/javascript,alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
  ];

  for (let i = 0; i < dataPayloads.length; i++) {
    const p = dataPayloads[i];
    const res = validateAndNormalizeDestination(p, "short1");
    check(res.valid === false, `A3.${i + 1}. Esquema data: rejeitado: ${JSON.stringify(p)}`);
  }

  // A4: Bloqueio de outros protocolos inseguros (vbscript, file, blob)
  const otherProtocolPayloads = [
    "vbscript:msgbox(1)",
    "VBSCRIPT:alert(1)",
    "file:///etc/passwd",
    "file://C:/Windows/win.ini",
    "FILE:///etc/shadow",
    "blob:https://qrmasterdigital.com/a938b812",
    "BLOB:https://qrmasterdigital.com/test",
  ];

  for (let i = 0; i < otherProtocolPayloads.length; i++) {
    const p = otherProtocolPayloads[i];
    const res = validateAndNormalizeDestination(p, "short1");
    check(res.valid === false, `A4.${i + 1}. Protocolo inseguro rejeitado: ${JSON.stringify(p)}`);
  }

  // A5: Rejeição de payloads com tags HTML/XSS como destino
  const htmlInjectionPayloads = [
    "<script>alert(1)</script>",
    '"><script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '"><svg/onload=alert(1)>',
    '</script><script>alert(1)</script>',
  ];

  for (let i = 0; i < htmlInjectionPayloads.length; i++) {
    const p = htmlInjectionPayloads[i];
    const res = validateAndNormalizeDestination(p, "short1");
    check(res.valid === false, `A5.${i + 1}. Destino com tag HTML rejeitado: ${JSON.stringify(p)}`);
  }

  // A6: Prevenção de loop de redirecionamento para o próprio shortCode
  const selfLoop = validateAndNormalizeDestination("https://qrmasterdigital.com/q/meu-codigo-1", "meu-codigo-1");
  check(selfLoop.valid === false && selfLoop.error?.includes("Loop"), "A6.1. Loop para a própria rota /q/[shortCode] bloqueado");

  // ==========================================================================
  // GRUPO B: Validação e Sanitização de URLs em MultiLink
  // ==========================================================================
  console.log("\n--- GRUPO B: MultiLink URL Validation & Filtering ---");

  // B1: URLs válidas em MultiLink
  const mlValid = validateMultiLinkUrl("https://instagram.com/empresa");
  check(mlValid.valid === true && mlValid.normalizedUrl === "https://instagram.com/empresa", "B1.1. URL HTTPS em MultiLink aceita");

  const mlPhone = validateMultiLinkUrl("whatsapp:+5511999998888");
  check(mlPhone.valid === true, "B1.2. Link whatsapp: em MultiLink aceito");

  // B2: Protocolos perigosos rejeitados em MultiLink
  const mlDangerous = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:http://localhost/test",
    "about:blank",
  ];

  for (let i = 0; i < mlDangerous.length; i++) {
    const p = mlDangerous[i];
    const res = validateMultiLinkUrl(p);
    check(res.valid === false, `B2.${i + 1}. MultiLink rejeita protocolo perigoso: ${p}`);
  }

  // B3: sanitizeMultiLinkLinks filtra itens maliciosos e preserva os legítimos
  const dirtyLinks = [
    { title: "Instagram Oficial", url: "https://instagram.com/oficial" },
    { title: "Script Malicioso", url: "javascript:alert(document.cookie)" },
    { title: "Data Malicioso", url: "data:text/html,<script>alert(1)</script>" },
    { title: "WhatsApp Contato", url: "https://wa.me/5511999999999" },
    { title: "Arquivo do Sistema", url: "file:///etc/hosts" },
  ];

  const filtered = sanitizeMultiLinkLinks(dirtyLinks);
  check(filtered.length === 2, "B3.1. sanitizeMultiLinkLinks filtrou exatamente os links maliciosos");
  check(filtered[0].title === "Instagram Oficial" && filtered[0].url === "https://instagram.com/oficial", "B3.2. Link 1 legítimo preservado");
  check(filtered[1].title === "WhatsApp Contato" && filtered[1].url === "https://wa.me/5511999999999", "B3.3. Link 2 legítimo preservado");

  // ==========================================================================
  // GRUPO C: Defesas Contra XSS em Logotipo e Avatar (isSafeImageUrl)
  // ==========================================================================
  console.log("\n--- GRUPO C: Validação de Segurança para Logotipo e Avatar ---");

  // C1: URLs de imagem seguras aceitas
  check(isSafeImageUrl("https://bocasggbmidsrwbirwdv.supabase.co/storage/v1/object/public/logos/img.png") === true, "C1.1. URL Supabase Storage aceita");
  check(isSafeImageUrl("/uploads/storage/users/u1/logos/logo.png") === true, "C1.2. Caminho local de upload aceito");
  check(isSafeImageUrl("https://lh3.googleusercontent.com/a/avatar.jpg") === true, "C1.3. Avatar Google OAuth aceito");
  check(isSafeImageUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==") === true, "C1.4. Data URL de imagem (PNG) aceito");
  check(isSafeImageUrl(null) === true, "C1.5. URL nula (opcional) aceita");
  check(isSafeImageUrl(undefined) === true, "C1.6. URL indefinida (opcional) aceita");

  // C2: URLs maliciosas bloqueadas por isSafeImageUrl
  const unsafeImages = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "javascript:/*comment*/alert(1)",
    "java\0script:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "data:application/xhtml+xml,<html xmlns='http://www.w3.org/1999/xhtml'><script>alert(1)</script></html>",
    "data:text/plain,malicious",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "about:blank",
    "//evil.example.com/payload",
    "blob:https://qrmasterdigital.com/1234",
    "ftp://evil.com/pic.png",
  ];

  for (let i = 0; i < unsafeImages.length; i++) {
    const p = unsafeImages[i];
    check(isSafeImageUrl(p) === false, `C2.${i + 1}. isSafeImageUrl bloqueia URL maliciosa: ${p.substring(0, 35)}...`);
  }

  // ==========================================================================
  // GRUPO D: Prevenção de HTML Injection em Páginas de Status /q/*
  // ==========================================================================
  console.log("\n--- GRUPO D: Prevenção de HTML Injection em /q/* ---");

  // D1: Consulta a shortCode com caracteres maliciosos deve retornar status sanitizado
  const xssShortCodeReq = new NextRequest("http://localhost:3000/q/%3Cscript%3Ealert(1)%3C%2Fscript%3E");
  const xssRes = await resolveQrRoute(xssShortCodeReq, { params: { shortCode: "<script>alert(1)</script>" } });
  const htmlBody = await xssRes.text();

  check(xssRes.status === 404, "D1.1. Resposta 404 para shortCode inválido");
  check(!htmlBody.includes("<script>alert(1)</script>"), "D1.2. Nenhum script injetado na resposta HTML");
  check(htmlBody.includes("&lt;title&gt;") || htmlBody.includes("<title>"), "D1.3. Estrutura HTML preservada");
  check(htmlBody.includes("QR MASTER"), "D1.4. Branding da plataforma presente");
  check(htmlBody.includes("#f43f5e"), "D1.5. Cor hex de badge válida aplicada com segurança");
  check(!htmlBody.includes("undefined") && !htmlBody.includes("null"), "D1.6. Sem literais nulos vazados no HTML");


  // ==========================================================================
  // GRUPO E: Prevenção de HTML Injection em E-mails Transacionais
  // ==========================================================================
  console.log("\n--- GRUPO E: Prevenção de HTML Injection em E-mails ---");

  // E1: Envio com nome contendo payload XSS
  const maliciousName = '<img src=x onerror=alert("XSS")>';
  const maliciousUrl = 'https://qrmasterdigital.com/reset-password?token=abc1234567890';
  const emailRes = await sendPasswordResetEmail("victim@test.local", maliciousUrl, maliciousName);

  check(emailRes.success === true, "E1.1. Função sendPasswordResetEmail processa requisição");

  // ==========================================================================
  // GRUPO F: Auditoria de Uploads e Armazenamento
  // ==========================================================================
  console.log("\n--- GRUPO F: Validação de Uploads e MIME Sniffing ---");

  // F1: Extensões executáveis bloqueadas
  const forbiddenExts = [
    { name: "payload.html", size: 100 },
    { name: "script.js", size: 100 },
    { name: "backdoor.php", size: 100 },
    { name: "app.exe", size: 100 },
    { name: "document.htm", size: 100 },
    { name: "config.sh", size: 100 },
  ];

  for (let i = 0; i < forbiddenExts.length; i++) {
    const f = forbiddenExts[i];
    const val = validateFile(f);
    check(val.valid === false, `F1.${i + 1}. Extensão executável bloqueada: ${f.name}`);
  }

  // F2: MIME types executáveis bloqueados
  const forbiddenMimes = [
    { name: "imagem.png", size: 100, mimeType: "text/html" },
    { name: "foto.jpg", size: 100, mimeType: "application/javascript" },
    { name: "vetor.svg", size: 100, mimeType: "text/javascript" },
  ];

  for (let i = 0; i < forbiddenMimes.length; i++) {
    const f = forbiddenMimes[i];
    const val = validateFile(f);
    check(val.valid === false, `F2.${i + 1}. MIME executável disfarçado bloqueado: ${f.mimeType}`);
  }

  // F3: Formatos legítimos aceitos
  const validFiles = [
    { name: "logo.png", size: 50000, mimeType: "image/png" },
    { name: "banner.jpg", size: 80000, mimeType: "image/jpeg" },
    { name: "icone.webp", size: 30000, mimeType: "image/webp" },
    { name: "vetor.svg", size: 15000, mimeType: "image/svg+xml" },
    { name: "manual.pdf", size: 200000, mimeType: "application/pdf" },
  ];

  for (let i = 0; i < validFiles.length; i++) {
    const f = validFiles[i];
    const val = validateFile(f);
    check(val.valid === true, `F3.${i + 1}. Arquivo legítimo aceito: ${f.name} (${f.mimeType})`);
  }

  // ==========================================================================
  // GRUPO G: Campos Persistentes no Banco de Dados
  // ==========================================================================
  console.log("\n--- GRUPO G: Campos Persistentes e Integridade de Dados ---");

  // G1: Setup de usuário de teste para validações de banco
  let testUser = await prisma.user.findFirst({ where: { email: "xss_audit_user@test.local" } });
  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: "xss_audit_user@test.local",
        name: 'Carlos <script>alert("name_xss")</script>',
        role: "ADMIN",
      },
    });
  }

  const { token: userToken } = await createAuthenticatedSessionToken({
    id: testUser.id,
    name: testUser.name,
    email: testUser.email,
    role: testUser.role,
  });

  // G2: Criação de QR Code com payloads no nome e na descrição
  const xssName = 'Cardápio <img src=x onerror=alert(1)>';
  const xssDesc = 'Promoção <script>alert("desc")</script>';
  const safeDest = "https://qrmasterdigital.com/cardapio-seguro";

  const createReq = new NextRequest("http://localhost:3000/api/qr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      name: xssName,
      description: xssDesc,
      destination: safeDest,
      type: "url",
      isDynamic: false,
    }),
  });

  const createRes = await createQrRoute(createReq);
  check(createRes.status === 200, "G1.1. QR Code com caracteres especiais aceito como dado legítimo");
  const createData = await createRes.json();
  const createdId = createData.qrCode?.id;

  // G3: Leitura e verificação de integridade no banco
  const storedQr = await prisma.qRCode.findUnique({ where: { id: createdId } });
  check(storedQr?.name === xssName, "G2.1. Nome armazenado com precisão literal como string de dados");
  check(storedQr?.description === xssDesc, "G2.2. Descrição armazenada com precisão literal");

  // G4: Rejeição de tentativa de injetar logoUrl malicioso na criação
  const maliciousLogoReq = new NextRequest("http://localhost:3000/api/qr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      name: "QR Logo Malicioso",
      destination: safeDest,
      type: "url",
      logoUrl: "javascript:alert(document.cookie)",
      isDynamic: false,
    }),
  });

  const maliciousLogoRes = await createQrRoute(maliciousLogoReq);
  check(maliciousLogoRes.status === 400, "G3.1. POST /api/qr rejeita logoUrl com esquema javascript:");
  const logoErrData = await maliciousLogoRes.json();
  check(logoErrData.error?.includes("logotipo"), "G3.2. Mensagem de erro apropriada para logotipo inválido");

  // G5: Rejeição de tentativa de injetar logoUrl malicioso na edição
  const maliciousEditReq = new NextRequest(`http://localhost:3000/api/qr/${createdId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      logoUrl: "data:text/html,<script>alert(1)</script>",
    }),
  });

  const maliciousEditRes = await updateQrRoute(maliciousEditReq, { params: { id: createdId } });
  check(maliciousEditRes.status === 400, "G4.1. PUT /api/qr/[id] rejeita logoUrl com data:text/html");

  // G6: Rejeição de avatarUrl malicioso em /api/auth/me
  const maliciousAvatarReq = new NextRequest("http://localhost:3000/api/auth/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      avatarUrl: "javascript:alert(1)",
    }),
  });

  const maliciousAvatarRes = await updateMeRoute(maliciousAvatarReq);
  check(maliciousAvatarRes.status === 400, "G5.1. PATCH /api/auth/me rejeita avatarUrl com esquema javascript:");

  // Cleanup de registros de teste
  await prisma.qRCode.deleteMany({ where: { id: createdId } });
  await prisma.user.deleteMany({ where: { id: testUser.id } });

  // ==========================================================================
  // GRUPO H: Varredura de Sinks Perigosos na Aplicação
  // ==========================================================================
  console.log("\n--- GRUPO H: Varredura Estática de Sinks Perigosos na Base de Código ---");

  function scanDirectory(dir: string, pattern: RegExp): string[] {
    const matches: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        matches.push(...scanDirectory(full, pattern));
      } else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        if (pattern.test(text)) {
          matches.push(path.relative(process.cwd(), full));
        }
      }
    }
    return matches;
  }

  const srcDir = path.join(process.cwd(), "src");

  // H1: dangerouslySetInnerHTML ausente em src
  const dangerousHtml = scanDirectory(srcDir, /dangerouslySetInnerHTML/);
  check(dangerousHtml.length === 0, `H1. Zero dangerouslySetInnerHTML em src/ (encontrados: ${dangerousHtml.length})`);

  // H2: innerHTML ausente em src
  const innerHtmlMatches = scanDirectory(srcDir, /\.innerHTML\b/);
  check(innerHtmlMatches.length === 0, `H2. Zero .innerHTML em src/ (encontrados: ${innerHtmlMatches.length})`);

  // H3: outerHTML ausente em src
  const outerHtmlMatches = scanDirectory(srcDir, /\.outerHTML\b/);
  check(outerHtmlMatches.length === 0, `H3. Zero .outerHTML em src/ (encontrados: ${outerHtmlMatches.length})`);

  // H4: document.write ausente em src
  const docWriteMatches = scanDirectory(srcDir, /document\.write(ln)?\b/);
  check(docWriteMatches.length === 0, `H4. Zero document.write em src/ (encontrados: ${docWriteMatches.length})`);

  // H5: eval() ausente em src
  const evalMatches = scanDirectory(srcDir, /\beval\s*\(/);
  check(evalMatches.length === 0, `H5. Zero eval() em src/ (encontrados: ${evalMatches.length})`);

  // H6: new Function() ausente em src
  const functionMatches = scanDirectory(srcDir, /new\s+Function\b/);
  check(functionMatches.length === 0, `H6. Zero new Function() em src/ (encontrados: ${functionMatches.length})`);

  // H7: createContextualFragment ausente em src
  const fragmentMatches = scanDirectory(srcDir, /createContextualFragment\b/);
  check(fragmentMatches.length === 0, `H7. Zero createContextualFragment em src/ (encontrados: ${fragmentMatches.length})`);

  // H8: srcdoc ausente em src
  const srcdocMatches = scanDirectory(srcDir, /\bsrcdoc\b/);
  check(srcdocMatches.length === 0, `H8. Zero srcdoc em src/ (encontrados: ${srcdocMatches.length})`);

  // H9: iframe ausente em src
  const iframeMatches = scanDirectory(srcDir, /<iframe\b/i);
  check(iframeMatches.length === 0, `H9. Zero tags <iframe> em src/ (encontrados: ${iframeMatches.length})`);

  // ==========================================================================
  // TOTALIZAÇÃO
  // ==========================================================================
  console.log("\n==========================================================================");
  console.log(`  TOTAL DE ASSERÇÕES: ${totalAsserts}`);
  console.log(`  APROVADAS:          ${passedAsserts}`);
  console.log(`  FALHAS:             ${failedAsserts}`);
  console.log("==========================================================================");

  if (failedAsserts > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Erro fatal na execução da suíte:", err);
  process.exit(1);
});
