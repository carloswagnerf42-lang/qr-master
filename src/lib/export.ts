import jsPDF from "jspdf";

export type ExportResolution = 512 | 1024 | 2048 | 4096;

/**
 * Converte um elemento SVG do DOM em string SVG pura
 */
export function getSvgString(svgElementId: string): string {
  const svg = document.getElementById(svgElementId);
  if (!svg) throw new Error("Elemento SVG não encontrado.");
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svg);
}

async function saveFileToDatabase(payload: {
  qrCodeId?: string;
  fileName: string;
  fileType: "png" | "svg" | "pdf";
  fileData: string;
  mimeType?: string;
}) {
  try {
    await fetch("/api/files/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("Falha ao sincronizar arquivo com o banco de dados local:", err);
  }
}

/**
 * Faz download do SVG vetorial e salva cópia no banco local
 */
export function downloadSvg(svgElementId: string, filename: string = "qrcode.svg", qrCodeId?: string) {
  const svgString = getSvgString(svgElementId);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  // Salva no banco de dados local
  saveFileToDatabase({
    qrCodeId,
    fileName: filename,
    fileType: "svg",
    fileData: svgString,
    mimeType: "image/svg+xml",
  });
}

/**
 * Converte o SVG para PNG na resolução selecionada (512, 1024, 2048, 4096px)
 */
export async function downloadPng(
  svgElementId: string,
  resolution: ExportResolution = 1024,
  filename: string = "qrcode.png",
  qrCodeId?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const svg = document.getElementById(svgElementId) as unknown as SVGSVGElement | null;
      if (!svg) {
        reject(new Error("Elemento SVG não encontrado"));
        return;
      }

      const svgString = getSvgString(svgElementId);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const URLObj = window.URL || window.webkitURL || window;
      const blobURL = URLObj.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const viewBox = svg.viewBox.baseVal;
        const aspect = viewBox && viewBox.width > 0 ? viewBox.height / viewBox.width : 1;

        canvas.width = resolution;
        canvas.height = resolution * aspect;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Contexto 2D do Canvas indisponível"));
          return;
        }

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/png");

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Falha ao gerar blob de imagem"));
            return;
          }
          const link = document.createElement("a");
          link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
          link.href = URLObj.createObjectURL(blob);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URLObj.revokeObjectURL(blobURL);

          // Salva no banco de dados local
          saveFileToDatabase({
            qrCodeId,
            fileName: filename,
            fileType: "png",
            fileData: dataUrl,
            mimeType: "image/png",
          });

          resolve();
        }, "image/png");
      };

      image.onerror = (e) => {
        URLObj.revokeObjectURL(blobURL);
        reject(e);
      };

      image.src = blobURL;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Gera e baixa documento PDF para impressão profissional
 */
export async function downloadPdf(
  svgElementId: string,
  title: string = "QR MASTER Code",
  subtitle: string = "Aponte a câmera do seu celular para escanear",
  filename: string = "qrcode.pdf",
  qrCodeId?: string
): Promise<void> {
  const svg = document.getElementById(svgElementId) as unknown as SVGSVGElement | null;
  if (!svg) throw new Error("Elemento SVG não encontrado");

  // Render SVG to high-res canvas first
  const canvas = document.createElement("canvas");
  const viewBox = svg.viewBox.baseVal;
  const aspect = viewBox && viewBox.width > 0 ? viewBox.height / viewBox.width : 1;
  const resolution = 1600;

  canvas.width = resolution;
  canvas.height = resolution * aspect;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Contexto Canvas indisponível");

  const svgString = getSvgString(svgElementId);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const blobURL = URL.createObjectURL(blob);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobURL);
      resolve();
    };
    img.onerror = reject;
    img.src = blobURL;
  });

  const imgData = canvas.toDataURL("image/png");

  // Initialize jsPDF A4 (210 x 297 mm)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Header Banner
  doc.setFillColor(79, 70, 229); // Primary Indigo (#4f46e5)
  doc.rect(0, 0, 210, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("QR MASTER", 105, 14, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Plataforma Profissional de QR Codes", 105, 21, { align: "center" });

  // Title & Subtitle
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(title, 105, 54, { align: "center" });

  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(subtitle, 105, 63, { align: "center" });

  // QR Code Image in Center
  const qrWidth = 110;
  const qrHeight = qrWidth * aspect;
  const qrX = (210 - qrWidth) / 2;
  const qrY = 74;

  // Subtle border around QR container
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.roundedRect(qrX - 5, qrY - 5, qrWidth + 10, qrHeight + 10, 4, 4, "S");

  doc.addImage(imgData, "PNG", qrX, qrY, qrWidth, qrHeight);

  // Instructions Box
  const instrY = qrY + qrHeight + 16;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(30, instrY, 150, 32, 3, 3, "F");

  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Instruções de Uso:", 105, instrY + 9, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("1. Abra a câmera do seu smartphone (ou leitor de QR Code).", 105, instrY + 16, { align: "center" });
  doc.text("2. Aponte para o código até aparecer o link de destino.", 105, instrY + 22, { align: "center" });
  doc.text("3. Toque na notificação para acessar o conteúdo instantaneamente.", 105, instrY + 28, { align: "center" });

  // Footer
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.text("Gerado com QR MASTER — www.qrmaster.app", 105, 285, { align: "center" });

  const pdfOutput = doc.output("datauristring");
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);

  // Salva cópia no banco de dados local
  saveFileToDatabase({
    qrCodeId,
    fileName: filename,
    fileType: "pdf",
    fileData: pdfOutput,
    mimeType: "application/pdf",
  });
}
