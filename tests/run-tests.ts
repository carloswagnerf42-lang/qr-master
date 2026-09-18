import fs from "fs";
import path from "path";
import { calculateCRC16, generatePixPayload } from "../src/lib/pix";
import { formatQRDestination } from "../src/lib/qr-generator";
import { parseUserAgent } from "../src/lib/user-agent";
import {
  sanitizeFileName,
  buildUserStoragePath,
  validateFile,
  uploadFile,
  deleteFile,
} from "../src/lib/storage";

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

async function runAllTests() {
  console.log("========================================");
  console.log("🚀 EXECUTANDO SUÍTE DE TESTES QR MASTER");
  console.log("========================================\n");

  // TESTE 1: Cálculo de CRC16 do Pix
  console.log("▶ 1. Testando Algoritmo CRC16-CCITT e BR Code Pix:");
  // Vetor de teste básico para CRC16-CCITT: "123456789" -> 0x29B1
  const testCrc = calculateCRC16("123456789");
  assert(testCrc === "29B1", `CRC16 de '123456789' deve ser 29B1 (calculado: ${testCrc})`);

  // Geração de Payload Pix Completo
  const pix = generatePixPayload({
    pixKey: "teste@qrmaster.com",
    merchantName: "CARLOS SILVA",
    merchantCity: "SAO PAULO",
    amount: 150.5,
    txId: "TESTE01",
    infoMessage: "Assinatura Pro",
  });

  assert(pix.startsWith("00020101021226"), "Payload Pix deve iniciar com padrão EMV (000201010212)");
  assert(pix.includes("br.gov.bcb.pix"), "Payload Pix deve conter GUI oficial do Banco Central");
  assert(pix.includes("5303986"), "Payload Pix deve conter Moeda 986 (BRL)");
  assert(pix.includes("5406150.50"), "Payload Pix deve conter valor formatado com 2 casas decimais");
  assert(pix.includes("5802BR"), "Payload Pix deve conter Código do País BR");
  assert(pix.includes("6304"), "Payload Pix deve conter tag 6304 antes do checksum");
  assert(pix.length > 50, "Payload Pix deve ter tamanho compatível com padrão EMV");

  // TESTE 2: Formatador Wi-Fi
  console.log("\n▶ 2. Testando Formatador de QR Wi-Fi:");
  const wifiWPA = formatQRDestination("wifi", {
    ssid: "MinhaRede_5G",
    password: "SenhaForte123",
    encryption: "WPA2",
    hidden: false,
  });
  assert(
    wifiWPA === "WIFI:T:WPA2;S:MinhaRede_5G;P:SenhaForte123;H:false;;",
    `Payload Wi-Fi WPA2 gerado corretamente: ${wifiWPA}`
  );

  const wifiHidden = formatQRDestination("wifi", {
    ssid: "RedeOculta",
    password: "pass",
    encryption: "WPA",
    hidden: true,
  });
  assert(wifiHidden.includes("H:true;;"), "Payload Wi-Fi oculto deve marcar H:true");

  // TESTE 3: Formatador vCard (Contato)
  console.log("\n▶ 3. Testando Formatador de Cartão de Visitas vCard:");
  const vcard = formatQRDestination("contact", {
    firstName: "Wagner",
    lastName: "Desenvolvedor",
    company: "SaaS Tech",
    title: "Software Engineer",
    cellPhone: "+5511999998888",
    contactEmail: "wagner@tech.com",
    website: "https://tech.com",
  });
  assert(vcard.startsWith("BEGIN:VCARD"), "vCard deve começar com BEGIN:VCARD");
  assert(vcard.endsWith("END:VCARD"), "vCard deve terminar com END:VCARD");
  assert(vcard.includes("FN:Wagner Desenvolvedor"), "vCard deve conter nome completo em FN");
  assert(vcard.includes("TEL;TYPE=CELL:+5511999998888"), "vCard deve conter telefone celular");

  // TESTE 4: Parser User-Agent e LGPD IP Hash
  console.log("\n▶ 4. Testando Parser User-Agent & LGPD IP Hashing:");
  const iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  const clientInfo = parseUserAgent(iphoneUA, "192.168.1.50");
  assert(clientInfo.device === "Mobile", `Dispositivo iPhone detectado como Mobile (detectado: ${clientInfo.device})`);
  assert(clientInfo.os === "iOS", `Sistema iOS detectado corretamente (detectado: ${clientInfo.os})`);
  assert(clientInfo.browser === "Safari", `Navegador Safari detectado corretamente (detectado: ${clientInfo.browser})`);
  assert(clientInfo.ipHash.length === 16, `Hash anônimo LGPD deve ter 16 caracteres hex (gerado: ${clientInfo.ipHash})`);

  const desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
  const desktopInfo = parseUserAgent(desktopUA, "200.180.10.5");
  assert(desktopInfo.device === "Desktop", "Desktop Windows detectado corretamente");
  assert(desktopInfo.os === "Windows", "OS Windows detectado");
  assert(desktopInfo.browser === "Chrome", "Browser Chrome detectado");

  // TESTE 5: Storage — Sanitização e Anti-Path Traversal
  console.log("\n▶ 5. Testando Storage — Sanitização e Anti-Path Traversal:");
  const safe1 = sanitizeFileName("../../etc/passwd");
  assert(!safe1.includes("..") && !safe1.includes("/"), `Path traversal unix bloqueado: '${safe1}'`);

  const safe2 = sanitizeFileName("..\\..\\windows\\win.ini");
  assert(!safe2.includes("..") && !safe2.includes("\\"), `Path traversal windows bloqueado: '${safe2}'`);

  const safe3 = sanitizeFileName("QR Code Loja 2026! @#$.png");
  assert(safe3.endsWith(".png") && !safe3.includes(" "), `Nome higienizado com sucesso: '${safe3}'`);

  // TESTE 6: Storage — Construção e Isolamento de Caminho
  console.log("\n▶ 6. Testando Storage — Isolamento de Diretório por Usuário:");
  const userPath = buildUserStoragePath("usr_abc123", "exports", "relatorio.pdf");
  assert(userPath.startsWith("users/usr_abc123/exports/"), `Caminho construído no prefixo correto: ${userPath}`);
  assert(userPath.endsWith(".pdf"), "Extensão mantida");

  let pathTraversalCaught = false;
  try {
    buildUserStoragePath("../hacker_user", "exports", "malicious.png");
  } catch {
    pathTraversalCaught = true;
  }
  assert(pathTraversalCaught, "Path traversal no userId foi interceptado com sucesso");

  // TESTE 7: Storage — Validação de MIME Type e Limites de Tamanho
  console.log("\n▶ 7. Testando Storage — Validação de Tipos e Limites de Arquivo:");
  const invalidExe = validateFile({ name: "malware.exe", size: 1024 });
  assert(!invalidExe.valid, "Executável .exe bloqueado com sucesso");

  const invalidPhp = validateFile({ name: "shell.php", size: 1024 });
  assert(!invalidPhp.valid, "Script .php bloqueado com sucesso");

  const oversizedImg = validateFile({ name: "foto.png", size: 7 * 1024 * 1024, mimeType: "image/png" });
  assert(!oversizedImg.valid, "Imagem > 5MB rejeitada");

  const validPng = validateFile({ name: "qrcode.png", size: 500 * 1024, mimeType: "image/png" });
  assert(validPng.valid, "PNG de 500KB aceito");

  const validPdf = validateFile({ name: "documento.pdf", size: 8 * 1024 * 1024, mimeType: "application/pdf" });
  assert(validPdf.valid, "PDF de 8MB aceito");

  // TESTE 8: Storage — Upload e Exclusão com Isolamento de Usuário
  console.log("\n▶ 8. Testando Storage — Upload e Exclusão Segura:");
  const testBuffer = Buffer.from("fake-png-content-for-test");
  const uploadRes = await uploadFile({
    userId: "usr_teste_testes",
    folder: "exports",
    fileName: "teste_unitario.png",
    buffer: testBuffer,
    mimeType: "image/png",
  });

  assert(uploadRes.storagePath.startsWith("users/usr_teste_testes/exports/"), "Upload salvo no caminho isolado do usuário");
  assert(uploadRes.fileSize === testBuffer.length, "Tamanho gravado corresponde ao buffer");

  // Tentar deletar com outro usuário (deve falhar)
  let unauthorizedDeleteBlocked = false;
  try {
    await deleteFile(uploadRes.storagePath, "usr_outro_invasor");
  } catch {
    unauthorizedDeleteBlocked = true;
  }
  assert(unauthorizedDeleteBlocked, "Tentativa de exclusão cruzada de arquivo foi bloqueada com sucesso");

  // Deletar com o usuário correto (deve ter sucesso)
  const deletedOk = await deleteFile(uploadRes.storagePath, "usr_teste_testes");
  assert(deletedOk === true, "Exclusão autorizada pelo proprietário concluída com sucesso");

  const tempUserDir = path.join(process.cwd(), "public", "uploads", "storage", "users", "usr_teste_testes");
  if (fs.existsSync(tempUserDir)) {
    fs.rmSync(tempUserDir, { recursive: true, force: true });
  }

  console.log("\n========================================");
  console.log(`TOTAL DE TESTES: ${passCount + failCount}`);
  console.log(`APROVADOS: ${passCount}`);
  console.log(`FALHAS: ${failCount}`);
  console.log("========================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Erro fatal nos testes:", err);
  process.exit(1);
});
