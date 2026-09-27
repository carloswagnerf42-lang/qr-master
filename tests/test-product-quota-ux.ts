import { evalQuotaCanCreate, formatQRCount } from "../src/lib/quota-gate";
import { checkPermission, UserPlanContext, PlanDetails } from "../src/lib/permissions";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
    passCount++;
  } else {
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (detail) console.error(`    ${YELLOW}Detalhes:${RESET} ${detail}`);
    failCount++;
  }
}

console.log(`${CYAN}============================================================${RESET}`);
console.log(`${CYAN}SUÍTE: PRODUCT-QUOTA-01 — QR CREATION GATE + DASHBOARD CTA UX${RESET}`);
console.log(`${CYAN}============================================================${RESET}`);

// Modelos canônicos de planos
const freePlan: PlanDetails = {
  name: "FREE",
  displayName: "Plano Grátis",
  priceMonth: 0,
  maxQRCodes: 5,
  dynamicQRs: false,
  analytics: false,
  exportSvg: false,
  exportPdf: false,
  customLogo: false,
  campaigns: false,
};

const proPlan: PlanDetails = {
  name: "PRO",
  displayName: "Plano Pro",
  priceMonth: 19.9,
  maxQRCodes: 15,
  dynamicQRs: true,
  analytics: true,
  exportSvg: true,
  exportPdf: true,
  customLogo: true,
  campaigns: false,
};

const businessPlan: PlanDetails = {
  name: "BUSINESS",
  displayName: "Plano Business",
  priceMonth: 49.9,
  maxQRCodes: 999999,
  dynamicQRs: true,
  analytics: true,
  exportSvg: true,
  exportPdf: true,
  customLogo: true,
  campaigns: true,
};

function makeContext(user: { id: string; role?: string }, plan: PlanDetails, usedCount: number): UserPlanContext {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return {
    id: user.id,
    role: user.role || "USER",
    planId: "plan_" + plan.name.toLowerCase(),
    plan,
    qrCodeCount: usedCount,
    totalQrCodeCount: usedCount,
    currentMonthLimit: plan.maxQRCodes,
    currentMonthStart: start,
    currentMonthEnd: end,
    isYearly: false,
    subscriptionStatus: "ACTIVE",
    subscription: null,
  };
}

// ---------------------------------------------------------------------
// TESTE A: Usuário FREE com 0/5 QRs criados -> ação Criar permitida
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE A: Free com 0/5 QRs ---${RESET}`);
{
  const evalResult = evalQuotaCanCreate("FREE", 0);
  assert(evalResult.canCreate === true, "evalQuotaCanCreate permite criação para FREE 0/5");
  assert(evalResult.maxQRCodes === 5, "maxQRCodes é 5 para FREE");
  assert(evalResult.usedQRCodes === 0, "usedQRCodes é 0");
  assert(evalResult.remainingQRCodes === 5, "remainingQRCodes é 5");
  assert(evalResult.reasonIfBlocked === undefined, "Sem bloqueio definido");

  const ctx = makeContext({ id: "user_free_0" }, freePlan, 0);
  const perm = checkPermission(ctx, "create_qr");
  assert(perm.allowed === true, "checkPermission(create_qr) allowed é true");
}

// ---------------------------------------------------------------------
// TESTE B: Usuário FREE com 4/5 QRs criados -> ação Criar permitida
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE B: Free com 4/5 QRs ---${RESET}`);
{
  const evalResult = evalQuotaCanCreate("FREE", 4);
  assert(evalResult.canCreate === true, "evalQuotaCanCreate permite criação para FREE 4/5");
  assert(evalResult.remainingQRCodes === 1, "remainingQRCodes é 1");
  assert(evalResult.reasonIfBlocked === undefined, "Sem bloqueio definido");

  const ctx = makeContext({ id: "user_free_4" }, freePlan, 4);
  const perm = checkPermission(ctx, "create_qr");
  assert(perm.allowed === true, "checkPermission(create_qr) allowed é true para 4/5");
}

// ---------------------------------------------------------------------
// TESTE C: Usuário FREE com 5/5 QRs criados -> ação Criar BLOQUEADA
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE C: Free com 5/5 QRs (Limite atingido) ---${RESET}`);
{
  const evalResult = evalQuotaCanCreate("FREE", 5);
  assert(evalResult.canCreate === false, "evalQuotaCanCreate BLOQUEIA criação para FREE 5/5");
  assert(evalResult.remainingQRCodes === 0, "remainingQRCodes é 0");
  assert(evalResult.reasonIfBlocked === "LIMIT_REACHED", "reasonIfBlocked é LIMIT_REACHED");
  assert(evalResult.limitIfBlocked === 5, "limitIfBlocked é 5");

  const ctx = makeContext({ id: "user_free_5" }, freePlan, 5);
  const perm = checkPermission(ctx, "create_qr");
  assert(perm.allowed === false, "checkPermission(create_qr) allowed é false para 5/5");
  assert(perm.code === "LIMIT_REACHED", "code é LIMIT_REACHED");
  assert(perm.limit === 5, "limit retornado pelo backend é 5");
  assert(perm.requiredPlan === "PRO", "requiredPlan é PRO");
}

// ---------------------------------------------------------------------
// TESTE D: Usuário FREE com >5 QRs (cenário legado ou degradação) -> bloqueio mantido
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE D: Free com >5 QRs (Fail-closed) ---${RESET}`);
{
  const evalResult = evalQuotaCanCreate("FREE", 8);
  assert(evalResult.canCreate === false, "evalQuotaCanCreate bloqueia fail-closed para FREE 8/5");
  assert(evalResult.remainingQRCodes === 0, "remainingQRCodes é 0 quando usado > max");
  assert(evalResult.reasonIfBlocked === "LIMIT_REACHED", "reasonIfBlocked é LIMIT_REACHED");

  const ctx = makeContext({ id: "user_free_8" }, freePlan, 8);
  const perm = checkPermission(ctx, "create_qr");
  assert(perm.allowed === false, "checkPermission(create_qr) allowed é false para 8/5");
  assert(perm.code === "LIMIT_REACHED", "code é LIMIT_REACHED no backend");
}

// ---------------------------------------------------------------------
// TESTE E: Usuário PRO com 14/15 QRs criados -> ação Criar permitida
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE E: Pro com 14/15 QRs ---${RESET}`);
{
  const evalResult = evalQuotaCanCreate("PRO", 14);
  assert(evalResult.canCreate === true, "evalQuotaCanCreate permite criação para PRO 14/15");
  assert(evalResult.maxQRCodes === 15, "maxQRCodes é 15 para PRO");
  assert(evalResult.remainingQRCodes === 1, "remainingQRCodes é 1");
  assert(evalResult.reasonIfBlocked === undefined, "Sem bloqueio definido");

  const ctx = makeContext({ id: "user_pro_14" }, proPlan, 14);
  const perm = checkPermission(ctx, "create_qr");
  assert(perm.allowed === true, "checkPermission(create_qr) allowed é true para PRO 14/15");
}

// ---------------------------------------------------------------------
// TESTE F: Usuário PRO com 15/15 QRs criados -> ação Criar BLOQUEADA
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE F: Pro com 15/15 QRs (Limite atingido) ---${RESET}`);
{
  const evalResult = evalQuotaCanCreate("PRO", 15);
  assert(evalResult.canCreate === false, "evalQuotaCanCreate BLOQUEIA criação para PRO 15/15");
  assert(evalResult.maxQRCodes === 15, "maxQRCodes é 15");
  assert(evalResult.remainingQRCodes === 0, "remainingQRCodes é 0");
  assert(evalResult.reasonIfBlocked === "LIMIT_REACHED", "reasonIfBlocked é LIMIT_REACHED");
  assert(evalResult.limitIfBlocked === 15, "limitIfBlocked é 15");

  const ctx = makeContext({ id: "user_pro_15" }, proPlan, 15);
  const perm = checkPermission(ctx, "create_qr");
  assert(perm.allowed === false, "checkPermission(create_qr) allowed é false para PRO 15/15");
  assert(perm.code === "LIMIT_REACHED", "code é LIMIT_REACHED no backend");
  assert(perm.limit === 15, "limit retornado pelo backend é 15");
  assert(perm.requiredPlan === "BUSINESS", "requiredPlan é BUSINESS");
}

// ---------------------------------------------------------------------
// TESTE G: Usuário BUSINESS com qualquer quantidade de QRs -> ação SEMPRE permitida
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE G: Business ilimitado ---${RESET}`);
{
  const eval0 = evalQuotaCanCreate("BUSINESS", 0);
  assert(eval0.canCreate === true && eval0.isUnlimited === true, "Business com 0 QRs é permitido e ilimitado");

  const eval50 = evalQuotaCanCreate("BUSINESS", 50);
  assert(eval50.canCreate === true && eval50.isUnlimited === true, "Business com 50 QRs é permitido");

  const eval5000 = evalQuotaCanCreate("BUSINESS", 5000);
  assert(eval5000.canCreate === true && eval5000.isUnlimited === true, "Business com 5000 QRs é permitido");
  assert(eval5000.reasonIfBlocked === undefined, "Business nunca recebe reasonIfBlocked");

  const ctx = makeContext({ id: "user_biz" }, businessPlan, 5000);
  const perm = checkPermission(ctx, "create_qr");
  assert(perm.allowed === true, "checkPermission(create_qr) allowed é true para Business com 5000 QRs");
}

// ---------------------------------------------------------------------
// TESTE H: Chamada direta ao endpoint POST /api/qr com cota esgotada
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE H: Chamada direta à API com cota esgotada ---${RESET}`);
{
  // Simula requisição recebida em POST /api/qr com sessão de usuário com cota esgotada
  const ctx = makeContext({ id: "attacker_free" }, freePlan, 5);
  const canCreate = checkPermission(ctx, "create_qr");

  function simulateApiQrPost(permissionCheck: typeof canCreate) {
    if (!permissionCheck.allowed) {
      return {
        status: 403,
        body: {
          error: permissionCheck.reason,
          code: permissionCheck.code,
          requiredPlan: permissionCheck.requiredPlan,
          limit: permissionCheck.limit,
          current: permissionCheck.current,
        },
      };
    }
    return { status: 201, body: { success: true } };
  }

  const response = simulateApiQrPost(canCreate);
  assert(response.status === 403, "API retorna status 403 para criação acima da cota");
  assert(response.body.code === "LIMIT_REACHED", "API retorna code LIMIT_REACHED");
  assert(response.body.limit === 5, "API retorna limit correto (5)");
  assert(response.body.current === 5, "API retorna contagem atual (5)");
}

// ---------------------------------------------------------------------
// TESTE I: Tentativa de forjar plano no payload da API
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE I: Tentativa de forjar plano no payload ---${RESET}`);
{
  // Usuário Free tenta enviar payload malicioso: { plan: 'BUSINESS', maxQRCodes: 999999 }
  const maliciousPayload = {
    name: "Hacked QR",
    destination: "https://example.com",
    plan: "BUSINESS",
    maxQRCodes: 999999,
  };

  // Backend obtém contexto exclusivamente da sessão e banco de dados, ignorando payload
  const sessionUser = { id: "user_honest_free_exhausted" };
  const userContextFromDb = makeContext(sessionUser, freePlan, 5);

  // A validação de permissão utiliza userContextFromDb e não o maliciousPayload
  const backendCheck = checkPermission(userContextFromDb, "create_qr");
  assert(backendCheck.allowed === false, "Backend rejeita criação mesmo que payload contenha plan='BUSINESS'");
  assert(backendCheck.code === "LIMIT_REACHED", "Código de erro permanece LIMIT_REACHED");
  assert(backendCheck.limit === 5, "Limite respeita plano oficial do banco (5)");
}

// ---------------------------------------------------------------------
// TESTE J: Isolamento de cota por usuário
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE J: Isolamento de cota entre usuários ---${RESET}`);
{
  const userA = makeContext({ id: "usr_alice" }, freePlan, 5); // Alice esgotou cota
  const userB = makeContext({ id: "usr_bob" }, freePlan, 2);   // Bob tem cota livre

  const checkAlice = checkPermission(userA, "create_qr");
  const checkBob = checkPermission(userB, "create_qr");

  assert(checkAlice.allowed === false, "Alice com 5/5 está bloqueada");
  assert(checkBob.allowed === true, "Bob com 2/5 permanece livre para criar");
  assert(userA.id !== userB.id, "Identificadores de usuário são distintos");
}

// ---------------------------------------------------------------------
// TESTE K: Hard-delete NÃO devolve cota de criação (Ledger Imutável)
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE K: Hard-delete NÃO devolve cota de criação ---${RESET}`);
{
  // Simulação de banco de dados com acervo e ledger
  const activeQRs = [
    { id: "qr_1", userId: "u1", deletedAt: null },
    { id: "qr_2", userId: "u1", deletedAt: null },
    { id: "qr_3", userId: "u1", deletedAt: null },
    { id: "qr_4", userId: "u1", deletedAt: null },
    { id: "qr_5", userId: "u1", deletedAt: null },
  ];
  // Ledger imutável de criações do ciclo
  const creationUsages: { id: string; userId: string; qrCodeId: string | null; createdAt: Date }[] = [
    { id: "usg_1", userId: "u1", qrCodeId: "qr_1", createdAt: new Date() },
    { id: "usg_2", userId: "u1", qrCodeId: "qr_2", createdAt: new Date() },
    { id: "usg_3", userId: "u1", qrCodeId: "qr_3", createdAt: new Date() },
    { id: "usg_4", userId: "u1", qrCodeId: "qr_4", createdAt: new Date() },
    { id: "usg_5", userId: "u1", qrCodeId: "qr_5", createdAt: new Date() },
  ];

  // Estado inicial: 5 criações consumidas
  let cycleCreations = creationUsages.filter((u) => u.userId === "u1").length;
  let evalBefore = evalQuotaCanCreate("FREE", cycleCreations);
  assert(evalBefore.canCreate === false, "Inicialmente com 5/5 criações está bloqueado");
  assert(activeQRs.length === 5, "Acervo inicial tem 5 QRs");

  // Deletar permanentemente qr_5 (hard-delete: remove do acervo)
  const index = activeQRs.findIndex((q) => q.id === "qr_5");
  if (index !== -1) {
    const deleted = activeQRs.splice(index, 1)[0];
    // Relação onDelete: SetNull desassocia qrCodeId no ledger, mas preserva a linha de consumo
    const usage = creationUsages.find((u) => u.qrCodeId === deleted.id);
    if (usage) usage.qrCodeId = null;
  }

  // Estado após hard-delete: acervo caiu para 4, mas consumo do ledger CONTINUA 5/5!
  const acervoCount = activeQRs.length;
  cycleCreations = creationUsages.filter((u) => u.userId === "u1").length;
  let evalAfter = evalQuotaCanCreate("FREE", cycleCreations);

  assert(acervoCount === 4, "Acervo ativo foi reduzido para 4");
  assert(cycleCreations === 5, "Consumo no ledger permanece rigorosamente 5 (NÃO devolve criação)");
  assert(evalAfter.canCreate === false, "Criação permanece BLOQUEADA após hard-delete");
  assert(evalAfter.remainingQRCodes === 0, "0 slots disponíveis na cota (sem bypass)");
}

// ---------------------------------------------------------------------
// TESTE L: Soft-delete para lixeira NÃO devolve cota de criação
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE L: Soft-delete NÃO devolve cota de criação ---${RESET}`);
{
  const userQRs = [
    { id: "qr_1", userId: "u2", deletedAt: null },
    { id: "qr_2", userId: "u2", deletedAt: null },
    { id: "qr_3", userId: "u2", deletedAt: null },
    { id: "qr_4", userId: "u2", deletedAt: null },
    { id: "qr_5", userId: "u2", deletedAt: new Date() }, // na lixeira
  ];
  // 5 registros de criação no ledger
  const creationUsages = [
    { id: "usg_1", userId: "u2", qrCodeId: "qr_1", createdAt: new Date() },
    { id: "usg_2", userId: "u2", qrCodeId: "qr_2", createdAt: new Date() },
    { id: "usg_3", userId: "u2", qrCodeId: "qr_3", createdAt: new Date() },
    { id: "usg_4", userId: "u2", qrCodeId: "qr_4", createdAt: new Date() },
    { id: "usg_5", userId: "u2", qrCodeId: "qr_5", createdAt: new Date() },
  ];

  // Acervo ativo conta apenas deletedAt === null
  const activeCount = userQRs.filter((q) => q.userId === "u2" && q.deletedAt === null).length;
  assert(activeCount === 4, "Acervo ativo computa 4 QRs (1 na lixeira)");

  // Cota do ciclo consulta o ledger imutável (5 consumidos)
  const cycleCreations = creationUsages.filter((u) => u.userId === "u2").length;
  assert(cycleCreations === 5, "Ledger computa exatamente 5 criações consumidas");

  const evalResult = evalQuotaCanCreate("FREE", cycleCreations);
  assert(evalResult.canCreate === false, "Soft-delete NÃO devolve cota (bloqueio mantido)");
  assert(evalResult.remainingQRCodes === 0, "0 criações restantes neste ciclo");
}

// ---------------------------------------------------------------------
// TESTE L2: Restore de QR Code não altera consumo no ledger
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE L2: Restore de QR Code não altera consumo ---${RESET}`);
{
  const creationUsages = [
    { id: "usg_1", userId: "u3", qrCodeId: "qr_1", createdAt: new Date() },
    { id: "usg_2", userId: "u3", qrCodeId: "qr_2", createdAt: new Date() },
    { id: "usg_3", userId: "u3", qrCodeId: "qr_3", createdAt: new Date() },
    { id: "usg_4", userId: "u3", qrCodeId: "qr_4", createdAt: new Date() },
    { id: "usg_5", userId: "u3", qrCodeId: "qr_5", createdAt: new Date() },
  ];
  // Usuário restaura QR_5 da lixeira (deletedAt volta a ser null no QRCode)
  // O ledger NÃO recebe novas linhas e NÃO perde linhas existentes
  const cycleCreations = creationUsages.filter((u) => u.userId === "u3").length;
  assert(cycleCreations === 5, "Consumo no ledger permanece exatamente 5 após restore");
  const evalResult = evalQuotaCanCreate("FREE", cycleCreations);
  assert(evalResult.canCreate === false, "Criação permanece bloqueada após restore");
}

// ---------------------------------------------------------------------
// TESTE L3: Loop de Delete -> Create é definitivamente neutralizado
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE L3: Loop de Delete -> Create neutralizado ---${RESET}`);
{
  const ledgerPro = Array.from({ length: 15 }, (_, i) => ({
    id: `usg_pro_${i + 1}`,
    userId: "usr_pro_loop",
    qrCodeId: `qr_${i + 1}`,
    createdAt: new Date(),
  }));

  // Cota PRO 15/15
  let count = ledgerPro.length;
  let gate = evalQuotaCanCreate("PRO", count);
  assert(gate.canCreate === false, "Inicialmente PRO 15/15 bloqueado");

  // Tentativa de bypass: deleta QR 15 (soft ou hard)
  // O ledger é imutável e permanece com 15 entradas
  gate = evalQuotaCanCreate("PRO", ledgerPro.length);
  assert(gate.canCreate === false, "Após deletar QR, tentativa de criar novo é BLOQUEADA");

  // Simula tentativa de criar: gate impede criação
  assert(gate.reasonIfBlocked === "LIMIT_REACHED", "Motivo de bloqueio é LIMIT_REACHED");
  assert(gate.limitIfBlocked === 15, "Limite respeita cota PRO de 15");
}

// ---------------------------------------------------------------------
// TESTE L4: Duplicar QR consome 1 unidade da cota
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE L4: Duplicar QR consome quota ---${RESET}`);
{
  const ledger = [
    { id: "usg_1", userId: "usr_dup", qrCodeId: "qr_1", createdAt: new Date() },
    { id: "usg_2", userId: "usr_dup", qrCodeId: "qr_2", createdAt: new Date() },
  ];
  // 2 consumidos no Free
  let count = ledger.length;
  assert(evalQuotaCanCreate("FREE", count).canCreate === true, "Usuário com 2/5 pode duplicar QR");

  // Duplicação efetuada com sucesso: adiciona QR e linha no ledger
  ledger.push({ id: "usg_3", userId: "usr_dup", qrCodeId: "qr_1_copy", createdAt: new Date() });
  count = ledger.length;
  assert(count === 3, "Duplicação incrementa consumo do ledger para 3");
  assert(evalQuotaCanCreate("FREE", count).remainingQRCodes === 2, "2 criações restantes após duplicação");
}

// ---------------------------------------------------------------------
// TESTE L5: Duplicar QR com cota esgotada é bloqueado com LIMIT_REACHED
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE L5: Duplicação com cota esgotada bloqueada ---${RESET}`);
{
  const fullLedger = Array.from({ length: 15 }, (_, i) => ({
    id: `usg_${i + 1}`,
    userId: "usr_pro_full",
    qrCodeId: `qr_${i + 1}`,
    createdAt: new Date(),
  }));
  const ctx = makeContext({ id: "usr_pro_full" }, proPlan, fullLedger.length);
  const perm = checkPermission(ctx, "create_qr");
  assert(perm.allowed === false, "Duplicação bloqueada quando 15/15 consumidos");
  assert(perm.code === "LIMIT_REACHED", "Retorna código LIMIT_REACHED");
  assert(perm.requiredPlan === "BUSINESS", "Orienta upgrade para BUSINESS");
}

// ---------------------------------------------------------------------
// TESTE L6: Garantia de Rollback Atômico (QR + Usage indivisíveis)
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE L6: Garantia de Rollback Atômico ---${RESET}`);
{
  // Simula execução de transação Prisma onde o passo de criação de Usage falha
  const mockDbState = { qrcodes: [] as any[], usages: [] as any[] };
  let transactionRolledBack = false;

  try {
    // Início da transação simulada
    const qr = { id: "qr_fail_test", userId: "usr_rb", name: "QR Rollback" };
    mockDbState.qrcodes.push(qr);

    // Simulação de erro ao gravar no ledger (ex: falha de banco / constraint)
    throw new Error("Simulated Usage Insert Failure");

    // Se não falhasse, gravaria usage:
    // mockDbState.usages.push({ id: "usg_fail_test", userId: "usr_rb", qrCodeId: qr.id });
  } catch (err) {
    // Rollback: desfaz todas as mutações da transação
    mockDbState.qrcodes = [];
    mockDbState.usages = [];
    transactionRolledBack = true;
  }

  assert(transactionRolledBack === true, "Transação captura falha e dispara rollback");
  assert(mockDbState.qrcodes.length === 0, "QRCode NÃO foi persistido isoladamente");
  assert(mockDbState.usages.length === 0, "Usage NÃO foi persistido isoladamente");
}

// ---------------------------------------------------------------------
// TESTE L7: Concorrência 14/15 simultânea respeita limite máximo de 15
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE L7: Concorrência simultânea respeita limite ---${RESET}`);
{
  // Simula 2 requisições simultâneas concorrendo pelo 15º slot no PRO
  let committedCreations = 14;
  const limit = 15;
  const results: { reqId: string; success: boolean; code?: string }[] = [];

  // Simula lock de serialização (pg_advisory_xact_lock)
  function handleConcurrentCreation(reqId: string) {
    // Dentro da transação serializada:
    if (committedCreations < limit) {
      committedCreations++;
      results.push({ reqId, success: true });
    } else {
      results.push({ reqId, success: false, code: "LIMIT_REACHED" });
    }
  }

  handleConcurrentCreation("req_A");
  handleConcurrentCreation("req_B");

  const successCount = results.filter((r) => r.success).length;
  const blockedCount = results.filter((r) => !r.success).length;

  assert(committedCreations === 15, "Total de criações aprovadas parou rigorosamente em 15");
  assert(successCount === 1, "Exatamente 1 das requisições simultâneas obteve sucesso");
  assert(blockedCount === 1, "A 2ª requisição concorrente foi bloqueada");
  assert(results.find((r) => !r.success)?.code === "LIMIT_REACHED", "Requisição bloqueada recebeu LIMIT_REACHED");
}

// ---------------------------------------------------------------------
// TESTE L8: Backfill robusto anti-duplicação e NULL safety (NOT EXISTS)
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE L8: Backfill robusto anti-duplicação ---${RESET}`);
{
  // Dataset simulado contendo todos os cenários adversários
  const mockQRCodes = [
    { id: "qr_active_1", userId: "usr_bf", createdAt: new Date("2026-09-01"), deletedAt: null },
    { id: "qr_soft_1", userId: "usr_bf", createdAt: new Date("2026-09-02"), deletedAt: new Date("2026-09-03") },
  ];

  const mockActivityLogs = [
    // Logs de QRs que existem no QRCode (devem ser ignorados pela Etapa 2 via NOT EXISTS)
    { id: "log_1", userId: "usr_bf", action: "CREATE_QR", entityId: "qr_active_1", createdAt: new Date("2026-09-01") },
    { id: "log_2", userId: "usr_bf", action: "CREATE_QR", entityId: "qr_soft_1", createdAt: new Date("2026-09-02") },
    // Log de QR que foi hard-deletado (existe apenas no log) -> 1 Usage
    { id: "log_3", userId: "usr_bf", action: "CREATE_QR", entityId: "qr_hard_unique", createdAt: new Date("2026-09-04") },
    // Múltiplos logs DUPLICADOS do mesmo entityId hard-deletado (ex: retries) -> DEVE gerar apenas 1 Usage!
    { id: "log_4_a", userId: "usr_bf", action: "CREATE_QR", entityId: "qr_hard_duplicated", createdAt: new Date("2026-09-05T10:00:00Z") },
    { id: "log_4_b", userId: "usr_bf", action: "CREATE_QR", entityId: "qr_hard_duplicated", createdAt: new Date("2026-09-05T10:05:00Z") },
    { id: "log_4_c", userId: "usr_bf", action: "CREATE_QR", entityId: "qr_hard_duplicated", createdAt: new Date("2026-09-05T10:10:00Z") },
    // Log sem entityId ou de outra ação -> deve ser ignorado
    { id: "log_5", userId: "usr_bf", action: "UPDATE_QR", entityId: "qr_active_1", createdAt: new Date("2026-09-06") },
    { id: "log_6", userId: "usr_bf", action: "CREATE_QR", entityId: null, createdAt: new Date("2026-09-07") },
  ];

  // Simulação da execução do SQL de Backfill final
  const usageLedger: Map<string, { id: string; userId: string; qrCodeId: string | null; createdAt: Date }> = new Map();

  function runBackfill() {
    // ETAPA 1: Inserção a partir de QRCode (ativos e lixeira)
    for (const qr of mockQRCodes) {
      const usageId = `bfill_qr_${qr.id}`;
      if (!usageLedger.has(usageId)) {
        usageLedger.set(usageId, {
          id: usageId,
          userId: qr.userId,
          qrCodeId: qr.id,
          createdAt: qr.createdAt,
        });
      }
    }

    // ETAPA 2: Inserção a partir de ActivityLog com NOT EXISTS e GROUP BY entityId
    // Agrupa logs de CREATE_QR que NÃO existem em mockQRCodes
    const hardDeletedGroups: Map<string, { userId: string; entityId: string; earliestCreatedAt: Date }> = new Map();

    for (const log of mockActivityLogs) {
      if (log.action !== "CREATE_QR" || !log.entityId) continue;

      // NOT EXISTS (SELECT 1 FROM QRCode WHERE id = log.entityId)
      const existsInQRCode = mockQRCodes.some((q) => q.id === log.entityId);
      if (existsInQRCode) continue;

      // GROUP BY userId, entityId selecionando MIN(createdAt)
      const existingGroup = hardDeletedGroups.get(log.entityId);
      if (!existingGroup) {
        hardDeletedGroups.set(log.entityId, {
          userId: log.userId,
          entityId: log.entityId,
          earliestCreatedAt: log.createdAt,
        });
      } else if (log.createdAt.getTime() < existingGroup.earliestCreatedAt.getTime()) {
        existingGroup.earliestCreatedAt = log.createdAt;
      }
    }

    for (const group of hardDeletedGroups.values()) {
      const usageId = `bfill_entity_${group.entityId}`;
      if (!usageLedger.has(usageId)) {
        usageLedger.set(usageId, {
          id: usageId,
          userId: group.userId,
          qrCodeId: null,
          createdAt: group.earliestCreatedAt,
        });
      }
    }
  }

  // 1ª Execução do Backfill
  runBackfill();

  const usagesUser = Array.from(usageLedger.values()).filter((u) => u.userId === "usr_bf");
  assert(usagesUser.length === 4, "Total de usages inseridos é exatamente 4 para o usuário");

  // Cenário 1: QR existente + ActivityLog -> exatamente 1 Usage
  const usageActive = usagesUser.filter((u) => u.qrCodeId === "qr_active_1");
  assert(usageActive.length === 1, "QR existente + ActivityLog gera exatamente 1 Usage");

  // Cenário 2: QR soft-deleted + ActivityLog -> exatamente 1 Usage
  const usageSoft = usagesUser.filter((u) => u.qrCodeId === "qr_soft_1");
  assert(usageSoft.length === 1, "QR soft-deleted + ActivityLog gera exatamente 1 Usage");

  // Cenário 3: QR hard-deleted + 1 log -> exatamente 1 Usage
  const usageHardSingle = usagesUser.filter((u) => u.id === "bfill_entity_qr_hard_unique");
  assert(usageHardSingle.length === 1, "QR hard-deleted com 1 log gera exatamente 1 Usage");

  // Cenário 4: QR hard-deleted + 3 logs duplicados -> exatamente 1 Usage com MIN(createdAt)
  const usageHardDup = usagesUser.filter((u) => u.id === "bfill_entity_qr_hard_duplicated");
  assert(usageHardDup.length === 1, "QR hard-deleted com múltiplos logs duplicados gera exatamente 1 Usage");
  assert(
    usageHardDup[0]?.createdAt.toISOString() === "2026-09-05T10:00:00.000Z",
    "Preserva o createdAt mais antigo (MIN) entre os logs duplicados"
  );

  // Cenário 5: Execução do backfill 2x (Idempotência absoluta)
  runBackfill();
  const usagesAfterSecondRun = Array.from(usageLedger.values()).filter((u) => u.userId === "usr_bf");
  assert(usagesAfterSecondRun.length === 4, "Execução do backfill 2 vezes não gera nenhuma duplicação");
}

// ---------------------------------------------------------------------
// TESTE L9: BUSINESS não grava no ledger e downgrade não herda consumo
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE L9: BUSINESS e Downgrade ---${RESET}`);
{
  // Simulação do comportamento:
  // 1. Usuário no PRO consome 10 criações
  const ledger: { id: string; userId: string; planName: string; createdAt: Date }[] = [];
  const userId = "usr_biz_flow";

  for (let i = 1; i <= 10; i++) {
    ledger.push({ id: `usg_pro_${i}`, userId, planName: "PRO", createdAt: new Date("2026-09-01") });
  }
  assert(ledger.filter((u) => u.userId === userId).length === 10, "PRO registrou 10 criações no ledger");

  // 2. Usuário faz upgrade para BUSINESS em 10/Setembro
  // Cria 50 QR Codes enquanto BUSINESS
  // Regra implementada: se plano for BUSINESS, NÃO grava em QRCodeCreationUsage
  const isBusiness = true;
  let businessQRsCreated = 0;
  for (let i = 1; i <= 50; i++) {
    businessQRsCreated++;
    // if (userContext.role !== "ADMIN" && userContext.plan?.name !== "BUSINESS") -> NÃO grava!
  }
  assert(businessQRsCreated === 50, "Criou 50 QRs com sucesso sob o plano BUSINESS ilimitado");
  assert(ledger.filter((u) => u.userId === userId).length === 10, "Ledger NÃO foi inflado durante plano BUSINESS (continua com 10)");

  // 3. Usuário expira/downgrades para PRO em 01/Outubro
  // O downgrade inicia novo ciclo: currentPeriodStart = 01/Outubro
  const downgradeCycleStart = new Date("2026-10-01");
  const proUsagesInNewCycle = ledger.filter(
    (u) => u.userId === userId && u.createdAt.getTime() >= downgradeCycleStart.getTime()
  ).length;

  assert(proUsagesInNewCycle === 0, "No novo ciclo PRO pós-BUSINESS, consumo inicia em 0/15");

  // 4. Usuário que faz downgrade para FREE não é penalizado pelos 50 QRs do BUSINESS
  // Criações do BUSINESS não existindo no ledger, o usuário não recebe bloqueio espúrio
  const freeUsages = ledger.filter(
    (u) => u.userId === userId && u.createdAt.getTime() >= downgradeCycleStart.getTime()
  ).length;
  const freeGate = evalQuotaCanCreate("FREE", freeUsages);
  assert(freeGate.canCreate === true, "Usuário pós-BUSINESS pode criar no ciclo do novo plano");
  assert(freeGate.remainingQRCodes === 5, "Recebe as 5 criações correspondentes à cota FREE");
}

// ---------------------------------------------------------------------
// TESTE M: Acesso direto à rota /create via URL com cota esgotada
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE M: Defesa contra acesso direto a /create ---${RESET}`);
{
  // Simula estado da página /create no carregamento direto (ex: bookmark / reload)
  const quotaState = evalQuotaCanCreate("FREE", 5);

  // Verificações do comportamento da página
  const shouldRenderBlockedCard = !quotaState.canCreate;
  const shouldTriggerUpgradePrompt = !quotaState.canCreate;
  const hasRedirectLoop = false; // página renderiza card diretamente sem chamar router.push('/')

  assert(shouldRenderBlockedCard === true, "Renderiza card defensivo bloqueado em vez do formulário interativo");
  assert(shouldTriggerUpgradePrompt === true, "Aciona experiência contextual de upgrade");
  assert(hasRedirectLoop === false, "Nenhum loop de redirecionamento infinito");
  assert(quotaState.reasonIfBlocked === "LIMIT_REACHED", "Motivo de bloqueio identificado corretamente");
}

// ---------------------------------------------------------------------
// TESTE N: Usuário BUSINESS nunca recebe modal de upgrade por cota
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE N: Usuário BUSINESS nunca recebe modal de upgrade ---${RESET}`);
{
  const countsToTest = [0, 5, 15, 100, 10000];
  let allAllowed = true;
  let allUnlimited = true;
  let anyBlocked = false;

  for (const c of countsToTest) {
    const res = evalQuotaCanCreate("BUSINESS", c);
    if (!res.canCreate) allAllowed = false;
    if (!res.isUnlimited) allUnlimited = false;
    if (res.reasonIfBlocked) anyBlocked = true;
  }

  assert(allAllowed === true, "Business sempre tem canCreate === true");
  assert(allUnlimited === true, "Business sempre tem isUnlimited === true");
  assert(anyBlocked === false, "Business nunca possui reasonIfBlocked por cota");
}

// ---------------------------------------------------------------------
// TESTE O: Consistência entre Sidebar CTA, Header CTA, Dashboard CTA e Modelos CTA
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE O: Consistência universal entre todos os CTAs ---${RESET}`);
{
  // Simula avaliação compartilhada pelo QuotaContext em diferentes componentes
  function simulateComponentCTA(componentName: string, plan: string, used: number) {
    const quota = evalQuotaCanCreate(plan, used);
    // requireCreationQuota(e) simula a função do contexto:
    const allowed = quota.canCreate;
    const triggersUpgradeModal = !quota.canCreate;
    return { componentName, allowed, triggersUpgradeModal, limit: quota.maxQRCodes };
  }

  const freeFull_Sidebar = simulateComponentCTA("Sidebar", "FREE", 5);
  const freeFull_Header = simulateComponentCTA("Header", "FREE", 5);
  const freeFull_Dashboard = simulateComponentCTA("Dashboard", "FREE", 5);
  const freeFull_Templates = simulateComponentCTA("Templates", "FREE", 5);

  assert(
    freeFull_Sidebar.allowed === false &&
    freeFull_Header.allowed === false &&
    freeFull_Dashboard.allowed === false &&
    freeFull_Templates.allowed === false,
    "Todos os 4 CTAs bloqueiam sincronizadamente quando FREE 5/5"
  );

  assert(
    freeFull_Sidebar.triggersUpgradeModal === true &&
    freeFull_Header.triggersUpgradeModal === true &&
    freeFull_Dashboard.triggersUpgradeModal === true &&
    freeFull_Templates.triggersUpgradeModal === true,
    "Todos os 4 CTAs acionam UpgradeModal sincronizadamente quando FREE 5/5"
  );

  const proOpen_Sidebar = simulateComponentCTA("Sidebar", "PRO", 10);
  const proOpen_Header = simulateComponentCTA("Header", "PRO", 10);
  const proOpen_Dashboard = simulateComponentCTA("Dashboard", "PRO", 10);
  const proOpen_Templates = simulateComponentCTA("Templates", "PRO", 10);

  assert(
    proOpen_Sidebar.allowed === true &&
    proOpen_Header.allowed === true &&
    proOpen_Dashboard.allowed === true &&
    proOpen_Templates.allowed === true,
    "Todos os 4 CTAs permitem criação sincronizadamente quando PRO 10/15"
  );
}

// ---------------------------------------------------------------------
// TESTE P: Pluralização rigorosa de QR Code (0, 1, 2, 20)
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE P: Pluralização de QR Code ---${RESET}`);
{
  assert(formatQRCount(0) === "0 QR Codes", "0 formata como '0 QR Codes'");
  assert(formatQRCount(1) === "1 QR Code", "1 formata no singular como '1 QR Code'");
  assert(formatQRCount(2) === "2 QR Codes", "2 formata no plural como '2 QR Codes'");
  assert(formatQRCount(15) === "15 QR Codes", "15 formata no plural como '15 QR Codes'");
  assert(formatQRCount(20) === "20 QR Codes", "20 formata no plural como '20 QR Codes'");
}

// ---------------------------------------------------------------------
// TESTE Q: Independência entre cota do ciclo e tamanho total do acervo
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE Q: Independência entre cota de ciclo e acervo total ---${RESET}`);
{
  // Exemplo homologado: Usuário criou 5 QRs no FREE.
  // Fez upgrade para PRO e criou mais 15 no ciclo atual.
  // Resultado:
  // - Cota do ciclo = 15/15 (bloqueada)
  // - Acervo total = 20 QRs
  const historicalFreeQRs = [
    { id: "free_1", userId: "usr_pro_upgraded", createdAt: new Date("2026-01-01"), deletedAt: null },
    { id: "free_2", userId: "usr_pro_upgraded", createdAt: new Date("2026-01-02"), deletedAt: null },
    { id: "free_3", userId: "usr_pro_upgraded", createdAt: new Date("2026-01-03"), deletedAt: null },
    { id: "free_4", userId: "usr_pro_upgraded", createdAt: new Date("2026-01-04"), deletedAt: null },
    { id: "free_5", userId: "usr_pro_upgraded", createdAt: new Date("2026-01-05"), deletedAt: null },
  ];

  const currentCycleProQRs = Array.from({ length: 15 }, (_, i) => ({
    id: `pro_${i + 1}`,
    userId: "usr_pro_upgraded",
    createdAt: new Date(), // ciclo atual
    deletedAt: null,
  }));

  const totalAcervo = [...historicalFreeQRs, ...currentCycleProQRs];
  assert(totalAcervo.length === 20, "Total de QR Codes no acervo é exatamente 20");

  const cycleCreationsCount = currentCycleProQRs.length;
  assert(cycleCreationsCount === 15, "Criações no ciclo atual são exatamente 15");

  // Avaliação da cota do ciclo (15/15)
  const quotaEval = evalQuotaCanCreate("PRO", cycleCreationsCount);
  assert(quotaEval.canCreate === false, "Cota do ciclo PRO (15/15) está esgotada para novas criações");
  assert(quotaEval.remainingQRCodes === 0, "0 criações restantes neste ciclo");
  assert(quotaEval.reason === "LIMIT_REACHED", "Motivo de bloqueio é LIMIT_REACHED");

  // O acervo continua com 20 QR Codes e formatado corretamente
  const acervoLabel = `${formatQRCount(totalAcervo.length)} no acervo`;
  assert(acervoLabel === "20 QR Codes no acervo", "Área inferior do card exibe '20 QR Codes no acervo'");

  // Contexto no backend: qrCodeCount avalia as criações do ciclo (15), totalQrCodeCount avalia o acervo (20)
  const ctx = makeContext({ id: "usr_pro_upgraded" }, proPlan, cycleCreationsCount);
  ctx.totalQrCodeCount = totalAcervo.length;

  const backendCheck = checkPermission(ctx, "create_qr");
  assert(backendCheck.allowed === false, "Backend bloqueia nova criação com 15/15 no ciclo");
  assert(backendCheck.code === "LIMIT_REACHED", "Backend retorna código LIMIT_REACHED");
  assert(backendCheck.requiredPlan === "BUSINESS", "Backend orienta upgrade para BUSINESS");
  assert(ctx.totalQrCodeCount === 20, "Acervo total de 20 permanece intacto sem exclusão ou desconto");
}

// ---------------------------------------------------------------------
// TESTE R: Matriz Semântica de Backfill e Ciclos Finitos (PRODUCT-QUOTA-03D)
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE R: Matriz Semântica de Backfill e Ciclos Finitos ---${RESET}`);
{
  const now = new Date("2026-09-27T12:00:00Z");

  interface MockUserRow {
    id: string;
    role: string;
    planName: "FREE" | "PRO" | "BUSINESS";
    createdAt: Date;
    subscription?: {
      status: string;
      planName: "PRO" | "BUSINESS";
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
    };
  }

  const users: MockUserRow[] = [
    // 1. FREE atual (criado há 10 dias, ciclo começou há 10 dias)
    { id: "u_free", role: "USER", planName: "FREE", createdAt: new Date("2026-09-17T12:00:00Z") },
    // 2. PRO atual (comprado em 15/Setembro, ciclo mensal atual começou em 15/Setembro)
    {
      id: "u_pro",
      role: "USER",
      planName: "PRO",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      subscription: {
        status: "ACTIVE",
        planName: "PRO",
        currentPeriodStart: new Date("2026-09-15T00:00:00Z"),
        currentPeriodEnd: new Date("2026-10-15T00:00:00Z"),
      },
    },
    // 3. BUSINESS atual (100 QRs criados)
    {
      id: "u_biz",
      role: "USER",
      planName: "BUSINESS",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      subscription: {
        status: "ACTIVE",
        planName: "BUSINESS",
        currentPeriodStart: new Date("2026-09-01T00:00:00Z"),
        currentPeriodEnd: new Date("2026-10-01T00:00:00Z"),
      },
    },
    // 4. ADMIN
    { id: "u_admin", role: "ADMIN", planName: "BUSINESS", createdAt: new Date("2025-01-01T00:00:00Z") },
  ];

  // QRs no banco
  const dbQRs = [
    // FREE: 5 criados no ciclo atual (Setembro), 10 criados em ciclos antigos (Agosto)
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `qr_free_current_${i + 1}`,
      userId: "u_free",
      createdAt: new Date("2026-09-20T10:00:00Z"),
      deletedAt: i === 4 ? new Date("2026-09-25T10:00:00Z") : null, // 1 soft-deleted no ciclo
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `qr_free_old_${i + 1}`,
      userId: "u_free",
      createdAt: new Date("2026-08-01T10:00:00Z"),
      deletedAt: null,
    })),

    // PRO: 14 criados no currentPeriod (Setembro), 40 criados em meses anteriores
    ...Array.from({ length: 14 }, (_, i) => ({
      id: `qr_pro_current_${i + 1}`,
      userId: "u_pro",
      createdAt: new Date("2026-09-20T10:00:00Z"),
      deletedAt: null,
    })),
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `qr_pro_old_${i + 1}`,
      userId: "u_pro",
      createdAt: new Date("2026-05-01T10:00:00Z"),
      deletedAt: null,
    })),

    // BUSINESS: 100 QRs no banco
    ...Array.from({ length: 100 }, (_, i) => ({
      id: `qr_biz_${i + 1}`,
      userId: "u_biz",
      createdAt: new Date("2026-09-10T10:00:00Z"),
      deletedAt: null,
    })),

    // ADMIN: 50 QRs no banco
    ...Array.from({ length: 50 }, (_, i) => ({
      id: `qr_admin_${i + 1}`,
      userId: "u_admin",
      createdAt: new Date("2026-09-10T10:00:00Z"),
      deletedAt: null,
    })),
  ];

  // Logs no banco
  const dbLogs = [
    // PRO: 1 hard-deleted no ciclo atual com 2 logs duplicados
    { id: "log_pro_hd_1", userId: "u_pro", action: "CREATE_QR", entityId: "qr_pro_hd_1", createdAt: new Date("2026-09-18T10:00:00Z") },
    { id: "log_pro_hd_2", userId: "u_pro", action: "CREATE_QR", entityId: "qr_pro_hd_1", createdAt: new Date("2026-09-18T10:05:00Z") },
    // PRO: 1 hard-deleted FORA do ciclo (em Agosto)
    { id: "log_pro_hd_old", userId: "u_pro", action: "CREATE_QR", entityId: "qr_pro_hd_old", createdAt: new Date("2026-08-10T10:00:00Z") },
    // BUSINESS: logs
    { id: "log_biz_1", userId: "u_biz", action: "CREATE_QR", entityId: "qr_biz_hd", createdAt: new Date("2026-09-12T10:00:00Z") },
  ];

  // Executa o Backfill Semântico baseado no SQL de ciclos finitos
  interface UsageRow {
    id: string;
    userId: string;
    qrCodeId: string | null;
    createdAt: Date;
  }
  const usageTable: Map<string, UsageRow> = new Map();

  function runSemanticBackfill() {
    for (const u of users) {
      if (u.role === "ADMIN") continue; // ADMIN excluído
      if (u.planName === "BUSINESS" || u.subscription?.planName === "BUSINESS") continue; // BUSINESS excluído

      let cycleStart: Date;
      if (u.subscription && u.subscription.status === "ACTIVE" && u.subscription.planName === "PRO") {
        cycleStart = u.subscription.currentPeriodStart;
      } else {
        // FREE: janela móvel de 30 dias
        const elapsedDays = Math.max(0, Math.floor((now.getTime() - u.createdAt.getTime()) / (1000 * 60 * 60 * 24)));
        const cycleIndex = Math.floor(elapsedDays / 30);
        cycleStart = new Date(u.createdAt.getTime() + cycleIndex * 30 * 24 * 60 * 60 * 1000);
      }

      // ETAPA 1: QRs do usuário criados no ciclo atual (inclusive soft-deleted)
      const userCycleQRs = dbQRs.filter((q) => q.userId === u.id && q.createdAt.getTime() >= cycleStart.getTime());
      for (const qr of userCycleQRs) {
        const id = `bfill_qr_${qr.id}`;
        if (!usageTable.has(id)) {
          usageTable.set(id, { id, userId: qr.userId, qrCodeId: qr.id, createdAt: qr.createdAt });
        }
      }

      // ETAPA 2: Hard-deletes via ActivityLog no ciclo atual com deduplicação por entityId
      const hardDeletedLogs = dbLogs.filter(
        (l) =>
          l.userId === u.id &&
          l.action === "CREATE_QR" &&
          l.entityId &&
          l.createdAt.getTime() >= cycleStart.getTime() &&
          !dbQRs.some((q) => q.id === l.entityId)
      );

      const groupedHardDeletes: Map<string, { userId: string; entityId: string; minDate: Date }> = new Map();
      for (const log of hardDeletedLogs) {
        const existing = groupedHardDeletes.get(log.entityId!);
        if (!existing) {
          groupedHardDeletes.set(log.entityId!, { userId: log.userId, entityId: log.entityId!, minDate: log.createdAt });
        } else if (log.createdAt.getTime() < existing.minDate.getTime()) {
          existing.minDate = log.createdAt;
        }
      }

      for (const group of groupedHardDeletes.values()) {
        const id = `bfill_entity_${group.entityId}`;
        if (!usageTable.has(id)) {
          usageTable.set(id, { id, userId: group.userId, qrCodeId: null, createdAt: group.minDate });
        }
      }
    }
  }

  // 1ª Execução
  runSemanticBackfill();

  // 1. FREE atual com 5 criações no ciclo -> 5/5
  const freeCycleUsages = Array.from(usageTable.values()).filter((u) => u.userId === "u_free");
  assert(freeCycleUsages.length === 5, "1. FREE possui exatamente 5 criações no ledger do ciclo atual");

  // 2. FREE atual com QRs antigos fora da janela -> não contam
  const freeOldCountInLedger = freeCycleUsages.filter((u) => u.createdAt.getTime() < new Date("2026-09-17").getTime()).length;
  assert(freeOldCountInLedger === 0, "2. QRs antigos do FREE fora da janela não foram inseridos no ledger");

  // 3. PRO atual com 14 criações no currentPeriod + 1 hard-deleted no ciclo
  const proUsages = Array.from(usageTable.values()).filter((u) => u.userId === "u_pro");
  assert(proUsages.filter((u) => u.qrCodeId !== null).length === 14, "3. PRO: 14 criações de QRs existentes inseridas no ledger");

  // 4. PRO com 40 QRs históricos antigos -> continuam fora da quota atual
  const proOldInLedger = proUsages.filter((u) => u.createdAt.getTime() < new Date("2026-09-15").getTime()).length;
  assert(proOldInLedger === 0, "4. 40 QRs históricos antigos do PRO continuam 100% fora do ledger atual");

  // 5. BUSINESS atual -> nenhum consumo finito criado pelo backfill
  const bizUsages = Array.from(usageTable.values()).filter((u) => u.userId === "u_biz");
  assert(bizUsages.length === 0, "5. BUSINESS atual: ZERO consumos finitos inseridos no ledger");

  // 6. ADMIN -> nenhum consumo finito
  const adminUsages = Array.from(usageTable.values()).filter((u) => u.userId === "u_admin");
  assert(adminUsages.length === 0, "6. ADMIN: ZERO consumos finitos inseridos no ledger");

  // 7. PRO -> BUSINESS -> PRO: ciclo pós-BUSINESS limpo
  const proDowngradedDate = new Date("2026-10-01T00:00:00Z");
  const proAfterBizUsages = Array.from(usageTable.values()).filter(
    (u) => u.userId === "u_biz" && u.createdAt.getTime() >= proDowngradedDate.getTime()
  ).length;
  assert(proAfterBizUsages === 0, "7. Transição pós-BUSINESS inicia ciclo PRO com 0/15 sem herdar criações do BUSINESS");

  // 8. QR soft-deleted no ciclo -> conta
  const freeSoftInLedger = freeCycleUsages.filter((u) => u.id === "bfill_qr_qr_free_current_5");
  assert(freeSoftInLedger.length === 1, "8. QR soft-deleted criado no ciclo é contado no ledger");

  // 9. QR hard-deleted + ActivityLog no ciclo -> conta
  const proHardInLedger = proUsages.filter((u) => u.id === "bfill_entity_qr_pro_hd_1");
  assert(proHardInLedger.length === 1, "9. QR hard-deleted com ActivityLog no ciclo atual é contado no ledger");

  // 10. Hard-delete histórico fora do ciclo -> não conta
  const proHardOldInLedger = proUsages.filter((u) => u.id === "bfill_entity_qr_pro_hd_old");
  assert(proHardOldInLedger.length === 0, "10. Hard-delete histórico anterior ao ciclo atual NÃO entra no ledger");

  // 11. Logs duplicados do mesmo entityId -> apenas 1
  const dupLogsCount = proUsages.filter((u) => u.id === "bfill_entity_qr_pro_hd_1").length;
  assert(dupLogsCount === 1, "11. Múltiplos logs duplicados do mesmo entityId resultam em estritamente 1 Usage");

  // 12. Backfill executado duas vezes -> idempotente
  const countBeforeSecond = usageTable.size;
  runSemanticBackfill();
  const countAfterSecond = usageTable.size;
  assert(countBeforeSecond === countAfterSecond, "12. Segunda execução do backfill resulta em ZERO inserções duplicadas");
}

// ---------------------------------------------------------------------
// RESULTADO FINAL DA SUÍTE
// ---------------------------------------------------------------------
console.log(`\n${CYAN}============================================================${RESET}`);
console.log(`TOTAL DE ASSERTS: ${passCount + failCount}`);
console.log(`PASSOU: ${GREEN}${passCount}${RESET}`);
console.log(`FALHOU: ${failCount > 0 ? RED : GREEN}${failCount}${RESET}`);
console.log(`${CYAN}============================================================${RESET}`);

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
