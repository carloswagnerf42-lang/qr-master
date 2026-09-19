import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import { NextRequest } from "next/server";
import { GET as getDashboard } from "../src/app/api/dashboard/route";
import { computeComparison } from "../src/lib/permissions";
import { POST as createQR } from "../src/app/api/qr/route";
import { GET as getAnalytics } from "../src/app/api/analytics/route";
import fs from "fs";
import path from "path";

function createAuthRequest(
  url: string,
  user: { id: string; name: string; email: string; role: string; planId?: string | null },
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): NextRequest {
  const token = signToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    planId: user.planId,
  });

  const headers: Record<string, string> = {
    cookie: `qrmaster_session=${token}`,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...(options.headers || {}),
  };

  const init: any = {
    method: options.method || (options.body ? "POST" : "GET"),
    headers,
  };

  if (options.body) {
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? "-> " + detail : ""}`);
    throw new Error(`Assertion failed: ${testName} - ${detail || ""}`);
  }
}

async function runUXDashboardSettingsSuite() {
  console.log("\n=======================================================");
  console.log("🧪 SUÍTE DE TESTES: UX DASHBOARD, SETTINGS E PERMISSÕES");
  console.log("=======================================================\n");

  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
  const bizPlan = await prisma.plan.findUnique({ where: { name: "BUSINESS" } });

  if (!freePlan || !proPlan || !bizPlan) {
    throw new Error("Planos base não encontrados no banco");
  }

  // Setup de usuário sintético para teste de Dashboard com 0 scans
  const testFreeUser = await prisma.user.upsert({
    where: { email: "audit_ux_free@qrmaster.com" },
    update: { planId: freePlan.id, role: "USER" },
    create: {
      name: "Audit UX Free",
      email: "audit_ux_free@qrmaster.com",
      passwordHash: "hash_test_123",
      role: "USER",
      planId: freePlan.id,
    },
  });

  // Limpeza prévia de QRs e scans do usuário sintético
  const existingQRs = await prisma.qRCode.findMany({ where: { userId: testFreeUser.id }, select: { id: true } });
  const existingQrIds = existingQRs.map(q => q.id);
  if (existingQrIds.length > 0) {
    await prisma.qRCodeScan.deleteMany({ where: { qrCodeId: { in: existingQrIds } } });
    await prisma.qRCode.deleteMany({ where: { userId: testFreeUser.id } });
  }

  // TESTE 1: Conta com 0 scans não mostra percentuais fictícios
  console.log("\n--- Teste 1: Conta com 0 scans não exibe percentuais fictícios ---");
  const dashReq = createAuthRequest("/api/dashboard", testFreeUser, { method: "GET" });
  const dashRes = await getDashboard(dashReq);
  const dashData = await dashRes.json();
  assert(dashRes.status === 200, "Dashboard retorna 200");
  assert(dashData.cards.totalScans.value === 0, "totalScans é 0");
  assert(dashData.cards.scansToday.value === 0, "scansToday é 0");
  assert(dashData.cards.scans7Days.value === 0, "scans7Days é 0");
  assert(dashData.cards.scans30Days.value === 0, "scans30Days é 0");
  const forbiddenMocks = ["14.2", "19.5", "24.8", "+8%", "+2 este mês"];
  const allCardChanges = Object.values(dashData.cards).map((c: any) => c.change).join(" ");
  const hasForbiddenMock = forbiddenMocks.some(m => allCardChanges.includes(m));
  assert(!hasForbiddenMock, "Nenhuma string mockada (+14.2%, +8%, etc) está presente nos cards");

  // TESTE 2: 0 atual / 0 anterior -> 'Sem variação'
  console.log("\n--- Teste 2: 0 atual / 0 anterior -> 'Sem variação' ---");
  const zeroComparison = computeComparison(0, 0, "mês anterior");
  assert(zeroComparison.change === "Sem variação" && zeroComparison.trend === "neutral",
    "computeComparison(0, 0) retorna 'Sem variação' e trend 'neutral'");
  assert(dashData.cards.totalScans.change === "Sem variação", "totalScans.change é 'Sem variação'");
  assert(dashData.cards.scansToday.change === "Sem variação", "scansToday.change é 'Sem variação'");
  assert(dashData.cards.scans7Days.change === "Sem variação", "scans7Days.change é 'Sem variação'");
  assert(dashData.cards.scans30Days.change === "Sem variação", "scans30Days.change é 'Sem variação'");

  // TESTE 3: atual > 0 / anterior = 0 -> não mostrar percentual matematicamente falso ('Novo período')
  console.log("\n--- Teste 3: atual > 0 / anterior = 0 -> 'Novo período' ---");
  const newPeriodComp = computeComparison(10, 0, "mês anterior");
  assert(newPeriodComp.change === "Novo período" && newPeriodComp.trend === "up",
    "computeComparison(10, 0) retorna 'Novo período' e trend 'up' sem divisão por zero");

  // TESTE 4: crescimento positivo real
  console.log("\n--- Teste 4: crescimento positivo real ---");
  const positiveComp = computeComparison(15, 10, "mês anterior");
  assert(positiveComp.change === "+50% vs mês anterior" && positiveComp.trend === "up",
    "computeComparison(15, 10) retorna '+50% vs mês anterior' e trend 'up'");

  // TESTE 5: queda real
  console.log("\n--- Teste 5: queda real ---");
  const negativeComp = computeComparison(5, 10, "mês anterior");
  assert(negativeComp.change === "-50% vs mês anterior" && negativeComp.trend === "down",
    "computeComparison(5, 10) retorna '-50% vs mês anterior' e trend 'down'");

  // TESTE 6: botão do Analytics FREE abre diretamente Plano & Limites
  console.log("\n--- Teste 6: Botão do Analytics FREE aponta para /settings?tab=plan ---");
  const analyticsPagePath = path.resolve(process.cwd(), "src/app/(dashboard)/analytics/page.tsx");
  const analyticsPageContent = fs.readFileSync(analyticsPagePath, "utf-8");
  assert(analyticsPageContent.includes('href="/settings?tab=plan"'),
    "analytics/page.tsx contém href='/settings?tab=plan'");

  // TESTE 7: refresh da URL mantém Plano & Limites selecionado
  console.log("\n--- Teste 7: SettingsPage interpreta e preserva tab=plan via URL / refresh ---");
  const settingsPagePath = path.resolve(process.cwd(), "src/app/(dashboard)/settings/page.tsx");
  const settingsPageContent = fs.readFileSync(settingsPagePath, "utf-8");
  assert(settingsPageContent.includes('urlTab === "plan"') && settingsPageContent.includes('tab === "plan"'),
    "settings/page.tsx interpreta urlTab === 'plan' e tab === 'plan'");
  assert(settingsPageContent.includes("useSearchParams"),
    "settings/page.tsx utiliza useSearchParams reativo do Next.js");

  // TESTE 8: FREE não apresenta recursos premium como habilitados
  console.log("\n--- Teste 8: FREE não apresenta recursos premium como habilitados ---");
  assert(settingsPageContent.includes('userPlan?.name === "FREE"'),
    "settings/page.tsx possui renderização condicional dedicada para plano FREE");
  assert(settingsPageContent.includes("Recursos Disponíveis com Upgrade:"),
    "settings/page.tsx possui seção explícita 'Recursos Disponíveis com Upgrade'");
  assert(settingsPageContent.includes("Disponível no PRO"),
    "Recursos bloqueados para FREE exibem badge 'Disponível no PRO'");

  // TESTE 9: PRO apresenta somente recursos realmente permitidos
  console.log("\n--- Teste 9: PRO apresenta somente recursos permitidos ---");
  assert(proPlan.dynamicQRs === true && proPlan.analytics === true && proPlan.customLogo === true,
    "Plano PRO possui dynamicQRs, analytics e customLogo como true no banco");
  assert(proPlan.maxQRCodes === 15, "Plano PRO possui cota de 15 QR Codes no banco");

  // TESTE 10: BUSINESS apresenta recursos correspondentes ao plano
  console.log("\n--- Teste 10: BUSINESS apresenta recursos correspondentes ao plano ---");
  assert(bizPlan.dynamicQRs === true && bizPlan.analytics === true && bizPlan.customLogo === true,
    "Plano BUSINESS possui dynamicQRs, analytics e customLogo como true");
  assert(bizPlan.maxQRCodes >= 999999, "Plano BUSINESS possui cota ilimitada (999.999)");

  // TESTE 11: Preços continuam corretos
  console.log("\n--- Teste 11: Preços oficiais conferidos no banco de dados ---");
  assert(Number(proPlan.priceMonth) === 19.9, `PRO mensal é R$ 19,90 (atual: ${proPlan.priceMonth})`);
  assert(Number(proPlan.priceYear) === 99.0, `PRO anual é R$ 99,00 (atual: ${proPlan.priceYear})`);
  assert(Number(bizPlan.priceMonth) === 29.9, `BUSINESS mensal é R$ 29,90 (atual: ${bizPlan.priceMonth})`);
  assert(Number(bizPlan.priceYear) === 199.0, `BUSINESS anual é R$ 199,00 (atual: ${bizPlan.priceYear})`);

  // TESTE 12: Checkout não foi alterado
  console.log("\n--- Teste 12: Checkout Mercado Pago permanece inalterado ---");
  const checkoutRoutePath = path.resolve(process.cwd(), "src/app/api/billing/mercadopago/checkout/route.ts");
  const checkoutRouteContent = fs.readFileSync(checkoutRoutePath, "utf-8");
  assert(checkoutRouteContent.includes("createMercadoPagoPreference"),
    "Rota de checkout do Mercado Pago está íntegra com createMercadoPagoPreference");

  // TESTE 13: Limite FREE continua 5
  console.log("\n--- Teste 13: Limite FREE continua 5 ---");
  assert(freePlan.maxQRCodes === 5, "Plano FREE possui limite oficial de 5 QRs no banco");

  // TESTE 14: Sexto QR continua bloqueado
  console.log("\n--- Teste 14: Sexto QR continua bloqueado para plano FREE ---");
  for (let i = 1; i <= 5; i++) {
    const res = await createQR(createAuthRequest("/api/qr", testFreeUser, {
      method: "POST",
      body: { name: `QR Teste ${i}`, type: "url", isDynamic: false, destination: `https://example.com/${i}` }
    }));
    assert(res.status === 200, `Criação do QR ${i} autorizada`);
  }
  const res6 = await createQR(createAuthRequest("/api/qr", testFreeUser, {
    method: "POST",
    body: { name: "QR Teste 6", type: "url", isDynamic: false, destination: "https://example.com/6" }
  }));
  assert(res6.status === 403, "Tentativa do 6º QR bloqueada com HTTP 403");

  // TESTE 15: QR dinâmico FREE continua bloqueado
  console.log("\n--- Teste 15: QR dinâmico continua bloqueado para FREE ---");
  const resDynamic = await createQR(createAuthRequest("/api/qr", testFreeUser, {
    method: "POST",
    body: { name: "QR Dinâmico Inválido", type: "url", isDynamic: true, destination: "https://example.com/dyn" }
  }));
  assert(resDynamic.status === 403, "Criação de QR dinâmico por FREE bloqueada com HTTP 403");

  // TESTE 16: Analytics FREE continua bloqueado
  console.log("\n--- Teste 16: Analytics continua bloqueado para FREE ---");
  const resAnalytics = await getAnalytics(createAuthRequest("/api/analytics", testFreeUser, { method: "GET" }));
  assert(resAnalytics.status === 403, "Acesso ao Analytics por FREE bloqueado com HTTP 403");

  // Limpeza final do usuário sintético de teste
  const cleanQRs = await prisma.qRCode.findMany({ where: { userId: testFreeUser.id }, select: { id: true } });
  const cleanQrIds = cleanQRs.map(q => q.id);
  if (cleanQrIds.length > 0) {
    await prisma.qRCodeScan.deleteMany({ where: { qrCodeId: { in: cleanQrIds } } });
    await prisma.qRCode.deleteMany({ where: { userId: testFreeUser.id } });
  }
  await prisma.user.delete({ where: { id: testFreeUser.id } });

  console.log("\n=======================================================");
  console.log(`🎉 TODOS OS 16 TESTES APROVADOS COM SUCESSO! (${passed}/${total})`);
  console.log("=======================================================\n");
}

runUXDashboardSettingsSuite()
  .catch((err) => {
    console.error("❌ ERRO NA SUÍTE DE TESTES:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
