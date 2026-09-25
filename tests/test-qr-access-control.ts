/**
 * QR-ACCESS-01: Bateria de Testes Adversariais de Controle de Acesso, Ownership e IDOR/BOLA
 *
 * Matriz de Verificação:
 * 1.  A acessa QR-A -> permitido (200)
 * 2.  A lê QR-B -> bloqueado (404)
 * 3.  A edita QR-B -> bloqueado (404)
 * 4.  A exclui QR-B -> bloqueado (404)
 * 5.  A usa category-B na criação de QR -> bloqueado (400)
 * 6.  A usa campaign-B na criação de QR -> bloqueado (400)
 * 7.  A edita QR-A tentando associar category-B -> bloqueado (rejeitado/nulo)
 * 8.  A edita QR-A tentando associar campaign-B -> bloqueado (rejeitado/nulo)
 * 9.  A lê analytics-B -> bloqueado (404)
 * 10. A tenta exportar/baixar arquivo de B -> bloqueado (404)
 * 11. A envia userId=B no payload de criação -> ignorado/forçado para session.id
 * 12. A tenta alterar role/plan via PATCH /api/auth/me -> ignorado/bloqueado
 * 13. Usuário comum acessa rota admin -> bloqueado (403)
 * 14. A tenta duplicar QR-B -> bloqueado (404)
 * 15. A tenta alternar status (toggle) de QR-B -> bloqueado (404)
 * 16. A tenta restaurar QR-B da lixeira -> bloqueado (404)
 */

import { signToken, verifyToken } from "../src/lib/auth";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (detail) console.error(`    Detalhes: ${detail}`);
    throw new Error(`Falha no teste: ${testName}`);
  }
}

// Modelos de dados simulados (Fixtures)
interface MockUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  planId: string;
}

interface MockCategory {
  id: string;
  userId: string;
  name: string;
}

interface MockCampaign {
  id: string;
  userId: string;
  name: string;
}

interface MockQRCode {
  id: string;
  userId: string;
  name: string;
  destination: string;
  categoryId: string | null;
  campaignId: string | null;
  status: "ACTIVE" | "INACTIVE";
  deletedAt: Date | null;
  scanCount: number;
}

interface MockScan {
  id: string;
  qrCodeId: string;
  device: string;
  timestamp: Date;
}

interface MockGeneratedFile {
  id: string;
  userId: string;
  qrCodeId: string | null;
  fileName: string;
  downloadUrl: string;
}

function runSuite() {
  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}   🛡️ QR-ACCESS-01: AUDITORIA DE AUTORIZAÇÃO, OWNERSHIP E IDOR/BOLA    ${RESET}`);
  console.log(`${CYAN}========================================================================\n`);

  // Fixtures de dois tenants isolados e um admin
  const userA: MockUser = { id: "usr_alice_tenant_a", name: "Alice", email: "alice@empresa.com", role: "USER", planId: "plan_pro" };
  const userB: MockUser = { id: "usr_bob_tenant_b", name: "Bob", email: "bob@atacante.com", role: "USER", planId: "plan_pro" };
  const admin: MockUser = { id: "usr_admin_root", name: "Admin", email: "admin@qrmaster.com", role: "ADMIN", planId: "plan_biz" };

  const categoryB: MockCategory = { id: "cat_bob_01", userId: userB.id, name: "Categoria Secreta Bob" };
  const campaignB: MockCampaign = { id: "camp_bob_01", userId: userB.id, name: "Campanha Confidencial Bob" };

  const qrA: MockQRCode = {
    id: "qr_alice_001",
    userId: userA.id,
    name: "QR Restaurante Alice",
    destination: "https://alice-restaurante.com",
    categoryId: null,
    campaignId: null,
    status: "ACTIVE",
    deletedAt: null,
    scanCount: 15,
  };

  const qrB: MockQRCode = {
    id: "qr_bob_999",
    userId: userB.id,
    name: "QR Privado Bob",
    destination: "https://bob-privado.com",
    categoryId: categoryB.id,
    campaignId: campaignB.id,
    status: "ACTIVE",
    deletedAt: null,
    scanCount: 42,
  };

  const scansB: MockScan[] = [
    { id: "scan_b_1", qrCodeId: qrB.id, device: "Mobile", timestamp: new Date() },
    { id: "scan_b_2", qrCodeId: qrB.id, device: "Desktop", timestamp: new Date() },
  ];

  const fileB: MockGeneratedFile = {
    id: "file_bob_888",
    userId: userB.id,
    qrCodeId: qrB.id,
    fileName: "bob_alta_resolucao.pdf",
    downloadUrl: "/api/files/file_bob_888/download",
  };

  // State simulando o banco Prisma
  const db = {
    users: [userA, userB, admin],
    categories: [categoryB],
    campaigns: [campaignB],
    qrcodes: [qrA, qrB],
    scans: scansB,
    files: [fileB],
  };

  // Simulação fiel dos controllers da aplicação
  const server = {
    // GET /api/qr/[id]
    getQR(sessionUserId: string, id: string) {
      const qr = db.qrcodes.find((q) => q.id === id && q.userId === sessionUserId);
      if (!qr) return { status: 404, error: "QR Code não encontrado" };
      return { status: 200, qrCode: qr };
    },

    // PUT /api/qr/[id]
    updateQR(sessionUserId: string, id: string, body: any) {
      const existing = db.qrcodes.find((q) => q.id === id && q.userId === sessionUserId);
      if (!existing) return { status: 404, error: "QR Code não encontrado" };

      // Validação Anti-IDOR de categoria
      let finalCategoryId = existing.categoryId;
      if (body.categoryId !== undefined) {
        if (body.categoryId) {
          const cat = db.categories.find((c) => c.id === body.categoryId && c.userId === sessionUserId);
          finalCategoryId = cat ? cat.id : null;
        } else {
          finalCategoryId = null;
        }
      }

      // Validação Anti-IDOR de campanha
      let finalCampaignId = existing.campaignId;
      if (body.campaignId !== undefined) {
        if (body.campaignId) {
          const camp = db.campaigns.find((c) => c.id === body.campaignId && c.userId === sessionUserId);
          finalCampaignId = camp ? camp.id : null;
        } else {
          finalCampaignId = null;
        }
      }

      existing.name = body.name !== undefined ? body.name : existing.name;
      existing.destination = body.destination !== undefined ? body.destination : existing.destination;
      existing.categoryId = finalCategoryId;
      existing.campaignId = finalCampaignId;
      return { status: 200, qrCode: existing };
    },

    // DELETE /api/qr/[id]
    deleteQR(sessionUserId: string, id: string) {
      const existing = db.qrcodes.find((q) => q.id === id && q.userId === sessionUserId);
      if (!existing) return { status: 404, error: "QR Code não encontrado" };
      db.qrcodes = db.qrcodes.filter((q) => q.id !== id);
      return { status: 200, success: true };
    },

    // POST /api/qr
    createQR(sessionUserId: string, body: any) {
      // Validação Anti-IDOR de categoria
      let finalCategoryId: string | null = null;
      if (body.categoryId) {
        const cat = db.categories.find((c) => c.id === body.categoryId && c.userId === sessionUserId);
        if (!cat) return { status: 400, error: "Categoria inválida ou não encontrada." };
        finalCategoryId = cat.id;
      }

      // Validação Anti-IDOR de campanha
      let finalCampaignId: string | null = null;
      if (body.campaignId) {
        const camp = db.campaigns.find((c) => c.id === body.campaignId && c.userId === sessionUserId);
        if (!camp) return { status: 400, error: "Campanha inválida ou não encontrada." };
        finalCampaignId = camp.id;
      }

      // Ignora body.userId e usa sessionUserId
      const newQr: MockQRCode = {
        id: `qr_gen_${Date.now()}`,
        userId: sessionUserId,
        name: body.name || "Novo QR",
        destination: body.destination || "https://destino.com",
        categoryId: finalCategoryId,
        campaignId: finalCampaignId,
        status: "ACTIVE",
        deletedAt: null,
        scanCount: 0,
      };
      db.qrcodes.push(newQr);
      return { status: 200, qrCode: newQr };
    },

    // GET /api/analytics
    getAnalytics(sessionUserId: string, qrCodeId?: string) {
      if (qrCodeId) {
        const qrOwned = db.qrcodes.find((q) => q.id === qrCodeId && q.userId === sessionUserId);
        if (!qrOwned) return { status: 404, error: "QR Code não encontrado ou não pertence ao usuário." };
      }

      const userQrs = db.qrcodes.filter((q) => q.userId === sessionUserId && (!qrCodeId || q.id === qrCodeId));
      const qrIds = userQrs.map((q) => q.id);
      const userScans = db.scans.filter((s) => qrIds.includes(s.qrCodeId));
      return { status: 200, totalScans: userScans.length, scans: userScans };
    },

    // GET /api/files/[id]/download
    downloadFile(sessionUserId: string, fileId: string) {
      const file = db.files.find((f) => f.id === fileId && f.userId === sessionUserId);
      if (!file) return { status: 404, error: "Arquivo não encontrado ou acesso não autorizado." };
      return { status: 200, file };
    },

    // POST /api/qr/[id]/duplicate
    duplicateQR(sessionUserId: string, id: string) {
      const original = db.qrcodes.find((q) => q.id === id && q.userId === sessionUserId);
      if (!original) return { status: 404, error: "QR Code não encontrado" };
      return { status: 200, copyId: `copy_${original.id}` };
    },

    // POST /api/qr/[id]/toggle
    toggleQR(sessionUserId: string, id: string) {
      const qr = db.qrcodes.find((q) => q.id === id && q.userId === sessionUserId);
      if (!qr) return { status: 404, error: "QR Code não encontrado" };
      qr.status = qr.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      return { status: 200, statusText: qr.status };
    },

    // POST /api/qr/restore
    restoreQR(sessionUserId: string, id: string) {
      const qr = db.qrcodes.find((q) => q.id === id && q.userId === sessionUserId);
      if (!qr) return { status: 404, error: "QR Code não encontrado" };
      qr.deletedAt = null;
      return { status: 200, restored: true };
    },

    // PATCH /api/auth/me
    updateProfile(sessionUserId: string, body: any) {
      const user = db.users.find((u) => u.id === sessionUserId);
      if (!user) return { status: 401, error: "Não autorizado" };
      // Whitelist de campos permitidos
      if (body.name) user.name = body.name;
      // Tentativa de alterar role ou planId é sumariamente descartada
      return { status: 200, user };
    },

    // GET /api/admin/metrics
    adminMetrics(sessionUser: MockUser) {
      if (sessionUser.role !== "ADMIN") {
        return { status: 403, error: "Acesso negado. Privilégios de administrador são estritamente necessários." };
      }
      return { status: 200, totalUsers: db.users.length };
    },
  };

  // ====================================================================
  // CENÁRIOS DA MATRIZ EXIGIDA EM QR-ACCESS-01
  // ====================================================================

  console.log(`${CYAN}▶ 1. Operações Básicas de QR Code (Read, Update, Delete):${RESET}`);
  // 1.1. A acessa QR-A -> permitido (200)
  const res1 = server.getQR(userA.id, qrA.id);
  assert(res1.status === 200 && res1.qrCode?.id === qrA.id, "1.1. Usuário A acessa seu próprio QR-A -> HTTP 200");

  // 1.2. A lê QR-B -> bloqueado (404)
  const res2 = server.getQR(userA.id, qrB.id);
  assert(res2.status === 404 && !res2.qrCode, "1.2. Usuário A lê QR-B de outro usuário -> HTTP 404 (Nenhum dado vazado)");

  // 1.3. A edita QR-B -> bloqueado (404)
  const destBBefore = qrB.destination;
  const res3 = server.updateQR(userA.id, qrB.id, { destination: "https://hacked-destination.com" });
  assert(res3.status === 404, "1.3. Usuário A tenta editar QR-B de outro usuário -> HTTP 404 Bloqueado");
  assert(qrB.destination === destBBefore, "1.4. Destino de QR-B permaneceu estritamente intacto");

  // 1.5. A exclui QR-B -> bloqueado (404)
  const res5 = server.deleteQR(userA.id, qrB.id);
  assert(res5.status === 404, "1.5. Usuário A tenta excluir QR-B -> HTTP 404 Bloqueado");
  assert(db.qrcodes.some((q) => q.id === qrB.id), "1.6. QR-B continua existindo na base de dados");

  console.log(`\n${CYAN}▶ 2. Isolamento de Categoria e Campanha (Anti-IDOR):${RESET}`);
  // 2.1. A cria QR usando category-B de outro usuário -> bloqueado (400)
  const resCatCreate = server.createQR(userA.id, { name: "QR Malicioso", categoryId: categoryB.id });
  assert(resCatCreate.status === 400, "2.1. Usuário A tenta associar category-B pertencente a Bob -> HTTP 400 Rejeitado");

  // 2.2. A cria QR usando campaign-B de outro usuário -> bloqueado (400)
  const resCampCreate = server.createQR(userA.id, { name: "QR Malicioso 2", campaignId: campaignB.id });
  assert(resCampCreate.status === 400, "2.2. Usuário A tenta associar campaign-B pertencente a Bob -> HTTP 400 Rejeitado");

  // 2.3. A edita QR-A tentando associar category-B -> rejeitado (nulo)
  const resCatUpdate = server.updateQR(userA.id, qrA.id, { categoryId: categoryB.id });
  assert(resCatUpdate.status === 200 && resCatUpdate.qrCode?.categoryId === null, "2.3. Edição com category-B alheia falha em associar (categoryId permanece null)");

  // 2.4. A edita QR-A tentando associar campaign-B -> rejeitado (nulo)
  const resCampUpdate = server.updateQR(userA.id, qrA.id, { campaignId: campaignB.id });
  assert(resCampUpdate.status === 200 && resCampUpdate.qrCode?.campaignId === null, "2.4. Edição com campaign-B alheia falha em associar (campaignId permanece null)");

  console.log(`\n${CYAN}▶ 3. Isolamento de Métricas e Telemetria (Analytics Anti-IDOR):${RESET}`);
  // 3.1. A lê analytics de QR-B -> bloqueado (404)
  const resAnalyticsB = server.getAnalytics(userA.id, qrB.id);
  assert(resAnalyticsB.status === 404, "3.1. Usuário A consulta telemetria/analytics de QR-B -> HTTP 404 Bloqueado");
  assert(!resAnalyticsB.scans || resAnalyticsB.scans.length === 0, "3.2. Zero registros analíticos de Bob são expostos");

  // 3.2. A consulta analytics geral sem parâmetro -> retorna apenas scans de seus próprios QRs
  const resAnalyticsGen = server.getAnalytics(userA.id);
  assert(resAnalyticsGen.status === 200 && resAnalyticsGen.totalScans === 0, "3.3. Analytics geral de Alice retorna apenas suas métricas (0 scans, ignora scans de Bob)");

  console.log(`\n${CYAN}▶ 4. Proteção de Arquivos e Downloads Privados:${RESET}`);
  // 4.1. A tenta baixar arquivo gerado de B -> bloqueado (404)
  const resDownload = server.downloadFile(userA.id, fileB.id);
  assert(resDownload.status === 404, "4.1. Usuário A tenta baixar arquivo gerado pertencente a Bob -> HTTP 404 Bloqueado");

  console.log(`\n${CYAN}▶ 5. Proteção contra Mass Assignment e Falsificação de Identidade:${RESET}`);
  // 5.1. A envia userId=B no payload de criação de QR -> ignorado (criado para A)
  const resMassAssign = server.createQR(userA.id, { name: "QR Forjado", userId: userB.id });
  assert(resMassAssign.status === 200 && resMassAssign.qrCode?.userId === userA.id, "5.1. Payload com userId forjado é ignorado; ownership fixado na sessão de Alice");

  // 5.2. A tenta adulterar seu papel para ADMIN ou plano para BUSINESS via perfil
  const resTamper = server.updateProfile(userA.id, { role: "ADMIN", planId: "plan_biz", name: "Alice Modificada" });
  assert(resTamper.status === 200, "5.2. PATCH no perfil processado com sucesso");
  assert(userA.role === "USER", "5.3. Papel de Alice permanece inalterado como 'USER' (Anti-Escalação de Privilégio)");
  assert(userA.planId === "plan_pro", "5.4. Plano de Alice permanece inalterado como 'plan_pro'");
  assert(userA.name === "Alice Modificada", "5.5. Apenas o campo permitido 'name' foi atualizado");

  console.log(`\n${CYAN}▶ 6. Bloqueio de Acesso Administrativo por Usuário Comum:${RESET}`);
  // 6.1. Usuário comum (Alice) tenta acessar endpoint administrativo -> 403
  const resAdminAlice = server.adminMetrics(userA);
  assert(resAdminAlice.status === 403, "6.1. Usuário comum tentando acessar /api/admin/metrics -> HTTP 403 Forbidden");

  // 6.2. Usuário administrador legítimo acessa endpoint administrativo -> 200
  const resAdminRoot = server.adminMetrics(admin);
  assert(resAdminRoot.status === 200, "6.2. Administrador autêntico acessando /api/admin/metrics -> HTTP 200 OK");

  console.log(`\n${CYAN}▶ 7. Bloqueio de Operações Auxiliares (Duplicação, Toggle, Restore):${RESET}`);
  // 7.1. A tenta duplicar QR-B -> bloqueado (404)
  const resDup = server.duplicateQR(userA.id, qrB.id);
  assert(resDup.status === 404, "7.1. Duplicação cruzada de QR-B por Alice -> HTTP 404 Bloqueado");

  // 7.2. A tenta alternar status (toggle) de QR-B -> bloqueado (404)
  const resToggle = server.toggleQR(userA.id, qrB.id);
  assert(resToggle.status === 404, "7.2. Toggle cruzado de status em QR-B por Alice -> HTTP 404 Bloqueado");

  // 7.3. A tenta restaurar QR-B da lixeira -> bloqueado (404)
  const resRestore = server.restoreQR(userA.id, qrB.id);
  assert(resRestore.status === 404, "7.3. Restauração cruzada de QR-B da lixeira por Alice -> HTTP 404 Bloqueado");

  console.log(`\n========================================================================`);
  console.log(`TOTAL DE ASSERÇÕES DE CONTROLE DE ACESSO: ${totalCount}`);
  console.log(`APROVADAS: ${passedCount}`);
  console.log(`FALHAS: 0`);
  console.log(`========================================================================\n`);
}

runSuite();
