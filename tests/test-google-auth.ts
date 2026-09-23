process.env.ENABLE_TEST_AUTH = "true";

import { prisma } from "../src/lib/db";
import { hashPassword, verifyPassword } from "../src/lib/auth";
import { verifyGoogleIdToken } from "../src/lib/google-auth";

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

function createMockGoogleToken(payload: {
  sub: string;
  email: string;
  name: string;
  emailVerified?: boolean;
  picture?: string;
}): string {
  return "test_mock_token:" + Buffer.from(JSON.stringify(payload)).toString("base64");
}

async function runGoogleAuthTests() {
  console.log("=== INICIANDO TESTES DE AUTENTICAÇÃO COM O GOOGLE ===");

  const googleSub1 = `google_sub_${Date.now()}_1`;
  const googleEmail1 = `google_user_${Date.now()}_1@example.com`;

  const googleSub2 = `google_sub_${Date.now()}_2`;
  const googleEmail2 = `existing_user_${Date.now()}_2@example.com`;

  let createdUserId1 = "";
  let existingUserId2 = "";

  try {
    // 1. Testa utilitário de validação de token mock em ambiente de teste
    const token1 = createMockGoogleToken({
      sub: googleSub1,
      email: googleEmail1,
      name: "Maria Google",
      picture: "https://lh3.googleusercontent.com/a/photo1",
    });

    const parsed1 = await verifyGoogleIdToken(token1);
    assert(parsed1 !== null, "Token Google mock parseado com sucesso");
    assert(parsed1?.sub === googleSub1, "Google Sub ID extraído corretamente");
    assert(parsed1?.email === googleEmail1, "Google Email extraído corretamente");
    assert(parsed1?.emailVerified === true, "Google email_verified validado");

    // 2. Simula criação de nova conta via Google (Cenário A/B: Cadastro)
    const defaultPlan = await prisma.plan.findFirst({ where: { name: "FREE" } });

    const newUser = await prisma.user.create({
      data: {
        name: parsed1!.name,
        email: parsed1!.email,
        passwordHash: null,
        avatarUrl: parsed1!.picture || null,
        planId: defaultPlan?.id || null,
        settings: {
          create: {
            theme: "system",
            language: "pt-BR",
            notifyNewScans: true,
            notifyWeeklyReport: true,
            notifyLimitAlert: true,
            analyticsConsent: true,
            dataRetentionDays: 365,
          },
        },
        accounts: {
          create: {
            provider: "google",
            providerAccountId: parsed1!.sub,
          },
        },
      },
      include: { accounts: true, settings: true },
    });
    createdUserId1 = newUser.id;

    assert(!!newUser.id, "Usuário Google criado com sucesso");
    assert(newUser.passwordHash === null, "passwordHash é null para usuário cadastrado exclusivamente via Google");
    assert(newUser.accounts.length === 1, "AuthAccount vinculada com sucesso");
    assert(newUser.accounts[0].provider === "google", "Provedor é 'google'");
    assert(newUser.accounts[0].providerAccountId === googleSub1, "providerAccountId corresponde ao sub");

    // 3. Simula login subsequente com a mesma conta Google
    const existingAccount = await prisma.authAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: googleSub1,
        },
      },
      include: { user: true },
    });

    assert(existingAccount !== null, "Conta Google encontrada diretamente em AuthAccount");
    assert(existingAccount?.user.id === createdUserId1, "Usuário retornado corresponde ao ID cadastrado");

    // 4. Cenário C: Usuário preexistente com senha tenta logar com Google (Account Linking)
    const passwordHash = await hashPassword("MinhaSenhaExistente999!");
    const existingUser = await prisma.user.create({
      data: {
        name: "Carlos Pré-existente",
        email: googleEmail2,
        passwordHash,
        planId: defaultPlan?.id,
      },
    });
    existingUserId2 = existingUser.id;

    // Simula tentativa de login com Google usando o mesmo e-mail googleEmail2
    const token2 = createMockGoogleToken({
      sub: googleSub2,
      email: googleEmail2,
      name: "Carlos Google",
    });

    const parsed2 = await verifyGoogleIdToken(token2);
    assert(parsed2?.email === existingUser.email, "Google payload corresponde ao e-mail existente");

    // Valida que conta tem senha e requer link
    const userInDb = await prisma.user.findUnique({ where: { email: parsed2!.email } });
    const requiresLink = !!(userInDb && userInDb.passwordHash);
    assert(requiresLink === true, "Sistema detecta que conta preexistente requer confirmação de senha");

    // 5. Tentativa de vincular com senha errada (deve falhar)
    const wrongPasswordValid = await verifyPassword("SenhaErrada123!", userInDb!.passwordHash);
    assert(wrongPasswordValid === false, "Vinculação com senha incorreta é rejeitada");

    // 6. Tentativa de vincular com senha correta (deve suceder)
    const correctPasswordValid = await verifyPassword("MinhaSenhaExistente999!", userInDb!.passwordHash);
    assert(correctPasswordValid === true, "Senha correta validada com sucesso");

    await prisma.authAccount.create({
      data: {
        userId: userInDb!.id,
        provider: "google",
        providerAccountId: parsed2!.sub,
      },
    });

    // 7. Confirma vínculo criado e dados preservados
    const linkedAccounts = await prisma.authAccount.findMany({ where: { userId: existingUser.id } });
    assert(linkedAccounts.length === 1, "Conta Google vinculada à conta existente");
    assert(linkedAccounts[0].providerAccountId === googleSub2, "providerAccountId associado com precisão");

    const verifiedUser = await prisma.user.findUnique({ where: { id: existingUser.id } });
    assert(verifiedUser?.passwordHash !== null, "passwordHash original preservado intacto");

    // 8. Integridade da assinatura histórica #178856033673
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
    assert(p178?.status === "ACTIVE", "Status da assinatura permanece ACTIVE");
    assert(p178?.user.email === "itzjhonzin@gmail.com", "Usuário permanece itzjhonzin@gmail.com");
    assert(p178?.plan.name === "PRO", "Plano permanece PRO");

  } finally {
    // Limpeza de testes
    if (createdUserId1) {
      await prisma.authAccount.deleteMany({ where: { userId: createdUserId1 } });
      await prisma.userSettings.deleteMany({ where: { userId: createdUserId1 } });
      await prisma.user.delete({ where: { id: createdUserId1 } });
    }
    if (existingUserId2) {
      await prisma.authAccount.deleteMany({ where: { userId: existingUserId2 } });
      await prisma.user.delete({ where: { id: existingUserId2 } });
    }
    console.log("  ✓ Limpeza controlada dos dados de teste Google concluída.");
  }

  console.log("\n=========================================");
  console.log(`TOTAL PASS: ${passCount} | TOTAL FAIL: ${failCount}`);
  console.log("=========================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runGoogleAuthTests()
  .catch((err) => {
    console.error("Erro fatal no teste Google Auth:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
