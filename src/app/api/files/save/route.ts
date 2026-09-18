import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";
import { uploadFile, getMimeTypeFromExt } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
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

    // Upload to centralized Storage (Supabase Storage in production, or structured mirror in dev)
    const uploadResult = await uploadFile({
      userId: session.id,
      folder: "exports",
      fileName: normalizedFileName,
      buffer,
      mimeType: finalMime,
    });

    // Save record into Prisma database
    const fileRecord = await prisma.generatedFile.create({
      data: {
        userId: session.id,
        qrCodeId: qrCodeId || null,
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
  } catch (error: any) {
    console.error("Erro ao salvar arquivo no storage:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao salvar arquivo no serviço de armazenamento." },
      { status: 500 }
    );
  }
}
