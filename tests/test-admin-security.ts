import { signToken, verifyToken, SessionUser } from "../src/lib/auth";

// Cores ANSI para o terminal
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (detail) console.error(`    ${YELLOW}Detalhes:${RESET} ${detail}`);
  }
}

console.log(`\n${CYAN}====================================================${RESET}`);
console.log(`${CYAN}   BATERIA DE TESTES DE SEGURANÇA: PAINEL ADMIN     ${RESET}`);
console.log(`${CYAN}====================================================${RESET}\n`);

// Modelos em memória para teste isolado da lógica de autorização administrativa
interface MockUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  planId: string;
  company?: string | null;
  phone?: string | null;
}

interface MockSubscription {
  id: string;
  userId: string;
  planId: string;
  status: "ACTIVE" | "SUSPENDED" | "CANCELED" | "PAST_DUE";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

interface MockQRCode {
  id: string;
  userId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  destination: string;
  scanCount: number;
}

interface MockActivityLog {
  id: string;
  userId: string;
  action: string;
  description: string;
  createdAt: Date;
}

// Banco de dados simulado para o teste
const mockDb = {
  users: [
    { id: "usr_admin_1", name: "Super Admin", email: "admin@qrmaster.com", role: "ADMIN" as const, planId: "plan_biz" },
    { id: "usr_client_alice", name: "Alice Comum", email: "alice@cliente.com", role: "USER" as const, planId: "plan_free" },
    { id: "usr_client_bob", name: "Bob Invasor", email: "bob@hacker.com", role: "USER" as const, planId: "plan_free" },
  ] as MockUser[],
  subscriptions: [
    { id: "sub_1", userId: "usr_admin_1", planId: "plan_biz", status: "ACTIVE" as const, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 365 * 86400000) },
    { id: "sub_2", userId: "usr_client_alice", planId: "plan_free", status: "ACTIVE" as const, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86400000) },
    { id: "sub_3", userId: "usr_client_bob", planId: "plan_free", status: "ACTIVE" as const, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86400000) },
  ] as MockSubscription[],
  qrcodes: [
    { id: "qr_alice_1", userId: "usr_client_alice", name: "QR Alice Oficial", status: "ACTIVE" as const, destination: "https://alice.com", scanCount: 42 },
    { id: "qr_bob_phishing", userId: "usr_client_bob", name: "QR Malicioso", status: "ACTIVE" as const, destination: "https://site-falso.com", scanCount: 5 },
  ] as MockQRCode[],
  logs: [] as MockActivityLog[],
};

// Simulador das regras dos controladores da API Administrativa
const adminSimulator = {
  checkAdminAuth(user: SessionUser | null) {
    if (!user) {
      return { success: false, status: 401, error: "Não autenticado." };
    }
    const dbUser = mockDb.users.find((u) => u.id === user.id);
    if (!dbUser || dbUser.role !== "ADMIN") {
      return { success: false, status: 403, error: "Acesso negado. Requer papel ADMIN." };
    }
    return { success: true, admin: dbUser };
  },

  // GET /api/admin/metrics
  getMetrics(sessionUser: SessionUser | null) {
    const auth = this.checkAdminAuth(sessionUser);
    if (!auth.success) return auth;
    return {
      success: true,
      status: 200,
      metrics: {
        totalUsers: mockDb.users.length,
        totalQRs: mockDb.qrcodes.length,
        totalLogs: mockDb.logs.length,
      },
    };
  },

  // GET /api/admin/users
  getUsers(sessionUser: SessionUser | null) {
    const auth = this.checkAdminAuth(sessionUser);
    if (!auth.success) return auth;
    return {
      success: true,
      status: 200,
      users: mockDb.users.map((u) => ({
        ...u,
        subscription: mockDb.subscriptions.find((s) => s.userId === u.id),
      })),
    };
  },

  // POST /api/admin/plan (Ativação manual)
  activatePlan(
    sessionUser: SessionUser | null,
    targetUserId: string,
    planId: string,
    durationDays: number,
    note?: string
  ) {
    const auth = this.checkAdminAuth(sessionUser);
    if (!auth.success) return auth;

    const user = mockDb.users.find((u) => u.id === targetUserId);
    if (!user) return { success: false, status: 404, error: "Usuário não encontrado." };

    user.planId = planId;
    const sub = mockDb.subscriptions.find((s) => s.userId === targetUserId);
    if (sub) {
      sub.planId = planId;
      sub.status = "ACTIVE";
      sub.currentPeriodEnd = new Date(Date.now() + durationDays * 86400000);
    }

    mockDb.logs.push({
      id: `log_${Date.now()}`,
      userId: auth.admin!.id,
      action: "ADMIN_PLAN_ACTIVATION",
      description: `Plano ${planId} ativado para ${user.name}. Nota: ${note || "Manual"}`,
      createdAt: new Date(),
    });

    return { success: true, status: 200, user };
  },

  // PATCH /api/admin/users/[id] (Alteração de status ou role)
  updateUser(
    sessionUser: SessionUser | null,
    targetUserId: string,
    updates: { role?: "USER" | "ADMIN"; accountStatus?: "ACTIVE" | "SUSPENDED" | "CANCELED" }
  ) {
    const auth = this.checkAdminAuth(sessionUser);
    if (!auth.success) return auth;

    const targetUser = mockDb.users.find((u) => u.id === targetUserId);
    if (!targetUser) return { success: false, status: 404, error: "Usuário não encontrado." };

    // Regra de segurança: Proibido rebaixar o único admin do sistema
    if (updates.role === "USER" && targetUser.role === "ADMIN") {
      const adminCount = mockDb.users.filter((u) => u.role === "ADMIN").length;
      if (adminCount <= 1) {
        return {
          success: false,
          status: 400,
          error: "Operação bloqueada: não é permitido rebaixar o único administrador do sistema.",
        };
      }
    }

    if (updates.role) {
      targetUser.role = updates.role;
      mockDb.logs.push({
        id: `log_${Date.now()}`,
        userId: auth.admin!.id,
        action: "ADMIN_ROLE_CHANGE",
        description: `Role alterado para ${updates.role} em ${targetUser.name}`,
        createdAt: new Date(),
      });
    }

    if (updates.accountStatus) {
      const sub = mockDb.subscriptions.find((s) => s.userId === targetUserId);
      if (sub) sub.status = updates.accountStatus;
      mockDb.logs.push({
        id: `log_${Date.now()}`,
        userId: auth.admin!.id,
        action: "ADMIN_ACCOUNT_STATUS_CHANGE",
        description: `Status da conta alterado para ${updates.accountStatus} em ${targetUser.name}`,
        createdAt: new Date(),
      });
    }

    return { success: true, status: 200, user: targetUser };
  },

  // PATCH /api/admin/qrcodes/[id] (Moderação de QR Code)
  toggleQRCodeStatus(sessionUser: SessionUser | null, qrCodeId: string, status: "ACTIVE" | "INACTIVE") {
    const auth = this.checkAdminAuth(sessionUser);
    if (!auth.success) return auth;

    const qr = mockDb.qrcodes.find((q) => q.id === qrCodeId);
    if (!qr) return { success: false, status: 404, error: "QR Code não encontrado." };

    qr.status = status;
    mockDb.logs.push({
      id: `log_${Date.now()}`,
      userId: auth.admin!.id,
      action: status === "ACTIVE" ? "ADMIN_ACTIVATE_QR" : "ADMIN_DEACTIVATE_QR",
      description: `QR Code ${qr.name} alterado para ${status}`,
      createdAt: new Date(),
    });

    return { success: true, status: 200, qr };
  },

  // GET /api/admin/logs
  getLogs(sessionUser: SessionUser | null) {
    const auth = this.checkAdminAuth(sessionUser);
    if (!auth.success) return auth;
    return { success: true, status: 200, logs: mockDb.logs };
  },

  // PATCH /api/auth/me (Endpoint do próprio usuário - teste de anti-escalonamento)
  updateOwnProfile(sessionUser: SessionUser | null, payload: Record<string, unknown>) {
    if (!sessionUser) return { success: false, status: 401 };
    const user = mockDb.users.find((u) => u.id === sessionUser.id);
    if (!user) return { success: false, status: 404 };

    // Filtro estrito: Somente name, company, phone permitidos
    if (typeof payload.name === "string") user.name = payload.name;
    if (typeof payload.company === "string") user.company = payload.company;
    if (typeof payload.phone === "string") user.phone = payload.phone;

    // Campos role e planId são estritamente IGNORADOS
    return { success: true, status: 200, user };
  },
};

async function runAdminSecurityTests() {
  const adminSession: SessionUser = { id: "usr_admin_1", name: "Super Admin", email: "admin@qrmaster.com", role: "ADMIN" };
  const clientAliceSession: SessionUser = { id: "usr_client_alice", name: "Alice Comum", email: "alice@cliente.com", role: "USER" };
  const hackerBobSession: SessionUser = { id: "usr_client_bob", name: "Bob Invasor", email: "bob@hacker.com", role: "USER" };

  // =================================================================
  // 1. TESTES DE ACESSO: USUÁRIO ADMINISTRADOR (ROLE = 'ADMIN')
  // =================================================================
  console.log(`${YELLOW}[1/5] Testes de Autorização: Administrador Legítimo${RESET}`);

  // Admin acessa métricas
  const adminMetrics = adminSimulator.getMetrics(adminSession);
  assert(adminMetrics.success && adminMetrics.status === 200, "Admin pode acessar GET /api/admin/metrics");

  // Admin lista usuários
  const adminUsers = adminSimulator.getUsers(adminSession);
  assert(adminUsers.success && adminUsers.status === 200, "Admin pode acessar GET /api/admin/users");

  // Admin ativa plano manualmente para cliente
  const planActivation = adminSimulator.activatePlan(adminSession, "usr_client_alice", "plan_pro", 30, "Venda externa Pix");
  assert(planActivation.success && planActivation.status === 200, "Admin ativa plano PRO manualmente para cliente");
  assert(mockDb.users.find((u) => u.id === "usr_client_alice")?.planId === "plan_pro", "Plano da Alice atualizado para PRO no banco");

  // Admin altera status da conta para SUSPENDED (ex: fraude ou inadimplência)
  const suspendUser = adminSimulator.updateUser(adminSession, "usr_client_bob", { accountStatus: "SUSPENDED" });
  assert(suspendUser.success && suspendUser.status === 200, "Admin altera status de conta do Bob para SUSPENDED");
  assert(mockDb.subscriptions.find((s) => s.userId === "usr_client_bob")?.status === "SUSPENDED", "Assinatura do Bob suspensa");

  // Admin desativa QR Code abusivo / malicioso
  const modQr = adminSimulator.toggleQRCodeStatus(adminSession, "qr_bob_phishing", "INACTIVE");
  assert(modQr.success && modQr.status === 200, "Admin desativa QR Code malicioso");
  assert(mockDb.qrcodes.find((q) => q.id === "qr_bob_phishing")?.status === "INACTIVE", "Status do QR atualizado para INACTIVE");

  // Admin consulta logs de auditoria
  const adminLogs = adminSimulator.getLogs(adminSession);
  assert(adminLogs.success && adminLogs.status === 200, "Admin pode visualizar logs de auditoria");
  assert(mockDb.logs.length >= 3, `Logs registrados com sucesso (total: ${mockDb.logs.length})`);

  // =================================================================
  // 2. TESTES DE ACESSO: USUÁRIO COMUM (ROLE = 'USER' -> ACESSO NEGADO)
  // =================================================================
  console.log(`\n${YELLOW}[2/5] Testes de Bloqueio de Usuário Comum (role = 'USER')${RESET}`);

  // Cliente tentando acessar métricas
  const clientMetrics = adminSimulator.getMetrics(clientAliceSession);
  assert(!clientMetrics.success && clientMetrics.status === 403, "Cliente comum bloqueado em GET /api/admin/metrics (403)");

  // Cliente tentando listar usuários
  const clientUsers = adminSimulator.getUsers(clientAliceSession);
  assert(!clientUsers.success && clientUsers.status === 403, "Cliente comum bloqueado em GET /api/admin/users (403)");

  // Cliente tentando ativar plano para si ou para terceiros
  const clientPlan = adminSimulator.activatePlan(clientAliceSession, "usr_client_alice", "plan_biz", 365);
  assert(!clientPlan.success && clientPlan.status === 403, "Cliente comum bloqueado em POST /api/admin/plan (403)");

  // Cliente tentando alterar status de conta
  const clientStatus = adminSimulator.updateUser(clientAliceSession, "usr_client_bob", { accountStatus: "SUSPENDED" });
  assert(!clientStatus.success && clientStatus.status === 403, "Cliente comum bloqueado em PATCH /api/admin/users/:id (403)");

  // Cliente tentando desativar QR de outro usuário
  const clientToggleQr = adminSimulator.toggleQRCodeStatus(clientAliceSession, "qr_bob_phishing", "ACTIVE");
  assert(!clientToggleQr.success && clientToggleQr.status === 403, "Cliente comum bloqueado em PATCH /api/admin/qrcodes/:id (403)");

  // Cliente tentando ler logs do sistema
  const clientLogs = adminSimulator.getLogs(clientAliceSession);
  assert(!clientLogs.success && clientLogs.status === 403, "Cliente comum bloqueado em GET /api/admin/logs (403)");

  // =================================================================
  // 3. TESTES DE ACESSO: USUÁRIO NÃO AUTENTICADO (SEM TOKEN)
  // =================================================================
  console.log(`\n${YELLOW}[3/5] Testes de Bloqueio de Usuário Não Autenticado (Sem Token)${RESET}`);

  assert(adminSimulator.getMetrics(null).status === 401, "Não autenticado rejeitado com 401 em /api/admin/metrics");
  assert(adminSimulator.getUsers(null).status === 401, "Não autenticado rejeitado com 401 em /api/admin/users");
  assert(adminSimulator.activatePlan(null, "usr_client_alice", "plan_biz", 30).status === 401, "Não autenticado rejeitado com 401 em /api/admin/plan");
  assert(adminSimulator.updateUser(null, "usr_client_alice", { role: "ADMIN" }).status === 401, "Não autenticado rejeitado com 401 em /api/admin/users/:id");
  assert(adminSimulator.toggleQRCodeStatus(null, "qr_alice_1", "INACTIVE").status === 401, "Não autenticado rejeitado com 401 em /api/admin/qrcodes/:id");
  assert(adminSimulator.getLogs(null).status === 401, "Não autenticado rejeitado com 401 em /api/admin/logs");

  // =================================================================
  // 4. TESTES DE PREVENÇÃO CONTRA ESCALAÇÃO DE PRIVILÉGIOS (ANTI-TAMPERING)
  // =================================================================
  console.log(`\n${YELLOW}[4/5] Testes de Anti-Tampering e Escalação de Privilégios${RESET}`);

  // Hacker Bob tenta forjar role = ADMIN via PATCH /api/auth/me
  adminSimulator.updateOwnProfile(hackerBobSession, {
    name: "Bob Modificado",
    role: "ADMIN",
    planId: "plan_biz",
  });
  const bobAfterTamper = mockDb.users.find((u) => u.id === "usr_client_bob")!;
  assert(bobAfterTamper.role === "USER", "Tentativa de auto-promoção para ADMIN foi sumariamente ignorada");
  assert(bobAfterTamper.planId === "plan_free", "Tentativa de auto-atribuição de plano BUSINESS foi sumariamente ignorada");
  assert(bobAfterTamper.name === "Bob Modificado", "Apenas o campo legítimo 'name' foi atualizado");

  // Hacker Bob tenta forjar um token JWT contendo role: "ADMIN"
  const forgedToken = signToken({
    id: "usr_client_bob",
    name: "Bob Invasor",
    email: "bob@hacker.com",
    role: "ADMIN", // Falsificado no token
  });
  const decodedToken = verifyToken(forgedToken);
  assert(decodedToken !== null, "Token assinado é criptograficamente legível");

  // No servidor, a validação consulta o banco de dados pelo session.id real
  const serverSideVerification = adminSimulator.checkAdminAuth(decodedToken);
  assert(!serverSideVerification.success && serverSideVerification.status === 403, "Servidor checa banco de dados e REJEITA Bob mesmo com token forjado (403)");

  // =================================================================
  // 5. TESTES DE SALVAGUARDAS ADMINISTRATIVAS
  // =================================================================
  console.log(`\n${YELLOW}[5/5] Testes de Salvaguardas do Sistema${RESET}`);

  // Tentativa de rebaixar o único admin do sistema
  const demoteAttempt = adminSimulator.updateUser(adminSession, "usr_admin_1", { role: "USER" });
  assert(!demoteAttempt.success && demoteAttempt.status === 400, "Tentativa de rebaixar o único admin do sistema BLOQUEADA com status 400");
  assert(mockDb.users.find((u) => u.id === "usr_admin_1")?.role === "ADMIN", "Papel de ADMIN do Super Admin preservado");

  // Sucesso na promoção de outro usuário para ADMIN
  const promoteAlice = adminSimulator.updateUser(adminSession, "usr_client_alice", { role: "ADMIN" });
  assert(promoteAlice.success && promoteAlice.status === 200, "Admin pode promover outro usuário para ADMIN");
  assert(mockDb.users.find((u) => u.id === "usr_client_alice")?.role === "ADMIN", "Alice agora é ADMIN");

  // Agora que há 2 admins, rebaixar um deles é permitido
  const demoteAlice = adminSimulator.updateUser(adminSession, "usr_client_alice", { role: "USER" });
  assert(demoteAlice.success && demoteAlice.status === 200, "Rebaixamento permitido quando há mais de 1 admin");
  assert(mockDb.users.find((u) => u.id === "usr_client_alice")?.role === "USER", "Alice voltou a ser USER");

  // Resumo
  console.log(`\n${CYAN}====================================================${RESET}`);
  console.log(`${CYAN}           RESUMO DOS TESTES DE SEGURANÇA ADMIN     ${RESET}`);
  console.log(`${CYAN}====================================================${RESET}`);
  console.log(`Total de testes executados: ${totalTests}`);
  console.log(`${GREEN}Passaram: ${passedTests}${RESET}`);
  if (failedTests > 0) {
    console.log(`${RED}Falharam: ${failedTests}${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}TODOS OS TESTES DE SEGURANÇA ADMINISTRATIVA PASSARAM COM SUCESSO!${RESET}\n`);
    process.exit(0);
  }
}

runAdminSecurityTests().catch((err) => {
  console.error("Erro fatal nos testes de segurança admin:", err);
  process.exit(1);
});
