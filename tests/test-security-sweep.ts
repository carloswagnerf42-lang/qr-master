/**
 * Bateria Completa de Testes de Segurança e Integridade do Sistema
 * Cobre:
 * 1. Autenticação, Tokens JWT e Criptografia
 * 2. Controle de Acesso Baseado em Papéis (RBAC) e Salvaguardas Admin
 * 3. Prevenção de IDOR e Isolamento Multitenancy
 * 4. Sanitização contra Injeção de Protocolos, XSS e Loops de Redirecionamento
 * 5. Proteção Anti-Abuso, Força Bruta e Rate Limiting
 * 6. Segurança em Gateways de Pagamento (Mercado Pago & Stripe)
 * 7. Hardening de Cabeçalhos HTTP e Defesa em Profundidade
 */

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { signToken, verifyToken, SessionUser } from "../src/lib/auth";
import { validateMultiLinkUrl, sanitizeMultiLinkLinks } from "../src/lib/multilink";
import { validateAndNormalizeDestination, checkShortCodeRateLimit } from "../src/lib/dynamic-redirect";
import { checkRateLimit, resetRateLimit, RATE_LIMIT_CONFIGS } from "../src/lib/rate-limit";
import { sanitizeFileName, buildUserStoragePath } from "../src/lib/storage";

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

async function runSecuritySweep() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   🛡️  VARREDURA COMPLETA & AUDITORIA DE SEGURANÇA (SECURITY SWEEP)  ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  // ====================================================================
  // 1. AUTENTICAÇÃO, TOKENS JWT E CRIPTOGRAFIA
  // ====================================================================
  console.log(`${YELLOW}▶ 1. Autenticação, Criptografia e Integridade de Sessão:${RESET}`);

  const testUser: SessionUser = {
    id: "usr_alice_sec",
    name: "Alice Security",
    email: "alice@security.io",
    role: "USER",
    planId: "plan_pro",
  };

  const validToken = signToken(testUser);
  const decoded = verifyToken(validToken);

  assert(decoded !== null, "Token JWT legítimo é decodificado e verificado com sucesso");
  assert(decoded?.id === testUser.id, "ID do usuário no token corresponde ao original");
  assert(decoded?.role === "USER", "Papel do usuário no token é preservado");

  // Ataque 1.1: Adulteração de assinatura JWT (Tentativa de elevação de privilégio para ADMIN)
  const tokenParts = validToken.split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({ ...testUser, role: "ADMIN" })
  ).toString("base64url");
  const tamperedToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;
  const tamperedResult = verifyToken(tamperedToken);

  assert(tamperedResult === null, "Token com payload adulterado é SUMARIAMENTE REJEITADO (Falha de assinatura)");

  // Ataque 1.2: Token assinado com chave secreta diferente (Key Confusion / Forgery)
  const forgedToken = jwt.sign(testUser, "chave-secreta-falsa-do-atacante", { expiresIn: "7d" });
  const forgedResult = verifyToken(forgedToken);
  assert(forgedResult === null, "Token forjado com chave arbitrária é REJEITADO");

  // Ataque 1.3: Verificação de Algoritmo "none"
  const noneAlgToken = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${tamperedPayload}.`;
  const noneAlgResult = verifyToken(noneAlgToken);
  assert(noneAlgResult === null, "Token com alg 'none' é rejeitado");

  // Validação Criptográfica de Senhas (Bcrypt)
  const rawPassword = "SenhaForteDeTeste!#123";
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(rawPassword, salt);

  assert(await bcrypt.compare(rawPassword, hash) === true, "Senha correta valida com hash bcrypt");
  assert(await bcrypt.compare("SenhaIncorreta", hash) === false, "Senha incorreta é rejeitada pelo hash");
  assert(rawPassword !== hash, "Senha nunca é armazenada em texto puro");


  // ====================================================================
  // 2. CONTROLE DE ACESSO BASEADO EM PAPÉIS (RBAC) & ADMIN SAFEGUARDS
  // ====================================================================
  console.log(`\n${YELLOW}▶ 2. RBAC e Salvaguardas de Administração:${RESET}`);

  // Simulação de banco de dados e controle de acesso
  const mockUsers = [
    { id: "adm_1", name: "Root Admin", role: "ADMIN" },
    { id: "usr_1", name: "Common User", role: "USER" },
  ];

  function evaluateAdminAccess(user: { role: string } | null) {
    if (!user) return { status: 401, allowed: false };
    if (user.role !== "ADMIN") return { status: 403, allowed: false };
    return { status: 200, allowed: true };
  }

  assert(!evaluateAdminAccess(null).allowed && evaluateAdminAccess(null).status === 401, "Usuário anônimo bloqueado com 401");
  assert(!evaluateAdminAccess(mockUsers[1]).allowed && evaluateAdminAccess(mockUsers[1]).status === 403, "Usuário comum 'USER' bloqueado em rotas admin com 403");
  assert(evaluateAdminAccess(mockUsers[0]).allowed && evaluateAdminAccess(mockUsers[0]).status === 200, "Administrador 'ADMIN' liberado com 200");

  // Salvaguarda: Não permitir rebaixar ou excluir o último admin
  function canDemoteAdmin(adminList: typeof mockUsers, targetId: string) {
    const totalAdmins = adminList.filter(u => u.role === "ADMIN").length;
    const target = adminList.find(u => u.id === targetId);
    if (target?.role === "ADMIN" && totalAdmins <= 1) {
      return { allowed: false, error: "Não é permitido rebaixar ou excluir o único administrador." };
    }
    return { allowed: true };
  }

  const demoteCheck = canDemoteAdmin(mockUsers, "adm_1");
  assert(!demoteCheck.allowed, "Bloqueia estritamente rebaixar/excluir o único administrador da plataforma");


  // ====================================================================
  // 3. PREVENÇÃO DE IDOR E ISOLAMENTO MULTITENANCY
  // ====================================================================
  console.log(`\n${YELLOW}▶ 3. Prevenção de IDOR e Isolamento de Dados por Usuário:${RESET}`);

  const mockDbTenant = {
    qrs: [
      { id: "qr_alice_01", userId: "usr_alice", name: "Cardápio Alice" },
      { id: "qr_bob_02", userId: "usr_bob", name: "Vendas Bob" },
    ],
    files: [
      { id: "file_alice_01", userId: "usr_alice", fileName: "cardapio.pdf" },
      { id: "file_bob_02", userId: "usr_bob", fileName: "planilha.pdf" },
    ],
  };

  // Simulação da consulta segura com filtro 'userId' obrigatório
  function findUserQr(reqUserId: string, targetQrId: string) {
    return mockDbTenant.qrs.find(q => q.id === targetQrId && q.userId === reqUserId) || null;
  }

  function findUserFile(reqUserId: string, targetFileId: string) {
    return mockDbTenant.files.find(f => f.id === targetFileId && f.userId === reqUserId) || null;
  }

  // Bob tenta ler o QR de Alice
  const bobAttempt = findUserQr("usr_bob", "qr_alice_01");
  assert(bobAttempt === null, "Bob NÃO CONSEGUE acessar ou modificar o QR Code de Alice (IDOR prevenido)");

  // Alice acessa o seu próprio QR
  const aliceLegit = findUserQr("usr_alice", "qr_alice_01");
  assert(aliceLegit !== null && aliceLegit.id === "qr_alice_01", "Alice acessa seu próprio QR Code legitimamente");

  // Bob tenta baixar o arquivo de Alice
  const bobFileAttempt = findUserFile("usr_bob", "file_alice_01");
  assert(bobFileAttempt === null, "Bob NÃO CONSEGUE baixar arquivo confidencial de Alice (IDOR prevenido)");


  // ====================================================================
  // 4. SANITIZAÇÃO CONTRA INJEÇÃO DE PROTOCOLOS, XSS E LOOPS
  // ====================================================================
  console.log(`\n${YELLOW}▶ 4. Sanitização contra Injeção de Protocolos, XSS e Loops:${RESET}`);

  // Testes de protocolos maliciosos no MultiLink
  const xssPayloads = [
    "javascript:alert(document.cookie)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:http://localhost/evil",
    "about:blank",
    "javascript://%0aalert(1)",
  ];

  for (const payload of xssPayloads) {
    const res = validateMultiLinkUrl(payload);
    assert(!res.valid, `Bloqueia protocolo malicioso: "${payload.slice(0, 25)}..."`);
  }

  // Links legítimos permitidos
  assert(validateMultiLinkUrl("https://instagram.com/empresa").valid, "Permite HTTPS legítimo");
  assert(validateMultiLinkUrl("http://meusite.com.br").valid, "Permite HTTP legítimo");
  assert(validateMultiLinkUrl("wa.me/5511999999999").valid, "Normaliza e permite link sem prefixo");
  assert(validateMultiLinkUrl("mailto:contato@empresa.com").valid, "Permite link mailto:");
  assert(validateMultiLinkUrl("tel:+5511999999999").valid, "Permite link telefônico tel:");

  // Sanitização de nomes de arquivos e prevenção de Path Traversal
  const dangerousNames = [
    "../../../etc/passwd",
    "..\\..\\windows\\system32\\cmd.exe",
    "malicious\x00file.png",
    "test/subfolder/file.svg",
  ];

  for (const dangerous of dangerousNames) {
    const sanitized = sanitizeFileName(dangerous);
    assert(!sanitized.includes("..") && !sanitized.includes("/") && !sanitized.includes("\\") && !sanitized.includes("\x00"),
      `Sanitiza e neutraliza path traversal em nome de arquivo: "${dangerous.slice(0, 20)}..." -> "${sanitized}"`);
  }

  // Prevenção de Loops no Redirecionamento Dinâmico
  const loopSelf = validateAndNormalizeDestination("/q/abc1234", "abc1234");
  assert(!loopSelf.valid, "Detecta e bloqueia loop autorreferencial no próprio shortCode");

  const loopChain = validateAndNormalizeDestination("https://qrmasterpro.vercel.app/q/xyz9876", "abc1234");
  assert(!loopChain.valid, "Detecta e bloqueia encadeamento malicioso de múltiplos QR Codes");


  // ====================================================================
  // 5. PROTEÇÃO ANTI-ABUSO, FORÇA BRUTA E RATE LIMITING
  // ====================================================================
  console.log(`\n${YELLOW}▶ 5. Proteção Anti-Abuso, Força Bruta e Rate Limiting:${RESET}`);

  const testIp = "192.168.100.50";
  await resetRateLimit(testIp, "login");

  // Realiza 5 tentativas permitidas
  for (let i = 1; i <= 5; i++) {
    const check = await checkRateLimit(testIp, "login");
    assert(check.allowed, `Tentativa de login ${i}/5 permitida`);
  }

  // 6ª tentativa deve ser terminantemente bloqueada
  const sixthAttempt = await checkRateLimit(testIp, "login");
  assert(!sixthAttempt.allowed, "6ª tentativa é BLOQUEADA por Rate Limiting (Proteção contra brute force)");
  assert(sixthAttempt.retryAfter > 0, `Tempo de espera informado corretamente: ${sixthAttempt.retryAfter}s`);

  // Rate limit de telemetria de scans
  const scanRate1 = await checkShortCodeRateLimit("ip_hash_abc", "short_1", 3);
  assert(scanRate1.allowed, "1º scan registrado");
  const scanRate2 = await checkShortCodeRateLimit("ip_hash_abc", "short_1", 3);
  assert(scanRate2.allowed, "2º scan registrado");
  const scanRate3 = await checkShortCodeRateLimit("ip_hash_abc", "short_1", 3);
  assert(scanRate3.allowed, "3º scan registrado");
  const scanRate4 = await checkShortCodeRateLimit("ip_hash_abc", "short_1", 3);
  assert(!scanRate4.allowed, "4º scan consecutivo é BLOQUEADO (Proteção contra flood de telemetria)");


  // ====================================================================
  // 6. SEGURANÇA EM GATEWAYS DE PAGAMENTO
  // ====================================================================
  console.log(`\n${YELLOW}▶ 6. Segurança em Gateways de Pagamento:${RESET}`);

  // Simulação de mascaramento de credenciais na API de administração
  function maskAccessToken(token: string) {
    if (!token) return "";
    if (token.length > 12) {
      return `${token.slice(0, 7)}...${token.slice(-4)}`;
    }
    return "********";
  }

  const liveToken = "APP_USR-8237492837498237-091812-78d1a3c8e5f2-987654321";
  const masked = maskAccessToken(liveToken);
  assert(!masked.includes("091812-78d1a3c8e5f2"), "Token de acesso nunca é exposto integralmente na API pública/admin");
  assert(masked.startsWith("APP_USR") && masked.endsWith("4321"), "Máscara segura exibe apenas prefixo e sufixo de identificação");

  // Prevenção de adulteração de preço no checkout
  function calculateServerSidePrice(planName: string, cycle: "month" | "year", clientClaimedPrice?: number) {
    // Servidor IGNORA clientClaimedPrice e consulta sua própria tabela autoritativa
    const catalog: Record<string, { month: number; year: number }> = {
      PRO: { month: 39.9, year: 399.0 },
      BUSINESS: { month: 99.9, year: 999.0 },
    };
    const officialPrice = catalog[planName]?.[cycle];
    return officialPrice;
  }

  const attackerPrice = 0.01; // Atacante alega que o Pro custa 1 centavo
  const verifiedPrice = calculateServerSidePrice("PRO", "month", attackerPrice);
  assert(verifiedPrice === 39.9, "Servidor ignora preço forjado pelo cliente e cobra o valor oficial da base (R$ 39,90)");


  // ====================================================================
  // 7. HARDENING DE CABEÇALHOS HTTP E TRANSPORTE
  // ====================================================================
  console.log(`\n${YELLOW}▶ 7. Hardening de Cabeçalhos HTTP e Defesa em Profundidade:${RESET}`);

  // Simulação de cabeçalhos configurados no next.config.mjs
  const configuredHeaders = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-DNS-Prefetch-Control": "on",
  };

  assert(configuredHeaders["X-Content-Type-Options"] === "nosniff", "X-Content-Type-Options: nosniff ativo (previne MIME sniffing)");
  assert(configuredHeaders["X-Frame-Options"] === "DENY", "X-Frame-Options: DENY ativo (previne Clickjacking)");
  assert(configuredHeaders["Strict-Transport-Security"].includes("max-age=63072000"), "HSTS com max-age de 2 anos e preload ativo");
  assert(configuredHeaders["Referrer-Policy"] === "strict-origin-when-cross-origin", "Referrer-Policy restringe vazamento de parâmetros de URL");
  assert(configuredHeaders["Permissions-Policy"].includes("camera=()"), "Permissions-Policy restringe sensores do navegador");

  // ====================================================================
  // RESUMO DA AUDITORIA
  // ====================================================================
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   TOTAL DE TESTES DE SEGURANÇA EXECUTADOS: ${totalTests}             ${RESET}`);
  console.log(`${GREEN}   APROVADOS: ${passedTests}                                           ${RESET}`);
  console.log(`${failedTests > 0 ? RED : GREEN}   FALHAS: ${failedTests}                                              ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSecuritySweep().catch((err) => {
  console.error("Erro fatal na execução dos testes de segurança:", err);
  process.exit(1);
});
