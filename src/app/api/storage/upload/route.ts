import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserPlanAndUsage, checkPermission } from "@/lib/permissions";
import { uploadFile, StorageFolder, getMimeTypeFromExt } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
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

    // Validação de permissão caso seja upload de logotipo personalizado
    if (folder === "logos") {
      const userContext = await getUserPlanAndUsage(session.id);
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

    const result = await uploadFile({
      userId: session.id,
      folder,
      fileName,
      buffer,
      mimeType,
    });

    return NextResponse.json({
      success: true,
      url: result.downloadUrl,
      storagePath: result.storagePath,
      fileSize: result.fileSize,
      mimeType: result.mimeType,
    });
  } catch (error: any) {
    console.error("Erro na rota de upload:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao processar upload do arquivo." },
      { status: 500 }
    );
  }
}
