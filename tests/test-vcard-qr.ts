import assert from "node:assert/strict";
import QRCodeLib from "qrcode";
import { NextRequest } from "next/server";
import {
  formatQRDestination,
  validateQRContent,
  escapeVCardValue,
  normalizeVCardPayload,
} from "../src/lib/qr-generator";
import { validateAndNormalizeDestination } from "../src/lib/dynamic-redirect";
import { prisma } from "../src/lib/db";
import { GET as handleDynamicRedirect } from "../src/app/q/[shortCode]/route";

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`✅ PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`❌ FAIL: ${name}`);
    console.error("   ", err?.message || err);
  }
}

async function main() {
  console.log("==================================================");
  console.log("TEST SUITE: QR-VCARD-01 — CARTÃO DE VISITA (vCard)");
  console.log("==================================================\n");

  // 1. Geração vCard completo válido + Caso de teste obrigatório Carlos Ferreira (Seção 9)
  await runTest("1. Geração vCard 3.0 completo válido (Caso real Carlos Ferreira)", () => {
    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      lastName: "ferreira",
      company: "QR MASTER DIGITAL",
      title: "proprietário",
      cellPhone: "+5531985029353",
      contactEmail: "qrmasterdital@gmail.com",
    });

    const expected = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:ferreira;Carlos;;;",
      "FN:Carlos ferreira",
      "ORG:QR MASTER DIGITAL",
      "TITLE:proprietário",
      "TEL;TYPE=CELL:+5531985029353",
      "EMAIL;TYPE=INTERNET:qrmasterdital@gmail.com",
      "END:VCARD",
    ].join("\r\n");

    assert.equal(payload, expected);
  });

  // 2. Geração vCard apenas com nome + telefone
  await runTest("2. Geração vCard apenas com nome + telefone", () => {
    const val = validateQRContent("contact", {
      firstName: "Carlos",
      cellPhone: "31985029353",
    });
    assert.equal(val.valid, true);

    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      cellPhone: "31985029353",
    });
    assert.ok(payload.includes("N:;Carlos;;;"));
    assert.ok(payload.includes("FN:Carlos"));
    assert.ok(payload.includes("TEL;TYPE=CELL:+5531985029353"));
    assert.ok(!payload.includes("ORG:"));
    assert.ok(!payload.includes("EMAIL"));
  });

  // 3. Geração vCard apenas com nome + email
  await runTest("3. Geração vCard apenas com nome + email", () => {
    const val = validateQRContent("contact", {
      firstName: "Carlos",
      contactEmail: "qrmasterdital@gmail.com",
    });
    assert.equal(val.valid, true);

    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      contactEmail: "qrmasterdital@gmail.com",
    });
    assert.ok(payload.includes("FN:Carlos"));
    assert.ok(payload.includes("EMAIL;TYPE=INTERNET:qrmasterdital@gmail.com"));
    assert.ok(!payload.includes("TEL;"));
  });

  // 4. Nome e sobrenome separados corretamente em N:
  await runTest("4. Nome e sobrenome separados corretamente em N: (Sobrenome;Nome;;;)", () => {
    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      lastName: "Ferreira",
      cellPhone: "+5531985029353",
    });
    assert.ok(payload.includes("\r\nN:Ferreira;Carlos;;;\r\n"));
  });

  // 5. FN preenchido corretamente
  await runTest("5. FN preenchido corretamente com nome completo", () => {
    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      lastName: "Ferreira",
      cellPhone: "+5531985029353",
    });
    assert.ok(payload.includes("\r\nFN:Carlos Ferreira\r\n"));
  });

  // 6. Acentos preservados ("proprietário")
  await runTest("6. Acentos UTF-8 preservados ('proprietário', 'São Paulo')", () => {
    const payload = formatQRDestination("contact", {
      firstName: "João",
      lastName: "Conceição",
      title: "proprietário",
      city: "São Paulo",
    });
    assert.ok(payload.includes("TITLE:proprietário"));
    assert.ok(payload.includes("FN:João Conceição"));
    assert.ok(payload.includes("São Paulo"));
  });

  // 7. Telefone normalizado (+5531985029353)
  await runTest("7. Telefone normalizado para formato internacional E.164 (+5531985029353)", () => {
    const p1 = formatQRDestination("contact", {
      firstName: "Carlos",
      cellPhone: "5531985029353",
    });
    const p2 = formatQRDestination("contact", {
      firstName: "Carlos",
      cellPhone: "(31) 98502-9353",
    });
    const p3 = formatQRDestination("contact", {
      firstName: "Carlos",
      cellPhone: "+55 31 98502-9353",
    });

    assert.ok(p1.includes("TEL;TYPE=CELL:+5531985029353"));
    assert.ok(p2.includes("TEL;TYPE=CELL:+5531985029353"));
    assert.ok(p3.includes("TEL;TYPE=CELL:+5531985029353"));
  });

  // 8. Email válido aceito
  await runTest("8. Email válido aceito e formatado como EMAIL;TYPE=INTERNET:", () => {
    const check = validateQRContent("contact", {
      firstName: "Carlos",
      contactEmail: "qrmasterdital@gmail.com",
    });
    assert.equal(check.valid, true);
    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      contactEmail: "qrmasterdital@gmail.com",
    });
    assert.ok(payload.includes("EMAIL;TYPE=INTERNET:qrmasterdital@gmail.com"));
  });

  // 9. Email inválido rejeitado
  await runTest("9. Email inválido rejeitado por validateQRContent", () => {
    const check = validateQRContent("contact", {
      firstName: "Carlos",
      contactEmail: "email-invalido-sem-arroba",
    });
    assert.equal(check.valid, false);
    assert.ok(check.error?.includes("e-mail"));
  });

  // 10. Campos vazios opcionais não geram 'undefined' ou 'null'
  await runTest("10. Campos vazios opcionais não geram 'undefined' ou 'null' no vCard", () => {
    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      lastName: undefined,
      company: undefined,
      title: undefined,
      cellPhone: "+5531985029353",
      workPhone: undefined,
      contactEmail: undefined,
      website: undefined,
    });
    assert.ok(!payload.includes("undefined"));
    assert.ok(!payload.includes("null"));
  });

  // 11. Início com BEGIN:VCARD
  await runTest("11. Payload inicia estritamente com BEGIN:VCARD", () => {
    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      cellPhone: "+5531985029353",
    });
    assert.ok(payload.startsWith("BEGIN:VCARD\r\n"));
  });

  // 12. VERSION:3.0 presente
  await runTest("12. VERSION:3.0 presente na segunda linha do vCard", () => {
    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      cellPhone: "+5531985029353",
    });
    const lines = payload.split("\r\n");
    assert.equal(lines[0], "BEGIN:VCARD");
    assert.equal(lines[1], "VERSION:3.0");
  });

  // 13. Fim com END:VCARD
  await runTest("13. Payload termina estritamente com END:VCARD", () => {
    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      cellPhone: "+5531985029353",
    });
    assert.ok(payload.endsWith("\r\nEND:VCARD"));
  });

  // 14. Quebras de linha corretas (CRLF \r\n)
  await runTest("14. Todas as quebras de linha seguem o padrão CRLF (\\r\\n)", () => {
    const payload = formatQRDestination("contact", {
      firstName: "Carlos",
      lastName: "ferreira",
      company: "QR MASTER DIGITAL",
      title: "proprietário",
      cellPhone: "5531985029353",
      contactEmail: "qrmasterdital@gmail.com",
    });
    const withoutCrlf = payload.replace(/\r\n/g, "");
    assert.ok(!withoutCrlf.includes("\n"), "Não deve conter LF solto sem CR");
    assert.ok(!withoutCrlf.includes("\r"), "Não deve conter CR solto sem LF");
  });

  // 15. Caracteres especiais escapados (; , \ e quebras de linha maliciosas)
  await runTest("15. Caracteres especiais (; , \\) escapados e quebras de linha neutralizadas", () => {
    const escaped = escapeVCardValue("Empresa; Ltda, Brasil \\ Matriz\r\nNOTE:Injected");
    assert.equal(escaped, "Empresa\\; Ltda\\, Brasil \\\\ Matriz NOTE:Injected");
    assert.ok(!escaped.includes("\n"));
    assert.ok(!escaped.includes("\r"));
  });

  // 16. QR gerado decodifica para vCard válido (ou rota .vcf válida)
  await runTest("16. QR Code gerado (QRCodeLib.create) codifica exatamente os bytes UTF-8 do vCard", () => {
    const vcard = formatQRDestination("contact", {
      firstName: "Carlos",
      lastName: "ferreira",
      company: "QR MASTER DIGITAL",
      title: "proprietário",
      cellPhone: "5531985029353",
      contactEmail: "qrmasterdital@gmail.com",
    });

    const qrMatrix = QRCodeLib.create(vcard, { errorCorrectionLevel: "M" });
    assert.ok(qrMatrix.modules.size > 21, "Matriz QR deve ser criada com sucesso");
    const reconstructed = qrMatrix.segments
      .map((s: any) =>
        typeof s.data === "string"
          ? s.data
          : Buffer.from(s.data).toString("utf-8")
      )
      .join("");
    assert.equal(reconstructed, vcard);
  });

  // 17. Não há redirect inválido para "BEGIN:VCARD..."
  // 18. Se usar rota dinâmica, retorna Content-Type text/vcard; charset=utf-8
  let dynamicVCardResStatus = 0;
  let dynamicVCardLocation: string | null = null;
  let dynamicVCardContentType: string | null = null;
  let dynamicVCardDisposition: string | null = null;
  let dynamicVCardBody = "";

  await runTest("17. Rota dinâmica /q/[shortCode] NUNCA dá redirect 307 para 'BEGIN:VCARD...'", async () => {
    const legacyVCard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:ferreira;Carlos;;;",
      "FN:Carlos ferreira",
      "ORG:QR MASTER DIGITAL",
      "TITLE:proprietário",
      "TEL;TYPE=CELL:5531985029353",
      "EMAIL;TYPE=INTERNET:qrmasterdital@gmail.com",
      "END:VCARD",
    ].join("\n");

    const validation = validateAndNormalizeDestination(legacyVCard, "vcrdtest");
    assert.equal(validation.valid, true);
    assert.ok(validation.sanitizedUrl?.includes("\r\nTEL;TYPE=CELL:+5531985029353\r\n"));

    const existingUser = await prisma.user.findFirst({ select: { id: true } });
    if (existingUser) {
      const tempShortCode = "vcrd9991";
      const created = await prisma.qRCode.create({
        data: {
          name: "Temp Test vCard Carlos",
          type: "contact",
          isDynamic: true,
          shortCode: tempShortCode,
          destination: legacyVCard,
          content: "{}",
          styleConfig: "{}",
          userId: existingUser.id,
          status: "ACTIVE",
        },
      });

      try {
        const req = new NextRequest(`https://qrmasterdigital.com/q/${tempShortCode}`, {
          method: "GET",
          headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
        });
        const res = await handleDynamicRedirect(req, {
          params: { shortCode: tempShortCode },
        });

        dynamicVCardResStatus = res.status;
        dynamicVCardLocation = res.headers.get("location");
        dynamicVCardContentType = res.headers.get("content-type");
        dynamicVCardDisposition = res.headers.get("content-disposition");
        dynamicVCardBody = await res.text();

        assert.equal(dynamicVCardResStatus, 200, "Status HTTP para vCard dinâmico deve ser 200 OK, nunca 307 redirect");
        assert.equal(dynamicVCardLocation, null, "Não deve existir header Location para BEGIN:VCARD");
      } finally {
        await prisma.qRCodeScan.deleteMany({ where: { qrCodeId: created.id } });
        await prisma.qRCode.delete({ where: { id: created.id } });
      }
    }
  });

  await runTest("18. Rota dinâmica /q/[shortCode] retorna Content-Type 'text/vcard; charset=utf-8' e payload .vcf válido", () => {
    assert.equal(dynamicVCardContentType, "text/vcard; charset=utf-8");
    assert.equal(dynamicVCardDisposition, 'inline; filename="contato.vcf"');
    assert.ok(dynamicVCardBody.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n"));
    assert.ok(dynamicVCardBody.includes("\r\nTEL;TYPE=CELL:+5531985029353\r\n"));
    assert.ok(dynamicVCardBody.endsWith("\r\nEND:VCARD"));
  });

  // 19. Normalização automática de vCards legados salvos no banco (normalizeVCardPayload)
  await runTest("19. normalizeVCardPayload repara vCards legados (LF -> CRLF e TEL sem '+' -> E.164)", () => {
    const legacy =
      "BEGIN:VCARD\nVERSION:3.0\nN:ferreira;Carlos;;;\nFN:Carlos ferreira\nORG:QR MASTER DIGITAL\nTITLE:proprietário\nTEL;TYPE=CELL:5531985029353\nEMAIL;TYPE=INTERNET:qrmasterdital@gmail.com\nEND:VCARD";
    const repaired = normalizeVCardPayload(legacy);
    assert.ok(repaired.includes("\r\nTEL;TYPE=CELL:+5531985029353\r\n"));
    assert.equal(repaired.split("\r\n").length, 9);
  });

  // 20. Nenhum tipo de QR existente (URL, Wi-Fi, Texto) quebrou
  await runTest("20. Regressão: Tipos de QR existentes (URL, Wi-Fi, Texto) permanecem íntegros", () => {
    const urlDest = formatQRDestination("url", { url: "qrmasterdigital.com" });
    assert.equal(urlDest, "https://qrmasterdigital.com");
    assert.equal(validateAndNormalizeDestination(urlDest).valid, true);

    const wifiDest = formatQRDestination("wifi", {
      ssid: "MinhaRede",
      password: "12345678",
      encryption: "WPA",
      hidden: false,
    });
    assert.equal(wifiDest, "WIFI:T:WPA;S:MinhaRede;P:12345678;H:false;;");
    assert.equal(validateAndNormalizeDestination(wifiDest).valid, true);

    const textDest = formatQRDestination("text", { text: "Cupom: PROMO10" });
    assert.equal(textDest, "Cupom: PROMO10");
  });

  console.log(`\n==================================================`);
  console.log(`RESULTADO FINAL: ${passed}/${passed + failed} PASS`);
  console.log(`==================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
