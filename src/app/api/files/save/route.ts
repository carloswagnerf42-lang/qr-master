import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";
import { uploadFile, deleteFile, getMimeTypeFromExt } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { qrCodeId, fileName, fileType, fileData, mimeType } = await req.json();

    if (!fileName || !fileType || !fileData) {
      return NextResponse.json(
        { error: "Dados do arquivo incompletos (fileName, fileType e fileData são obrigatórios)." },
        { status: 400 }
      );
    }

    // Validação de permissões de exportação baseada no plano
    if (fileType === "svg" || fileType === "pdf") {
      const userContext = await getUserPlanAndUsage(session.id);
      if (!userContext) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

      const action = fileType === "svg" ? "export_svg" : "export_pdf";
      const canExport = checkPermission(userContext, action);
      if (!canExport.allowed) {
        return NextResponse.json(
          {
            error: canExport.reason,
            code: canExport.code,
            requiredPlan: canExport.requiredPlan,
          },
          { status: 403 }
        );
      }
    }

    // Determine correct MIME type
    const finalMime = mimeType || getMimeTypeFromExt(fileType);

    // Convert fileData into Buffer
    let buffer: Buffer;
    if (fileType === "svg") {
      buffer = Buffer.from(fileData, "utf-8");
    } else {
      // Base64 data URL or raw base64 string
      const base64Clean = fileData.replace(/^data:.*,/, "");
      buffer = Buffer.from(base64Clean, "base64");
    }

    const normalizedFileName = fileName.endsWith(`.${fileType}`) ? fileName : `${fileName}.${fileType}`;

    let uploadResult: { storagePath: string; downloadUrl: string; fileSize: number } | null = null;

    try {
      // Upload to centralized Storage (Supabase Storage in production, or structured mirror in dev)
      uploadResult = await uploadFile({
        userId: session.id,
        folder: "exports",
        fileName: normalizedFileName,
        buffer,
        mimeType: finalMime,
      });

      let verifiedQrCodeId: string | null = null;
      if (qrCodeId && typeof qrCodeId === "string") {
        const userQr = await prisma.qRCode.findFirst({
          where: { id: qrCodeId, userId: session.id },
          select: { id: true },
        });
        if (userQr) {
          verifiedQrCodeId = userQr.id;
        }
      }

      // Save record into Prisma database
      const fileRecord = await prisma.generatedFile.create({
        data: {
          userId: session.id,
          qrCodeId: verifiedQrCodeId,
          fileName: normalizedFileName,
          fileType,
          fileSize: uploadResult.fileSize,
          mimeType: finalMime,
          storagePath: uploadResult.storagePath,
          downloadUrl: uploadResult.downloadUrl,
        },
      });

      return NextResponse.json({
        success: true,
        file: fileRecord,
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

      // Propaga o erro original do banco/processo para o tratamento unificado
      throw saveError;
    }
  } catch (error: any) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const safeErrorLog = rawMessage
      .replace(/(?:postgres|postgresql):\/\/[^\s]+/gi, "[DATABASE_URL_REDACTED]")
      .replace(/(?:password|senha|secret|token|key)=\S+/gi, "[CREDENTIAL_REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
    console.error("Erro ao salvar arquivo no storage:", safeErrorLog);

    return NextResponse.json(
      { error: "Não foi possível salvar o arquivo. Tente novamente." },
      { status: 500 }
    );
  }
}
