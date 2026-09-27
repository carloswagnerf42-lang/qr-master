import crypto from "crypto";
import path from "path";
import fs from "fs";

export type StorageFolder = "exports" | "logos" | "qrcodes";

export interface FileValidationOptions {
  maxSizeBytes?: number;
  allowedExtensions?: string[];
  allowedMimes?: string[];
}

export interface UploadFileOptions {
  userId: string;
  folder: StorageFolder;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}

export interface UploadResult {
  storagePath: string;
  downloadUrl: string;
  fileSize: number;
  mimeType: string;
}

export type DetectedRasterType = "png" | "jpeg" | "webp" | "gif" | null;

export interface ImageBufferValidationResult {
  valid: boolean;
  detectedFormat?: "png" | "jpeg" | "webp" | "gif";
  serverMime?: string;
  error?: string;
}

/**
 * Inspeciona os Magic Bytes (assinatura binária) do buffer para determinar
 * deterministicamente se é um arquivo raster suportado e autêntico.
 */
export function detectRasterImageFormat(buffer: Buffer): DetectedRasterType {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpeg";
  }

  // GIF: GIF87a ou GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 && // G
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x38 && // 8
    (buffer[4] === 0x37 || buffer[4] === 0x39) && // 7 ou 9
    buffer[5] === 0x61 // a
  ) {
    return "gif";
  }

  // WEBP: RIFF....WEBP (bytes 0-3 == 'RIFF', bytes 8-11 == 'WEBP')
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return "webp";
  }

  return null;
}

/**
 * Validação rigorosa de bytes binários de imagens (anti-MIME spoofing, anti-polyglot,
 * anti-HTML/SVG disguise).
 */
export function validateImageBuffer(buffer: Buffer, fileName: string): ImageBufferValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "Arquivo de imagem vazio (0 bytes)." };
  }

  if (buffer.length < 12) {
    return { valid: false, error: "Arquivo muito pequeno para conter cabeçalho de imagem válido." };
  }

  // Detecta se contém conteúdo XML/SVG ou HTML nos primeiros 512 bytes (anti-polyglot e anti-disguise)
  const headerText = buffer.subarray(0, Math.min(512, buffer.length)).toString("utf8").toLowerCase();
  if (
    headerText.includes("<svg") ||
    headerText.includes("<?xml") ||
    headerText.includes("<!doctype") ||
    headerText.includes("<html") ||
    headerText.includes("<script")
  ) {
    return {
      valid: false,
      error: "Conteúdo SVG, XML ou HTML não é permitido como imagem raster.",
    };
  }

  const detected = detectRasterImageFormat(buffer);
  if (!detected) {
    return {
      valid: false,
      error: "Assinatura binária (magic bytes) inválida ou formato de imagem não suportado.",
    };
  }

  // Verifica compatibilidade da extensão declarada com o formato detectado
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  const validExtsForFormat: Record<string, string[]> = {
    png: ["png"],
    jpeg: ["jpg", "jpeg"],
    webp: ["webp"],
    gif: ["gif"],
  };

  const allowedForDetected = validExtsForFormat[detected] || [];
  if (ext && !allowedForDetected.includes(ext)) {
    return {
      valid: false,
      error: `Extensão do arquivo (.${ext}) incompatível com o formato real detectado (${detected.toUpperCase()}).`,
    };
  }

  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };

  return {
    valid: true,
    detectedFormat: detected,
    serverMime: mimeMap[detected],
  };
}

const DEFAULT_ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "svg", "pdf"];

const DEFAULT_ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Sanitiza o nome do arquivo para impedir Path Traversal, injeção de caracteres
 * especiais e sobrescrita maliciosa.
 */
export function sanitizeFileName(rawFileName: string): string {

  if (!rawFileName || typeof rawFileName !== "string") {
    return `file_${Date.now()}`;
  }

  // Remove null bytes, quebras de linha e separadores de diretório
  let clean = rawFileName
    .replace(/\0/g, "")
    .replace(/[/\\]/g, "_")
    .replace(/\.\.+/g, "") // Remove '..'
    .trim();

  // Separa nome e extensão
  const ext = path.extname(clean).toLowerCase().replace(".", "");
  const base = path.basename(clean, path.extname(clean));

  // Remove caracteres que não sejam alfanuméricos, hífen ou underline
  const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase().substring(0, 60);

  if (!safeBase) {
    return `file_${Date.now()}${ext ? `.${ext}` : ""}`;
  }

  return ext ? `${safeBase}.${ext}` : safeBase;
}

/**
 * Constrói o caminho estritamente isolado por usuário: users/{userId}/{folder}/{fileName}
 * Valida que não haja path traversal.
 */
export function buildUserStoragePath(userId: string, folder: StorageFolder, fileName: string): string {
  if (!userId || typeof userId !== "string" || userId.includes("/") || userId.includes("\\") || userId.includes("..")) {
    throw new Error("Identificador de usuário inválido para armazenamento.");
  }

  const safeFolder = (["exports", "logos", "qrcodes"].includes(folder) ? folder : "exports") as StorageFolder;
  const safeName = sanitizeFileName(fileName);
  const randomSuffix = crypto.randomBytes(4).toString("hex");

  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);
  const uniqueSafeFileName = `${base}_${Date.now()}_${randomSuffix}${ext}`;

  return `users/${userId}/${safeFolder}/${uniqueSafeFileName}`;
}

/**
 * Validações de segurança do arquivo enviado (tamanho, extensão e MIME type)
 */
export function validateFile(
  file: { name: string; size: number; mimeType?: string },
  options?: FileValidationOptions
): { valid: boolean; error?: string } {
  const allowedExts = options?.allowedExtensions || DEFAULT_ALLOWED_EXTENSIONS;
  const allowedMimes = options?.allowedMimes || DEFAULT_ALLOWED_MIMES;

  const ext = path.extname(file.name).toLowerCase().replace(".", "");
  if (!ext || !allowedExts.includes(ext)) {
    return {
      valid: false,
      error: `Formato de arquivo não suportado (.${ext || "desconhecido"}). Extensões permitidas: ${allowedExts.join(", ")}.`,
    };
  }

  const mime = file.mimeType || getMimeTypeFromExt(ext);
  if (!allowedMimes.includes(mime)) {
    return {
      valid: false,
      error: `Tipo de mídia (MIME) não permitido (${mime}).`,
    };
  }

  const isDoc = ext === "pdf";
  const maxSize = options?.maxSizeBytes || (isDoc ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE);

  if (file.size > maxSize) {
    const maxMb = Math.round(maxSize / (1024 * 1024));
    return {
      valid: false,
      error: `Arquivo excede o tamanho limite permitido de ${maxMb}MB (enviado: ${(file.size / (1024 * 1024)).toFixed(2)}MB).`,
    };
  }

  return { valid: true };
}

export function getMimeTypeFromExt(ext: string): string {
  const parsed = path.extname(ext) ? path.extname(ext) : ext;
  switch (parsed.toLowerCase().replace(".", "")) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

/**
 * Determina o bucket de destino com base no tipo de conteúdo (folder).
 * Arquivos de exportação (GeneratedFile) vão estritamente para o bucket privado (qrmaster-private).
 * Logotipos e avatares vão para o bucket público (qrmaster-files).
 */
export function resolveStorageBucket(folder: StorageFolder): string {
  if (folder === "exports") {
    return process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || "qrmaster-private";
  }
  return process.env.SUPABASE_STORAGE_BUCKET || "qrmaster-files";
}

export function resolveBucketFromPath(storagePath: string): string {
  if (storagePath.includes("/exports/")) {
    return process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || "qrmaster-private";
  }
  return process.env.SUPABASE_STORAGE_BUCKET || "qrmaster-files";
}

/**
 * Obtém configuração do Supabase Storage
 */
function getSupabaseStorageConfig(folder?: StorageFolder) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STORAGE_SECRET_KEY;
  const publicBucket = process.env.SUPABASE_STORAGE_BUCKET || "qrmaster-files";
  const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || "qrmaster-private";
  const bucket = folder ? resolveStorageBucket(folder) : publicBucket;

  const isConfigured = Boolean(supabaseUrl && serviceKey);

  return {
    isConfigured,
    supabaseUrl: supabaseUrl ? supabaseUrl.replace(/\/$/, "") : "",
    serviceKey: serviceKey || "",
    bucket,
    publicBucket,
    privateBucket,
  };
}

/**
 * Faz upload de um arquivo para o Storage (Supabase ou fallback local estruturado em dev)
 */
export async function uploadFile(options: UploadFileOptions): Promise<UploadResult> {
  const { userId, folder, fileName, buffer, mimeType } = options;

  // 1. Validação declarativa do arquivo
  const validation = validateFile({
    name: fileName,
    size: buffer.length,
    mimeType,
  });

  if (!validation.valid) {
    throw new Error(validation.error || "Arquivo inválido para armazenamento.");
  }

  // 2. Validação de conteúdo para uploads de imagem (logos/qrcodes)
  let effectiveMime = mimeType;
  if (folder === "logos" || folder === "qrcodes") {
    if (fileName.toLowerCase().endsWith(".svg") || mimeType.toLowerCase().includes("svg")) {
      throw new Error("Upload de arquivos SVG não é permitido por motivos de segurança.");
    }
    const contentValidation = validateImageBuffer(buffer, fileName);
    if (!contentValidation.valid) {
      throw new Error(contentValidation.error || "Conteúdo binário do arquivo não corresponde a uma imagem válida.");
    }
    if (contentValidation.serverMime) {
      effectiveMime = contentValidation.serverMime;
    }
  }

  // 3. Cria o storage path padronizado users/{userId}/{folder}/{safeName}
  const storagePath = buildUserStoragePath(userId, folder, fileName);
  const config = getSupabaseStorageConfig(folder);
  const targetBucket = resolveStorageBucket(folder);
  const isPrivate = folder === "exports";

  // 4. Produção: Supabase Storage REST API
  if (config.isConfigured) {
    const uploadEndpoint = `${config.supabaseUrl}/storage/v1/object/${targetBucket}/${storagePath}`;

    const res = await fetch(uploadEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.serviceKey}`,
        "Content-Type": effectiveMime,
        "x-upsert": "true",
      },
      body: new Uint8Array(buffer),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Erro na API do Supabase Storage:", errorText);
      throw new Error(`Falha no upload para o Supabase Storage: ${res.statusText}`);
    }

    // Para arquivos privados (exports), não expomos URL pública direta (/object/public/)
    // O download ocorre exclusivamente pela rota autenticada /api/files/[id]/download
    const downloadUrl = isPrivate
      ? `/api/files/download?path=${encodeURIComponent(storagePath)}`
      : `${config.supabaseUrl}/storage/v1/object/public/${targetBucket}/${storagePath}`;

    return {
      storagePath,
      downloadUrl,
      fileSize: buffer.length,
      mimeType: effectiveMime,
    };
  }

  // 5. Modo de Desenvolvimento Local / Fallback Seguro
  // Salva no diretório espelho mantendo rigorosamente a hierarquia users/{userId}/{folder}
  const localDir = path.join(process.cwd(), "public", "uploads", "storage", path.dirname(storagePath));
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  const fullLocalPath = path.join(process.cwd(), "public", "uploads", "storage", storagePath);
  fs.writeFileSync(fullLocalPath, buffer);

  const downloadUrl = `/uploads/storage/${storagePath}`;

  return {
    storagePath,
    downloadUrl,
    fileSize: buffer.length,
    mimeType: effectiveMime,
  };
}

export interface DownloadFileResult {
  buffer: Buffer;
  contentLength: number;
  mimeType?: string;
  sourceBucket: string;
}

/**
 * Baixa o buffer de um arquivo do Storage no servidor de forma autenticada.
 * Busca exclusivamente no bucket privado (qrmaster-private).
 * Fallback público legado completamente removido conforme STORAGE-HARDEN-04.
 */
export async function downloadFileBuffer(storagePath: string): Promise<DownloadFileResult | null> {
  if (!storagePath || typeof storagePath !== "string") {
    throw new Error("Caminho de armazenamento inválido.");
  }

  // Validação estrita de isolamento de namespace
  if (!storagePath.startsWith("users/")) {
    throw new Error("Caminho de armazenamento fora do namespace permitido.");
  }

  // Defesa adicional contra path traversal
  if (storagePath.includes("..") || storagePath.includes("\\")) {
    throw new Error("Caminho de armazenamento contém caracteres não permitidos.");
  }

  const config = getSupabaseStorageConfig();

  // 1. Produção: Supabase Storage REST API (estritamente bucket privado)
  if (config.isConfigured) {
    const privateBucket = config.privateBucket;

    // Busca exclusivamente no bucket privado (qrmaster-private)
    const privateUrl = `${config.supabaseUrl}/storage/v1/object/authenticated/${privateBucket}/${storagePath}`;
    try {
      const resPrivate = await fetch(privateUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.serviceKey}`,
        },
      });

      if (resPrivate.ok) {
        const arrayBuf = await resPrivate.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const mimeType = resPrivate.headers.get("content-type") || undefined;
        return {
          buffer,
          contentLength: buffer.length,
          mimeType,
          sourceBucket: privateBucket,
        };
      }

      // Se não encontrado no bucket privado (404/400), falha controlada (fail-closed)
      // O bucket público legado (qrmaster-files) NUNCA é consultado
      if (resPrivate.status === 404 || resPrivate.status === 400) {
        return null;
      }

      const errText = await resPrivate.text();
      console.error(`Erro na leitura do bucket privado ${privateBucket}:`, resPrivate.status, errText);
      throw new Error(`Erro na comunicação com o serviço de armazenamento (${resPrivate.statusText}).`);
    } catch (err: any) {
      if (err.message && err.message.includes("Erro na comunicação")) {
        throw err;
      }
      return null;
    }
  }

  // 2. Modo Desenvolvimento Local / Fallback em Disco
  const fullLocalPath = path.join(process.cwd(), "public", "uploads", "storage", storagePath);
  if (fs.existsSync(fullLocalPath)) {
    const buffer = fs.readFileSync(fullLocalPath);
    return {
      buffer,
      contentLength: buffer.length,
      sourceBucket: "local",
    };
  }

  return null;
}

/**
 * Remove um arquivo do Storage com validação de isolamento de usuário
 */
export async function deleteFile(storagePath: string, userId: string): Promise<boolean> {
  if (!storagePath || !userId) return false;

  // Garante que o storagePath pertença exclusivamente ao usuário solicitante
  const expectedPrefix = `users/${userId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new Error("Tentativa de exclusão de arquivo não autorizado (violação de isolamento).");
  }

  // Defesa em profundidade: impede que deleteFile receba prefixos genéricos de diretório
  const relativePath = storagePath.slice(expectedPrefix.length);
  if (!relativePath || storagePath.endsWith("/") || relativePath.includes("..")) {
    throw new Error("Caminho de arquivo inválido: exclusão pontual não aceita prefixo genérico de diretório.");
  }

  const config = getSupabaseStorageConfig();

  // 1. Produção: Supabase Storage REST API
  if (config.isConfigured) {
    const targetBucket = resolveBucketFromPath(storagePath);
    const deleteEndpoint = `${config.supabaseUrl}/storage/v1/object/${targetBucket}`;
    try {
      const res = await fetch(deleteEndpoint, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${config.serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: [storagePath] }),
      });

      // Se for exportação e durante período de transição, tenta também no bucket legado
      if (storagePath.includes("/exports/")) {
        try {
          const legacyEndpoint = `${config.supabaseUrl}/storage/v1/object/${config.publicBucket}`;
          await fetch(legacyEndpoint, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${config.serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ prefixes: [storagePath] }),
          });
        } catch {
          // Ignora falha de exclusão secundária no legado
        }
      }

      return res.ok;
    } catch (err) {
      console.error("Erro ao deletar arquivo no Supabase Storage:", err);
      return false;
    }
  }

  // 2. Modo Desenvolvimento Local
  try {
    const fullLocalPath = path.join(process.cwd(), "public", "uploads", "storage", storagePath);
    if (fs.existsSync(fullLocalPath)) {
      fs.unlinkSync(fullLocalPath);
    }
    return true;
  } catch (err) {
    console.warn("Falha ao remover arquivo do armazenamento local:", err);
    return false;
  }
}

/**
 * Obtém ou gera a URL de download de um arquivo
 */
export function getFileDownloadUrl(storagePath: string, userId: string): string {
  const expectedPrefix = `users/${userId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new Error("Acesso negado: o arquivo pertence a outro usuário.");
  }

  const config = getSupabaseStorageConfig();
  if (config.isConfigured) {
    return `${config.supabaseUrl}/storage/v1/object/public/${config.bucket}/${storagePath}`;
  }

  return `/uploads/storage/${storagePath}`;
}

/**
 * Remove todos os arquivos sob o prefixo do usuário em um bucket específico
 * com validação estrita de namespace fail-closed.
 */
async function deleteUserPrefixFromBucket(
  config: { supabaseUrl: string; serviceKey: string },
  bucket: string,
  userPrefix: string
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  if (!config.supabaseUrl || !config.serviceKey || !bucket || !userPrefix) {
    return { success: false, deletedCount: 0, error: "Configuração ou prefixo inválido" };
  }

  // Namespace fail-closed: prefixo DEVE ser no formato exato 'users/{cleanUserId}/'
  if (
    !userPrefix.startsWith("users/") ||
    !userPrefix.endsWith("/") ||
    userPrefix === "users/" ||
    userPrefix.includes("..") ||
    userPrefix.includes("\\")
  ) {
    return { success: false, deletedCount: 0, error: "Prefixo não autorizado fora do namespace users/" };
  }

  const filesToDelete: string[] = [];

  // Caminhamento recursivo seguro estritamente contido no namespace do usuário
  async function walk(prefix: string): Promise<void> {
    const listEndpoint = `${config.supabaseUrl}/storage/v1/object/list/${bucket}`;
    const res = await fetch(listEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix, limit: 1000 }),
    });

    if (!res.ok) {
      throw new Error(`Falha HTTP ao listar ${bucket}: status ${res.status}`);
    }

    const items = (await res.json()) as Array<{ name: string; id?: string | null }>;
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    for (const item of items) {
      const itemPath = prefix.endsWith("/") ? `${prefix}${item.name}` : `${prefix}/${item.name}`;

      // Defesa em profundidade: rejeita qualquer item cujo path não pertença ao userPrefix
      if (!itemPath.startsWith(userPrefix)) {
        continue;
      }

      if (item.id === null) {
        // Diretório virtual no Supabase Storage: desce recursivamente
        await walk(`${itemPath}/`);
        // Inclui também a entrada da pasta para exclusão de placeholders
        filesToDelete.push(itemPath);
      } else {
        // Arquivo ou mock de testes
        filesToDelete.push(itemPath);
      }
    }
  }

  try {
    await walk(userPrefix);

    if (filesToDelete.length > 0) {
      // Deduplica caminhos e envia em lotes de até 1000
      const uniqueFiles = Array.from(new Set(filesToDelete));
      const deleteEndpoint = `${config.supabaseUrl}/storage/v1/object/${bucket}`;

      for (let i = 0; i < uniqueFiles.length; i += 1000) {
        const chunk = uniqueFiles.slice(i, i + 1000);
        const delRes = await fetch(deleteEndpoint, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${config.serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prefixes: chunk }),
        });

        if (!delRes.ok) {
          throw new Error(`Falha HTTP ao deletar de ${bucket}: status ${delRes.status}`);
        }
      }

      return { success: true, deletedCount: uniqueFiles.length };
    }

    return { success: true, deletedCount: 0 };
  } catch (err: any) {
    return {
      success: false,
      deletedCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Remove todos os arquivos do usuário ao excluir a conta (limpeza integral bicameral: público e privado)
 */
export async function deleteUserStorageFolder(userId: string): Promise<boolean> {
  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (
    !cleanUserId ||
    cleanUserId.includes("/") ||
    cleanUserId.includes("\\") ||
    cleanUserId.includes("..")
  ) {
    return false;
  }

  const userPrefix = `users/${cleanUserId}/`;
  const config = getSupabaseStorageConfig();

  // 1. Supabase Storage API (limpeza explícita em qrmaster-files e qrmaster-private)
  if (config.isConfigured) {
    const bucketsToClean = Array.from(new Set([config.publicBucket, config.privateBucket]));
    let allSucceeded = true;

    for (const bucket of bucketsToClean) {
      try {
        const result = await deleteUserPrefixFromBucket(config, bucket, userPrefix);
        if (!result.success) {
          console.warn(
            `[storage] Falha ao limpar bucket '${bucket}' para o usuário '${cleanUserId}':`,
            result.error
          );
          allSucceeded = false;
        }
      } catch (err) {
        console.error(
          `[storage] Erro inesperado ao limpar bucket '${bucket}' para o usuário '${cleanUserId}':`,
          err
        );
        allSucceeded = false;
      }
    }

    // Limpeza de contingência em armazenamento local
    try {
      const userLocalDir = path.join(process.cwd(), "public", "uploads", "storage", "users", cleanUserId);
      if (fs.existsSync(userLocalDir)) {
        fs.rmSync(userLocalDir, { recursive: true, force: true });
      }
    } catch {
      // Ignora falha local secundária quando Supabase está ativo
    }

    return allSucceeded;
  }

  // 2. Modo Desenvolvimento Local
  try {
    const userLocalDir = path.join(process.cwd(), "public", "uploads", "storage", "users", cleanUserId);
    if (fs.existsSync(userLocalDir)) {
      fs.rmSync(userLocalDir, { recursive: true, force: true });
    }
    return true;
  } catch (err) {
    console.warn("Falha ao remover pasta local do usuário:", err);
    return false;
  }
}

