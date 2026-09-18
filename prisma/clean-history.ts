import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanHistory() {
  console.log("🧹 Iniciando limpeza do histórico de testes no QR MASTER...");

  // 1. Remover todos os scans de teste
  const deletedScans = await prisma.qRCodeScan.deleteMany({});
  console.log(`✓ Removidos ${deletedScans.count} registros de escaneamento de teste.`);

  // 2. Remover logs de teste
  const deletedLogs = await prisma.activityLog.deleteMany({});
  console.log(`✓ Removidos ${deletedLogs.count} registros de log de teste.`);

  // 3. Resetar contadores de scan de todos os QR Codes
  const updatedQRs = await prisma.qRCode.updateMany({
    data: {
      scanCount: 0,
      lastScanAt: null,
    },
  });
  console.log(`✓ Zerado o contador de scans em ${updatedQRs.count} QR Codes.`);

  // 4. Limpar arquivos gerados de teste se houver
  const deletedFiles = await prisma.generatedFile.deleteMany({});
  console.log(`✓ Removidos ${deletedFiles.count} arquivos de teste.`);

  console.log("\n✨ Histórico de testes limpo com sucesso! Banco de dados pronto para uso real.");
}

cleanHistory()
  .catch((e) => {
    console.error("❌ Erro ao limpar histórico:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
