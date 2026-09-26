import { prisma } from "./db";
import { deleteFile } from "./storage";
import fs from "fs";

/**
 * Erro de autorização/ownership e não localização de GeneratedFile.
 * Retorna status 404 para que arquivos de terceiros sejam indistinguíveis
 * de arquivos inexistentes (anti-enumeração e isolamento estrito multi-tenant).
 */
export class FileNotFoundError extends Error {
  status: number;
  code: string;

  constructor(message = "Arquivo não encontrado") {
    super(message);
    this.name = "FileNotFoundError";
    this.status = 404;
    this.code = "NOT_FOUND";
    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}

/**
 * Validação rigorosa fail-closed de identificadores de arquivo e usuário.
 * Rejeita valores nulos, indefinidos, vazios ou compostos exclusivamente por espaços em branco.
 */
export function validateFileIdentifiers(fileId: unknown, userId: unknown): { cleanFileId: string; cleanUserId: string } {
  const cleanFileId = typeof fileId === "string" ? fileId.trim() : "";
  const cleanUserId = typeof userId === "string" ? userId.trim() : "";

  if (!cleanFileId || !cleanUserId) {
    throw new FileNotFoundError("Arquivo não encontrado");
  }

  return { cleanFileId, cleanUserId };
}

export interface DeleteUserGeneratedFileInput {
  fileId: string;
  userId: string;
}

export interface DeleteUserGeneratedFileResult {
  success: true;
  file: {
    id: string;
    fileName: string;
    storagePath: string;
  };
}

/**
 * Exclui um GeneratedFile pertencente ao usuário autenticado com defesa em profundidade.
 * Exige obrigatoriamente fileId e userId válidos e falha fechado (404) caso o arquivo não
 * pertença ao usuário, impedindo qualquer mutação no banco de dados e qualquer chamada ao storage.
 */
export async function deleteUserGeneratedFile(
  fileIdOrParams: string | DeleteUserGeneratedFileInput,
  maybeUserId?: string
): Promise<DeleteUserGeneratedFileResult> {
  const fileId = typeof fileIdOrParams === "string" ? fileIdOrParams : fileIdOrParams?.fileId;
  const userId = typeof fileIdOrParams === "string" ? maybeUserId : fileIdOrParams?.userId;

  const { cleanFileId, cleanUserId } = validateFileIdentifiers(fileId, userId);

  // 1. Validação de ownership server-side
  const existing = await prisma.generatedFile.findFirst({
    where: { id: cleanFileId, userId: cleanUserId },
  });

  if (!existing) {
    throw new FileNotFoundError("Arquivo não encontrado");
  }

  // 2. Exclusão física no storage (usando storagePath obtido exclusivamente do registro validado)
  if (existing.storagePath) {
    if (existing.storagePath.startsWith(`users/${cleanUserId}/`)) {
      await deleteFile(existing.storagePath, cleanUserId);
    } else if (existing.storagePath.startsWith("users/")) {
      // Inconsistência de isolamento de prefixo no registro (não pertence a cleanUserId)
      throw new FileNotFoundError("Arquivo não encontrado");
    } else if (fs.existsSync(existing.storagePath)) {
      // Fallback legado em disco local
      try {
        fs.unlinkSync(existing.storagePath);
      } catch (err) {
        console.warn("Falha ao remover arquivo legado:", err);
      }
    }
  }

  // 3. Mutação final no banco de dados vinculada estritamente a { id, userId } (defesa em profundidade)
  const deleteResult = await prisma.generatedFile.deleteMany({
    where: { id: existing.id, userId: cleanUserId },
  });

  if (deleteResult.count === 0) {
    throw new FileNotFoundError("Arquivo não encontrado");
  }

  return {
    success: true,
    file: {
      id: existing.id,
      fileName: existing.fileName,
      storagePath: existing.storagePath,
    },
  };
}
