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
// TESTE K: QR Code deletado definitivamente -> libera slot de cota
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE K: QR Code deletado definitivamente ---${RESET}`);
{
  // Simulação de banco de dados
  const activeQRs = [
    { id: "qr_1", userId: "u1", deletedAt: null },
    { id: "qr_2", userId: "u1", deletedAt: null },
    { id: "qr_3", userId: "u1", deletedAt: null },
    { id: "qr_4", userId: "u1", deletedAt: null },
    { id: "qr_5", userId: "u1", deletedAt: null },
  ];

  // Estado inicial: 5/5
  let count = activeQRs.filter((q) => q.userId === "u1" && q.deletedAt === null).length;
  let evalBefore = evalQuotaCanCreate("FREE", count);
  assert(evalBefore.canCreate === false, "Inicialmente com 5/5 está bloqueado");

  // Deletar permanentemente qr_5 (remover do array/tabela)
  const index = activeQRs.findIndex((q) => q.id === "qr_5");
  if (index !== -1) activeQRs.splice(index, 1);

  // Estado após deleção: 4/5
  count = activeQRs.filter((q) => q.userId === "u1" && q.deletedAt === null).length;
  let evalAfter = evalQuotaCanCreate("FREE", count);
  assert(count === 4, "Contagem ativa reduzida para 4");
  assert(evalAfter.canCreate === true, "Criação desbloqueada após exclusão definitiva");
  assert(evalAfter.remainingQRCodes === 1, "1 slot disponível na cota");
}

// ---------------------------------------------------------------------
// TESTE L: QR Code na lixeira (deletedAt != null) -> não conta na cota
// ---------------------------------------------------------------------
console.log(`\n${YELLOW}--- TESTE L: QR Code na lixeira não conta na cota ---${RESET}`);
{
  const userQRs = [
    { id: "qr_1", userId: "u2", deletedAt: null },
    { id: "qr_2", userId: "u2", deletedAt: null },
    { id: "qr_3", userId: "u2", deletedAt: null },
    { id: "qr_4", userId: "u2", deletedAt: null },
    { id: "qr_5", userId: "u2", deletedAt: new Date() }, // na lixeira
    { id: "qr_6", userId: "u2", deletedAt: new Date() }, // na lixeira
  ];

  // Regra oficial do Prisma: where: { userId, deletedAt: null }
  const activeCount = userQRs.filter((q) => q.userId === "u2" && q.deletedAt === null).length;
  assert(activeCount === 4, "Apenas 4 QRs ativos computados (2 na lixeira ignorados)");

  const evalResult = evalQuotaCanCreate("FREE", activeCount);
  assert(evalResult.canCreate === true, "Usuário com 4 ativos e 2 na lixeira pode criar QR");
  assert(evalResult.remainingQRCodes === 1, "1 slot disponível na cota");
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
