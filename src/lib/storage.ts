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

  // 1. Validação do arquivo
  const validation = validateFile({
    name: fileName,
    size: buffer.length,
    mimeType,
  });

  if (!validation.valid) {
    throw new Error(validation.error || "Arquivo inválido para armazenamento.");
  }

  // 2. Cria o storage path padronizado users/{userId}/{folder}/{safeName}
  const storagePath = buildUserStoragePath(userId, folder, fileName);
  const config = getSupabaseStorageConfig(folder);
  const targetBucket = resolveStorageBucket(folder);
  const isPrivate = folder === "exports";

  // 3. Produção: Supabase Storage REST API
  if (config.isConfigured) {
    const uploadEndpoint = `${config.supabaseUrl}/storage/v1/object/${targetBucket}/${storagePath}`;

    const res = await fetch(uploadEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.serviceKey}`,
        "Content-Type": mimeType,
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
      mimeType,
    };
  }

  // 4. Modo de Desenvolvimento Local / Fallback Seguro
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
    mimeType,
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
 * Remove todos os arquivos do usuário ao excluir a conta (limpeza integral)
 */
export async function deleteUserStorageFolder(userId: string): Promise<boolean> {
  if (!userId || typeof userId !== "string" || userId.includes("/") || userId.includes("\\") || userId.includes("..")) {
    return false;
  }

  const userPrefix = `users/${userId}/`;
  const config = getSupabaseStorageConfig();

  // 1. Supabase Storage API
  if (config.isConfigured) {
    try {
      // Lista todos os arquivos com o prefixo do usuário
      const listEndpoint = `${config.supabaseUrl}/storage/v1/object/list/${config.bucket}`;
      const res = await fetch(listEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefix: userPrefix, limit: 1000 }),
      });

      if (res.ok) {
        const files = (await res.json()) as Array<{ name: string }>;
        if (files && files.length > 0) {
          const deleteEndpoint = `${config.supabaseUrl}/storage/v1/object/${config.bucket}`;
          await fetch(deleteEndpoint, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${config.serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ prefixes: files.map((f) => `${userPrefix}${f.name}`) }),
          });
        }
      }
      return true;
    } catch (err) {
      console.error("Erro ao limpar pasta do usuário no Supabase Storage:", err);
      return false;
    }
  }

  // 2. Armazenamento Local
  try {
    const userLocalDir = path.join(process.cwd(), "public", "uploads", "storage", "users", userId);
    if (fs.existsSync(userLocalDir)) {
      fs.rmSync(userLocalDir, { recursive: true, force: true });
    }
    return true;
  } catch (err) {
    console.warn("Falha ao remover pasta local do usuário:", err);
    return false;
  }
}

