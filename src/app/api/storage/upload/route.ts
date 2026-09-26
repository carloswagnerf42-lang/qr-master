import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";
import { uploadFile, deleteFile, StorageFolder, getMimeTypeFromExt } from "@/lib/storage";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { checkStorageQuota } from "@/lib/storage-quota";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Rate Limiting de upload por usuário autenticado
    const rateCheck = await checkRateLimit(session.id, "upload");
    if (!rateCheck.allowed) {
      return createRateLimitResponse("upload", rateCheck.retryAfter, rateCheck.resetAt);
    }

    const contentType = req.headers.get("content-type") || "";

    let fileName = "";
    let folder: StorageFolder = "logos";
    let mimeType = "";
    let buffer: Buffer;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const requestedFolder = formData.get("folder") as string;

      if (!file) {
        return NextResponse.json({ error: "Arquivo não fornecido." }, { status: 400 });
      }

      fileName = file.name;
      mimeType = file.type || getMimeTypeFromExt(file.name);
      folder = (["exports", "logos", "qrcodes"].includes(requestedFolder) ? requestedFolder : "logos") as StorageFolder;

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      // JSON payload: { fileName, folder, fileData (base64), mimeType }
      const body = await req.json();
      const { fileName: reqFileName, folder: reqFolder, fileData, mimeType: reqMime } = body;

      if (!reqFileName || !fileData) {
        return NextResponse.json(
          { error: "fileName e fileData são obrigatórios no payload JSON." },
          { status: 400 }
        );
      }

      fileName = reqFileName;
      folder = (["exports", "logos", "qrcodes"].includes(reqFolder) ? reqFolder : "logos") as StorageFolder;
      mimeType = reqMime || getMimeTypeFromExt(fileName);

      const base64Clean = fileData.replace(/^data:.*,/, "");
      buffer = Buffer.from(base64Clean, "base64");
    }

    // Obter contexto de plano do usuário (necessário para permissões e/ou cota)
    let userContext = null;
    if (folder === "logos") {
      userContext = await getUserPlanAndUsage(session.id);
      if (!userContext) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

      const canLogo = checkPermission(userContext, "custom_logo");
      if (!canLogo.allowed) {
        return NextResponse.json(
          {
            error: canLogo.reason,
            code: canLogo.code,
            requiredPlan: canLogo.requiredPlan,
          },
          { status: 403 }
        );
      }
    }

    // Validação de cota de armazenamento antes do upload físico
    const quotaCheck = await checkStorageQuota({
      userId: session.id,
      incomingSizeBytes: buffer.length,
      userContext,
    });
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: quotaCheck.reason || "Limite de armazenamento da conta atingido.",
          code: quotaCheck.code || "STORAGE_QUOTA_EXCEEDED",
        },
        { status: quotaCheck.code === "INVALID_INPUT" ? 400 : 403 }
      );
    }

    const fileType = folder === "logos" ? "logo" : folder === "qrcodes" ? "qrcode" : "upload";

    let uploadResult: { storagePath: string; downloadUrl: string; fileSize: number; mimeType: string } | null = null;

    try {
      uploadResult = await uploadFile({
        userId: session.id,
        folder,
        fileName,
        buffer,
        mimeType,
      });

      // Criação obrigatória de registro em GeneratedFile para controle de quota
      const fileRecord = await prisma.generatedFile.create({
        data: {
          userId: session.id,
          fileName,
          fileType,
          fileSize: uploadResult.fileSize,
          mimeType: uploadResult.mimeType || mimeType,
          storagePath: uploadResult.storagePath,
          downloadUrl: uploadResult.downloadUrl,
        },
      });

      return NextResponse.json({
        success: true,
        url: uploadResult.downloadUrl,
        storagePath: uploadResult.storagePath,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType,
        fileId: fileRecord.id,
      });
    } catch (saveError: any) {
      // Compensação em armazenamento: se o upload ocorreu mas o banco de dados falhou,
      // remove imediatamente o objeto órfão criado no storage sob o namespace do usuário.
      if (uploadResult?.storagePath) {
        try {
          await deleteFile(uploadResult.storagePath, session.id);
        } catch (compensationError) {
          const compMsg = compensationError instanceof Error ? compensationError.message : String(compensationError);
          const safeCompLog = compMsg
            .replace(/(?:postgres|postgresql):\/\/[^\s]+/gi, "[DATABASE_URL_REDACTED]")
            .replace(/(?:password|senha|secret|token|key)=\S+/gi, "[CREDENTIAL_REDACTED]")
            .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
          console.error("Falha na compensação de armazenamento após erro no banco de dados:", safeCompLog);
        }
      }

      throw saveError;
    }
  } catch (error: any) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const safeErrorLog = rawMessage
      .replace(/(?:postgres|postgresql):\/\/[^\s]+/gi, "[DATABASE_URL_REDACTED]")
      .replace(/(?:password|senha|secret|token|key)=\S+/gi, "[CREDENTIAL_REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
    console.error("Erro na rota de upload:", safeErrorLog);
    return NextResponse.json(
      { error: "Erro ao processar upload do arquivo." },
      { status: 500 }
    );
  }
}
