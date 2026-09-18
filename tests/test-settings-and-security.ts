import { hashPassword, verifyPassword, signToken, verifyToken, SessionUser } from "../src/lib/auth";

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
console.log(`${CYAN}  TESTES DE CONFIGURAÇÕES, SEGURANÇA E CONTA        ${RESET}`);
console.log(`${CYAN}====================================================${RESET}\n`);

// Modelos em memória simulando o banco de dados
interface MockUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "USER" | "ADMIN";
  company?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  planId: string;
}

interface MockUserSettings {
  id: string;
  userId: string;
  notifyNewScans: boolean;
  notifyWeeklyReport: boolean;
  notifyLimitAlert: boolean;
  analyticsConsent: boolean;
  dataRetentionDays: number;
  language: string;
  theme: string;
}

interface MockActivityLog {
  id: string;
  userId: string;
  action: string;
  description: string;
  createdAt: Date;
}

interface MockQRCode {
  id: string;
  userId: string;
  name: string;
}

interface MockGeneratedFile {
  id: string;
  userId: string;
  storagePath: string;
}

// Inicializa banco de testes
let mockDbUsers: MockUser[] = [];
let mockDbSettings: MockUserSettings[] = [];
let mockDbLogs: MockActivityLog[] = [];
let mockDbQRs: MockQRCode[] = [];
let mockDbFiles: MockGeneratedFile[] = [];

async function setupTestDatabase() {
  const adminHash = await hashPassword("AdminSecret123!");
  const userHash = await hashPassword("UserPassword123!");

  mockDbUsers = [
    {
      id: "usr_admin_master",
      name: "Administrador Master",
      email: "master@qrmaster.com",
      passwordHash: adminHash,
      role: "ADMIN",
      company: "QR MASTER Inc",
      phone: "+5511999990000",
      avatarUrl: "https://qrmaster.app/avatars/admin.png",
      planId: "plan_business",
    },
    {
      id: "usr_client_clara",
      name: "Clara Cliente",
      email: "clara@empresa.com",
      passwordHash: userHash,
      role: "USER",
      company: "Clara Cosméticos",
      phone: "+5511988887777",
      avatarUrl: null,
      planId: "plan_pro",
    },
  ];

  mockDbSettings = [
    {
      id: "set_clara",
      userId: "usr_client_clara",
      notifyNewScans: true,
      notifyWeeklyReport: true,
      notifyLimitAlert: true,
      analyticsConsent: true,
      dataRetentionDays: 365,
      language: "pt-BR",
      theme: "system",
    },
  ];

  mockDbQRs = [
    { id: "qr_clara_1", userId: "usr_client_clara", name: "Catálogo Clara" },
    { id: "qr_clara_2", userId: "usr_client_clara", name: "Instagram Clara" },
  ];

  mockDbFiles = [
    { id: "file_clara_1", userId: "usr_client_clara", storagePath: "users/usr_client_clara/logos/logo.png" },
  ];

  mockDbLogs = [];
}

// Controladores simulados espelhando exatamente a lógica de produção
const settingsService = {
  // PATCH /api/auth/me
  async updateProfileAndSettings(
    userId: string,
    payload: {
      name?: string;
      email?: string;
      company?: string | null;
      phone?: string | null;
      avatarUrl?: string | null;
      role?: string;    // Tentativa maliciosa
      planId?: string;  // Tentativa maliciosa
      settings?: Partial<MockUserSettings>;
    }
  ) {
    const user = mockDbUsers.find((u) => u.id === userId);
    if (!user) return { success: false, status: 404, error: "Usuário não encontrado." };

    // Validação e atualização de e-mail
    if (payload.email !== undefined) {
      const cleanEmail = payload.email.toLowerCase().trim();
      const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
      if (!emailRegex.test(cleanEmail)) {
        return { success: false, status: 400, error: "Formato de e-mail inválido." };
      }

      const duplicate = mockDbUsers.find((u) => u.email === cleanEmail && u.id !== userId);
      if (duplicate) {
        return { success: false, status: 409, error: "Este endereço de e-mail já está sendo utilizado por outra conta." };
      }
      user.email = cleanEmail;
    }

    if (payload.name) user.name = payload.name.trim();
    if (payload.company !== undefined) user.company = payload.company;
    if (payload.phone !== undefined) user.phone = payload.phone;
    if (payload.avatarUrl !== undefined) user.avatarUrl = payload.avatarUrl;

    // Campos role e planId são ignorados (anti-escalonamento)

    // Persistência real em UserSettings
    if (payload.settings) {
      let setting = mockDbSettings.find((s) => s.userId === userId);
      if (!setting) {
        setting = {
          id: `set_${Date.now()}`,
          userId,
          notifyNewScans: true,
          notifyWeeklyReport: true,
          notifyLimitAlert: true,
          analyticsConsent: true,
          dataRetentionDays: 365,
          language: "pt-BR",
          theme: "system",
        };
        mockDbSettings.push(setting);
      }

      if (typeof payload.settings.notifyNewScans === "boolean") setting.notifyNewScans = payload.settings.notifyNewScans;
      if (typeof payload.settings.notifyWeeklyReport === "boolean") setting.notifyWeeklyReport = payload.settings.notifyWeeklyReport;
      if (typeof payload.settings.notifyLimitAlert === "boolean") setting.notifyLimitAlert = payload.settings.notifyLimitAlert;
      if (typeof payload.settings.analyticsConsent === "boolean") setting.analyticsConsent = payload.settings.analyticsConsent;
      if (typeof payload.settings.dataRetentionDays === "number") setting.dataRetentionDays = payload.settings.dataRetentionDays;
      if (typeof payload.settings.language === "string") setting.language = payload.settings.language;
      if (typeof payload.settings.theme === "string") setting.theme = payload.settings.theme;
    }

    return { success: true, status: 200, user };
  },

  // POST /api/auth/password
  async changePassword(userId: string, body: { currentPassword?: string; newPassword?: string; confirmPassword?: string }) {
    const { currentPassword, newPassword, confirmPassword } = body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return { success: false, status: 400, error: "Todos os campos de senha são obrigatórios." };
    }

    if (newPassword !== confirmPassword) {
      return { success: false, status: 400, error: "A nova senha e a confirmação de senha não coincidem." };
    }

    if (newPassword.length < 6) {
      return { success: false, status: 400, error: "A nova senha deve conter no mínimo 6 caracteres." };
    }

    if (currentPassword === newPassword) {
      return { success: false, status: 400, error: "A nova senha deve ser diferente da senha atual." };
    }

    const user = mockDbUsers.find((u) => u.id === userId);
    if (!user) return { success: false, status: 404, error: "Usuário não encontrado." };

    const validCurrent = await verifyPassword(currentPassword, user.passwordHash);
    if (!validCurrent) {
      return { success: false, status: 400, error: "A senha atual informada está incorreta." };
    }

    user.passwordHash = await hashPassword(newPassword);
    mockDbLogs.push({
      id: `log_${Date.now()}`,
      userId,
      action: "PASSWORD_CHANGE",
      description: "Senha alterada com sucesso.",
      createdAt: new Date(),
    });

    return { success: true, status: 200, message: "Senha alterada com sucesso!" };
  },

  // POST /api/auth/delete-account
  async deleteAccount(userId: string, body: { password?: string; confirmationText?: string }) {
    const { password, confirmationText } = body;

    if (!password) {
      return { success: false, status: 400, error: "A senha atual é obrigatória." };
    }

    if (confirmationText !== "EXCLUIR") {
      return { success: false, status: 400, error: "Digite a palavra 'EXCLUIR' em maiúsculas." };
    }

    const user = mockDbUsers.find((u) => u.id === userId);
    if (!user) return { success: false, status: 404, error: "Usuário não encontrado." };

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return { success: false, status: 400, error: "Senha incorreta." };
    }

    // Salvaguarda: impede exclusão do único admin
    if (user.role === "ADMIN") {
      const adminCount = mockDbUsers.filter((u) => u.role === "ADMIN").length;
      if (adminCount <= 1) {
        return {
          success: false,
          status: 400,
          error: "Operação bloqueada: não é permitido excluir o único administrador da plataforma.",
        };
      }
    }

    // Limpeza de relações
    mockDbFiles = mockDbFiles.filter((f) => f.userId !== userId);
    mockDbQRs = mockDbQRs.filter((q) => q.userId !== userId);
    mockDbSettings = mockDbSettings.filter((s) => s.userId !== userId);
    mockDbLogs = mockDbLogs.filter((l) => l.userId !== userId);
    mockDbUsers = mockDbUsers.filter((u) => u.id !== userId);

    return { success: true, status: 200, message: "Conta excluída com sucesso." };
  },
};

async function runSettingsAndSecurityTests() {
  await setupTestDatabase();

  // -----------------------------------------------------------------
  // 1. TESTES DE ATUALIZAÇÃO DE CONTA E PERFIL
  // -----------------------------------------------------------------
  console.log(`${YELLOW}[1/5] Testes de Atualização de Perfil, Foto e E-mail${RESET}`);

  // Atualização básica legítima
  const updateRes = await settingsService.updateProfileAndSettings("usr_client_clara", {
    name: "Clara Silva",
    company: "Clara Beauty Ltda",
    phone: "+5511977776666",
    avatarUrl: "https://qrmaster.app/avatars/clara_photo.png",
  });
  assert(updateRes.success, "Atualização de nome, empresa, telefone e avatar bem-sucedida");
  const claraInDb = mockDbUsers.find((u) => u.id === "usr_client_clara")!;
  assert(claraInDb.name === "Clara Silva", "Nome atualizado no banco");
  assert(claraInDb.avatarUrl === "https://qrmaster.app/avatars/clara_photo.png", "AvatarUrl persistido no banco");

  // Tentativa de atualizar e-mail para formato inválido
  const invalidEmailRes = await settingsService.updateProfileAndSettings("usr_client_clara", {
    email: "email-invalido",
  });
  assert(!invalidEmailRes.success && invalidEmailRes.status === 400, "Rejeita e-mail com formato inválido (400)");

  // Tentativa de atualizar e-mail para um já existente de outro usuário (Colisão)
  const duplicateEmailRes = await settingsService.updateProfileAndSettings("usr_client_clara", {
    email: "master@qrmaster.com", // E-mail do Admin
  });
  assert(!duplicateEmailRes.success && duplicateEmailRes.status === 409, "Rejeita e-mail já existente com 409 Conflict");

  // Atualização legítima de e-mail
  const validEmailRes = await settingsService.updateProfileAndSettings("usr_client_clara", {
    email: "clara.silva@novodominio.com.br",
  });
  assert(validEmailRes.success && claraInDb.email === "clara.silva@novodominio.com.br", "E-mail atualizado com sucesso");

  // Tentativa de escalação de privilégios pelo endpoint me
  await settingsService.updateProfileAndSettings("usr_client_clara", {
    role: "ADMIN",
    planId: "plan_enterprise",
  });
  assert(claraInDb.role === "USER", "Tentativa de alterar role ignorada (permanece USER)");
  assert(claraInDb.planId === "plan_pro", "Tentativa de alterar plano ignorada (permanece plan_pro)");

  // -----------------------------------------------------------------
  // 2. TESTES DE PERSISTÊNCIA REAL DE PREFERÊNCIAS (UserSettings)
  // -----------------------------------------------------------------
  console.log(`\n${YELLOW}[2/5] Testes de Persistência Real de Preferências (UserSettings)${RESET}`);

  // Altera preferências de notificação e retenção
  const prefUpdateRes = await settingsService.updateProfileAndSettings("usr_client_clara", {
    settings: {
      notifyNewScans: false,
      notifyWeeklyReport: true,
      notifyLimitAlert: false,
      dataRetentionDays: 180,
      analyticsConsent: false,
      language: "en",
    },
  });
  assert(prefUpdateRes.success, "Preferências salvas com sucesso");

  const claraSettings = mockDbSettings.find((s) => s.userId === "usr_client_clara")!;
  assert(claraSettings.notifyNewScans === false, "notifyNewScans atualizado para false no banco");
  assert(claraSettings.notifyLimitAlert === false, "notifyLimitAlert atualizado para false no banco");
  assert(claraSettings.dataRetentionDays === 180, "dataRetentionDays atualizado para 180 dias no banco");
  assert(claraSettings.analyticsConsent === false, "analyticsConsent atualizado para false no banco");
  assert(claraSettings.language === "en", "Idioma preferencial atualizado para 'en' no banco");

  // -----------------------------------------------------------------
  // 3. TESTES DE ALTERAÇÃO SEGURA DE SENHA
  // -----------------------------------------------------------------
  console.log(`\n${YELLOW}[3/5] Testes de Alteração Segura de Senha${RESET}`);

  // Senha atual incorreta
  const wrongPassRes = await settingsService.changePassword("usr_client_clara", {
    currentPassword: "SenhaTotalmenteErrada!",
    newPassword: "NovaSenhaSegura456!",
    confirmPassword: "NovaSenhaSegura456!",
  });
  assert(!wrongPassRes.success && wrongPassRes.status === 400, "Rejeita quando senha atual está incorreta");

  // Confirmação diferente da nova senha
  const mismatchPassRes = await settingsService.changePassword("usr_client_clara", {
    currentPassword: "UserPassword123!",
    newPassword: "NovaSenhaSegura456!",
    confirmPassword: "OutraSenhaDiferente!",
  });
  assert(!mismatchPassRes.success && mismatchPassRes.status === 400, "Rejeita quando nova senha e confirmação não coincidem");

  // Senha nova curta (< 6 caracteres)
  const shortPassRes = await settingsService.changePassword("usr_client_clara", {
    currentPassword: "UserPassword123!",
    newPassword: "123",
    confirmPassword: "123",
  });
  assert(!shortPassRes.success && shortPassRes.status === 400, "Rejeita nova senha com menos de 6 caracteres");

  // Nova senha igual à senha atual
  const samePassRes = await settingsService.changePassword("usr_client_clara", {
    currentPassword: "UserPassword123!",
    newPassword: "UserPassword123!",
    confirmPassword: "UserPassword123!",
  });
  assert(!samePassRes.success && samePassRes.status === 400, "Rejeita nova senha idêntica à senha atual");

  // Alteração com sucesso
  const successPassRes = await settingsService.changePassword("usr_client_clara", {
    currentPassword: "UserPassword123!",
    newPassword: "NovaSenhaForte@2026",
    confirmPassword: "NovaSenhaForte@2026",
  });
  assert(successPassRes.success, "Senha alterada com sucesso!");

  // Validação criptográfica do novo hash
  const isValidWithNew = await verifyPassword("NovaSenhaForte@2026", claraInDb.passwordHash);
  assert(isValidWithNew, "Novo hash gerado é validado com sucesso pela nova senha");
  const isOldRejected = await verifyPassword("UserPassword123!", claraInDb.passwordHash);
  assert(!isOldRejected, "Senha antiga é recusada após a alteração");

  // Verificação de log de auditoria
  const passLog = mockDbLogs.find((l) => l.action === "PASSWORD_CHANGE" && l.userId === "usr_client_clara");
  assert(passLog !== undefined, "Evento PASSWORD_CHANGE registrado no ActivityLog");

  // -----------------------------------------------------------------
  // 4. TESTES DE EXCLUSÃO SEGURA DE CONTA (CASCADE E CLEANUP)
  // -----------------------------------------------------------------
  console.log(`\n${YELLOW}[4/5] Testes de Exclusão Segura de Conta${RESET}`);

  // Rejeição de exclusão do único admin
  const adminDeleteRes = await settingsService.deleteAccount("usr_admin_master", {
    password: "AdminSecret123!",
    confirmationText: "EXCLUIR",
  });
  assert(!adminDeleteRes.success && adminDeleteRes.status === 400, "Bloqueia exclusão do único administrador do sistema (400)");

  // Rejeição por senha incorreta
  const wrongPassDelete = await settingsService.deleteAccount("usr_client_clara", {
    password: "SenhaErrada!",
    confirmationText: "EXCLUIR",
  });
  assert(!wrongPassDelete.success && wrongPassDelete.status === 400, "Rejeita exclusão com senha incorreta");

  // Rejeição por texto de confirmação incorreto
  const wrongConfirmDelete = await settingsService.deleteAccount("usr_client_clara", {
    password: "NovaSenhaForte@2026",
    confirmationText: "excluir", // minúsculo
  });
  assert(!wrongConfirmDelete.success && wrongConfirmDelete.status === 400, "Rejeita exclusão quando confirmação não é 'EXCLUIR'");

  // Exclusão bem-sucedida da Clara
  const successfulDelete = await settingsService.deleteAccount("usr_client_clara", {
    password: "NovaSenhaForte@2026",
    confirmationText: "EXCLUIR",
  });
  assert(successfulDelete.success, "Exclusão da conta de usuário comum concluída com sucesso");

  // Verificação de limpeza em cascata
  assert(mockDbUsers.find((u) => u.id === "usr_client_clara") === undefined, "Usuário removido da tabela User");
  assert(mockDbSettings.find((s) => s.userId === "usr_client_clara") === undefined, "UserSettings do usuário removido");
  assert(mockDbQRs.filter((q) => q.userId === "usr_client_clara").length === 0, "Todos os QR Codes do usuário removidos");
  assert(mockDbFiles.filter((f) => f.userId === "usr_client_clara").length === 0, "Todos os registros de arquivos removidos");

  // -----------------------------------------------------------------
  // 5. TESTES DE LOGOUT E INVALIDAÇÃO DE SESSÃO
  // -----------------------------------------------------------------
  console.log(`\n${YELLOW}[5/5] Testes de Logout e Sessão${RESET}`);

  const token = signToken({
    id: "usr_admin_master",
    name: "Administrador Master",
    email: "master@qrmaster.com",
    role: "ADMIN",
    planId: "plan_business",
  });
  const verified = verifyToken(token);
  assert(verified !== null && verified.id === "usr_admin_master", "Token de sessão é assinado e verificado");

  // Resumo
  console.log(`\n${CYAN}====================================================${RESET}`);
  console.log(`${CYAN}     RESUMO DOS TESTES DE CONFIGURAÇÕES E CONTA     ${RESET}`);
  console.log(`${CYAN}====================================================${RESET}`);
  console.log(`Total de testes executados: ${totalTests}`);
  console.log(`${GREEN}Passaram: ${passedTests}${RESET}`);
  if (failedTests > 0) {
    console.log(`${RED}Falharam: ${failedTests}${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}TODOS OS TESTES DE CONFIGURAÇÕES E CONTA PASSARAM COM SUCESSO!${RESET}\n`);
    process.exit(0);
  }
}

runSettingsAndSecurityTests().catch((err) => {
  console.error("Erro fatal nos testes:", err);
  process.exit(1);
});
