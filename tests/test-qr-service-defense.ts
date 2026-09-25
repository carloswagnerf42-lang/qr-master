import { prisma } from "../src/lib/db";
import {
  updateUserQRCode,
  deleteUserQRCode,
  toggleUserQRCodeStatus,
  restoreUserQRCode,
  QRCodeNotFoundError,
} from "../src/lib/qr-service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function expectNotFound(fn: () => Promise<unknown>, label: string) {
  let threwExpected = false;
  try {
    await fn();
  } catch (err: any) {
    if (err instanceof QRCodeNotFoundError || err?.status === 404 || err?.message?.includes("QR Code não encontrado")) {
      threwExpected = true;
    }
  }
  assert(threwExpected, `${label} -> rejeitado fail-closed com QRCodeNotFoundError (404)`);
}

async function runTests() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: SECURITY-AUTHZ-03B — QR MUTATION DEFENSE-IN-DEPTH");
  console.log("==========================================================================\n");

  // 1. Setup de usuários de teste e plano
  const plan = await prisma.plan.findFirst() || await prisma.plan.create({
    data: {
      name: "FREE",
      displayName: "Free Plan",
      priceMonth: 0,
      priceYear: 0,
    },
  });

  const userA = await prisma.user.upsert({
    where: { email: "user_a_defense@test.local" },
    create: {
      email: "user_a_defense@test.local",
      name: "User Alice",
      role: "USER",
      planId: plan.id,
    },
    update: {},
  });

  const userB = await prisma.user.upsert({
    where: { email: "user_b_defense@test.local" },
    create: {
      email: "user_b_defense@test.local",
      name: "User Bob Attacker",
      role: "USER",
      planId: plan.id,
    },
    update: {},
  });

  // Limpeza de testes anteriores para garantir estado isolado
  await prisma.qRCode.deleteMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });

  // Criação do QR de Alice (Proprietária legítima)
  const qrAlice = await prisma.qRCode.create({
    data: {
      userId: userA.id,
      name: "Cardápio Original Alice",
      type: "url",
      destination: "https://alice-restaurante.com/menu",
      content: JSON.stringify({ url: "https://alice-restaurante.com/menu" }),
      status: "ACTIVE",
      styleConfig: "{}",
    },
  });

  console.log("▶ 1. Operações Adversárias do Usuário B sobre o QR de Alice (Bloqueio Fail-Closed):");

  // 1. Usuário B não consegue editar QR de Alice
  await expectNotFound(
    () =>
      updateUserQRCode({
        qrId: qrAlice.id,
        userId: userB.id,
        data: {
          name: "Hacked by Bob",
          destination: "https://phishing-site.com",
        },
      }),
    "1.1. Usuário B tentando editar QR de Alice"
  );

  // 2. Usuário B não consegue soft-delete QR de Alice
  await expectNotFound(
    () =>
      deleteUserQRCode({
        qrId: qrAlice.id,
        userId: userB.id,
        permanent: false,
      }),
    "1.2. Usuário B tentando enviar QR de Alice para a lixeira (soft-delete)"
  );

  // 3. Usuário B não consegue hard-delete QR de Alice
  await expectNotFound(
    () =>
      deleteUserQRCode({
        qrId: qrAlice.id,
        userId: userB.id,
        permanent: true,
      }),
    "1.3. Usuário B tentando excluir permanentemente QR de Alice (hard-delete)"
  );

  // 4. Usuário B não consegue alternar status (toggle) do QR de Alice
  await expectNotFound(
    () =>
      toggleUserQRCodeStatus({
        qrId: qrAlice.id,
        userId: userB.id,
      }),
    "1.4. Usuário B tentando alternar status (toggle) do QR de Alice"
  );

  // 5. Usuário B não consegue restaurar QR de Alice
  await expectNotFound(
    () =>
      restoreUserQRCode({
        qrId: qrAlice.id,
        userId: userB.id,
      }),
    "1.5. Usuário B tentando restaurar QR de Alice"
  );

  console.log("\n▶ 2. Validação Rigorosa de Identificadores (Parâmetros Vazios / Whitespace / Inválidos):");

  // 6. userId vazio falha fechado
  await expectNotFound(
    () =>
      updateUserQRCode({
        qrId: qrAlice.id,
        userId: "",
        data: { name: "Test" },
      }),
    "2.1. updateUserQRCode com userId string vazia"
  );

  await expectNotFound(
    () =>
      updateUserQRCode({
        qrId: qrAlice.id,
        userId: "   ",
        data: { name: "Test" },
      }),
    "2.2. updateUserQRCode com userId apenas espaços"
  );

  await expectNotFound(
    () =>
      deleteUserQRCode({
        qrId: qrAlice.id,
        userId: "",
      }),
    "2.3. deleteUserQRCode com userId vazio"
  );

  await expectNotFound(
    () =>
      toggleUserQRCodeStatus({
        qrId: qrAlice.id,
        userId: "",
      }),
    "2.4. toggleUserQRCodeStatus com userId vazio"
  );

  await expectNotFound(
    () =>
      restoreUserQRCode({
        qrId: qrAlice.id,
        userId: "",
      }),
    "2.5. restoreUserQRCode com userId vazio"
  );

  // 7. qrId vazio falha fechado
  await expectNotFound(
    () =>
      updateUserQRCode({
        qrId: "",
        userId: userA.id,
        data: { name: "Test" },
      }),
    "2.6. updateUserQRCode com qrId vazio"
  );

  await expectNotFound(
    () =>
      updateUserQRCode({
        qrId: "   ",
        userId: userA.id,
        data: { name: "Test" },
      }),
    "2.7. updateUserQRCode com qrId apenas espaços"
  );

  await expectNotFound(
    () =>
      deleteUserQRCode({
        qrId: "",
        userId: userA.id,
      }),
    "2.8. deleteUserQRCode com qrId vazio"
  );

  await expectNotFound(
    () =>
      toggleUserQRCodeStatus({
        qrId: "",
        userId: userA.id,
      }),
    "2.9. toggleUserQRCodeStatus com qrId vazio"
  );

  await expectNotFound(
    () =>
      restoreUserQRCode({
        qrId: "",
        userId: userA.id,
      }),
    "2.10. restoreUserQRCode com qrId vazio"
  );

  console.log("\n▶ 3. Verificação de Integridade no Banco (Zero Efeitos Colaterais das Tentativas Adversárias):");

  const qrAliceCheck = await prisma.qRCode.findUnique({
    where: { id: qrAlice.id },
  });

  assert(
    qrAliceCheck !== null &&
      qrAliceCheck.name === "Cardápio Original Alice" &&
      qrAliceCheck.destination === "https://alice-restaurante.com/menu" &&
      qrAliceCheck.status === "ACTIVE" &&
      qrAliceCheck.deletedAt === null,
    "3.1. Estado do QR de Alice no banco permaneceu 100% intacto (zero mutações decorrentes dos ataques de Bob)"
  );

  console.log("\n▶ 4. Operações Legítimas pelo Proprietário (Funcionamento Normal Preservado):");

  // 4.1. Edição legítima por Alice
  const updatedByAlice = await updateUserQRCode({
    qrId: qrAlice.id,
    userId: userA.id,
    data: {
      name: "Cardápio Atualizado Alice",
      destination: "https://alice-restaurante.com/novo-cardapio",
    },
  });

  assert(
    updatedByAlice.name === "Cardápio Atualizado Alice" &&
      updatedByAlice.destination === "https://alice-restaurante.com/novo-cardapio",
    "4.1. Proprietária (Alice) atualiza seu próprio QR Code com sucesso"
  );

  // 4.2. Toggle legítimo por Alice (ACTIVE -> INACTIVE)
  const toggled1 = await toggleUserQRCodeStatus({
    qrId: qrAlice.id,
    userId: userA.id,
  });
  assert(toggled1.status === "INACTIVE", "4.2. Proprietária pausa seu QR Code (ACTIVE -> INACTIVE)");

  // 4.3. Toggle legítimo por Alice (INACTIVE -> ACTIVE)
  const toggled2 = await toggleUserQRCodeStatus({
    qrId: qrAlice.id,
    userId: userA.id,
  });
  assert(toggled2.status === "ACTIVE", "4.3. Proprietária reativa seu QR Code (INACTIVE -> ACTIVE)");

  // 4.4. Soft-delete legítimo por Alice
  const softDeleted = await deleteUserQRCode({
    qrId: qrAlice.id,
    userId: userA.id,
    permanent: false,
  });

  const qrInTrash = await prisma.qRCode.findUnique({ where: { id: qrAlice.id } });
  assert(
    softDeleted.permanent === false && qrInTrash?.deletedAt !== null,
    "4.4. Proprietária move seu QR Code para a lixeira (soft-delete)"
  );

  // 4.5. Restauração legítima por Alice
  const restored = await restoreUserQRCode({
    qrId: qrAlice.id,
    userId: userA.id,
  });

  const qrRestored = await prisma.qRCode.findUnique({ where: { id: qrAlice.id } });
  assert(
    restored.id === qrAlice.id && qrRestored?.deletedAt === null,
    "4.5. Proprietária restaura seu QR Code da lixeira com sucesso"
  );

  // 4.6. Exclusão permanente por Alice (com scan associado para validar transação em cascata)
  await prisma.qRCodeScan.create({
    data: {
      qrCodeId: qrAlice.id,
      device: "Mobile",
      browser: "Safari",
      os: "iOS",
    },
  });

  const hardDeleted = await deleteUserQRCode({
    qrId: qrAlice.id,
    userId: userA.id,
    permanent: true,
  });

  const qrAfterHardDelete = await prisma.qRCode.findUnique({ where: { id: qrAlice.id } });
  const scansAfterHardDelete = await prisma.qRCodeScan.count({ where: { qrCodeId: qrAlice.id } });

  assert(
    hardDeleted.permanent === true && qrAfterHardDelete === null && scansAfterHardDelete === 0,
    "4.6. Proprietária exclui permanentemente seu QR Code e scans associados são removidos em transação"
  );

  // Limpeza final
  await prisma.user.deleteMany({
    where: { id: { in: [userA.id, userB.id] } },
  });

  console.log("\n==========================================================================");
  console.log(`  RESULTADO FINAL: ${passed} PASS / ${failed} FAIL`);
  console.log("==========================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erro fatal nos testes SECURITY-AUTHZ-03B:", err);
  process.exit(1);
});
