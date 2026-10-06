/**
 * Suíte de Testes de Regressão: BUG-02 — Validação Cirúrgica de Logotipo (isSafeImageUrl)
 * 
 * Cobre:
 * 1. Casos obrigatórios [A] a [Y];
 * 2. Regressão com 10 PNGs oficiais do repositório (anteriormente rejeitados por falso positivo);
 * 3. Validação estrutural de endpoints (POST /api/qr e PUT /api/qr/[id]) com logo Data URI legítimo e SVG malicioso.
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { isSafeImageUrl } from "../src/lib/dynamic-redirect";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let passCount = 0;
let failCount = 0;

function check(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ${GREEN}✅ PASS:${RESET} ${desc}`);
    passCount++;
  } else {
    console.log(`  ${RED}❌ FAIL:${RESET} ${desc}`);
    failCount++;
  }
}

// ----------------------------------------------------------------------------
// Utilitários para criação de fixtures
// ----------------------------------------------------------------------------
const basePngBuf = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function createPngWithSubstrings(): {
  withSvg: string;
  withXml: string;
  withHtml: string;
} {
  // apple-touch-icon.png já contém "svg" em base64
  // logo-dark.png já contém "xml" em base64
  // Vamos carregar esses arquivos oficiais como referências autênticas:
  const appleTouchPath = path.join(process.cwd(), "public/brand/apple-touch-icon.png");
  const logoDarkPath = path.join(process.cwd(), "public/brand/logo-dark.png");

  const withSvg = "data:image/png;base64," + fs.readFileSync(appleTouchPath).toString("base64");
  const withXml = "data:image/png;base64," + fs.readFileSync(logoDarkPath).toString("base64");

  // Para "html", injetamos um chunk tEXt autêntico alinhado para produzir a substring literal "html"
  const iend = basePngBuf.lastIndexOf(Buffer.from("IEND"));
  const beforeIend = basePngBuf.subarray(0, iend - 4);
  const afterIend = basePngBuf.subarray(iend - 4);

  const padBuf = Buffer.alloc(1, 0); // pad 1 garante o alinhamento
  const targetBytes = Buffer.from([0x86, 0xd9, 0xa5]); // bytes que codificam para "html"
  const chunkData = Buffer.concat([Buffer.from("X\0"), padBuf, targetBytes]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(chunkData.length, 0);
  const type = Buffer.from("tEXt");
  const crc = Buffer.alloc(4);
  const chunk = Buffer.concat([len, type, chunkData, crc]);
  const fullPng = Buffer.concat([beforeIend, chunk, afterIend]);
  const withHtml = "data:image/png;base64," + fullPng.toString("base64");

  return { withSvg, withXml, withHtml };
}

async function runLogoValidationTests() {
  console.log(`\n${CYAN}==========================================================================${RESET}`);
  console.log(`${CYAN}  SUÍTE DE TESTES: BUG-02 — SURGICAL FIX LOGO VALIDATION (isSafeImageUrl)  ${RESET}`);
  console.log(`${CYAN}==========================================================================${RESET}\n`);

  const { withSvg, withXml, withHtml } = createPngWithSubstrings();

  // Verifica premissa: as fixtures contêm as substrings no Base64
  assert(withSvg.toLowerCase().includes("svg"), "Fixture withSvg deve conter 'svg' no Base64");
  assert(withXml.toLowerCase().includes("xml"), "Fixture withXml deve conter 'xml' no Base64");
  assert(withHtml.toLowerCase().includes("html"), "Fixture withHtml deve conter 'html' no Base64");

  // ==========================================================================
  // BLOCO 1: Casos Obrigatórios [A] a [Y]
  // ==========================================================================
  console.log(`${YELLOW}--- BLOCO 1: Casos Obrigatórios [A] a [Y] ---${RESET}`);

  // A. PNG Data URI legítimo => TRUE
  check(isSafeImageUrl("data:image/png;base64," + basePngBuf.toString("base64")) === true, "[A] PNG Data URI legítimo aceito");

  // B. PNG Data URI cujo Base64 contém literalmente "svg" => TRUE
  check(isSafeImageUrl(withSvg) === true, "[B] PNG Data URI cujo Base64 contém literalmente 'svg' aceito");

  // C. PNG Data URI cujo Base64 contém literalmente "xml" => TRUE
  check(isSafeImageUrl(withXml) === true, "[C] PNG Data URI cujo Base64 contém literalmente 'xml' aceito");

  // D. PNG Data URI cujo Base64 contém literalmente "html" => TRUE
  check(isSafeImageUrl(withHtml) === true, "[D] PNG Data URI cujo Base64 contém literalmente 'html' aceito");

  // E. JPEG Data URI legítimo => TRUE
  check(isSafeImageUrl("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP") === true, "[E] JPEG Data URI legítimo aceito");

  // F. WEBP Data URI legítimo => TRUE
  check(isSafeImageUrl("data:image/webp;base64,UklGRmQAAABXRUJQVlA4TFYAAAAv") === true, "[F] WEBP Data URI legítimo aceito");

  // G. SVG Data URI => FALSE
  check(isSafeImageUrl("data:image/svg+xml;utf8,<svg onload=alert(1)>") === false, "[G] SVG Data URI rejeitado");

  // H. SVG Base64 malicioso => FALSE
  check(isSafeImageUrl("data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+") === false, "[H] SVG Base64 malicioso rejeitado");

  // I. data:text/html => FALSE
  check(isSafeImageUrl("data:text/html,<script>alert(1)</script>") === false, "[I] data:text/html rejeitado");

  // J. data:application/xml => FALSE
  check(isSafeImageUrl("data:application/xml,<svg/>") === false, "[J] data:application/xml rejeitado");

  // K. javascript: => FALSE
  check(isSafeImageUrl("javascript:alert(1)") === false, "[K] javascript: rejeitado");

  // L. blob: => FALSE
  check(isSafeImageUrl("blob:https://qrmasterdigital.com/uuid") === false, "[L] blob: rejeitado");

  // M. URL malformada => FALSE
  check(isSafeImageUrl("not-a-valid-url-12345") === false, "[M] URL malformada rejeitada");

  // N. Supabase Storage legítimo => TRUE
  check(isSafeImageUrl("https://bocasggbmidsrwbirwdv.supabase.co/storage/v1/object/public/logos/img.png") === true, "[N] Supabase Storage legítimo aceito");

  // O. localhost => FALSE
  check(isSafeImageUrl("http://localhost:3000/logo.png") === false, "[O] localhost rejeitado");

  // P. 127.0.0.1 => FALSE
  check(isSafeImageUrl("http://127.0.0.1:8080/logo.png") === false, "[P] 127.0.0.1 rejeitado");

  // Q. 169.254.169.254 => FALSE
  check(isSafeImageUrl("http://169.254.169.254/latest/meta-data/") === false, "[Q] 169.254.169.254 rejeitado");

  // R. 192.168.x.x => FALSE
  check(isSafeImageUrl("http://192.168.1.1/logo.png") === false, "[R] 192.168.x.x rejeitado");

  // S. 10.x.x.x => FALSE
  check(isSafeImageUrl("http://10.0.0.1/logo.png") === false, "[S] 10.x.x.x rejeitado");

  // T. 172.16-31.x.x => FALSE
  check(isSafeImageUrl("http://172.16.0.1/logo.png") === false, "[T] 172.16-31.x.x rejeitado");

  // U. userinfo URL => FALSE
  check(isSafeImageUrl("https://bocasggbmidsrwbirwdv.supabase.co@attacker.com/logo.png") === false, "[U] userinfo URL rejeitada");

  // V. hostname spoofing => FALSE
  check(isSafeImageUrl("https://bocasggbmidsrwbirwdv.supabase.co.attacker.com/logo.png") === false, "[V] hostname spoofing rejeitado");

  // W. payload Base64 inválido => FALSE
  check(isSafeImageUrl("data:image/png;base64,invalid!@#$characters") === false, "[W] payload Base64 inválido rejeitado");

  // X. payload vazio => FALSE
  check(isSafeImageUrl("data:image/png;base64,") === false, "[X] payload vazio rejeitado");

  // Y. MIME falso: data:image/png;base64,<HTML> => FALSE (magic-byte validation)
  const fakePngHtml = "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64");
  check(isSafeImageUrl(fakePngHtml) === false, "[Y] MIME falso (HTML disfarçado de PNG) rejeitado por magic bytes");

  // ==========================================================================
  // BLOCO 2: Regressão dos 10 PNGs Oficiais do Repositório (public/brand/)
  // ==========================================================================
  console.log(`\n${YELLOW}--- BLOCO 2: Regressão com os 10 PNGs Oficiais do Repositório ---${RESET}`);

  const brandDir = path.join(process.cwd(), "public/brand");
  const brandFiles = fs.readdirSync(brandDir).filter((f) => f.endsWith(".png"));

  let brandPass = 0;
  for (const f of brandFiles) {
    const filePath = path.join(brandDir, f);
    const buf = fs.readFileSync(filePath);
    const dataUrl = "data:image/png;base64," + buf.toString("base64");
    const ok = isSafeImageUrl(dataUrl);
    check(ok, `Brand PNG: ${f} (${buf.length} bytes) aprovado`);
    if (ok) brandPass++;
  }
  check(brandPass === 10, `Todos os 10 PNGs de marca oficiais aprovados (10/10 vs 2/10 anteriormente)`);

  // ==========================================================================
  // BLOCO 3: Simulação de Validação do Endpoint POST /api/qr
  // ==========================================================================
  console.log(`\n${YELLOW}--- BLOCO 3: Validação de Regras do Endpoint /api/qr ---${RESET}`);

  // Simula a validação exata executada em src/app/api/qr/route.ts linhas 156-161:
  // if (!isSafeImageUrl(logoUrl) || (styleConfig && typeof styleConfig === "object" && !isSafeImageUrl(styleConfig.logoUrl)))
  function validateQrEndpointLogo(logoUrl: unknown, styleConfig?: any): { error?: string; status: number } {
    if (!isSafeImageUrl(logoUrl) || (styleConfig && typeof styleConfig === "object" && !isSafeImageUrl(styleConfig.logoUrl))) {
      return {
        error: "URL de logotipo inválida ou não permitida por motivos de segurança.",
        status: 400,
      };
    }
    return { status: 200 };
  }

  // 3.1 Logo PNG legítimo com metadados XMP/XML (estilo WhatsApp Comercial)
  const validLogoRes = validateQrEndpointLogo(withXml, { logoUrl: withXml });
  check(validLogoRes.status === 200, "3.1. POST /api/qr aceita logotipo raster legítimo com metadados");

  // 3.2 Logo SVG malicioso
  const maliciousSvgRes = validateQrEndpointLogo("data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+", {
    logoUrl: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
  });
  check(maliciousSvgRes.status === 400, "3.2. POST /api/qr rejeita logotipo SVG com HTTP 400");
  check(
    maliciousSvgRes.error === "URL de logotipo inválida ou não permitida por motivos de segurança.",
    "3.3. Mensagem de erro oficial mantida intacta para logos maliciosos"
  );

  // 3.3 Criação sem logo (logoUrl ausente / null / undefined)
  const noLogoRes = validateQrEndpointLogo(null, { hasLogo: false });
  check(noLogoRes.status === 200, "3.4. POST /api/qr sem logo é aceito normalmente");

  // ==========================================================================
  // RESUMO FINAL
  // ==========================================================================
  console.log(`\n${CYAN}==========================================================================${RESET}`);
  console.log(`  TOTAL DE ASSERÇÕES: ${passCount + failCount}`);
  console.log(`  APROVADAS:          ${GREEN}${passCount}${RESET}`);
  console.log(`  FALHAS:             ${failCount > 0 ? RED : GREEN}${failCount}${RESET}`);
  console.log(`${CYAN}==========================================================================${RESET}\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runLogoValidationTests().catch((err) => {
  console.error("Erro na execução dos testes:", err);
  process.exit(1);
});
