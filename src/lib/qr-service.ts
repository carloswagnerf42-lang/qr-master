import { prisma } from "./db";
import { QRCode } from "@prisma/client";
import { cleanupReplacedManagedFile } from "./storage-lifecycle";

/**
 * Erro de autorização/ownership e não localização de QR Code.
 * Retorna status 404 para garantir que a existência de QR Codes pertencentes a outros
 * usuários seja indistinguível de um recurso inexistente (anti-enumeração e isolamento).
 */
export class QRCodeNotFoundError extends Error {
  status: number;
  code: string;

  constructor(message = "QR Code não encontrado") {
    super(message);
    this.name = "QRCodeNotFoundError";
    this.status = 404;
    this.code = "NOT_FOUND";
    Object.setPrototypeOf(this, QRCodeNotFoundError.prototype);
  }
}

/**
 * Validação rigorosa fail-closed de identificadores.
 * Rejeita valores nulos, indefinidos, vazios ou compostos exclusivamente por espaços em branco.
 */
function validateIdentifiers(qrId: unknown, userId: unknown): { cleanQrId: string; cleanUserId: string } {
  const cleanQrId = typeof qrId === "string" ? qrId.trim() : "";
  const cleanUserId = typeof userId === "string" ? userId.trim() : "";

  if (!cleanQrId || !cleanUserId) {
    throw new QRCodeNotFoundError("QR Code não encontrado");
  }

  return { cleanQrId, cleanUserId };
}

export interface UpdateUserQRCodeInput {
  qrId: string;
  userId: string;
  data: {
    name?: string;
    description?: string | null;
    destination?: string;
    content?: string;
    styleConfig?: string;
    categoryId?: string | null;
    campaignId?: string | null;
    status?: string;
    favorite?: boolean;
    logoUrl?: string | null;
  };
}

/**
 * Atualiza um QR Code pertencente ao usuário autenticado com defesa em profundidade.
 * Exige obrigatoriamente qrId e userId válidos e falha fechado (404) caso o QR não
 * pertença ao usuário, impedindo qualquer mutação no banco de dados.
 */
export async function updateUserQRCode(params: UpdateUserQRCodeInput): Promise<QRCode> {
  const { cleanQrId, cleanUserId } = validateIdentifiers(params.qrId, params.userId);

  const existing = await prisma.qRCode.findFirst({
    where: { id: cleanQrId, userId: cleanUserId },
  });

  if (!existing) {
    throw new QRCodeNotFoundError("QR Code não encontrado");
  }

  const updated = await prisma.qRCode.update({
    where: { id: existing.id },
    data: {
      ...(params.data.name !== undefined ? { name: params.data.name } : {}),
      ...(params.data.description !== undefined ? { description: params.data.description } : {}),
      ...(params.data.destination !== undefined ? { destination: params.data.destination } : {}),
      ...(params.data.content !== undefined ? { content: params.data.content } : {}),
      ...(params.data.styleConfig !== undefined ? { styleConfig: params.data.styleConfig } : {}),
      ...(params.data.categoryId !== undefined ? { categoryId: params.data.categoryId } : {}),
      ...(params.data.campaignId !== undefined ? { campaignId: params.data.campaignId } : {}),
      ...(params.data.status !== undefined ? { status: params.data.status } : {}),
      ...(params.data.favorite !== undefined ? { favorite: params.data.favorite } : {}),
      ...(params.data.logoUrl !== undefined ? { logoUrl: params.data.logoUrl } : {}),
    },
    include: {
      category: true,
      campaign: true,
    },
  });

  // Limpeza segura de logotipo substituído (STORAGE-LIFECYCLE-07)
  if (
    params.data.logoUrl !== undefined &&
    existing.logoUrl &&
    existing.logoUrl !== params.data.logoUrl
  ) {
    try {
      await cleanupReplacedManagedFile({
        oldFileUrlOrPath: existing.logoUrl,
        newFileUrlOrPath: params.data.logoUrl,
        userId: cleanUserId,
        resourceType: "logo",
        activeResourceId: existing.id,
      });
    } catch (cleanupErr) {
      console.error("[QRService] Falha no lifecycle de logotipo substituído:", cleanupErr);
    }
  }

  return updated;
}

export interface DeleteUserQRCodeInput {
  qrId: string;
  userId: string;
  permanent?: boolean;
}

export interface DeleteUserQRCodeResult {
  success: true;
  permanent: boolean;
  qr: { id: string; name: string };
}

/**
 * Exclui ou move para a lixeira (soft-delete) um QR Code pertencente ao usuário.
 * Exige validação estrita de ownership { id: qrId, userId }.
 */
export async function deleteUserQRCode(params: DeleteUserQRCodeInput): Promise<DeleteUserQRCodeResult> {
  const { cleanQrId, cleanUserId } = validateIdentifiers(params.qrId, params.userId);

  const existing = await prisma.qRCode.findFirst({
    where: { id: cleanQrId, userId: cleanUserId },
  });

  if (!existing) {
    throw new QRCodeNotFoundError("QR Code não encontrado");
  }

  const isPermanent = Boolean(params.permanent || existing.deletedAt !== null);

  if (isPermanent) {
    // Exclusão definitiva: remove scans associados e o QR dentro de transação atômica
    await prisma.$transaction(async (tx) => {
      await tx.qRCodeScan.deleteMany({ where: { qrCodeId: existing.id } });
      await tx.qRCode.delete({ where: { id: existing.id } });
    });

    return {
      success: true,
      permanent: true,
      qr: { id: existing.id, name: existing.name },
    };
  } else {
    // Soft-delete para a Lixeira
    const updated = await prisma.qRCode.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    return {
      success: true,
      permanent: false,
      qr: { id: updated.id, name: updated.name },
    };
  }
}

export interface ToggleUserQRCodeStatusInput {
  qrId: string;
  userId: string;
}

export interface ToggleUserQRCodeStatusResult {
  id: string;
  status: string;
}

/**
 * Alterna o status (ACTIVE <-> INACTIVE) de um QR Code pertencente ao usuário.
 */
export async function toggleUserQRCodeStatus(params: ToggleUserQRCodeStatusInput): Promise<ToggleUserQRCodeStatusResult> {
  const { cleanQrId, cleanUserId } = validateIdentifiers(params.qrId, params.userId);

  const qr = await prisma.qRCode.findFirst({
    where: { id: cleanQrId, userId: cleanUserId },
  });

  if (!qr) {
    throw new QRCodeNotFoundError("QR Code não encontrado");
  }

  const newStatus = qr.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  const updated = await prisma.qRCode.update({
    where: { id: qr.id },
    data: { status: newStatus },
  });

  return { id: updated.id, status: updated.status };
}

export interface RestoreUserQRCodeInput {
  qrId: string;
  userId: string;
}

export interface RestoreUserQRCodeResult {
  id: string;
  name: string;
}

/**
 * Restaura um QR Code da lixeira pertencente ao usuário.
 */
export async function restoreUserQRCode(params: RestoreUserQRCodeInput): Promise<RestoreUserQRCodeResult> {
  const { cleanQrId, cleanUserId } = validateIdentifiers(params.qrId, params.userId);

  const qr = await prisma.qRCode.findFirst({
    where: { id: cleanQrId, userId: cleanUserId },
  });

  if (!qr) {
    throw new QRCodeNotFoundError("QR Code não encontrado");
  }

  const updated = await prisma.qRCode.update({
    where: { id: qr.id },
    data: { deletedAt: null },
  });

  return { id: updated.id, name: updated.name };
}
