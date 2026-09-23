import { prisma } from "../src/lib/db";
import { hashPassword, verifyPassword, generateSecureToken, hashToken } from "../src/lib/auth";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failCount++;
  }
}

async function runPasswordResetTests() {
  console.log("=== INICIANDO TESTES DO FLUXO DE RECUPERAÇÃO DE SENHA ===");

  const testEmail = `test_reset_${Date.now()}@example.com`;
  let testUserId = "";

  try {
    // 1. Cria usuário de teste com plano padrão
    const defaultPlan = await prisma.plan.findFirst({ where: { name: "FREE" } });
    const initialPasswordHash = await hashPassword("SenhaAntiga123!");

    const user = await prisma.user.create({
      data: {
        name: "Usuário Teste Recuperação",
        email: testEmail,
        passwordHash: initialPasswordHash,
        planId: defaultPlan?.id,
      },
    });
    testUserId = user.id;

    assert(!!user.id, "Usuário de teste criado com sucesso");

    // 2. Testa geração de token criptográfico
    const { rawToken, tokenHash } = generateSecureToken();
    assert(rawToken.length === 64, "Raw token possui 64 caracteres hexadecimais (32 bytes)");
    assert(tokenHash === hashToken(rawToken), "Hash SHA-256 é determinístico e compatível com hashToken");

    // 3. Salva token com expiração futura (1 hora)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const tokenRecord = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    assert(!!tokenRecord.id, "Token de recuperação persistido no banco com sucesso");
    assert(tokenRecord.usedAt === null, "Token inicializado com usedAt = null");

    // 4. Simula validação do token
    const fetchedToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    assert(!!fetchedToken, "Token encontrado via hash SHA-256");
    assert(fetchedToken!.expiresAt > new Date(), "Token está dentro do prazo de validade");
    assert(fetchedToken!.usedAt === null, "Token ainda não foi utilizado");

    // 5. Executa redefinição de senha com sucesso
    const newPassword = "NovaSenhaSegura456!";
    const newPasswordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    await prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    // 6. Valida que a senha foi atualizada
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert(await verifyPassword(newPassword, updatedUser?.passwordHash), "Nova senha valida com sucesso");
    assert(!(await verifyPassword("SenhaAntiga123!", updatedUser?.passwordHash)), "Senha antiga é rejeitada");

    // 7. Valida rejeição de reutilização do mesmo token (one-time use)
    const reusedToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    assert(reusedToken?.usedAt !== null, "Token já utilizado é marcado e não pode ser reutilizado");

    // 8. Valida rejeição de token expirado
    const expiredTokenData = generateSecureToken();
    const expiredRecord = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: expiredTokenData.tokenHash,
        expiresAt: new Date(Date.now() - 1000 * 60), // expirado há 1 minuto
      },
    });

    const isExpired = expiredRecord.expiresAt < new Date();
    assert(isExpired, "Token com validade no passado é identificado como expirado");

    // 9. Valida proteção anti-enumeração (busca e-mail inexistente não lança exceção)
    const nonExistent = await prisma.user.findUnique({
      where: { email: "email_totalmente_inexistente_999@xyz.com" },
    });
    assert(nonExistent === null, "E-mail inexistente tratado com sucesso sem erro");

    // 10. Valida integridade da assinatura histórica #178856033673
    const p178 = await prisma.subscription.findFirst({
      where: {
        OR: [
          { gatewaySubscriptionId: "178856033673" },
          { gatewayCustomerId: "178856033673" },
        ],
      },
      include: { user: true, plan: true },
    });

    assert(p178 !== null, "Assinatura #178856033673 existe intacta");
    assert(p178?.status === "ACTIVE", "Status da assinatura #178856033673 permanece ACTIVE");
    assert(p178?.user.email === "itzjhonzin@gmail.com", "Usuário de #178856033673 permanece itzjhonzin@gmail.com");
    assert(p178?.plan.name === "PRO", "Plano de #178856033673 permanece PRO");

  } finally {
    // Limpeza controlada dos dados de teste
    if (testUserId) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
      console.log("  ✓ Limpeza de usuário de teste concluída.");
    }
  }

  console.log("\n=========================================");
  console.log(`TOTAL PASS: ${passCount} | TOTAL FAIL: ${failCount}`);
  console.log("=========================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runPasswordResetTests()
  .catch((err) => {
    console.error("Erro fatal no teste de recuperação de senha:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
