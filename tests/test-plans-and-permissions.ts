import {
  can,
  checkPermission,
  DEFAULT_FREE_PLAN,
  PlanDetails,
  UserPlanContext,
} from "../src/lib/permissions";

// Cores para saída no terminal
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

// Planos canônicos do sistema (definidos no Prisma Seed)
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
  priceMonth: 39.9,
  maxQRCodes: 100,
  dynamicQRs: true,
  analytics: true,
  exportSvg: true,
  exportPdf: true,
  customLogo: true,
  campaigns: true,
};

const businessPlan: PlanDetails = {
  name: "BUSINESS",
  displayName: "Plano Business",
  priceMonth: 99.9,
  maxQRCodes: 999999,
  dynamicQRs: true,
  analytics: true,
  exportSvg: true,
  exportPdf: true,
  customLogo: true,
  campaigns: true,
};

async function runPlanAndPermissionTests() {
  console.log(`\n==========================================================`);
  console.log(`🛡️  SUÍTE DE TESTES: PLANOS, LIMITES E PERMISSÕES QR MASTER`);
  console.log(`==========================================================\n`);

  console.log(`${CYAN}▶ 1. Testando Limites Reais e Bloqueios do Usuário FREE:${RESET}`);
  {
    const freeUserContext: UserPlanContext = {
      id: "usr_free_01",
      role: "USER",
      planId: "plan_free_id",
      plan: freePlan,
      qrCodeCount: 0,
    };

    // Criação inicial (com 0 a 4 QRs)
    assert(can(freeUserContext, "create_qr") === true, "FREE pode criar QR code quando count < 5");

    // Recursos PRO/BUSINESS bloqueados para FREE
    assert(can(freeUserContext, "dynamic_qr") === false, "FREE: QR Code dinâmico BLOQUEADO");
    assert(can(freeUserContext, "analytics") === false, "FREE: Telemetria e Analytics BLOQUEADO");
    assert(can(freeUserContext, "export_svg") === false, "FREE: Exportação em vetor SVG BLOQUEADO");
    assert(can(freeUserContext, "export_pdf") === false, "FREE: Exportação em documento PDF BLOQUEADO");
    assert(can(freeUserContext, "custom_logo") === false, "FREE: Logotipo personalizado no centro BLOQUEADO");
    assert(can(freeUserContext, "campaigns") === false, "FREE: Gerenciamento de campanhas BLOQUEADO");

    // Simulação progressiva de criação até o limite
    for (let count = 1; count <= 4; count++) {
      const progressiveContext: UserPlanContext = { ...freeUserContext, qrCodeCount: count };
      assert(can(progressiveContext, "create_qr") === true, `FREE pode criar QR Code com saldo ativo (${count}/5)`);
    }

    // Atingindo o limite exato de 5 QRs
    const atLimitContext: UserPlanContext = { ...freeUserContext, qrCodeCount: 5 };
    const checkLimit = checkPermission(atLimitContext, "create_qr");
    assert(checkLimit.allowed === false, "FREE: Tentativa de criar o 6º QR Code é BLOQUEADA (403)");
    assert(checkLimit.code === "LIMIT_REACHED", "Código de erro retornado é LIMIT_REACHED");
    assert(checkLimit.requiredPlan === "PRO", "Sugere upgrade para o plano PRO");
    assert(checkLimit.limit === 5, "Informa limite máximo de 5");
    assert(checkLimit.current === 5, "Informa contagem atual de 5");
    assert(can(atLimitContext, "create_qr") === false, "can(user, 'create_qr') avalia para false quando count = 5");
  }

  console.log(`\n${CYAN}▶ 2. Testando Recursos e Limites Reais do Usuário PRO:${RESET}`);
  {
    const proUserContext: UserPlanContext = {
      id: "usr_pro_02",
      role: "USER",
      planId: "plan_pro_id",
      plan: proPlan,
      qrCodeCount: 5, // Já ultrapassou o limite do plano FREE
    };

    assert(can(proUserContext, "create_qr") === true, "PRO pode criar QR Code mesmo já possuindo 5 (limite FREE)");
    assert(can(proUserContext, "dynamic_qr") === true, "PRO: QR Code dinâmico LIBERADO");
    assert(can(proUserContext, "analytics") === true, "PRO: Telemetria e Analytics LIBERADO");
    assert(can(proUserContext, "export_svg") === true, "PRO: Exportação em vetor SVG LIBERADO");
    assert(can(proUserContext, "export_pdf") === true, "PRO: Exportação em documento PDF LIBERADO");
    assert(can(proUserContext, "custom_logo") === true, "PRO: Logotipo personalizado LIBERADO");
    assert(can(proUserContext, "campaigns") === true, "PRO: Gestão de campanhas promocionais LIBERADO");

    // Limite real do plano PRO (100 QRs)
    const proAtLimitContext: UserPlanContext = { ...proUserContext, qrCodeCount: 100 };
    const checkProLimit = checkPermission(proAtLimitContext, "create_qr");
    assert(checkProLimit.allowed === false, "PRO: Tentativa de criar o 101º QR Code é BLOQUEADA");
    assert(checkProLimit.code === "LIMIT_REACHED", "Código de erro para PRO no limite é LIMIT_REACHED");
  }

  console.log(`\n${CYAN}▶ 3. Testando Recursos e Limites do Usuário BUSINESS:${RESET}`);
  {
    const businessUserContext: UserPlanContext = {
      id: "usr_biz_03",
      role: "USER",
      planId: "plan_biz_id",
      plan: businessPlan,
      qrCodeCount: 250, // Alto volume de criação
    };

    assert(can(businessUserContext, "create_qr") === true, "BUSINESS: Pode criar QR codes em alto volume (250 QRs)");
    assert(can(businessUserContext, "dynamic_qr") === true, "BUSINESS: QR dinâmico LIBERADO");
    assert(can(businessUserContext, "analytics") === true, "BUSINESS: Analytics LIBERADO");
    assert(can(businessUserContext, "export_svg") === true, "BUSINESS: Exportação SVG LIBERADO");
    assert(can(businessUserContext, "export_pdf") === true, "BUSINESS: Exportação PDF LIBERADO");
    assert(can(businessUserContext, "custom_logo") === true, "BUSINESS: Logotipo LIBERADO");
    assert(can(businessUserContext, "campaigns") === true, "BUSINESS: Campanhas LIBERADO");
  }

  console.log(`\n${CYAN}▶ 4. Testando Bypass de Administrador (Role ADMIN):${RESET}`);
  {
    const adminUserContext: UserPlanContext = {
      id: "usr_admin_04",
      role: "ADMIN",
      planId: null,
      plan: freePlan, // Mesmo se com plano free ou nulo
      qrCodeCount: 10000,
    };

    assert(can(adminUserContext, "create_qr") === true, "ADMIN possui bypass irrestrito de limite de QR Codes");
    assert(can(adminUserContext, "dynamic_qr") === true, "ADMIN possui bypass para QR dinâmico");
    assert(can(adminUserContext, "analytics") === true, "ADMIN possui bypass para analytics");
    assert(can(adminUserContext, "export_svg") === true, "ADMIN possui bypass para SVG");
    assert(can(adminUserContext, "export_pdf") === true, "ADMIN possui bypass para PDF");
    assert(can(adminUserContext, "custom_logo") === true, "ADMIN possui bypass para logotipo");
    assert(can(adminUserContext, "campaigns") === true, "ADMIN possui bypass para campanhas");
  }

  console.log(`\n${CYAN}▶ 5. Testando Fallback de Assinatura e Planos Inválidos:${RESET}`);
  {
    // Usuário sem plano associado
    const noPlanContext: UserPlanContext = {
      id: "usr_noplan_05",
      role: "USER",
      plan: null,
      qrCodeCount: 5,
    };
    assert(can(noPlanContext, "create_qr") === false, "Usuário sem plano recai em DEFAULT_FREE_PLAN e bloqueia além de 5 QRs");
    assert(can(noPlanContext, "dynamic_qr") === false, "Usuário sem plano recai em DEFAULT_FREE_PLAN (sem QR dinâmico)");

    // Contexto nulo (deslogado)
    assert(can(null, "create_qr") === false, "Contexto nulo recai em bloqueio (unauthorized)");
    assert(can(undefined, "analytics") === false, "Contexto indefinido recai em bloqueio (unauthorized)");
  }

  console.log(`\n${CYAN}▶ 6. Simulação de Proteção de Endpoints no Servidor:${RESET}`);
  {
    // Simula requisições reais aos endpoints protegidos
    // A) POST /api/qr para usuário FREE no limite
    const simulatePostQR = (user: UserPlanContext, isDynamic: boolean, hasLogo: boolean, campaignId?: string) => {
      const canCreate = checkPermission(user, "create_qr");
      if (!canCreate.allowed) return { status: 403, error: canCreate.reason, code: canCreate.code };

      if (isDynamic) {
        const canDyn = checkPermission(user, "dynamic_qr");
        if (!canDyn.allowed) return { status: 403, error: canDyn.reason, code: canDyn.code };
      }

      if (hasLogo) {
        const canLog = checkPermission(user, "custom_logo");
        if (!canLog.allowed) return { status: 403, error: canLog.reason, code: canLog.code };
      }

      if (campaignId) {
        const canCamp = checkPermission(user, "campaigns");
        if (!canCamp.allowed) return { status: 403, error: canCamp.reason, code: canCamp.code };
      }

      return { status: 200, success: true };
    };

    const freeUserAtLimit: UserPlanContext = { id: "u1", role: "USER", plan: freePlan, qrCodeCount: 5 };
    const res1 = simulatePostQR(freeUserAtLimit, false, false);
    assert(res1.status === 403 && res1.code === "LIMIT_REACHED", "API POST /api/qr: Bloqueou criação no limite FREE (403)");

    const freeUserUnderLimit: UserPlanContext = { id: "u2", role: "USER", plan: freePlan, qrCodeCount: 2 };
    const res2 = simulatePostQR(freeUserUnderLimit, true, false);
    assert(res2.status === 403 && res2.code === "UPGRADE_REQUIRED", "API POST /api/qr: Bloqueou QR dinâmico para plano FREE (403)");

    const res3 = simulatePostQR(freeUserUnderLimit, false, true);
    assert(res3.status === 403 && res3.code === "UPGRADE_REQUIRED", "API POST /api/qr: Bloqueou logotipo para plano FREE (403)");

    const res4 = simulatePostQR(freeUserUnderLimit, false, false, "camp_123");
    assert(res4.status === 403 && res4.code === "UPGRADE_REQUIRED", "API POST /api/qr: Bloqueou vínculo de campanha para plano FREE (403)");

    const proUser: UserPlanContext = { id: "u3", role: "USER", plan: proPlan, qrCodeCount: 10 };
    const res5 = simulatePostQR(proUser, true, true, "camp_123");
    assert(res5.status === 200 && res5.success === true, "API POST /api/qr: Autorizou criação completa para usuário PRO (200)");

    // B) POST /api/files/save
    const simulateSaveFile = (user: UserPlanContext, fileType: "png" | "svg" | "pdf") => {
      if (fileType === "svg" || fileType === "pdf") {
        const action = fileType === "svg" ? "export_svg" : "export_pdf";
        const canExp = checkPermission(user, action);
        if (!canExp.allowed) return { status: 403, error: canExp.reason, code: canExp.code };
      }
      return { status: 200, success: true };
    };

    assert(simulateSaveFile(freeUserUnderLimit, "png").status === 200, "API POST /api/files/save: PNG liberado para FREE");
    assert(simulateSaveFile(freeUserUnderLimit, "svg").status === 403, "API POST /api/files/save: SVG bloqueado para FREE (403)");
    assert(simulateSaveFile(freeUserUnderLimit, "pdf").status === 403, "API POST /api/files/save: PDF bloqueado para FREE (403)");
    assert(simulateSaveFile(proUser, "svg").status === 200, "API POST /api/files/save: SVG liberado para PRO (200)");
    assert(simulateSaveFile(proUser, "pdf").status === 200, "API POST /api/files/save: PDF liberado para PRO (200)");

    // C) POST /api/storage/upload para folder 'logos'
    const simulateUploadLogo = (user: UserPlanContext, folder: string) => {
      if (folder === "logos") {
        const canLog = checkPermission(user, "custom_logo");
        if (!canLog.allowed) return { status: 403, error: canLog.reason };
      }
      return { status: 200, success: true };
    };

    assert(simulateUploadLogo(freeUserUnderLimit, "logos").status === 403, "API POST /api/storage/upload: Upload de logo bloqueado para FREE (403)");
    assert(simulateUploadLogo(proUser, "logos").status === 200, "API POST /api/storage/upload: Upload de logo liberado para PRO (200)");

    // D) GET /api/analytics
    const simulateGetAnalytics = (user: UserPlanContext) => {
      const canAna = checkPermission(user, "analytics");
      if (!canAna.allowed) return { status: 403, error: canAna.reason };
      return { status: 200, data: [] };
    };

    assert(simulateGetAnalytics(freeUserUnderLimit).status === 403, "API GET /api/analytics: Bloqueado para plano FREE (403)");
    assert(simulateGetAnalytics(proUser).status === 200, "API GET /api/analytics: Autorizado para plano PRO (200)");
  }

  console.log(`\n==========================================================`);
  console.log(`TOTAL DE TESTES DE PLANOS E LIMITES: ${totalTests}`);
  console.log(`${GREEN}APROVADOS: ${passedTests}${RESET}`);
  console.log(`${failedTests === 0 ? GREEN : RED}FALHAS: ${failedTests}${RESET}`);
  console.log(`==========================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPlanAndPermissionTests().catch((err) => {
  console.error("Erro fatal nos testes:", err);
  process.exit(1);
});
