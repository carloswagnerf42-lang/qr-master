import path from "path";
import { prisma } from "./db";
import { deleteFile } from "./storage";

export type FileLifecycleCategory =
  | "OWNED_TRACKED"
  | "OWNED_LEGACY"
  | "EXTERNAL"
  | "DEFAULT"
  | "SHARED_OR_UNSAFE"
  | "UNKNOWN";

export interface FileClassificationResult {
  category: FileLifecycleCategory;
  rawUrlOrPath: string | null;
  storagePath: string | null;
  generatedFileId?: string | null;
  fileSize?: number;
  reason: string;
}

export interface ClassifyManagedFileParams {
  fileUrlOrPath: string | null | undefined;
  userId: string;
  resourceType?: "avatar" | "logo";
  activeResourceId?: string;
  newFileUrlOrPath?: string | null;
}

export interface CleanupResult {
  cleaned: boolean;
  category?: FileLifecycleCategory;
  storagePath?: string | null;
  fileId?: string | null;
  fileSize?: number;
  reason?: string;
  error?: string;
}

/**
 * Normaliza e extrai o storagePath (users/{userId}/{folder}/{filename}) a partir de URLs
 * ou caminhos suportados pela aplicação.
 *
 * Rejeita fail-closed:
 * - Path traversal (..)
 * - Separadores invertidos (\)
 * - Caracteres de controle ou esquemas perigosos
 * - Caminhos que não correspondam à estrutura esperada
 */
export function extractStoragePathFromUrl(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath || typeof urlOrPath !== "string") {
    return null;
  }

  const clean = urlOrPath.trim();
  if (!clean || clean.includes("..") || clean.includes("\\") || clean.includes("\0")) {
    return null;
  }

  // 1. Caminho direto relativo: users/{userId}/{folder}/{filename}
  const directMatch = clean.match(/^users\/[a-zA-Z0-9_-]+\/(?:exports|logos|qrcodes)\/[a-zA-Z0-9_.-]+$/);
  if (directMatch) {
    return clean;
  }

  // 2. Rota de download local/autenticada: /api/files/download?path=users%2F...
  if (clean.includes("/api/files/download")) {
    try {
      const parsedUrl = new URL(clean, "http://localhost");
      const pathParam = parsedUrl.searchParams.get("path");
      if (pathParam) {
        const decoded = decodeURIComponent(pathParam).trim();
        if (
          decoded.startsWith("users/") &&
          !decoded.includes("..") &&
          !decoded.includes("\\") &&
          decoded.match(/^users\/[a-zA-Z0-9_-]+\/(?:exports|logos|qrcodes)\/[a-zA-Z0-9_.-]+$/)
        ) {
          return decoded;
        }
      }
    } catch {
      return null;
    }
  }

  // 3. Mirror de desenvolvimento local: /uploads/storage/users/...
  if (clean.startsWith("/uploads/storage/")) {
    const sub = clean.slice("/uploads/storage/".length);
    if (sub.match(/^users\/[a-zA-Z0-9_-]+\/(?:exports|logos|qrcodes)\/[a-zA-Z0-9_.-]+$/)) {
      return sub;
    }
  }

  // 4. URL completa do Supabase Storage: /storage/v1/object/(public|authenticated)/bucket/users/...
  const supabaseStorageMatch = clean.match(
    /\/storage\/v1\/object\/(?:public|authenticated)\/[^/]+\/(users\/[a-zA-Z0-9_-]+\/(?:exports|logos|qrcodes)\/[a-zA-Z0-9_.-]+)(?:[?#].*)?$/
  );
  if (supabaseStorageMatch && supabaseStorageMatch[1]) {
    return supabaseStorageMatch[1];
  }

  // 5. URL ou caminho relativo direto contendo users/...
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    const relativeUsersMatch = clean.match(
      /(?:^|[/?#])(users\/[a-zA-Z0-9_-]+\/(?:exports|logos|qrcodes)\/[a-zA-Z0-9_.-]+)(?:[?#].*)?$/
    );
    if (relativeUsersMatch && relativeUsersMatch[1]) {
      return relativeUsersMatch[1];
    }
  }

  return null;
}

/**
 * Verifica se uma URL é estritamente externa (pertencente a outro domínio como Google OAuth, CDN externa, etc.)
 */
export function isExternalUrl(rawUrl: string): boolean {
  if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
    return false;
  }

  // Se a URL contém /storage/v1/object/, é uma rota de Supabase Storage gerenciada pelo sistema
  if (rawUrl.includes("/storage/v1/object/")) {
    return false;
  }

  try {
    const urlObj = new URL(rawUrl);
    const host = urlObj.hostname.toLowerCase();

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseHost = "";
    if (supabaseUrl) {
      try {
        supabaseHost = new URL(supabaseUrl).hostname.toLowerCase();
      } catch {
        // ignore
      }
    }

    // Se o host coincide com o Supabase configurado, é recurso interno gerenciado
    if (supabaseHost && host === supabaseHost) {
      return false;
    }

    // Se for localhost ou host local de dev, não é considerado externo não-gerenciado
    if (host === "localhost" || host === "127.0.0.1") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Classifica um arquivo candidato a lifecycle em uma das 6 categorias do sistema:
 * - OWNED_TRACKED: Comprovadamente do usuário com GeneratedFile ativo e sem compartilhamento
 * - OWNED_LEGACY: Namespace users/{userId}/... mas sem registro GeneratedFile
 * - EXTERNAL: URL de domínio externo (ex: avatar do Google)
 * - DEFAULT: Avatar/logo padrão, vazio ou nulo
 * - SHARED_OR_UNSAFE: Pertence a outro usuário ou ainda está em uso por outro recurso ativo
 * - UNKNOWN: URL malformada ou formato desconhecido
 */
export async function classifyManagedFile(params: ClassifyManagedFileParams): Promise<FileClassificationResult> {
  const { fileUrlOrPath, userId, resourceType, activeResourceId, newFileUrlOrPath } = params;

  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanUserId || cleanUserId.includes("..") || cleanUserId.includes("/") || cleanUserId.includes("\\")) {
    return {
      category: "UNKNOWN",
      rawUrlOrPath: fileUrlOrPath || null,
      storagePath: null,
      reason: "Identificador de usuário inválido para classificação",
    };
  }

  // 1. Categoria DEFAULT: nulo, vazio, string "null" ou caminho de avatar default
  if (!fileUrlOrPath || typeof fileUrlOrPath !== "string") {
    return {
      category: "DEFAULT",
      rawUrlOrPath: null,
      storagePath: null,
      reason: "Referência vazia ou nula",
    };
  }

  const cleanUrl = fileUrlOrPath.trim();
  if (
    !cleanUrl ||
    cleanUrl === "null" ||
    cleanUrl.startsWith("/avatars/") ||
    cleanUrl.includes("default-avatar") ||
    cleanUrl.includes("placeholder")
  ) {
    return {
      category: "DEFAULT",
      rawUrlOrPath: cleanUrl,
      storagePath: null,
      reason: "Recurso padrão do sistema ou valor nulo",
    };
  }

  // 2. Proteção de Mesma Chave / Idempotência: se o novo arquivo aponta para o mesmo objeto
  if (newFileUrlOrPath && newFileUrlOrPath.trim() === cleanUrl) {
    return {
      category: "SHARED_OR_UNSAFE",
      rawUrlOrPath: cleanUrl,
      storagePath: extractStoragePathFromUrl(cleanUrl),
      reason: "Arquivo antigo é idêntico ao novo arquivo ativo (mesma referência)",
    };
  }

  // 3. Categoria UNKNOWN: esquemas perigosos ou strings malformadas
  if (
    cleanUrl.startsWith("javascript:") ||
    cleanUrl.startsWith("data:") ||
    cleanUrl.includes("..") ||
    cleanUrl.includes("\\") ||
    cleanUrl.includes("\0")
  ) {
    return {
      category: "UNKNOWN",
      rawUrlOrPath: cleanUrl,
      storagePath: null,
      reason: "Formato ou esquema de URL não reconhecido ou perigoso",
    };
  }

  // 4. Extração de storagePath
  const extractedPath = extractStoragePathFromUrl(cleanUrl);

  // Se não foi possível extrair storagePath, verificamos se é URL externa legítima ou desconhecida
  if (!extractedPath) {
    if (isExternalUrl(cleanUrl)) {
      return {
        category: "EXTERNAL",
        rawUrlOrPath: cleanUrl,
        storagePath: null,
        reason: "URL pertencente a domínio externo não gerenciado",
      };
    }
    return {
      category: "UNKNOWN",
      rawUrlOrPath: cleanUrl,
      storagePath: null,
      reason: "Não foi possível extrair storagePath válido da URL",
    };
  }

  // 5. Categoria SHARED_OR_UNSAFE (Isolamento Cross-User):
  // Se o caminho não inicia rigorosamente com users/{cleanUserId}/, pertence a outro usuário
  const expectedPrefix = `users/${cleanUserId}/`;
  if (!extractedPath.startsWith(expectedPrefix)) {
    return {
      category: "SHARED_OR_UNSAFE",
      rawUrlOrPath: cleanUrl,
      storagePath: extractedPath,
      reason: "Tentativa de acesso a arquivo fora do namespace do usuário autenticado (cross-user)",
    };
  }

  // 7. Verificação de Compartilhamento com outros recursos (ativos ou na lixeira) do mesmo usuário
  // Se for um logotipo, verificar se outro QR Code (ativo ou recuperável na lixeira) do usuário também utiliza este logoUrl
  if (resourceType === "logo" || extractedPath.includes("/logos/")) {
    const otherQrUsingLogo = await prisma.qRCode.findFirst({
      where: {
        userId: cleanUserId,
        ...(activeResourceId ? { id: { not: activeResourceId } } : {}),
        OR: [
          { logoUrl: cleanUrl },
          { logoUrl: extractedPath },
          { styleConfig: { contains: cleanUrl } },
          { styleConfig: { contains: extractedPath } },
        ],
      },
      select: { id: true, name: true, deletedAt: true },
    });

    if (otherQrUsingLogo) {
      const stateLabel = otherQrUsingLogo.deletedAt ? "na lixeira" : "ativo";
      return {
        category: "SHARED_OR_UNSAFE",
        rawUrlOrPath: cleanUrl,
        storagePath: extractedPath,
        reason: `Logotipo ainda referenciado pelo QR Code ${stateLabel} "${otherQrUsingLogo.name}" (${otherQrUsingLogo.id})`,
      };
    }
  }

  // Se for substituição de avatar, verificar se o perfil do usuário ainda aponta para este arquivo
  if (resourceType === "avatar") {
    // Se o usuário ainda possui este avatar como atual e não está mudando para algo diferente
    if (!newFileUrlOrPath) {
      // Remoção explícita de avatar (setando para null) -> permitido se for OWNED_TRACKED
    } else {
      const newExtracted = extractStoragePathFromUrl(newFileUrlOrPath);
      if (newExtracted && newExtracted === extractedPath) {
        return {
          category: "SHARED_OR_UNSAFE",
          rawUrlOrPath: cleanUrl,
          storagePath: extractedPath,
          reason: "Arquivo de avatar coincide com o novo arquivo ativo",
        };
      }
    }
  }

  // 8. Consulta no banco de dados para comprovação de tracking e ownership (GeneratedFile)
  const trackedRecord = await prisma.generatedFile.findFirst({
    where: {
      userId: cleanUserId,
      OR: [
        { storagePath: extractedPath },
        { downloadUrl: cleanUrl },
      ],
    },
  });

  // Se não possui registro em GeneratedFile, trata-se de arquivo legado
  if (!trackedRecord) {
    return {
      category: "OWNED_LEGACY",
      rawUrlOrPath: cleanUrl,
      storagePath: extractedPath,
      reason: "Arquivo sob namespace do usuário mas sem registro GeneratedFile correspondente",
    };
  }

  // 9. Comprovadamente OWNED_TRACKED
  return {
    category: "OWNED_TRACKED",
    rawUrlOrPath: cleanUrl,
    storagePath: trackedRecord.storagePath,
    generatedFileId: trackedRecord.id,
    fileSize: trackedRecord.fileSize,
    reason: "Propriedade e tracking comprovados com sucesso",
  };
}

/**
 * Remove com segurança um arquivo substituído de avatar ou logotipo,
 * garantindo que apenas arquivos classificados estritamente como OWNED_TRACKED
 * sejam submetidos à exclusão física no Storage e no banco.
 *
 * Se a exclusão física no Storage falhar, o registro GeneratedFile NÃO é excluído,
 * mantendo a consistência de quota e preservando o tracking para reconciliação futura.
 */
export async function cleanupReplacedManagedFile(params: {
  oldFileUrlOrPath: string | null | undefined;
  newFileUrlOrPath?: string | null;
  userId: string;
  resourceType: "avatar" | "logo";
  activeResourceId?: string;
}): Promise<CleanupResult> {
  const { oldFileUrlOrPath, newFileUrlOrPath, userId, resourceType, activeResourceId } = params;

  if (!oldFileUrlOrPath) {
    return { cleaned: false, reason: "Nenhum arquivo anterior fornecido" };
  }

  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanUserId) {
    return { cleaned: false, reason: "Identificador de usuário inválido" };
  }

  // 1. Classificação estrita do arquivo anterior
  const classification = await classifyManagedFile({
    fileUrlOrPath: oldFileUrlOrPath,
    newFileUrlOrPath,
    userId: cleanUserId,
    resourceType,
    activeResourceId,
  });

  // 2. Regra fundamental: somente OWNED_TRACKED pode ser automaticamente excluído
  if (classification.category !== "OWNED_TRACKED") {
    return {
      cleaned: false,
      category: classification.category,
      storagePath: classification.storagePath,
      reason: classification.reason,
    };
  }

  const targetPath = classification.storagePath!;
  const targetId = classification.generatedFileId!;

  // 3. Exclusão física no Supabase Storage
  let storageDeleteSuccess = false;
  try {
    storageDeleteSuccess = await deleteFile(targetPath, cleanUserId);
  } catch (err: any) {
    console.error(
      `[StorageLifecycle] Erro ao deletar objeto antigo no Storage (${targetPath}):`,
      err?.message || err
    );
    storageDeleteSuccess = false;
  }

  // 4. Se a exclusão física falhar, NUNCA remove o registro GeneratedFile
  // Preserva o tracking no PostgreSQL para manter a quota correta e evitar órfãos silenciosos
  if (!storageDeleteSuccess) {
    return {
      cleaned: false,
      category: "OWNED_TRACKED",
      storagePath: targetPath,
      fileId: targetId,
      reason: "Falha na exclusão física do Storage; registro mantido no banco para integridade de quota",
      error: "STORAGE_DELETE_FAILED",
    };
  }

  // 5. Exclusão física confirmada: remove o registro GeneratedFile do banco de dados
  try {
    await prisma.generatedFile.deleteMany({
      where: {
        id: targetId,
        userId: cleanUserId,
      },
    });
  } catch (dbErr: any) {
    console.error(
      `[StorageLifecycle] Falha ao remover registro GeneratedFile (${targetId}) após exclusão física:`,
      dbErr?.message || dbErr
    );
  }

  return {
    cleaned: true,
    category: "OWNED_TRACKED",
    storagePath: targetPath,
    fileId: targetId,
    fileSize: classification.fileSize,
    reason: "Arquivo antigo excluído do Storage e desvinculado do banco com sucesso",
  };
}
