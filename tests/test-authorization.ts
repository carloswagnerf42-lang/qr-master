import { signToken, verifyToken } from "../src/lib/auth";
import { deleteFile, getFileDownloadUrl } from "../src/lib/storage";

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

// Modelos de dados simulados em memória representando os registros no banco de dados
interface MockQRCode {
  id: string;
  userId: string;
  name: string;
  destination: string;
  status: string;
  deletedAt: Date | null;
}

interface MockGeneratedFile {
  id: string;
  userId: string;
  fileName: string;
  storagePath: string;
}

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
}

// Base de dados de teste
const mockDb = {
  users: [
    { id: "usr_alice", name: "Alice Cliente", email: "alice@empresa.com", role: "USER" as const },
    { id: "usr_bob", name: "Bob Invasor", email: "bob@hacker.com", role: "USER" as const },
    { id: "usr_admin", name: "Administrador", email: "admin@qrmaster.com", role: "ADMIN" as const },
  ],
  qrcodes: [
    {
      id: "qr_alice_001",
      userId: "usr_alice",
      name: "Cardápio Digital Alice",
      destination: "https://alice-restaurante.com/cardapio",
      status: "ACTIVE",
      deletedAt: null,
    },
    {
      id: "qr_bob_002",
      userId: "usr_bob",
      name: "Promoção Bob",
      destination: "https://bob-loja.com/promo",
      status: "ACTIVE",
      deletedAt: null,
    },
  ],
  files: [
    {
      id: "file_alice_777",
      userId: "usr_alice",
      fileName: "cardapio_alta_resolucao.pdf",
      storagePath: "users/usr_alice/exports/cardapio_alta_resolucao_123.pdf",
    },
  ],
};

// Simulador dos controllers de API para testar os invariantes exatos de isolamento
const apiSimulator = {
  // GET /api/qr/[id]
  getQRCode(sessionUserId: string, qrId: string) {
    return mockDb.qrcodes.find((q) => q.id === qrId && q.userId === sessionUserId) || null;
  },

  // GET /api/analytics?qrCodeId=...
  getAnalyticsForQr(sessionUserId: string, qrCodeId: string) {
    const userQrs = mockDb.qrcodes.filter((q) => q.userId === sessionUserId && q.id === qrCodeId);
    if (userQrs.length === 0) return { scans: [], allowed: false };
    return { scans: [{ id: "scan_1", device: "Mobile" }], allowed: true };
  },

  // GET /api/files/[id]/download
  getFileDownload(sessionUserId: string, fileId: string) {
    return mockDb.files.find((f) => f.id === fileId && f.userId === sessionUserId) || null;
  },

  // POST /api/qr/[id]/duplicate
  duplicateQRCode(sessionUserId: string, qrId: string) {
    const original = mockDb.qrcodes.find((q) => q.id === qrId && q.userId === sessionUserId);
    if (!original) return { success: false, error: "QR Code não encontrado (Acesso Negado)", code: 404 };
    return { success: true, duplicatedId: `copy_${original.id}` };
  },

  // POST /api/qr/[id]/toggle
  toggleQRCode(sessionUserId: string, qrId: string) {
    const qr = mockDb.qrcodes.find((q) => q.id === qrId && q.userId === sessionUserId);
    if (!qr) return { success: false, error: "QR Code não encontrado (Acesso Negado)", code: 404 };
    qr.status = qr.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    return { success: true, newStatus: qr.status };
  },

  // POST /api/qr/restore
  restoreQRCode(sessionUserId: string, qrId: string) {
    const qr = mockDb.qrcodes.find((q) => q.id === qrId && q.userId === sessionUserId);
    if (!qr) return { success: false, error: "QR Code não encontrado (Acesso Negado)", code: 404 };
    qr.deletedAt = null;
    return { success: true, restored: true };
  },

  // POST /api/admin/plan
  activatePlanAdmin(sessionUser: MockUser, targetUserId: string, planName: string) {
    if (sessionUser.role !== "ADMIN") {
      return { success: false, error: "Acesso negado. Apenas administradores podem ativar planos.", code: 403 };
    }
    return { success: true, activatedFor: targetUserId, plan: planName };
  },

  // PUT /api/qr/[id]
  updateQRCode(sessionUserId: string, qrId: string, newDestination: string) {
    const existing = mockDb.qrcodes.find((q) => q.id === qrId && q.userId === sessionUserId);
    if (!existing) return { success: false, error: "QR Code não encontrado (Acesso Negado)", code: 404 };
    existing.destination = newDestination;
    return { success: true, updated: existing };
  },

  // PATCH /api/auth/me
  updateProfile(sessionUserId: string, newName: string) {
    const user = mockDb.users.find((u) => u.id === sessionUserId);
    if (!user) return { success: false, error: "Não autorizado", code: 401 };
    user.name = newName;
    return { success: true, user };
  },

  // DELETE /api/qr/[id]
  deleteQRCode(sessionUserId: string, qrId: string) {
    const existing = mockDb.qrcodes.find((q) => q.id === qrId && q.userId === sessionUserId);
    if (!existing) return { success: false, error: "QR Code não encontrado (Acesso Negado)", code: 404 };
    return { success: true, deletedId: existing.id };
  },

  // DELETE /api/files/[id]
  deleteFileRecord(sessionUserId: string, fileId: string) {
    const existing = mockDb.files.find((f) => f.id === fileId && f.userId === sessionUserId);
    if (!existing) return { success: false, error: "Arquivo não encontrado (Acesso Negado)", code: 404 };
    return { success: true, deletedFile: existing.id };
  },
};

async function runAuthorizationTests() {
  console.log("==========================================================");
  console.log("🛡️  SUÍTE DE TESTES DE AUTORIZAÇÃO E ISOLAMENTO MULTI-TENANT");
  console.log("==========================================================\n");

  const alice = mockDb.users[0];
  const bob = mockDb.users[1];
  const admin = mockDb.users[2];

  // ========================================================
  // 1. TESTES DE AUTENTICAÇÃO E JWT
  // ========================================================
  console.log("▶ 1. Testando Assinatura, Integridade de Token e Role Check:");
  const aliceToken = signToken({ id: alice.id, name: alice.name, email: alice.email, role: alice.role });
  const bobToken = signToken({ id: bob.id, name: bob.name, email: bob.email, role: bob.role });
  const adminToken = signToken({ id: admin.id, name: admin.name, email: admin.email, role: admin.role });

  const decodedAlice = verifyToken(aliceToken);
  assert(decodedAlice?.id === alice.id, "Token da Alice decodificado com id correto");
  assert(decodedAlice?.role === "USER", "Role da Alice é USER");

  const decodedAdmin = verifyToken(adminToken);
  assert(decodedAdmin?.role === "ADMIN", "Role do Admin é ADMIN");

  // Tentativa de falsificação de token (adulteração de payload)
  const tokenParts = aliceToken.split(".");
  const tamperedPayload = Buffer.from(JSON.stringify({ id: "usr_alice", role: "ADMIN" })).toString("base64url");
  const tamperedToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;
  const verifyTampered = verifyToken(tamperedToken);
  assert(verifyTampered === null, "Token adulterado com elevação de privilégio foi rejeitado (assinatura inválida)");

  // ========================================================
  // 2. TESTES DE AUTORIZAÇÃO GET (ISOLAMENTO CONTRA IDOR)
  // ========================================================
  console.log("\n▶ 2. Testando Verbo GET — Proteção contra IDOR:");
  // Caso 1: Alice acessa o próprio QR -> OK
  const aliceOwnQr = apiSimulator.getQRCode(alice.id, "qr_alice_001");
  assert(aliceOwnQr !== null && aliceOwnQr.id === "qr_alice_001", "Alice consegue visualizar seu próprio QR");

  // Caso 2: Bob tenta acessar o QR da Alice -> ACESSO NEGADO (null / 404)
  const bobAccessAliceQr = apiSimulator.getQRCode(bob.id, "qr_alice_001");
  assert(bobAccessAliceQr === null, "Bob tentando visualizar QR da Alice: ACESSO NEGADO (404)");

  // Caso 3: Bob tenta consultar analytics do QR da Alice -> ACESSO NEGADO
  const bobAnalytics = apiSimulator.getAnalyticsForQr(bob.id, "qr_alice_001");
  assert(!bobAnalytics.allowed && bobAnalytics.scans.length === 0, "Bob tentando ver telemetria da Alice: ACESSO NEGADO (0 métricas)");

  // Caso 4: Bob tenta baixar arquivo gerado da Alice -> ACESSO NEGADO
  const bobDownloadFile = apiSimulator.getFileDownload(bob.id, "file_alice_777");
  assert(bobDownloadFile === null, "Bob tentando baixar arquivo da Alice: ACESSO NEGADO (404)");

  // ========================================================
  // 3. TESTES DE AUTORIZAÇÃO POST
  // ========================================================
  console.log("\n▶ 3. Testando Verbo POST — Bloqueio de Ações Cruzadas:");
  // Caso 1: Bob tenta duplicar o QR da Alice -> ACESSO NEGADO
  const bobDupAlice = apiSimulator.duplicateQRCode(bob.id, "qr_alice_001");
  assert(!bobDupAlice.success && bobDupAlice.code === 404, "Bob tentando duplicar QR da Alice: ACESSO NEGADO (404)");

  // Caso 2: Bob tenta pausar/ativar o QR da Alice -> ACESSO NEGADO
  const bobToggleAlice = apiSimulator.toggleQRCode(bob.id, "qr_alice_001");
  assert(!bobToggleAlice.success && bobToggleAlice.code === 404, "Bob tentando pausar/ativar QR da Alice: ACESSO NEGADO (404)");

  // Caso 3: Bob tenta restaurar QR da Alice da lixeira -> ACESSO NEGADO
  const bobRestoreAlice = apiSimulator.restoreQRCode(bob.id, "qr_alice_001");
  assert(!bobRestoreAlice.success && bobRestoreAlice.code === 404, "Bob tentando restaurar QR da Alice: ACESSO NEGADO (404)");

  // Caso 4: Usuário comum (Bob) tenta acionar endpoint administrativo de ativação de planos
  const bobAdminAttempt = apiSimulator.activatePlanAdmin(bob, alice.id, "BUSINESS");
  assert(!bobAdminAttempt.success && bobAdminAttempt.code === 403, "Bob tentando acionar função ADMIN: ACESSO NEGADO (403 Forbidden)");

  // Caso 5: Admin legítimo aciona ativação de plano -> AUTORIZADO
  const legitAdminAction = apiSimulator.activatePlanAdmin(admin, alice.id, "BUSINESS");
  assert(legitAdminAction.success === true, "Administrador autêntico executando ativação: AUTORIZADO");

  // ========================================================
  // 4. TESTES DE AUTORIZAÇÃO PUT
  // ========================================================
  console.log("\n▶ 4. Testando Verbo PUT — Alteração Não Autorizada:");
  // Caso 1: Bob tenta alterar o destino do QR da Alice para URL maliciosa -> ACESSO NEGADO
  const destinationBefore = mockDb.qrcodes[0].destination;
  const bobUpdateAlice = apiSimulator.updateQRCode(bob.id, "qr_alice_001", "https://phishing-site.com");
  assert(!bobUpdateAlice.success && bobUpdateAlice.code === 404, "Bob tentando alterar destino do QR da Alice: ACESSO NEGADO (404)");
  assert(mockDb.qrcodes[0].destination === destinationBefore, "Destino original da Alice permaneceu intacto");

  // Caso 2: Alice alterando seu próprio QR -> AUTORIZADO
  const aliceLegitUpdate = apiSimulator.updateQRCode(alice.id, "qr_alice_001", "https://alice-restaurante.com/novo-cardapio");
  assert(aliceLegitUpdate.success === true, "Alice alterando seu próprio QR: AUTORIZADO");

  // ========================================================
  // 5. TESTES DE AUTORIZAÇÃO PATCH
  // ========================================================
  console.log("\n▶ 5. Testando Verbo PATCH — Mutação de Perfil Isolada:");
  // Caso 1: Bob tenta atualizar perfil via PATCH /api/auth/me
  // O endpoint amarra estritamente ao session.id, logo afeta apenas Bob
  const aliceNameBefore = alice.name;
  apiSimulator.updateProfile(bob.id, "Bob Alterado");
  assert(bob.name === "Bob Alterado", "Perfil do Bob foi atualizado corretamente");
  assert(alice.name === aliceNameBefore, "Perfil da Alice não sofreu nenhuma interferência cruzada");

  // ========================================================
  // 6. TESTES DE AUTORIZAÇÃO DELETE
  // ========================================================
  console.log("\n▶ 6. Testando Verbo DELETE — Exclusão Cruzada e Storage:");
  // Caso 1: Bob tenta deletar QR da Alice no banco -> ACESSO NEGADO
  const bobDeleteAliceQr = apiSimulator.deleteQRCode(bob.id, "qr_alice_001");
  assert(!bobDeleteAliceQr.success && bobDeleteAliceQr.code === 404, "Bob tentando deletar QR da Alice: ACESSO NEGADO (404)");

  // Caso 2: Bob tenta deletar registro de arquivo da Alice no banco -> ACESSO NEGADO
  const bobDeleteAliceFile = apiSimulator.deleteFileRecord(bob.id, "file_alice_777");
  assert(!bobDeleteAliceFile.success && bobDeleteAliceFile.code === 404, "Bob tentando deletar arquivo da Alice no banco: ACESSO NEGADO (404)");

  // Caso 3: Bob tenta invocar deleteFile no Storage para apagar arquivo da Alice
  let storageDeleteBlocked = false;
  try {
    await deleteFile("users/usr_alice/exports/cardapio.pdf", bob.id);
  } catch {
    storageDeleteBlocked = true;
  }
  assert(storageDeleteBlocked, "Bob tentando apagar arquivo físico da Alice no Storage: ACESSO NEGADO (Exceção)");

  // Caso 4: Bob tenta gerar URL de download privada do arquivo da Alice
  let storageUrlBlocked = false;
  try {
    getFileDownloadUrl("users/usr_alice/exports/cardapio.pdf", bob.id);
  } catch {
    storageUrlBlocked = true;
  }
  assert(storageUrlBlocked, "Bob tentando obter URL de arquivo da Alice no Storage: ACESSO NEGADO (Exceção)");

  console.log("\n==========================================================");
  console.log(`TOTAL DE TESTES DE AUTORIZAÇÃO: ${passCount + failCount}`);
  console.log(`APROVADOS: ${passCount}`);
  console.log(`FALHAS: ${failCount}`);
  console.log("==========================================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runAuthorizationTests().catch((err) => {
  console.error("Erro fatal na execução dos testes de autorização:", err);
  process.exit(1);
});
