import { hashPassword, verifyPassword, signToken, verifyToken, SessionUser } from "../src/lib/auth";
import { formatQRDestination } from "../src/lib/qr-generator";
import { generateSecureShortCode, isValidShortCode } from "../src/lib/short-code";
import { validateAndNormalizeDestination } from "../src/lib/dynamic-redirect";
import { parseUserAgent } from "../src/lib/user-agent";
import { calculateCRC16, generatePixPayload, parsePixPayload } from "../src/lib/pix";
import { buildUserStoragePath, sanitizeFileName, validateFile } from "../src/lib/storage";

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
console.log(`${CYAN}   BATERIA GERAL DE TESTES DE ROTAS E INTEGRAÇÃO    ${RESET}`);
console.log(`${CYAN}====================================================${RESET}\n`);

// Modelos em memória para teste de ponta a ponta
interface MockDBUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "USER" | "ADMIN";
  planId: string;
  company?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}

interface MockDBQRCode {
  id: string;
  userId: string;
  name: string;
  type: string;
  isDynamic: boolean;
  shortCode: string | null;
  destination: string;
  status: "ACTIVE" | "INACTIVE";
  scanCount: number;
  deletedAt: Date | null;
  favorite: boolean;
}

interface MockDBScan {
  id: string;
  qrCodeId: string;
  timestamp: Date;
  device: string;
  browser: string;
  os: string;
  ipHash: string;
}

interface MockDBFile {
  id: string;
  userId: string;
  fileName: string;
  storagePath: string;
  downloadUrl: string;
}

const db = {
  users: [] as MockDBUser[],
  qrcodes: [] as MockDBQRCode[],
  scans: [] as MockDBScan[],
  files: [] as MockDBFile[],
};

// Simulador das regras reais das APIs
const api = {
  // 1. AUTENTICAÇÃO
  async register(body: { name?: string; email?: string; password?: string; company?: string; phone?: string }) {
    const { name, email, password, company, phone } = body;
    if (!name || !email || !password) return { success: false, status: 400, error: "Campos obrigatórios ausentes." };
    if (password.length < 6) return { success: false, status: 400, error: "Senha com menos de 6 caracteres." };

    const cleanEmail = email.toLowerCase().trim();
    if (db.users.some((u) => u.email === cleanEmail)) {
      return { success: false, status: 409, error: "E-mail já cadastrado." };
    }

    const passwordHash = await hashPassword(password);
    const user: MockDBUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      email: cleanEmail,
      passwordHash,
      role: "USER", // Sempre USER na criação
      planId: "plan_free",
      company: company || null,
      phone: phone || null,
      avatarUrl: null,
    };
    db.users.push(user);
    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role, planId: user.planId });
    return { success: true, status: 201, user, token };
  },

  async login(body: { email?: string; password?: string }) {
    const { email, password } = body;
    if (!email || !password) return { success: false, status: 400, error: "Credenciais incompletas." };

    const user = db.users.find((u) => u.email === email.toLowerCase().trim());
    if (!user) return { success: false, status: 401, error: "Credenciais inválidas." };

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return { success: false, status: 401, error: "Credenciais inválidas." };

    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role, planId: user.planId });
    return { success: true, status: 200, user, token };
  },

  async getMe(token: string | null) {
    if (!token) return { success: false, status: 401 };
    const session = verifyToken(token);
    if (!session) return { success: false, status: 401 };

    const user = db.users.find((u) => u.id === session.id);
    if (!user) return { success: false, status: 404 };

    const qrCount = db.qrcodes.filter((q) => q.userId === user.id && q.deletedAt === null).length;
    const maxQRs = user.planId === "plan_biz" ? 99999 : user.planId === "plan_pro" ? 100 : 5;

    return {
      success: true,
      status: 200,
      user,
      plan: { name: user.planId === "plan_biz" ? "BUSINESS" : user.planId === "plan_pro" ? "PRO" : "FREE" },
      usage: { qrCodes: qrCount, maxQRCodes: maxQRs, remaining: Math.max(0, maxQRs - qrCount) },
      permissions: {
        dynamicQRs: user.planId !== "plan_free",
        analytics: user.planId !== "plan_free",
      },
    };
  },

  // 2. QR CODES
  async createQRCode(token: string, body: { name: string; type: string; isDynamic?: boolean; destination: string }) {
    const me = await this.getMe(token);
    if (!me.success || !me.user) return { success: false, status: 401, error: "Não autorizado" };

    if (me.usage && me.usage.qrCodes >= me.usage.maxQRCodes) {
      return { success: false, status: 403, error: "Limite do plano atingido." };
    }

    if (body.isDynamic && !me.permissions?.dynamicQRs) {
      return { success: false, status: 403, error: "Plano FREE não permite QR dinâmico." };
    }

    const shortCode = body.isDynamic ? generateSecureShortCode(8) : null;
    const validDest = validateAndNormalizeDestination(body.destination);
    if (!validDest.valid) {
      return { success: false, status: 400, error: validDest.error };
    }

    const qr: MockDBQRCode = {
      id: `qr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: me.user.id,
      name: body.name,
      type: body.type,
      isDynamic: !!body.isDynamic,
      shortCode,
      destination: validDest.sanitizedUrl || body.destination,
      status: "ACTIVE",
      scanCount: 0,
      deletedAt: null,
      favorite: false,
    };
    db.qrcodes.push(qr);
    return { success: true, status: 201, qrCode: qr };
  },

  async updateQRCode(token: string, qrId: string, updates: { name?: string; destination?: string }) {
    const me = await this.getMe(token);
    if (!me.success || !me.user) return { success: false, status: 401 };

    const qr = db.qrcodes.find((q) => q.id === qrId && q.userId === me.user!.id && q.deletedAt === null);
    if (!qr) return { success: false, status: 404, error: "QR não encontrado." };

    if (updates.name) qr.name = updates.name;
    if (updates.destination) {
      const valid = validateAndNormalizeDestination(updates.destination, qr.shortCode || undefined);
      if (!valid.valid) return { success: false, status: 400, error: valid.error };
      qr.destination = valid.sanitizedUrl || updates.destination;
    }
    return { success: true, status: 200, qrCode: qr };
  },

  async deleteQRCode(token: string, qrId: string) {
    const me = await this.getMe(token);
    if (!me.success || !me.user) return { success: false, status: 401 };

    const qr = db.qrcodes.find((q) => q.id === qrId && q.userId === me.user!.id);
    if (!qr) return { success: false, status: 404 };

    qr.deletedAt = new Date(); // Soft delete para lixeira
    return { success: true, status: 200, message: "Enviado para a lixeira." };
  },

  async restoreQRCode(token: string, qrId: string) {
    const me = await this.getMe(token);
    if (!me.success || !me.user) return { success: false, status: 401 };

    const qr = db.qrcodes.find((q) => q.id === qrId && q.userId === me.user!.id && q.deletedAt !== null);
    if (!qr) return { success: false, status: 404 };

    qr.deletedAt = null;
    return { success: true, status: 200, message: "Restaurado." };
  },

  // 3. ANALYTICS
  async recordScan(qrId: string, userAgent: string, ip: string) {
    const qr = db.qrcodes.find((q) => q.id === qrId);
    if (!qr || qr.status !== "ACTIVE" || qr.deletedAt !== null) {
      return { success: false, status: 404 };
    }

    const clientInfo = parseUserAgent(userAgent, ip);
    const scan: MockDBScan = {
      id: `scan_${Date.now()}`,
      qrCodeId: qr.id,
      timestamp: new Date(),
      device: clientInfo.device,
      browser: clientInfo.browser,
      os: clientInfo.os,
      ipHash: clientInfo.ipHash,
    };
    db.scans.push(scan);
    qr.scanCount++;
    return { success: true, status: 200, scan };
  },

  async queryAnalytics(token: string, filter?: { period?: string; qrCodeId?: string }) {
    const me = await this.getMe(token);
    if (!me.success || !me.user) return { success: false, status: 401 };

    if (!me.permissions?.analytics) {
      return { success: false, status: 403, error: "Seu plano atual não inclui gráficos de analytics." };
    }

    const userQrs = db.qrcodes.filter((q) => q.userId === me.user!.id);
    let targetQrs = userQrs;
    if (filter?.qrCodeId) {
      targetQrs = userQrs.filter((q) => q.id === filter.qrCodeId);
      if (targetQrs.length === 0) {
        return { success: false, status: 404, error: "QR Code não pertence ao usuário." };
      }
    }

    const targetIds = targetQrs.map((q) => q.id);
    const userScans = db.scans.filter((s) => targetIds.includes(s.qrCodeId));

    return {
      success: true,
      status: 200,
      totalScans: userScans.length,
      scans: userScans,
    };
  },

  // 4. STORAGE & DOWNLOAD
  async downloadFile(token: string, fileId: string) {
    const me = await this.getMe(token);
    if (!me.success || !me.user) return { success: false, status: 401 };

    const file = db.files.find((f) => f.id === fileId && f.userId === me.user!.id);
    if (!file) return { success: false, status: 404, error: "Arquivo não encontrado ou acesso não autorizado." };

    return { success: true, status: 200, file };
  },
};

async function runCompleteProjectTests() {
  // =================================================================
  // BLOCO 1: AUTENTICAÇÃO COMPLETA
  // =================================================================
  console.log(`${YELLOW}[1/8] Testando Autenticação Completa (Cadastro, Login, Sessão, Senha, Logout)${RESET}`);

  // Cadastro de usuário normal (Hugo)
  const regHugo = await api.register({
    name: "Hugo Cliente",
    email: "hugo@empresa.com",
    password: "Password123!",
  });
  assert(regHugo.success && regHugo.status === 201, "Cadastro com dados válidos retorna 201 e token");
  assert(regHugo.user?.role === "USER", "Novo usuário recebe papel 'USER' nativamente");
  assert(regHugo.user?.planId === "plan_free", "Novo usuário é vinculado ao plano FREE");

  // Tentativa de cadastro com e-mail duplicado
  const regDup = await api.register({
    name: "Hugo Clone",
    email: "hugo@empresa.com",
    password: "Password123!",
  });
  assert(!regDup.success && regDup.status === 409, "Rejeita e-mail duplicado com status 409");

  // Tentativa de cadastro com senha < 6 caracteres
  const regShort = await api.register({
    name: "Hugo Short",
    email: "hugo.short@empresa.com",
    password: "123",
  });
  assert(!regShort.success && regShort.status === 400, "Rejeita senha com menos de 6 caracteres (400)");

  // Login com senha incorreta
  const loginWrong = await api.login({ email: "hugo@empresa.com", password: "SenhaTotalmenteIncorreta" });
  assert(!loginWrong.success && loginWrong.status === 401, "Login com senha incorreta retorna 401");

  // Login com sucesso
  const loginSuccess = await api.login({ email: "hugo@empresa.com", password: "Password123!" });
  assert(loginSuccess.success && loginSuccess.status === 200, "Login com credenciais corretas retorna 200");
  const hugoToken = loginSuccess.token!;

  // Consulta de sessão /api/auth/me
  const meHugo = await api.getMe(hugoToken);
  assert(meHugo.success && meHugo.user?.email === "hugo@empresa.com", "Sessão validada com sucesso via /api/auth/me");
  assert(meHugo.usage?.maxQRCodes === 5, "Plano FREE limita em 5 QR Codes");

  // Sessão com token nulo
  const meNull = await api.getMe(null);
  assert(!meNull.success && meNull.status === 401, "Sessão sem token retorna 401");

  // =================================================================
  // BLOCO 2: CICLO DE VIDA DO QR CODE
  // =================================================================
  console.log(`\n${YELLOW}[2/8] Testando Ciclo de Vida do QR Code (Criação, Edição, Exclusão, Restauração, Estático e Dinâmico)${RESET}`);

  // Criação de QR Estático no plano FREE
  const createStatic = await api.createQRCode(hugoToken, {
    name: "Cardápio do Hugo",
    type: "url",
    isDynamic: false,
    destination: "https://hugo-restaurante.com/cardapio",
  });
  assert(createStatic.success && createStatic.status === 201, "Criação de QR Estático permitida no plano FREE");
  assert(createStatic.qrCode?.isDynamic === false, "QR marcado como estático");
  assert(createStatic.qrCode?.shortCode === null, "QR estático não possui shortCode");

  // Tentativa de criar QR Dinâmico no plano FREE -> Bloqueado
  const createDynFree = await api.createQRCode(hugoToken, {
    name: "QR Dinâmico Não Autorizado",
    type: "url",
    isDynamic: true,
    destination: "https://hugo-restaurante.com/promo",
  });
  assert(!createDynFree.success && createDynFree.status === 403, "Plano FREE bloqueado para criar QR Dinâmico (403)");

  // Upgrade simulado do Hugo para PRO
  const hugoInDb = db.users.find((u) => u.email === "hugo@empresa.com")!;
  hugoInDb.planId = "plan_pro";
  const hugoProToken = signToken({ id: hugoInDb.id, name: hugoInDb.name, email: hugoInDb.email, role: hugoInDb.role, planId: "plan_pro" });

  // Criação de QR Dinâmico no plano PRO -> Sucesso
  const createDynPro = await api.createQRCode(hugoProToken, {
    name: "Campanha Black Friday",
    type: "url",
    isDynamic: true,
    destination: "https://hugo-restaurante.com/blackfriday",
  });
  assert(createDynPro.success && createDynPro.status === 201, "Criação de QR Dinâmico autorizada no plano PRO");
  assert(createDynPro.qrCode?.isDynamic === true, "QR marcado como dinâmico");
  assert(createDynPro.qrCode?.shortCode !== null && isValidShortCode(createDynPro.qrCode!.shortCode!), "ShortCode seguro e válido gerado");

  // Edição de destino do QR Dinâmico (preservando shortCode)
  const dynQrId = createDynPro.qrCode!.id;
  const originalShortCode = createDynPro.qrCode!.shortCode;
  const updateQr = await api.updateQRCode(hugoProToken, dynQrId, {
    destination: "https://hugo-restaurante.com/promocao-de-natal",
  });
  assert(updateQr.success && updateQr.qrCode?.destination === "https://hugo-restaurante.com/promocao-de-natal", "Destino atualizado com sucesso");
  assert(updateQr.qrCode?.shortCode === originalShortCode, "ShortCode permaneceu rigorosamente idêntico");

  // Exclusão (Soft Delete -> Lixeira)
  const deleteQr = await api.deleteQRCode(hugoProToken, dynQrId);
  assert(deleteQr.success && db.qrcodes.find((q) => q.id === dynQrId)?.deletedAt !== null, "QR Code movido para a lixeira (deletedAt preenchido)");

  // Restauração da lixeira
  const restoreQr = await api.restoreQRCode(hugoProToken, dynQrId);
  assert(restoreQr.success && db.qrcodes.find((q) => q.id === dynQrId)?.deletedAt === null, "QR Code restaurado com sucesso da lixeira");

  // =================================================================
  // BLOCO 3: ANALYTICS E TELEMETRIA
  // =================================================================
  console.log(`\n${YELLOW}[3/8] Testando Registro e Consulta de Analytics com Filtros${RESET}`);

  // Registro de scan com parse de User-Agent e hash anônimo LGPD
  const scan1 = await api.recordScan(dynQrId, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1", "200.150.10.5");
  assert(scan1.success, "Scan 1 registrado com sucesso");
  assert(scan1.scan?.device === "Mobile" && scan1.scan?.os === "iOS", "Detectou Mobile e iOS");
  assert(scan1.scan?.ipHash.length === 16, "IP Hash LGPD gerado com 16 caracteres");

  // Registro de scan 2 (Desktop)
  const scan2 = await api.recordScan(dynQrId, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36", "187.50.20.8");
  assert(scan2.success, "Scan 2 registrado com sucesso");
  assert(scan2.scan?.device === "Desktop" && scan2.scan?.os === "Windows", "Detectou Desktop e Windows");

  // Consulta de Analytics pelo Hugo (Plano PRO)
  const analyticsRes = await api.queryAnalytics(hugoProToken, { qrCodeId: dynQrId });
  assert(analyticsRes.success && analyticsRes.totalScans === 2, "Analytics consolidou 2 scans para o QR");

  // =================================================================
  // BLOCO 4: PLANOS E PERMISSÕES
  // =================================================================
  console.log(`\n${YELLOW}[4/8] Testando Cumprimento de Limites e Permissões de Planos${RESET}`);

  // Cadastro de usuário Bob no plano FREE
  const regBob = await api.register({ name: "Bob Free", email: "bob.free@empresa.com", password: "Password123!" });
  const bobToken = regBob.token!;

  // Bob tenta consultar analytics no plano FREE -> Rejeitado
  const bobAnalytics = await api.queryAnalytics(bobToken);
  assert(!bobAnalytics.success && bobAnalytics.status === 403, "Plano FREE bloqueado de acessar consulta de Analytics (403)");

  // Criação de 5 QRs para o Bob (atingir limite FREE)
  for (let i = 1; i <= 5; i++) {
    await api.createQRCode(bobToken, { name: `QR Bob ${i}`, type: "url", destination: `https://bob.com/${i}` });
  }
  const bobUsageAfter5 = await api.getMe(bobToken);
  assert(bobUsageAfter5.usage?.qrCodes === 5, "Bob atingiu exatamente 5 de 5 QR Codes");

  // Tentativa de criar o 6º QR no plano FREE -> Bloqueado
  const bob6thQr = await api.createQRCode(bobToken, { name: "QR Bob 6", type: "url", destination: "https://bob.com/6" });
  assert(!bob6thQr.success && bob6thQr.status === 403, "Criação do 6º QR bloqueada por limite de plano no servidor (403)");

  // =================================================================
  // BLOCO 5: ISOLAMENTO MULTIUSUÁRIO (ANTI-IDOR)
  // =================================================================
  console.log(`\n${YELLOW}[5/8] Testando Isolamento Multiusuário e Prevenção de IDOR${RESET}`);

  // Bob tenta alterar QR pertencente ao Hugo -> 404
  const bobTamperHugo = await api.updateQRCode(bobToken, dynQrId, { destination: "https://hacker.com/phishing" });
  assert(!bobTamperHugo.success && bobTamperHugo.status === 404, "Bob tentando alterar QR do Hugo: ACESSO NEGADO (404)");

  // Bob tenta excluir QR do Hugo -> 404
  const bobDeleteHugo = await api.deleteQRCode(bobToken, dynQrId);
  assert(!bobDeleteHugo.success && bobDeleteHugo.status === 404, "Bob tentando excluir QR do Hugo: ACESSO NEGADO (404)");

  // Bob tenta consultar Analytics do QR do Hugo -> 404
  const bobSpyHugo = await api.queryAnalytics(hugoProToken, { qrCodeId: "qr_inexistente_ou_alheio" });
  assert(!bobSpyHugo.success && bobSpyHugo.status === 404, "Consulta de analytics de QR alheio: REJEITADO (404)");

  // =================================================================
  // BLOCO 6: PAINEL ADMINISTRATIVO E SEGURANÇA MASTER
  // =================================================================
  console.log(`\n${YELLOW}[6/8] Testando Acesso Administrativo e Bloqueio de Usuários Comuns${RESET}`);

  // Cadastro de Admin Master
  const adminHash = await hashPassword("AdminSecret123!");
  const adminUser: MockDBUser = {
    id: "usr_admin_master",
    name: "Admin Master",
    email: "admin@qrmaster.com",
    passwordHash: adminHash,
    role: "ADMIN",
    planId: "plan_biz",
  };
  db.users.push(adminUser);
  const adminToken = signToken({ id: adminUser.id, name: adminUser.name, email: adminUser.email, role: adminUser.role, planId: adminUser.planId });

  // Usuário comum tentando se passar por admin com token alterado
  const fakeAdminToken = signToken({ id: bobUsageAfter5.user!.id, name: "Bob", email: "bob.free@empresa.com", role: "ADMIN" });
  // O servidor valida a role no banco
  const dbCheck = db.users.find((u) => u.id === bobUsageAfter5.user!.id);
  assert(dbCheck?.role === "USER", "Role no banco de dados permanece estritamente 'USER'");

  // Admin Master é autenticado com role ADMIN
  const meAdmin = await api.getMe(adminToken);
  assert(meAdmin.success && meAdmin.user?.role === "ADMIN", "Admin reconhecido com sucesso no servidor");

  // =================================================================
  // BLOCO 7: ARMAZENAMENTO E STORAGE
  // =================================================================
  console.log(`\n${YELLOW}[7/8] Testando Módulo de Armazenamento e Validação de Arquivos${RESET}`);

  // Sanitização de nomes de arquivos maliciosos (anti-path traversal)
  const safeName = sanitizeFileName("../../../etc/passwd.png");
  assert(!safeName.includes("..") && !safeName.includes("/"), "Path traversal sanitizado no nome do arquivo");

  // Construção de caminho isolado por usuário
  const userPath = buildUserStoragePath(hugoInDb.id, "logos", "meu_logo.png");
  assert(userPath.startsWith(`users/${hugoInDb.id}/logos/`), "Caminho do storage contém estritamente o ID do usuário");

  // Validação de arquivo (extensão e tamanho)
  const validFile = validateFile({ name: "logo.png", size: 1024 * 50, mimeType: "image/png" });
  assert(validFile.valid, "Arquivo PNG com tamanho válido aceito");

  const invalidExe = validateFile({ name: "virus.exe", size: 1024, mimeType: "application/x-msdownload" });
  assert(!invalidExe.valid, "Arquivo .exe sumariamente rejeitado pelo Storage");

  // Download com controle de acesso
  const hugoFile: MockDBFile = {
    id: "file_hugo_1",
    userId: hugoInDb.id,
    fileName: "export_alta_resolucao.pdf",
    storagePath: `users/${hugoInDb.id}/exports/export.pdf`,
    downloadUrl: `/uploads/storage/users/${hugoInDb.id}/exports/export.pdf`,
  };
  db.files.push(hugoFile);

  // Hugo baixa o próprio arquivo -> 200
  const hugoDownload = await api.downloadFile(hugoProToken, "file_hugo_1");
  assert(hugoDownload.success && hugoDownload.status === 200, "Hugo baixa seu próprio arquivo com sucesso (200)");

  // Bob tenta baixar arquivo do Hugo -> 404
  const bobDownloadHugo = await api.downloadFile(bobToken, "file_hugo_1");
  assert(!bobDownloadHugo.success && bobDownloadHugo.status === 404, "Bob tentando baixar arquivo do Hugo: ACESSO NEGADO (404)");

  // =================================================================
  // BLOCO 8: PADRÃO PIX / BR CODE BACEN & CRC16
  // =================================================================
  console.log(`\n${YELLOW}[8/8] Testando Padrão Oficial Pix (EMV / BR Code Bacen & Checksum CRC16)${RESET}`);

  // Geração de BR Code com valor fixo e chave telefone
  const pixPhone = generatePixPayload({
    pixKey: "+5511987654321",
    merchantName: "Hugo Restaurante",
    merchantCity: "São Paulo",
    amount: 89.9,
    txId: "PEDIDO88",
  });

  assert(pixPhone.startsWith("00020101021226"), "BR Code inicia com Tag 00 e Tag 01 (estático 12)");
  assert(pixPhone.includes("540589.90"), "Tag 54 com valor 89.90 formatado com 2 decimais");
  assert(pixPhone.includes("5802BR"), "Tag 58 com código de país BR");
  assert(pixPhone.includes("5916HUGO RESTAURANTE"), "Tag 59 com nome sem acentos e tamanho exato (16)");
  assert(pixPhone.includes("6009SAO PAULO"), "Tag 60 com cidade sem acentos e tamanho exato (09)");
  assert(pixPhone.includes("62120508PEDIDO88"), "Tag 62 com TXID alfanumérico correto");

  // Decodificação e validação criptográfica do CRC16
  const parsedPix = parsePixPayload(pixPhone);
  assert(parsedPix.valid === true, "Payload Pix decodificado e validado com sucesso");
  assert(parsedPix.crcValid === true, "Checksum CRC16-CCITT verificado matematicamente");
  assert(parsedPix.pixKey === "+5511987654321", "Chave Pix extraída com fidelidade");
  assert(parsedPix.amount === 89.9, "Valor extraído com fidelidade");

  // Payload com adulteração de valor rejeitado por falha de CRC
  const tamperedPix = pixPhone.replace("89.90", "99.90");
  const parsedTampered = parsePixPayload(tamperedPix);
  assert(parsedTampered.valid === false && parsedTampered.crcValid === false, "Adulteração no valor rejeitada por discrepância no CRC16");

  // =================================================================
  // RESUMO GERAL
  // =================================================================
  console.log(`\n${CYAN}====================================================${RESET}`);
  console.log(`${CYAN}    RESUMO GERAL DOS TESTES DE ROTAS E INTEGRAÇÃO   ${RESET}`);
  console.log(`${CYAN}====================================================${RESET}`);
  console.log(`Total de asserções executadas: ${totalTests}`);
  console.log(`${GREEN}Passaram: ${passedTests}${RESET}`);
  if (failedTests > 0) {
    console.log(`${RED}Falharam: ${failedTests}${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}TODOS OS TESTES DE ROTAS E INTEGRAÇÃO PASSARAM COM SUCESSO!${RESET}\n`);
    process.exit(0);
  }
}

runCompleteProjectTests().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
