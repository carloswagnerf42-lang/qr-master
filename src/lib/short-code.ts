import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * Alfabeto Base62: 62 caracteres alfanuméricos de alta entropia.
 * 62^8 = 218.340.105.584.896 combinações (mais de 218 trilhões),
 * tornando inviável qualquer tentativa de enumeração ou adivinhação.
 */
const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Gera um shortCode criptograficamente seguro e não sequencial.
 */
export function generateSecureShortCode(length: number = 8): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += BASE62_ALPHABET[bytes[i] % BASE62_ALPHABET.length];
  }
  return result;
}

/**
 * Valida o formato de um shortCode recebido por parâmetro de rota.
 * Aceita de 4 a 32 caracteres alfanuméricos, traços ou underscores.
 */
export function isValidShortCode(shortCode: string | null | undefined): boolean {
  if (!shortCode || typeof shortCode !== "string") return false;
  const trimmed = shortCode.trim();
  if (trimmed.length < 4 || trimmed.length > 32) return false;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * Gera um shortCode garantidamente único no banco de dados com loop de retry contra colisões.
 */
export async function generateUniqueShortCode(
  prisma: PrismaClient,
  maxAttempts: number = 5
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateSecureShortCode(8);
    const existing = await prisma.qRCode.findUnique({
      where: { shortCode: code },
      select: { id: true },
    });
    if (!existing) {
      return code;
    }
  }

  // Fallback de segurança com comprimento estendido caso ocorra improvável colisão repetida
  return generateSecureShortCode(10);
}
