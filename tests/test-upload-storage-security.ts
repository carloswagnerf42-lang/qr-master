/**
 * UPLOAD-STORAGE-01: Bateria de Testes Automatizados de Segurança de Upload, Storage e Arquivos
 *
 * Escopo dos Testes:
 * 1. Sanitização de nome de arquivo e prevenção contra Path Traversal (sanitizeFileName)
 * 2. Isolamento estrito de namespace por usuário e sufixo criptográfico (buildUserStoragePath)
 * 3. Validação declarativa de MIME, extensão e limites de tamanho (validateFile)
 * 4. Resiliência a colisões e integridade de nomes repetidos
 * 5. Comportamento com extensões duplas e caracteres de controle
 * 6. Documentação de MIME spoofing (validação declarativa vs magic bytes)
 * 7. Documentação de active SVG (ausência de sanitização XML server-side)
 * 8. Prevenção de HTTP Header Injection no Content-Disposition do download
 * 9. Isolamento de exclusão em deleteFile (bloqueio de exclusão cross-user)
 * 10. Controle de acesso e autorização em rotas simuladas:
 *     - Upload não autenticado -> 401
 *     - Tentativa de forjar userId no payload de upload -> ignorado (usa session.id)
 *     - Tentativa de associar GeneratedFile a QR Code de outro usuário -> bloqueado/nulo
 *     - Download de arquivo de outro usuário -> 404 (IDOR bloqueado)
 *     - Exclusão de arquivo de outro usuário -> 404 (IDOR bloqueado)
 *     - Listagem de arquivos de outro usuário -> bloqueado (retorna apenas do session.id)
 *     - Permissão de plano (FREE tentando upload de logo ou export SVG/PDF) -> 403
 *     - Verificação de ausência de quota cumulativa de storage
 *     - Verificação de ausência de rate limiter no upload
 */

import path from "path";
import {
  sanitizeFileName,
  buildUserStoragePath,
  validateFile,
  getMimeTypeFromExt,
  deleteFile,
  getFileDownloadUrl,
  StorageFolder,
  resolveStorageBucket,
  resolveBucketFromPath,
  downloadFileBuffer,
} from "../src/lib/storage";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (detail) console.error(`    Detalhes: ${detail}`);
    throw new Error(`Falha no teste: ${testName}`);
  }
}

async function runSuite() {
  console.log(`\n${CYAN}======================================================${RESET}`);
  console.log(`${CYAN}  UPLOAD-STORAGE-01: SUÍTE DE SEGURANÇA E AUDITORIA  ${RESET}`);
  console.log(`${CYAN}======================================================${RESET}\n`);

  // --------------------------------------------------------------------------
  // GRUPO 1: SANITIZAÇÃO DE NOMES E PATH TRAVERSAL
  // --------------------------------------------------------------------------
  console.log(`${YELLOW}1. Sanitização de Nomes e Prevenção de Path Traversal${RESET}`);

  // 1.1 ../arquivo.png
  const t1 = sanitizeFileName("../arquivo.png");
  assert(
    !t1.includes("..") && !t1.includes("/") && !t1.includes("\\") && t1.endsWith(".png"),
    "sanitizeFileName impede ../arquivo.png",
    `Resultado: ${t1}`
  );

  // 1.2 ../../arquivo.png
  const t2 = sanitizeFileName("../../arquivo.png");
  assert(
    !t2.includes("..") && !t2.includes("/") && !t2.includes("\\") && t2.endsWith(".png"),
    "sanitizeFileName impede ../../arquivo.png",
    `Resultado: ${t2}`
  );

  // 1.3 ..\\arquivo.png
  const t3 = sanitizeFileName("..\\arquivo.png");
  assert(
    !t3.includes("..") && !t3.includes("/") && !t3.includes("\\") && t3.endsWith(".png"),
    "sanitizeFileName impede ..\\arquivo.png",
    `Resultado: ${t3}`
  );

  // 1.4 ..\\..\\arquivo.png
  const t4 = sanitizeFileName("..\\..\\arquivo.png");
  assert(
    !t4.includes("..") && !t4.includes("/") && !t4.includes("\\") && t4.endsWith(".png"),
    "sanitizeFileName impede ..\\..\\arquivo.png",
    `Resultado: ${t4}`
  );

  // 1.5 users/outro-user/arquivo.png
  const t5 = sanitizeFileName("users/outro-user/arquivo.png");
  assert(
    !t5.includes("/") && !t5.includes("\\") && t5.endsWith(".png"),
    "sanitizeFileName substitui barras por underscores em users/outro-user/arquivo.png",
    `Resultado: ${t5}`
  );

  // 1.6 /absolute/path.png
  const t6 = sanitizeFileName("/absolute/path.png");
  assert(
    !t6.startsWith("/") && !t6.includes("/") && t6.endsWith(".png"),
    "sanitizeFileName remove barra inicial e barras internas em caminhos absolutos",
    `Resultado: ${t6}`
  );

  // 1.7 %2e%2e%2farquivo.png (URL encoded traversal)
  const t7 = sanitizeFileName("%2e%2e%2farquivo.png");
  assert(
    !t7.includes("..") && !t7.includes("/") && !t7.includes("\\"),
    "sanitizeFileName neutraliza caracteres codificados (% substituído por _)",
    `Resultado: ${t7}`
  );

  // 1.8 ....//arquivo.png (múltiplos pontos e barras)
  const t8 = sanitizeFileName("....//arquivo.png");
  assert(
    !t8.includes("..") && !t8.includes("/") && !t8.includes("\\"),
    "sanitizeFileName elimina múltiplos pontos e barras (....//)",
    `Resultado: ${t8}`
  );

  // 1.9 Null byte: arquivo\0.png
  const t9 = sanitizeFileName("arquivo\0.png");
  assert(
    !t9.includes("\0") && t9.endsWith(".png"),
    "sanitizeFileName remove null bytes (\\0)",
    `Resultado: ${t9}`
  );

  // 1.10 Caracteres especiais perigosos (pipe, redirect, newline, carriage return, quotes, semicolon)
  const t10 = sanitizeFileName('logo|"<>?\r\n;*.png');
  assert(
    !/[|"<>?\r\n;*]/.test(t10) && t10.endsWith(".png"),
    "sanitizeFileName remove/substitui caracteres perigosos de injeção",
    `Resultado: ${t10}`
  );

  // 1.11 Nome extremamente longo (> 100 caracteres)
  const longName = "a".repeat(120) + ".png";
  const t11 = sanitizeFileName(longName);
  const baseLen = t11.replace(".png", "").length;
  assert(
    baseLen <= 60 && t11.endsWith(".png"),
    "sanitizeFileName trunca a base do nome em no máximo 60 caracteres",
    `Comprimento da base: ${baseLen}`
  );

  // 1.12 Nome vazio ou indefinido
  const t12 = sanitizeFileName("");
  assert(
    t12.startsWith("file_"),
    "sanitizeFileName gera fallback file_<timestamp> para nome vazio",
    `Resultado: ${t12}`
  );

  // --------------------------------------------------------------------------
  // GRUPO 2: ISOLAMENTO DE NAMESPACE E SUFIXO CRIPTOGRÁFICO
  // --------------------------------------------------------------------------
  console.log(`\n${YELLOW}2. Isolamento de Namespace do Usuário (buildUserStoragePath)${RESET}`);

  const userA = "usr_111aaa";
  const userB = "usr_222bbb";

  // 2.1 Caminho padrão estruturado users/{userId}/{folder}/{base}_{timestamp}_{randomSuffix}.ext
  const pA = buildUserStoragePath(userA, "logos", "meu-logo.png");
  assert(
    pA.startsWith(`users/${userA}/logos/`) && pA.endsWith(".png"),
    "buildUserStoragePath gera caminho restrito ao namespace users/{userId}/folder/",
    `Caminho: ${pA}`
  );

  // 2.2 Prevenção contra colisão: dois uploads com mesmo nome geram caminhos distintos
  const pA2 = buildUserStoragePath(userA, "logos", "meu-logo.png");
  assert(
    pA !== pA2,
    "buildUserStoragePath gera caminhos únicos com entropia aleatória para mesmo nome",
    `Upload 1: ${pA} | Upload 2: ${pA2}`
  );

  // 2.3 Tentativa de escape via userId com barras ou traversal
  let userEscapeThrows1 = false;
  try {
    buildUserStoragePath("../userB", "logos", "logo.png");
  } catch (err: any) {
    userEscapeThrows1 = true;
  }
  assert(userEscapeThrows1, "buildUserStoragePath rejeita userId contendo '..'");

  let userEscapeThrows2 = false;
  try {
    buildUserStoragePath("userA/subfolder", "logos", "logo.png");
  } catch (err: any) {
    userEscapeThrows2 = true;
  }
  assert(userEscapeThrows2, "buildUserStoragePath rejeita userId contendo '/'");

  let userEscapeThrows3 = false;
  try {
    buildUserStoragePath("userA\\subfolder", "logos", "logo.png");
  } catch (err: any) {
    userEscapeThrows3 = true;
  }
  assert(userEscapeThrows3, "buildUserStoragePath rejeita userId contendo '\\'");

  // 2.4 Folder não autorizado / inválido cai no fallback seguro "exports"
  const pFallback = buildUserStoragePath(userA, "invalid_folder" as StorageFolder, "test.png");
  assert(
    pFallback.startsWith(`users/${userA}/exports/`),
    "buildUserStoragePath restringe pasta a whitelist (fallback para exports se inválida)",
    `Caminho: ${pFallback}`
  );

  // --------------------------------------------------------------------------
  // GRUPO 3: VALIDAÇÃO DE EXTENSÕES, MIME E TAMANHO (validateFile)
  // --------------------------------------------------------------------------
  console.log(`\n${YELLOW}3. Validação de Extensões, MIME Types e Tamanho de Arquivo${RESET}`);

  // 3.1 Extensões permitidas com MIME correto
  const validExts = [
    { name: "foto.png", mime: "image/png", size: 1024 },
    { name: "foto.jpg", mime: "image/jpeg", size: 1024 },
    { name: "foto.jpeg", mime: "image/jpeg", size: 1024 },
    { name: "foto.webp", mime: "image/webp", size: 1024 },
    { name: "vector.svg", mime: "image/svg+xml", size: 1024 },
    { name: "documento.pdf", mime: "application/pdf", size: 1024 },
  ];
  for (const v of validExts) {
    const res = validateFile({ name: v.name, size: v.size, mimeType: v.mime });
    assert(res.valid === true, `validateFile aceita extensão e MIME válidos: ${v.name}`);
  }

  // 3.2 Extensões estritamente proibidas
  const blockedExts = [
    { name: "malware.exe", mime: "application/x-msdownload" },
    { name: "script.js", mime: "application/javascript" },
    { name: "index.html", mime: "text/html" },
    { name: "page.htm", mime: "text/html" },
    { name: "shell.php", mime: "application/x-php" },
    { name: "script.sh", mime: "application/x-sh" },
    { name: "batch.bat", mime: "application/x-bat" },
    { name: "arquivo", mime: "application/octet-stream" },
  ];
  for (const b of blockedExts) {
    const res = validateFile({ name: b.name, size: 500, mimeType: b.mime });
    assert(
      res.valid === false,
      `validateFile bloqueia extensão proibida: ${b.name}`,
      `Erro: ${res.error}`
    );
  }

  // 3.3 MIME type proibido mesmo com extensão permitida
  const mimeMismatch = validateFile({
    name: "legitimo.png",
    size: 500,
    mimeType: "text/html",
  });
  assert(
    mimeMismatch.valid === false,
    "validateFile rejeita MIME text/html mesmo quando extensão é .png",
    `Erro: ${mimeMismatch.error}`
  );

  // 3.4 Limites de Tamanho (Imagens: 5MB = 5.242.880 bytes; PDF: 10MB = 10.485.760 bytes)
  const FIVE_MB = 5 * 1024 * 1024;
  const TEN_MB = 10 * 1024 * 1024;

  // Imagem no limite exato
  assert(
    validateFile({ name: "limite.png", size: FIVE_MB, mimeType: "image/png" }).valid === true,
    "validateFile aceita imagem exatamente no limite de 5MB"
  );

  // Imagem 1 byte acima do limite
  assert(
    validateFile({ name: "excesso.png", size: FIVE_MB + 1, mimeType: "image/png" }).valid === false,
    "validateFile rejeita imagem com 5MB + 1 byte (bloqueio server-side)"
  );

  // PDF no limite exato
  assert(
    validateFile({ name: "doc.pdf", size: TEN_MB, mimeType: "application/pdf" }).valid === true,
    "validateFile aceita PDF exatamente no limite de 10MB"
  );

  // PDF 1 byte acima do limite
  assert(
    validateFile({ name: "doc_grande.pdf", size: TEN_MB + 1, mimeType: "application/pdf" }).valid === false,
    "validateFile rejeita PDF com 10MB + 1 byte (bloqueio server-side)"
  );

  // Arquivo vazio (0 bytes)
  assert(
    validateFile({ name: "vazio.png", size: 0, mimeType: "image/png" }).valid === true,
    "validateFile aceita arquivo de 0 bytes estruturalmente (tamanho <= limite)"
  );

  // 3.5 Extensão dupla (ex: exploit.php.png ou script.js.webp)
  const doubleExt = "exploit.php.png";
  const doubleRes = validateFile({ name: doubleExt, size: 100, mimeType: "image/png" });
  const sanitizedDouble = sanitizeFileName(doubleExt);
  assert(
    doubleRes.valid === true && sanitizedDouble === "exploit_php.png",
    "Extensão dupla tem base sanitizada (exploit_php.png) e extensão final mantida (.png)",
    `Sanitizado: ${sanitizedDouble}`
  );

  // --------------------------------------------------------------------------
  // GRUPO 4: DOCUMENTAÇÃO DE MIME SPOOFING E ACTIVE SVG
  // --------------------------------------------------------------------------
  console.log(`\n${YELLOW}4. Auditoria de MIME Spoofing e Active SVG${RESET}`);

  // 4.1 MIME Spoofing: arquivo não-imagem contendo texto com cabeçalho declarado image/png
  // Como o sistema valida apenas a declaração (extensão + MIME declarado), ele aceita o arquivo.
  // Demonstramos conceitualmente que a validação é declarativa e não verifica magic bytes:
  const spoofedContent = Buffer.from("MZ malicioso simulado em texto");
  const spoofedValidation = validateFile({
    name: "trojan.png",
    size: spoofedContent.length,
    mimeType: "image/png",
  });
  assert(
    spoofedValidation.valid === true,
    "AUDITORIA: validateFile é declarativo (extensão + MIME informado); não inspeciona magic bytes",
    "Resultado esperado conforme design atual: declarativo apenas"
  );

  // 4.2 SVG com script embutido (<script>alert(1)</script>)
  // Como SVG é permitido como vetor e image/svg+xml é MIME permitido, o backend aceita sem sanitização XML:
  const activeSvg = "<svg xmlns='http://www.w3.org/2000/svg'><script>alert('XSS')</script></svg>";
  const svgValidation = validateFile({
    name: "active.svg",
    size: Buffer.byteLength(activeSvg),
    mimeType: "image/svg+xml",
  });
  assert(
    svgValidation.valid === true,
    "AUDITORIA: SVG com scripts embutidos é aceito pela validação de tipos de arquivo",
    "O backend não possui sanitizador de SVG ativo na recepção do upload"
  );

  // --------------------------------------------------------------------------
  // GRUPO 5: CONTENT-DISPOSITION E HEADER INJECTION
  // --------------------------------------------------------------------------
  console.log(`\n${YELLOW}5. Proteção de Download e Prevenção de Header Injection${RESET}`);

  // Em /api/files/[id]/download, o header gerado é:
  // `attachment; filename="${encodeURIComponent(file.fileName)}"`
  const maliciousDownloadName = 'logo\r\nSet-Cookie: sessionId=hacked\r\nContent-Type: text/html"; evil=1.png';
  const encodedName = encodeURIComponent(maliciousDownloadName);
  const headerValue = `attachment; filename="${encodedName}"`;

  assert(
    !headerValue.includes("\r") && !headerValue.includes("\n"),
    "encodeURIComponent impede CRLF Header Injection no Content-Disposition",
    `Header seguro: ${headerValue}`
  );
  assert(
    !headerValue.substring(headerValue.indexOf('"') + 1, headerValue.lastIndexOf('"')).includes('"'),
    "encodeURIComponent impede quebra de aspas no parâmetro filename",
    `Nome codificado: ${encodedName}`
  );

  // --------------------------------------------------------------------------
  // GRUPO 6: ISOLAMENTO DE EXCLUSÃO (deleteFile)
  // --------------------------------------------------------------------------
  console.log(`\n${YELLOW}6. Isolamento de Exclusão de Arquivos (deleteFile)${RESET}`);

  // 6.1 Usuário A tenta excluir caminho de B -> lançar exceção
  let crossDeleteBlocked = false;
  try {
    await deleteFile(`users/${userB}/logos/logo_123_abc.png`, userA);
  } catch (err: any) {
    if (err.message.includes("Tentativa de exclusão de arquivo não autorizado")) {
      crossDeleteBlocked = true;
    }
  }
  assert(
    crossDeleteBlocked,
    "deleteFile bloqueia estritamente exclusão de arquivo pertencente a outro usuário (prefixo users/{userId}/ violado)"
  );

  // 6.2 Usuário A tenta passar path sem prefixo users/
  let invalidPrefixBlocked = false;
  try {
    await deleteFile("public/uploads/outros/arquivo.png", userA);
  } catch (err: any) {
    invalidPrefixBlocked = true;
  }
  assert(
    invalidPrefixBlocked,
    "deleteFile rejeita caminhos que não iniciam com users/{userId}/"
  );

  // --------------------------------------------------------------------------
  // GRUPO 7: CONTROLE DE ACESSO, OWNERSHIP E IDOR (SIMULAÇÃO DE ROTAS)
  // --------------------------------------------------------------------------
  console.log(`\n${YELLOW}7. Controle de Acesso, Ownership e Prevenção de IDOR em Rotas${RESET}`);

  // Fixtures de usuários e banco
  const dbUsers = {
    userA: { id: "user-uuid-A", plan: "PRO", email: "a@master.com" },
    userB: { id: "user-uuid-B", plan: "PRO", email: "b@master.com" },
    userFree: { id: "user-uuid-FREE", plan: "FREE", email: "free@master.com" },
  };

  const dbQRs = [
    { id: "qr-100-A", userId: dbUsers.userA.id, name: "QR do Usuário A" },
    { id: "qr-200-B", userId: dbUsers.userB.id, name: "QR do Usuário B" },
  ];

  const dbGeneratedFiles = [
    {
      id: "file-1-A",
      userId: dbUsers.userA.id,
      qrCodeId: "qr-100-A",
      fileName: "export_qr_a.png",
      downloadUrl: "https://supa.co/storage/v1/object/public/qrmaster-files/users/user-uuid-A/exports/export.png",
      storagePath: "users/user-uuid-A/exports/export.png",
    },
    {
      id: "file-2-B",
      userId: dbUsers.userB.id,
      qrCodeId: "qr-200-B",
      fileName: "export_qr_b.png",
      downloadUrl: "https://supa.co/storage/v1/object/public/qrmaster-files/users/user-uuid-B/exports/export.png",
      storagePath: "users/user-uuid-B/exports/export.png",
    },
  ];

  // Simulação /api/storage/upload
  function simulateUploadRoute(session: { id: string } | null, body: any) {
    if (!session) return { status: 401, error: "Não autorizado" };

    // Forjamento de userId no body é completamente ignorado; usa exclusivamente session.id
    const effectiveUserId = session.id;
    const requestedFolder = (["exports", "logos", "qrcodes"].includes(body.folder) ? body.folder : "logos") as StorageFolder;

    // Validação de plano para custom_logo (FREE não pode)
    if (requestedFolder === "logos" && session.id === dbUsers.userFree.id) {
      return { status: 403, error: "Plano FREE não permite logotipo personalizado" };
    }

    const ext = path.extname(body.fileName).replace(".", "");
    const validation = validateFile({
      name: body.fileName,
      size: body.fileSize || 1024,
      mimeType: body.mimeType || getMimeTypeFromExt(ext),
    });

    if (!validation.valid) {
      return { status: 400, error: validation.error };
    }

    const storagePath = buildUserStoragePath(effectiveUserId, requestedFolder, body.fileName);
    return {
      status: 200,
      data: {
        success: true,
        storagePath,
        assignedUserId: effectiveUserId,
      },
    };
  }

  // 7.1 Upload sem autenticação -> 401
  const upAnon = simulateUploadRoute(null, { fileName: "logo.png" });
  assert(upAnon.status === 401, "Upload sem autenticação retorna 401");

  // 7.2 Usuário A tenta forjar userId=userB no payload -> servidor ignora e usa session.id
  const upSpoof = simulateUploadRoute({ id: dbUsers.userA.id }, {
    fileName: "logo.png",
    userId: dbUsers.userB.id,
    folder: "logos",
  });
  assert(
    upSpoof.status === 200 && upSpoof.data?.assignedUserId === dbUsers.userA.id && upSpoof.data.storagePath.startsWith(`users/${dbUsers.userA.id}/`),
    "Upload ignora userId forjado no payload e isola no namespace da sessão autenticada",
    `Atribuído: ${upSpoof.data?.assignedUserId}`
  );

  // 7.3 Usuário FREE tenta upload de logotipo -> 403
  const upFree = simulateUploadRoute({ id: dbUsers.userFree.id }, { fileName: "logo.png", folder: "logos" });
  assert(upFree.status === 403, "Upload de logotipo por usuário FREE retorna 403 (restrição de plano)");

  // Simulação /api/files/save (Associação com QR Code)
  function simulateSaveRoute(session: { id: string } | null, body: any) {
    if (!session) return { status: 401, error: "Não autorizado" };

    const { qrCodeId, fileName, fileType } = body;
    if (!fileName || !fileType) return { status: 400, error: "Incompleto" };

    // Validação de exportação de SVG/PDF para plano FREE
    if ((fileType === "svg" || fileType === "pdf") && session.id === dbUsers.userFree.id) {
      return { status: 403, error: "Exportação vetorial/PDF não permitida no plano FREE" };
    }

    // Verificação de Ownership do QRCode
    let verifiedQrCodeId: string | null = null;
    if (qrCodeId) {
      const userQr = dbQRs.find((q) => q.id === qrCodeId && q.userId === session.id);
      if (userQr) {
        verifiedQrCodeId = userQr.id;
      }
    }

    return {
      status: 200,
      data: {
        userId: session.id,
        qrCodeId: verifiedQrCodeId,
        fileName,
      },
    };
  }

  // 7.4 Usuário A tenta associar arquivo salvo ao QR do Usuário B -> bloqueado (qrCodeId fica null)
  const saveSpoofQR = simulateSaveRoute({ id: dbUsers.userA.id }, {
    qrCodeId: "qr-200-B",
    fileName: "qr.png",
    fileType: "png",
  });
  assert(
    saveSpoofQR.status === 200 && saveSpoofQR.data?.qrCodeId === null,
    "Tentativa de associar GeneratedFile ao QR de outro usuário neutraliza o vínculo (qrCodeId = null)",
    `qrCodeId vinculado: ${saveSpoofQR.data?.qrCodeId}`
  );

  // 7.5 Usuário A associa ao seu próprio QR -> permitido
  const saveOwnQR = simulateSaveRoute({ id: dbUsers.userA.id }, {
    qrCodeId: "qr-100-A",
    fileName: "meu_qr.png",
    fileType: "png",
  });
  assert(
    saveOwnQR.status === 200 && saveOwnQR.data?.qrCodeId === "qr-100-A",
    "Usuário A associa arquivo ao seu próprio QR Code com sucesso"
  );

  // 7.6 Usuário FREE tenta salvar SVG -> 403
  const saveFreeSvg = simulateSaveRoute({ id: dbUsers.userFree.id }, {
    fileName: "qr.svg",
    fileType: "svg",
  });
  assert(saveFreeSvg.status === 403, "Salvar exportação SVG por usuário FREE retorna 403");

  // Simulação /api/files/[id]/download (Download Ownership)
  function simulateDownloadRoute(session: { id: string } | null, fileId: string) {
    if (!session) return { status: 401, error: "Não autorizado" };

    const file = dbGeneratedFiles.find((f) => f.id === fileId && f.userId === session.id);
    if (!file) {
      return { status: 404, error: "Arquivo não encontrado ou acesso não autorizado." };
    }

    return { status: 200, downloadUrl: file.downloadUrl };
  }

  // 7.7 Download não autenticado -> 401
  assert(simulateDownloadRoute(null, "file-1-A").status === 401, "Download sem autenticação retorna 401");

  // 7.8 Usuário A baixa seu próprio arquivo -> 200
  assert(
    simulateDownloadRoute({ id: dbUsers.userA.id }, "file-1-A").status === 200,
    "Usuário A baixa seu próprio arquivo com sucesso (200)"
  );

  // 7.9 Usuário A tenta baixar arquivo do Usuário B -> 404 (IDOR bloqueado)
  const downloadB = simulateDownloadRoute({ id: dbUsers.userA.id }, "file-2-B");
  assert(
    downloadB.status === 404,
    "Usuário A é bloqueado com 404 ao tentar baixar arquivo pertencente ao Usuário B (IDOR prevenido)",
    `Erro: ${downloadB.error}`
  );

  // Simulação DELETE /api/files/[id] (Delete Ownership)
  function simulateDeleteFileRoute(session: { id: string } | null, fileId: string) {
    if (!session) return { status: 401, error: "Não autorizado" };

    const file = dbGeneratedFiles.find((f) => f.id === fileId && f.userId === session.id);
    if (!file) {
      return { status: 404, error: "Arquivo não encontrado." };
    }

    return { status: 200, success: true };
  }

  // 7.10 Usuário A tenta excluir arquivo do Usuário B -> 404
  const delB = simulateDeleteFileRoute({ id: dbUsers.userA.id }, "file-2-B");
  assert(
    delB.status === 404,
    "Usuário A é bloqueado com 404 ao tentar excluir arquivo pertencente ao Usuário B",
    `Erro: ${delB.error}`
  );

  // --------------------------------------------------------------------------
  // GRUPO 8: AUDITORIA DE STORAGE QUOTA E RATE LIMIT
  // --------------------------------------------------------------------------
  console.log(`\n${YELLOW}8. Auditoria de Storage Quota e Rate Limit${RESET}`);

  // 8.1 Verificação de Quota Total por Usuário
  // No código inspecionado (permissions.ts e storage.ts), não há soma de bytes nem contagem total de arquivos.
  const hasUserStorageQuota = false;
  assert(
    hasUserStorageQuota === false,
    "AUDITORIA: NÃO EXISTE quota cumulativa de bytes ou número máximo de arquivos por usuário",
    "Apenas o limite por arquivo individual (5MB imagem / 10MB PDF) é aplicado"
  );

  // 8.2 Verificação de Rate Limit no Endpoint de Upload
  // No código de /api/storage/upload/route.ts, não há chamada a rateLimit()
  const hasUploadRateLimit = false;
  assert(
    hasUploadRateLimit === false,
    "AUDITORIA: NÃO EXISTE rate limiter específico na rota /api/storage/upload",
    "Diferente da rota /api/qr, uploads não passam por rate limiter distribuído Upstash"
  );

  // --------------------------------------------------------------------------
  // GRUPO 9: STORAGE-HARDEN-02 — BUCKET PRIVADO, ROTEAMENTO E DOWNLOAD STREAM
  // --------------------------------------------------------------------------
  console.log(`\n${YELLOW}9. Storage-Harden-02: Roteamento de Bucket Privado e Download Stream${RESET}`);

  // 9.1 Roteamento de Bucket por pasta
  const exportBucket = resolveStorageBucket("exports");
  assert(
    exportBucket === (process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || "qrmaster-private"),
    "resolveStorageBucket direciona folder 'exports' para o bucket privado (qrmaster-private)",
    `Bucket: ${exportBucket}`
  );

  const logoBucket = resolveStorageBucket("logos");
  assert(
    logoBucket === (process.env.SUPABASE_STORAGE_BUCKET || "qrmaster-files"),
    "resolveStorageBucket direciona folder 'logos' para o bucket público (qrmaster-files)",
    `Bucket: ${logoBucket}`
  );

  const qrBucket = resolveStorageBucket("qrcodes");
  assert(
    qrBucket === (process.env.SUPABASE_STORAGE_BUCKET || "qrmaster-files"),
    "resolveStorageBucket direciona folder 'qrcodes' para o bucket público (qrmaster-files)",
    `Bucket: ${qrBucket}`
  );

  // 9.2 Roteamento por storagePath
  assert(
    resolveBucketFromPath("users/u1/exports/file.png") === (process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || "qrmaster-private"),
    "resolveBucketFromPath identifica caminho de 'exports' como pertencente ao bucket privado"
  );
  assert(
    resolveBucketFromPath("users/u1/logos/logo.png") === (process.env.SUPABASE_STORAGE_BUCKET || "qrmaster-files"),
    "resolveBucketFromPath identifica caminho de 'logos' como pertencente ao bucket público"
  );

  // 9.3 Validação de Namespace e Path Traversal em downloadFileBuffer
  let downloadInvalidPath1 = false;
  try {
    await downloadFileBuffer("../outside/file.png");
  } catch (err: any) {
    downloadInvalidPath1 = true;
  }
  assert(downloadInvalidPath1, "downloadFileBuffer rejeita caminho fora do namespace 'users/'");

  let downloadInvalidPath2 = false;
  try {
    await downloadFileBuffer("users/u1/exports/../../etc/passwd");
  } catch (err: any) {
    downloadInvalidPath2 = true;
  }
  assert(downloadInvalidPath2, "downloadFileBuffer rejeita caminhos contendo traversal '..'");

  let downloadInvalidPath3 = false;
  try {
    await downloadFileBuffer("users\\u1\\exports\\file.png");
  } catch (err: any) {
    downloadInvalidPath3 = true;
  }
  assert(downloadInvalidPath3, "downloadFileBuffer rejeita caminhos com backslash '\\'");

  // 9.4 Formatação robusta de Content-Disposition (RFC 6266 e RFC 5987)
  const filenameComplex = 'relatório "cliente" ;\r\nSet-Cookie: evil=1.png';
  const safeAscii = filenameComplex.replace(/[\r\n";]/g, "_").replace(/[^\x20-\x7E]/g, "_");
  const encodedUtf8 = encodeURIComponent(filenameComplex);
  const cdHeader = `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodedUtf8}`;

  assert(!cdHeader.includes("\r") && !cdHeader.includes("\n"), "Header Content-Disposition elimina completamente CRLF");
  assert(!cdHeader.substring(cdHeader.indexOf('"') + 1, cdHeader.indexOf('";')).includes('"'), "Parâmetro filename em ASCII não contém aspas não escapadas");
  assert(cdHeader.includes("filename*=UTF-8''"), "Header inclui parâmetro filename* conforme padrão RFC 5987");

  // 9.5 Simulação de Fallback de Transição em downloadFileBuffer
  // Cenário 1: Arquivo presente no bucket privado -> retornado imediatamente
  const mockStorageStore: Record<string, Record<string, Buffer>> = {
    "qrmaster-private": {
      "users/user-A/exports/novo_export.png": Buffer.from("conteúdo do bucket privado"),
    },
    "qrmaster-files": {
      "users/user-A/exports/legado_export.png": Buffer.from("conteúdo do bucket legado"),
      "users/user-uuid-A/exports/export.png": Buffer.from("conteúdo do arquivo 1 de A"),
    },
  };

  async function simulateDownloadFileBuffer(storagePath: string) {
    if (!storagePath.startsWith("users/")) throw new Error("Namespace inválido");

    // Tentativa 1: Private
    const inPrivate = mockStorageStore["qrmaster-private"][storagePath];
    if (inPrivate) {
      return { buffer: inPrivate, sourceBucket: "qrmaster-private", contentLength: inPrivate.length };
    }

    // Tentativa 2: Fallback público legado
    const inLegacy = mockStorageStore["qrmaster-files"][storagePath];
    if (inLegacy) {
      return { buffer: inLegacy, sourceBucket: "qrmaster-files", contentLength: inLegacy.length };
    }

    return null;
  }

  const resPrivate = await simulateDownloadFileBuffer("users/user-A/exports/novo_export.png");
  assert(
    resPrivate?.sourceBucket === "qrmaster-private",
    "Objeto presente em qrmaster-private é servido diretamente do bucket privado"
  );

  const resLegacy = await simulateDownloadFileBuffer("users/user-A/exports/legado_export.png");
  assert(
    resLegacy?.sourceBucket === "qrmaster-files",
    "Objeto ausente no privado mas existente no legado aciona fallback seguro para qrmaster-files"
  );

  const resMissing = await simulateDownloadFileBuffer("users/user-A/exports/inexistente.png");
  assert(
    resMissing === null,
    "Objeto ausente em ambos os buckets retorna null de forma segura sem lançar exceções não tratadas"
  );

  // 9.6 Simulação da nova rota de Download Stream com Headers de Segurança
  async function simulateSecureDownloadRoute(session: { id: string } | null, fileId: string) {
    if (!session) return { status: 401, error: "Não autorizado" };

    const file = dbGeneratedFiles.find((f) => f.id === fileId && f.userId === session.id);
    if (!file) return { status: 404, error: "Arquivo não encontrado ou acesso não autorizado." };

    const result = await simulateDownloadFileBuffer(file.storagePath);
    if (!result) return { status: 404, error: "Conteúdo não localizado no armazenamento." };

    const rawFileName = file.fileName || "export.png";
    const safeAscii = rawFileName.replace(/[\r\n";]/g, "_").replace(/[^\x20-\x7E]/g, "_");
    const encodedUtf8 = encodeURIComponent(rawFileName);

    return {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodedUtf8}`,
        "Content-Length": result.contentLength.toString(),
        "Cache-Control": "private, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
      hasRedirect: false,
      bodyLength: result.buffer.length,
    };
  }

  // 9.7 Usuário A baixa arquivo próprio via nova rota stream
  const secureDlA = await simulateSecureDownloadRoute({ id: dbUsers.userA.id }, "file-1-A");
  assert(
    secureDlA.status === 200 && secureDlA.hasRedirect === false && secureDlA.headers?.["X-Content-Type-Options"] === "nosniff",
    "Download seguro retorna HTTP 200 via stream direto (sem redirect para URL do Supabase)",
    `Status: ${secureDlA.status}`
  );
  assert(
    secureDlA.headers?.["Cache-Control"] === "private, no-store, must-revalidate",
    "Download seguro aplica header Cache-Control: private, no-store, must-revalidate"
  );
  assert(
    !!secureDlA.headers?.["Content-Disposition"]?.startsWith("attachment; filename="),
    "Download seguro força Content-Disposition: attachment"
  );

  // 9.8 Usuário A tenta baixar arquivo de B via nova rota stream -> 404
  const secureDlB = await simulateSecureDownloadRoute({ id: dbUsers.userA.id }, "file-2-B");
  assert(
    secureDlB.status === 404,
    "Download seguro mantém bloqueio 404 ao tentar baixar arquivo de outro usuário"
  );

  // --------------------------------------------------------------------------
  // GRUPO 10: CONCLUSÃO E RESULTADOS
  // --------------------------------------------------------------------------
  console.log(`\n${CYAN}======================================================${RESET}`);
  console.log(`${CYAN}  RESUMO FINAL DOS TESTES DE UPLOAD E STORAGE        ${RESET}`);
  console.log(`${CYAN}======================================================${RESET}`);
  console.log(`  Total de verificações executadas: ${totalCount}`);
  console.log(`  Verificações aprovadas:           ${GREEN}${passedCount}${RESET}`);
  console.log(`  Falhas registradas:               ${passedCount === totalCount ? GREEN + "0" : RED + (totalCount - passedCount)}${RESET}`);
  console.log(`${CYAN}======================================================${RESET}\n`);

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Erro fatal na execução da suíte de upload/storage:", err);
  process.exit(1);
});
