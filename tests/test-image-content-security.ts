/**
 * SECURITY-HARD-15A: Suíte Dedicada de Testes de Segurança de Imagem e SVG
 *
 * Escopo dos Testes:
 * 1. Validação determinística de Magic Bytes para formatos raster (PNG, JPEG, WEBP, GIF).
 * 2. Bloqueio estrito de arquivos SVG e ativos maliciosos em uploads de logos e avatares.
 * 3. Prevenção de MIME Spoofing, polyglots e buffers com preâmbulos XML/HTML disfarçados.
 * 4. Validação e sanitização de data URIs e URLs de imagem em isSafeImageUrl.
 * 5. Proteção adversarial na rota /api/storage/upload (multipart e JSON base64).
 * 6. Hardening da rota /api/files/save para exportações SVG e integridade de PNG.
 * 7. Auditoria estática dos componentes de UI (create/page.tsx e settings/page.tsx).
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { createAuthenticatedSessionToken } from "../src/lib/auth";
import {
  detectRasterImageFormat,
  validateImageBuffer,
  uploadFile,
  validateFile,
} from "../src/lib/storage";
import { isSafeImageUrl } from "../src/lib/dynamic-redirect";
import { POST as uploadRoute } from "../src/app/api/storage/upload/route";
import { POST as saveRoute } from "../src/app/api/files/save/route";

// Cores para saída no terminal
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let totalAsserts = 0;
let passedAsserts = 0;
let failedAsserts = 0;

function check(condition: unknown, description: string, detail?: string) {
  totalAsserts++;
  if (Boolean(condition)) {
    passedAsserts++;
    console.log(`  ${GREEN}✅ PASS:${RESET} ${description}`);
  } else {
    failedAsserts++;
    console.error(`  ${RED}❌ FAIL:${RESET} ${description}`);
    if (detail) console.error(`     Detalhe: ${detail}`);
  }
}

// Buffers legítimos para testes de Magic Bytes
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
]);

const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
]);

const VALID_WEBP_BUFFER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

const VALID_GIF87_BUFFER = Buffer.from("GIF87a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00", "binary");
const VALID_GIF89_BUFFER = Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00", "binary");

// Buffers maliciosos ou inadequados
const PURE_SVG_BUFFER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>');
const XML_SVG_BUFFER = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
const XSS_SVG_BUFFER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const ONLOAD_SVG_BUFFER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle/></svg>');
const HTML_SPOOFED_BUFFER = Buffer.from('<!DOCTYPE html><html><body><script>alert("hacked")</script></body></html>');
const JS_SPOOFED_BUFFER = Buffer.from('console.log("malicious code execution");');

async function runTestSuite() {
  console.log(`\n${CYAN}==========================================================================${RESET}`);
  console.log(`${CYAN}  SUÍTE DE TESTES: SECURITY-HARD-15A — SVG & IMAGE CONTENT HARDENING      ${RESET}`);
  console.log(`${CYAN}==========================================================================\n`);

  // ==========================================================================
  // GRUPO 1: Detecção Determinística de Formato Raster e Magic Bytes
  // ==========================================================================
  console.log(`${YELLOW}--- GRUPO 1: Detecção Determinística de Formato Raster (Magic Bytes) ---${RESET}`);

  check(detectRasterImageFormat(VALID_PNG_BUFFER) === "png", "1.1. detectRasterImageFormat identifica PNG autêntico");
  check(detectRasterImageFormat(VALID_JPEG_BUFFER) === "jpeg", "1.2. detectRasterImageFormat identifica JPEG autêntico");
  check(detectRasterImageFormat(VALID_WEBP_BUFFER) === "webp", "1.3. detectRasterImageFormat identifica WEBP autêntico");
  check(detectRasterImageFormat(VALID_GIF87_BUFFER) === "gif", "1.4. detectRasterImageFormat identifica GIF87a autêntico");
  check(detectRasterImageFormat(VALID_GIF89_BUFFER) === "gif", "1.5. detectRasterImageFormat identifica GIF89a autêntico");

  check(detectRasterImageFormat(PURE_SVG_BUFFER) === null, "1.6. detectRasterImageFormat rejeita SVG puro");
  check(detectRasterImageFormat(XML_SVG_BUFFER) === null, "1.7. detectRasterImageFormat rejeita XML com SVG");
  check(detectRasterImageFormat(HTML_SPOOFED_BUFFER) === null, "1.8. detectRasterImageFormat rejeita HTML");
  check(detectRasterImageFormat(JS_SPOOFED_BUFFER) === null, "1.9. detectRasterImageFormat rejeita JavaScript");
  check(detectRasterImageFormat(Buffer.from([0x89, 0x50, 0x4e])) === null, "1.10. detectRasterImageFormat rejeita buffer truncado (< 12 bytes)");
  check(detectRasterImageFormat(Buffer.alloc(0)) === null, "1.11. detectRasterImageFormat rejeita buffer vazio (0 bytes)");

  // Falsos magic bytes
  const fakeWebp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x46, 0x41, 0x4b, 0x45]); // RIFF...FAKE
  check(detectRasterImageFormat(fakeWebp) === null, "1.12. detectRasterImageFormat rejeita falso WEBP (RIFF sem assinatura WEBP)");

  const fakeJpeg = Buffer.from([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  check(detectRasterImageFormat(fakeJpeg) === null, "1.13. detectRasterImageFormat rejeita falso JPEG (FF D8 sem 3º byte FF)");

  // ==========================================================================
  // GRUPO 2: Validação Rigorosa de Buffer de Imagem (validateImageBuffer)
  // ==========================================================================
  console.log(`\n${YELLOW}--- GRUPO 2: Validação de Buffer de Imagem e Prevenção de Injeção ---${RESET}`);

  const vPng = validateImageBuffer(VALID_PNG_BUFFER, "logo.png");
  check(vPng.valid && vPng.detectedFormat === "png" && vPng.serverMime === "image/png", "2.1. validateImageBuffer aprova PNG com MIME image/png");

  const vJpg = validateImageBuffer(VALID_JPEG_BUFFER, "foto.jpg");
  check(vJpg.valid && vJpg.detectedFormat === "jpeg" && vJpg.serverMime === "image/jpeg", "2.2. validateImageBuffer aprova JPG com MIME image/jpeg");

  const vJpeg = validateImageBuffer(VALID_JPEG_BUFFER, "foto.jpeg");
  check(vJpeg.valid && vJpeg.detectedFormat === "jpeg" && vJpeg.serverMime === "image/jpeg", "2.3. validateImageBuffer aprova JPEG com MIME image/jpeg");

  const vWebp = validateImageBuffer(VALID_WEBP_BUFFER, "banner.webp");
  check(vWebp.valid && vWebp.detectedFormat === "webp" && vWebp.serverMime === "image/webp", "2.4. validateImageBuffer aprova WEBP com MIME image/webp");

  const vGif = validateImageBuffer(VALID_GIF89_BUFFER, "anim.gif");
  check(vGif.valid && vGif.detectedFormat === "gif" && vGif.serverMime === "image/gif", "2.5. validateImageBuffer aprova GIF com MIME image/gif");

  // Rejeição estrita de SVG por extensão
  const vSvgExt1 = validateImageBuffer(PURE_SVG_BUFFER, "vector.svg");
  check(!vSvgExt1.valid && vSvgExt1.error?.includes("SVG"), "2.6. validateImageBuffer bloqueia extensão .svg explicitamente");

  const vSvgExt2 = validateImageBuffer(PURE_SVG_BUFFER, "vector.SVG");
  check(!vSvgExt2.valid && vSvgExt2.error?.includes("SVG"), "2.7. validateImageBuffer bloqueia extensão .SVG em maiúsculas");

  const vSvgExt3 = validateImageBuffer(PURE_SVG_BUFFER, "vector.Svg");
  check(!vSvgExt3.valid && vSvgExt3.error?.includes("SVG"), "2.8. validateImageBuffer bloqueia extensão .Svg mista");

  // Detecção de mismatch de extensão vs formato real
  const vMismatch1 = validateImageBuffer(VALID_PNG_BUFFER, "imagem.jpg");
  check(!vMismatch1.valid && vMismatch1.error?.includes("incompatível"), "2.9. validateImageBuffer rejeita PNG com extensão .jpg");

  const vMismatch2 = validateImageBuffer(VALID_JPEG_BUFFER, "imagem.png");
  check(!vMismatch2.valid && vMismatch2.error?.includes("incompatível"), "2.10. validateImageBuffer rejeita JPEG com extensão .png");

  const vMismatch3 = validateImageBuffer(VALID_WEBP_BUFFER, "imagem.gif");
  check(!vMismatch3.valid && vMismatch3.error?.includes("incompatível"), "2.11. validateImageBuffer rejeita WEBP com extensão .gif");

  // Arquivos truncados ou vazios
  const vEmpty = validateImageBuffer(Buffer.alloc(0), "empty.png");
  check(!vEmpty.valid && vEmpty.error?.includes("vazio"), "2.12. validateImageBuffer rejeita arquivo de 0 bytes");

  const vTrunc = validateImageBuffer(Buffer.from([0x89, 0x50, 0x4e]), "trunc.png");
  check(!vTrunc.valid && vTrunc.error?.includes("muito pequeno"), "2.13. validateImageBuffer rejeita buffer menor que 12 bytes");

  // Prevenção de preâmbulos XML/HTML embutidos em arquivos
  const vXmlInPng = validateImageBuffer(XML_SVG_BUFFER, "fake.png");
  check(!vXmlInPng.valid, "2.14. validateImageBuffer rejeita preâmbulo XML em arquivo com extensão .png");

  const vSvgInJpg = validateImageBuffer(PURE_SVG_BUFFER, "fake.jpg");
  check(!vSvgInJpg.valid, "2.15. validateImageBuffer rejeita SVG em arquivo com extensão .jpg");

  const vHtmlInWebp = validateImageBuffer(HTML_SPOOFED_BUFFER, "fake.webp");
  check(!vHtmlInWebp.valid, "2.16. validateImageBuffer rejeita HTML em arquivo com extensão .webp");

  const vScriptInGif = validateImageBuffer(Buffer.from('<script>alert("xss")</script>GIF89a'), "fake.gif");
  check(!vScriptInGif.valid, "2.17. validateImageBuffer rejeita tag script em preâmbulo de arquivo");

  // ==========================================================================
  // GRUPO 3: Upload de Arquivos em Storage (uploadFile) com Bloqueio de SVG
  // ==========================================================================
  console.log(`\n${YELLOW}--- GRUPO 3: uploadFile e Isolamento de Pastas ---${RESET}`);

  let uploadSvgLogosFailed = false;
  try {
    await uploadFile({
      userId: "usr_test",
      folder: "logos",
      fileName: "vector.svg",
      buffer: PURE_SVG_BUFFER,
      mimeType: "image/svg+xml",
    });
  } catch (err: any) {
    uploadSvgLogosFailed = err.message.includes("SVG");
  }
  check(uploadSvgLogosFailed, "3.1. uploadFile bloqueia .svg em pasta 'logos'");

  let uploadSvgQrcodesFailed = false;
  try {
    await uploadFile({
      userId: "usr_test",
      folder: "qrcodes",
      fileName: "vector.svg",
      buffer: PURE_SVG_BUFFER,
      mimeType: "image/svg+xml",
    });
  } catch (err: any) {
    uploadSvgQrcodesFailed = err.message.includes("SVG");
  }
  check(uploadSvgQrcodesFailed, "3.2. uploadFile bloqueia .svg em pasta 'qrcodes'");

  let uploadSpoofedFailed = false;
  try {
    await uploadFile({
      userId: "usr_test",
      folder: "logos",
      fileName: "fake.png",
      buffer: HTML_SPOOFED_BUFFER,
      mimeType: "image/png",
    });
  } catch (err: any) {
    uploadSpoofedFailed = true;
  }
  check(uploadSpoofedFailed, "3.3. uploadFile bloqueia HTML disfarçado de .png");

  // ==========================================================================
  // GRUPO 4: Validação de URLs de Imagens (isSafeImageUrl)
  // ==========================================================================
  console.log(`\n${YELLOW}--- GRUPO 4: isSafeImageUrl — Proteção de Data URIs e URLs de Imagem ---${RESET}`);

  // Formatos raster permitidos em data: URI
  const validDataPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  check(isSafeImageUrl(validDataPng), "4.1. isSafeImageUrl aceita data:image/png legítimo");

  const validDataJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP";
  check(isSafeImageUrl(validDataJpeg), "4.2. isSafeImageUrl aceita data:image/jpeg legítimo");

  const validDataWebp = "data:image/webp;base64,UklGRmQAAABXRUJQVlA4TFYAAAAv";
  check(isSafeImageUrl(validDataWebp), "4.3. isSafeImageUrl aceita data:image/webp legítimo");

  const validDataGif = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  check(isSafeImageUrl(validDataGif), "4.4. isSafeImageUrl aceita data:image/gif legítimo");

  // SVG estritamente bloqueado em data: URI
  check(!isSafeImageUrl("data:image/svg+xml;utf8,<svg onload=alert(1)>"), "4.5. isSafeImageUrl bloqueia data:image/svg+xml UTF-8");
  check(!isSafeImageUrl("data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+"), "4.6. isSafeImageUrl bloqueia data:image/svg+xml Base64");
  check(!isSafeImageUrl("DATA:IMAGE/SVG+XML;base64,PHN2Zz4="), "4.7. isSafeImageUrl bloqueia DATA:IMAGE/SVG+XML em maiúsculas");
  check(!isSafeImageUrl("data:image/svg;utf8,<svg></svg>"), "4.8. isSafeImageUrl bloqueia data:image/svg");
  check(!isSafeImageUrl("data:image/xml;base64,PHhtbD4="), "4.9. isSafeImageUrl bloqueia data:image/xml");
  check(!isSafeImageUrl("data:text/html,<script>alert(1)</script>"), "4.10. isSafeImageUrl bloqueia data:text/html");
  check(!isSafeImageUrl("data:application/xml,<svg/>"), "4.11. isSafeImageUrl bloqueia data:application/xml");

  // URLs convencionais legítimas
  check(isSafeImageUrl("https://qrmasterdigital.com/uploads/logo.png"), "4.12. isSafeImageUrl aceita HTTPS legítimo");
  check(isSafeImageUrl("/uploads/avatar.png"), "4.13. isSafeImageUrl aceita caminho relativo /uploads/");
  check(isSafeImageUrl(null), "4.14. isSafeImageUrl aceita null (campo opcional)");
  check(isSafeImageUrl(undefined), "4.15. isSafeImageUrl aceita undefined (campo opcional)");

  // Esquemas maliciosos
  check(!isSafeImageUrl("javascript:alert(1)"), "4.16. isSafeImageUrl bloqueia javascript:");
  check(!isSafeImageUrl("//malicious.com/logo.png"), "4.17. isSafeImageUrl bloqueia protocol-relative (//)");
  check(!isSafeImageUrl("blob:https://qrmasterdigital.com/uuid"), "4.18. isSafeImageUrl bloqueia blob:");
  check(!isSafeImageUrl("file:///etc/passwd"), "4.19. isSafeImageUrl bloqueia file:");

  // ==========================================================================
  // GRUPO 5: Rota /api/storage/upload — Validação Adversarial Server-Side
  // ==========================================================================
  console.log(`\n${YELLOW}--- GRUPO 5: Rota /api/storage/upload — Validação Server-Side ---${RESET}`);

  // Setup de usuário de teste com role ADMIN (para ter permissão de custom_logo e exportação)
  let testUser = await prisma.user.findFirst({ where: { email: "img_audit_user@test.local" } });
  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: "img_audit_user@test.local",
        name: "Audit User Pro",
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

  // 5.1 Rejeição de upload multipart com extensão .svg
  const formDataSvg = new FormData();
  formDataSvg.append("file", new File([PURE_SVG_BUFFER], "vector.svg", { type: "image/svg+xml" }));
  formDataSvg.append("folder", "logos");

  const reqSvgMultipart = new NextRequest("http://localhost:3000/api/storage/upload", {
    method: "POST",
    headers: {
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: formDataSvg,
  });

  const resSvgMultipart = await uploadRoute(reqSvgMultipart);
  check(resSvgMultipart.status === 400, "5.1. /api/storage/upload rejeita upload multipart com extensão .svg (HTTP 400)");
  const dataSvgMulti = await resSvgMultipart.json();
  check(dataSvgMulti.error?.includes("SVG"), "5.2. Mensagem de erro informativa sobre bloqueio de SVG");

  // 5.3 Rejeição de upload multipart com HTML disfarçado de .png
  const formDataSpoof = new FormData();
  formDataSpoof.append("file", new File([HTML_SPOOFED_BUFFER], "foto.png", { type: "image/png" }));
  formDataSpoof.append("folder", "logos");

  const reqSpoofMultipart = new NextRequest("http://localhost:3000/api/storage/upload", {
    method: "POST",
    headers: {
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: formDataSpoof,
  });

  const resSpoofMultipart = await uploadRoute(reqSpoofMultipart);
  check(resSpoofMultipart.status === 400, "5.3. /api/storage/upload rejeita HTML disfarçado de .png (HTTP 400)");

  // 5.4 Rejeição de upload JSON base64 com .svg
  const reqSvgJson = new NextRequest("http://localhost:3000/api/storage/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "logo.svg",
      folder: "logos",
      fileData: PURE_SVG_BUFFER.toString("base64"),
      mimeType: "image/svg+xml",
    }),
  });

  const resSvgJson = await uploadRoute(reqSvgJson);
  check(resSvgJson.status === 400, "5.4. /api/storage/upload rejeita payload JSON com .svg (HTTP 400)");

  // 5.5 Rejeição de upload JSON base64 com HTML disfarçado de .png
  const reqSpoofJson = new NextRequest("http://localhost:3000/api/storage/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "logo.png",
      folder: "logos",
      fileData: HTML_SPOOFED_BUFFER.toString("base64"),
      mimeType: "image/png",
    }),
  });

  const resSpoofJson = await uploadRoute(reqSpoofJson);
  check(resSpoofJson.status === 400, "5.5. /api/storage/upload rejeita payload JSON com HTML disfarçado de .png (HTTP 400)");

  // 5.6 Rejeição de upload JSON base64 com buffer corrompido / lixo binário
  const reqJunkJson = new NextRequest("http://localhost:3000/api/storage/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "logo.png",
      folder: "logos",
      fileData: Buffer.from("LIXO_NAO_IMAGEM_1234567890").toString("base64"),
      mimeType: "image/png",
    }),
  });

  const resJunkJson = await uploadRoute(reqJunkJson);
  check(resJunkJson.status === 400, "5.6. /api/storage/upload rejeita buffer binário desconhecido (HTTP 400)");

  // ==========================================================================
  // GRUPO 6: Rota /api/files/save — Hardening de Exportações SVG e PNG
  // ==========================================================================
  console.log(`\n${YELLOW}--- GRUPO 6: Rota /api/files/save — Hardening de Exportações ---${RESET}`);

  // 6.1 Rejeição de SVG contendo <script>
  const reqSaveSvgScript = new NextRequest("http://localhost:3000/api/files/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "qr_export.svg",
      fileType: "svg",
      fileData: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>',
      mimeType: "image/svg+xml",
    }),
  });

  const resSaveSvgScript = await saveRoute(reqSaveSvgScript);
  check(resSaveSvgScript.status === 400, "6.1. /api/files/save rejeita exportação SVG contendo <script> (HTTP 400)");

  // 6.2 Rejeição de SVG contendo manipulador onload=
  const reqSaveSvgOnload = new NextRequest("http://localhost:3000/api/files/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "qr_export.svg",
      fileType: "svg",
      fileData: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle cx="10" cy="10" r="5"/></svg>',
      mimeType: "image/svg+xml",
    }),
  });

  const resSaveSvgOnload = await saveRoute(reqSaveSvgOnload);
  check(resSaveSvgOnload.status === 400, "6.2. /api/files/save rejeita exportação SVG contendo manipulador onload= (HTTP 400)");

  // 6.3 Rejeição de SVG contendo link javascript:
  const reqSaveSvgJsLink = new NextRequest("http://localhost:3000/api/files/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "qr_export.svg",
      fileType: "svg",
      fileData: '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><circle cx="10" cy="10" r="5"/></a></svg>',
      mimeType: "image/svg+xml",
    }),
  });

  const resSaveSvgJsLink = await saveRoute(reqSaveSvgJsLink);
  check(resSaveSvgJsLink.status === 400, "6.3. /api/files/save rejeita exportação SVG contendo link javascript: (HTTP 400)");

  // 6.4 Rejeição de exportação PNG com conteúdo adulterado
  const reqSavePngCorrupt = new NextRequest("http://localhost:3000/api/files/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "qr_export.png",
      fileType: "png",
      fileData: HTML_SPOOFED_BUFFER.toString("base64"),
      mimeType: "image/png",
    }),
  });

  const resSavePngCorrupt = await saveRoute(reqSavePngCorrupt);
  check(resSavePngCorrupt.status === 400, "6.4. /api/files/save rejeita exportação PNG com conteúdo adulterado (HTTP 400)");

  // 6.5 Rejeição de SVG contendo <foreignObject>
  const reqSaveForeign = new NextRequest("http://localhost:3000/api/files/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "qr_export.svg",
      fileType: "svg",
      fileData: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100" height="50"><div>xss</div></foreignObject></svg>',
      mimeType: "image/svg+xml",
    }),
  });
  const resSaveForeign = await saveRoute(reqSaveForeign);
  check(resSaveForeign.status === 400, "6.5. /api/files/save rejeita exportação SVG contendo <foreignObject> (HTTP 400)");

  // 6.6 Rejeição de SVG contendo <!DOCTYPE>
  const reqSaveDoctype = new NextRequest("http://localhost:3000/api/files/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "qr_export.svg",
      fileType: "svg",
      fileData: '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg></svg>',
      mimeType: "image/svg+xml",
    }),
  });
  const resSaveDoctype = await saveRoute(reqSaveDoctype);
  check(resSaveDoctype.status === 400, "6.6. /api/files/save rejeita exportação SVG contendo <!DOCTYPE> (HTTP 400)");

  // 6.7 Rejeição de SVG contendo <!ENTITY>
  const reqSaveEntity = new NextRequest("http://localhost:3000/api/files/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "qr_export.svg",
      fileType: "svg",
      fileData: '<svg xmlns="http://www.w3.org/2000/svg"><!ENTITY xxe SYSTEM "file:///etc/passwd"><rect/></svg>',
      mimeType: "image/svg+xml",
    }),
  });
  const resSaveEntity = await saveRoute(reqSaveEntity);
  check(resSaveEntity.status === 400, "6.7. /api/files/save rejeita exportação SVG contendo <!ENTITY> (HTTP 400)");

  // 6.8 Rejeição de SVG contendo mixed-case <ScRiPt>
  const reqSaveMixedScript = new NextRequest("http://localhost:3000/api/files/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `qrmaster_session=${userToken}`,
      authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      fileName: "qr_export.svg",
      fileType: "svg",
      fileData: '<svg xmlns="http://www.w3.org/2000/svg"><ScRiPt>alert("xss")</sCrIpT></svg>',
      mimeType: "image/svg+xml",
    }),
  });
  const resSaveMixedScript = await saveRoute(reqSaveMixedScript);
  check(resSaveMixedScript.status === 400, "6.8. /api/files/save rejeita exportação SVG contendo mixed-case <ScRiPt> (HTTP 400)");

  // Cleanup de usuário de teste
  await prisma.user.deleteMany({ where: { id: testUser.id } });

  // ==========================================================================
  // GRUPO 7: Auditoria Estática dos Componentes de UI (Frontend Hardening)
  // ==========================================================================
  console.log(`\n${YELLOW}--- GRUPO 7: Auditoria Estática dos Componentes de UI ---${RESET}`);

  const createPagePath = path.join(process.cwd(), "src/app/(dashboard)/create/page.tsx");
  const createPageCode = fs.readFileSync(createPagePath, "utf-8");

  const createInputAccept = createPageCode.includes('accept="image/png, image/jpeg, image/webp"');
  check(createInputAccept, "7.1. create/page.tsx restringe input accept a PNG, JPEG e WEBP");

  const createHasSvgBlock = createPageCode.includes("image/svg+xml") && createPageCode.includes(".svg");
  check(createHasSvgBlock, "7.2. create/page.tsx bloqueia explicitamente SVG no handler handleLogoUpload");

  const settingsPagePath = path.join(process.cwd(), "src/app/(dashboard)/settings/page.tsx");
  const settingsPageCode = fs.readFileSync(settingsPagePath, "utf-8");

  const settingsInputAccept = settingsPageCode.includes('accept="image/png, image/jpeg, image/webp"');
  check(settingsInputAccept, "7.3. settings/page.tsx restringe input accept a PNG, JPEG e WEBP");

  const settingsHasSvgBlock = settingsPageCode.includes("image/svg+xml") && settingsPageCode.includes(".svg");
  check(settingsHasSvgBlock, "7.4. settings/page.tsx bloqueia explicitamente SVG no handler handleAvatarUpload");

  // ==========================================================================
  // RESUMO FINAL
  // ==========================================================================
  console.log(`\n${CYAN}==========================================================================${RESET}`);
  console.log(`${CYAN}  RESUMO FINAL: SECURITY-HARD-15A                                         ${RESET}`);
  console.log(`${CYAN}==========================================================================${RESET}`);
  console.log(`  Total de Asserções: ${totalAsserts}`);
  console.log(`  Aprovadas:          ${GREEN}${passedAsserts}${RESET}`);
  console.log(`  Falhas:             ${failedAsserts > 0 ? RED : GREEN}${failedAsserts}${RESET}`);
  console.log(`${CYAN}==========================================================================\n${RESET}`);

  if (failedAsserts > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Erro fatal na execução da suíte:", err);
  process.exit(1);
});
