import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import { GET as getAdminLogs } from "../src/app/api/admin/logs/route";
import { processMercadoPagoNotification } from "../src/lib/mercadopago";

// ANSI colors for terminal output
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

async function runAdminLogsSearchTestSuite() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   🔍 SUÍTE DE TESTES: PESQUISA E AUDITORIA DE LOGS ADMIN (12/12)   ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  // Identificar administrador para os testes autenticados
  let adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: "test_admin_logs@qrmaster.com",
        name: "Admin Tester",
        passwordHash: "fake_hash_admin",
        role: "ADMIN",
      },
    });
  }

  // Identificar usuário comum para teste de acesso não-autorizado (403)
  let normalUser = await prisma.user.findFirst({
    where: { role: "USER" },
  });

  if (!normalUser) {
    normalUser = await prisma.user.create({
      data: {
        email: "test_normal_user_logs@qrmaster.com",
        name: "Normal User Tester",
        passwordHash: "fake_hash_normal",
        role: "USER",
      },
    });
  }

  const adminToken = signToken({
    id: adminUser.id,
    name: adminUser.name,
    email: adminUser.email,
    role: "ADMIN",
  });

  const normalUserToken = signToken({
    id: normalUser.id,
    name: normalUser.name,
    email: normalUser.email,
    role: "USER",
  });

  // Helper para criar requisições autenticadas para a rota GET /api/admin/logs
  function makeAdminRequest(queryString: string = "", token?: string) {
    const url = `http://localhost:3000/api/admin/logs${queryString ? `?${queryString}` : ""}`;
    const headers: Record<string, string> = {};
    if (token) {
      headers["cookie"] = `qrmaster_session=${token}`;
    }
    return new NextRequest(url, { headers });
  }

  // =========================================================================
  // CENÁRIO 1: Buscar termo contido em log além dos 50 primeiros
  // =========================================================================
  {
    const req = makeAdminRequest("search=178856033673", adminToken);
    const res = await getAdminLogs(req);
    const data = await res.json();

    assert(
      res.status === 200 && data.success === true && Array.isArray(data.logs) && data.logs.length > 0,
      "Cenário 1: Buscar termo contido em log além dos 50 primeiros (deve retornar resultado)",
      `Total retornado: ${data.logs?.length}`
    );
  }

  // =========================================================================
  // CENÁRIO 2: Buscar por nome de usuário
  // =========================================================================
  {
    const req = makeAdminRequest("search=joaolucas", adminToken);
    const res = await getAdminLogs(req);
    const data = await res.json();

    const matchesName = data.logs?.every((l: any) =>
      l.user?.name?.toLowerCase().includes("joaolucas") ||
      l.description?.toLowerCase().includes("joaolucas")
    );

    assert(
      res.status === 200 && data.success === true && data.logs.length > 0 && matchesName,
      "Cenário 2: Buscar por nome de usuário (joaolucas encontrado no banco)",
      `Encontrados: ${data.logs?.length} logs`
    );
  }

  // =========================================================================
  // CENÁRIO 3: Buscar por e-mail de usuário
  // =========================================================================
  {
    const searchEmail = adminUser.email;
    const req = makeAdminRequest(`search=${encodeURIComponent(searchEmail)}`, adminToken);
    const res = await getAdminLogs(req);
    const data = await res.json();

    assert(
      res.status === 200 && data.success === true && data.logs.length > 0,
      "Cenário 3: Buscar por e-mail de usuário",
      `Busca por ${searchEmail} retornou ${data.logs?.length} logs`
    );
  }

  // =========================================================================
  // CENÁRIO 4: Buscar por texto da descrição
  // =========================================================================
  {
    const req = makeAdminRequest("search=Assinatura ativada via Mercado Pago", adminToken);
    const res = await getAdminLogs(req);
    const data = await res.json();

    const matchesDesc = data.logs?.every((l: any) =>
      l.description?.toLowerCase().includes("assinatura ativada via mercado pago")
    );

    assert(
      res.status === 200 && data.success === true && data.logs.length > 0 && matchesDesc,
      "Cenário 4: Buscar por texto da descrição",
      `Encontrados ${data.logs?.length} logs correspondentes`
    );
  }

  // =========================================================================
  // CENÁRIO 5: Buscar por nome da ação
  // =========================================================================
  {
    const req = makeAdminRequest("search=SUBSCRIPTION_ACTIVATE", adminToken);
    const res = await getAdminLogs(req);
    const data = await res.json();

    const hasAction = data.logs?.some((l: any) => l.action === "SUBSCRIPTION_ACTIVATE");

    assert(
      res.status === 200 && data.success === true && hasAction,
      "Cenário 5: Buscar por nome da ação (SUBSCRIPTION_ACTIVATE)",
      `Total retornado: ${data.logs?.length}`
    );
  }

  // =========================================================================
  // CENÁRIO 6: Buscar por ID de entidade / payment ID (novo e legado)
  // =========================================================================
  {
    // Criar log com entityId preenchido (novo padrão) para teste pontual
    const testEntityId = `entity_test_${Date.now()}`;
    const testLog = await prisma.activityLog.create({
      data: {
        userId: adminUser.id,
        action: "TEST_ENTITY_SEARCH",
        entityId: testEntityId,
        description: "Log de verificação de busca por entityId",
      },
    });

    const reqNew = makeAdminRequest(`search=${testEntityId}`, adminToken);
    const resNew = await getAdminLogs(reqNew);
    const dataNew = await resNew.json();

    const foundNew = dataNew.logs?.some((l: any) => l.entityId === testEntityId);

    // Limpar log de teste
    await prisma.activityLog.delete({ where: { id: testLog.id } });

    // Testar busca por payment ID legado (178856033673)
    const reqLegacy = makeAdminRequest("search=178856033673", adminToken);
    const resLegacy = await getAdminLogs(reqLegacy);
    const dataLegacy = await resLegacy.json();
    const foundLegacy = dataLegacy.logs?.length > 0;

    assert(
      foundNew && foundLegacy,
      "Cenário 6: Buscar por ID de entidade / payment ID (novo via entityId e legado via description)",
      `Novo: ${foundNew}, Legado: ${foundLegacy}`
    );
  }

  // =========================================================================
  // CENÁRIO 7: Filtrar por tipo de ação isolado
  // =========================================================================
  {
    const req = makeAdminRequest("action=SUBSCRIPTION_ACTIVATE", adminToken);
    const res = await getAdminLogs(req);
    const data = await res.json();

    const allMatchAction = data.logs?.every((l: any) => l.action === "SUBSCRIPTION_ACTIVATE");

    assert(
      res.status === 200 && data.success === true && data.logs.length > 0 && allMatchAction,
      "Cenário 7: Filtrar por tipo de ação isolado (action=SUBSCRIPTION_ACTIVATE)",
      `Todos os ${data.logs?.length} logs possuem action SUBSCRIPTION_ACTIVATE`
    );
  }

  // =========================================================================
  // CENÁRIO 8: Busca sem correspondência (deve retornar vazio de forma limpa)
  // =========================================================================
  {
    const req = makeAdminRequest("search=termo_totalmente_inexistente_xyz_987654", adminToken);
    const res = await getAdminLogs(req);
    const data = await res.json();

    assert(
      res.status === 200 && data.success === true && Array.isArray(data.logs) && data.logs.length === 0 && data.total === 0,
      "Cenário 8: Busca sem correspondência (retorna array vazio com total 0 e status 200)"
    );
  }

  // =========================================================================
  // CENÁRIO 9: Usuário comum / não autenticado tentando acessar o endpoint de logs
  // =========================================================================
  {
    // Não autenticado
    const unauthReq = makeAdminRequest("search=test");
    const unauthRes = await getAdminLogs(unauthReq);

    // Usuário comum (role USER)
    const forbiddenReq = makeAdminRequest("search=test", normalUserToken);
    const forbiddenRes = await getAdminLogs(forbiddenReq);

    assert(
      unauthRes.status === 401 && forbiddenRes.status === 403,
      "Cenário 9: Usuário comum / não autenticado bloqueado (401 para anônimo, 403 para role USER)",
      `Anônimo: ${unauthRes.status}, USER: ${forbiddenRes.status}`
    );
  }

  // =========================================================================
  // CENÁRIO 10: A busca não deve alterar nem interferir nos dados de outros usuários
  // =========================================================================
  {
    const usersCountBefore = await prisma.user.count();
    const logsCountBefore = await prisma.activityLog.count();
    const subsCountBefore = await prisma.subscription.count();

    // Executar múltiplas buscas
    await getAdminLogs(makeAdminRequest("search=admin", adminToken));
    await getAdminLogs(makeAdminRequest("search=joaolucas", adminToken));
    await getAdminLogs(makeAdminRequest("action=LOGIN", adminToken));

    const usersCountAfter = await prisma.user.count();
    const logsCountAfter = await prisma.activityLog.count();
    const subsCountAfter = await prisma.subscription.count();

    assert(
      usersCountBefore === usersCountAfter &&
      logsCountBefore === logsCountAfter &&
      subsCountBefore === subsCountAfter,
      "Cenário 10: A busca é estritamente somente-leitura e não altera dados nem registros",
      `Users: ${usersCountBefore}->${usersCountAfter}, Logs: ${logsCountBefore}->${logsCountAfter}`
    );
  }

  // =========================================================================
  // CENÁRIO 11: Confirmação de que o log do pagamento histórico 178856033673 é localizado
  // =========================================================================
  {
    const req = makeAdminRequest("search=178856033673", adminToken);
    const res = await getAdminLogs(req);
    const data = await res.json();

    const historicalLog = data.logs?.find((l: any) =>
      l.description?.includes("178856033673")
    );

    assert(
      Boolean(historicalLog && historicalLog.action === "SUBSCRIPTION_ACTIVATE"),
      "Cenário 11: Log histórico do pagamento 178856033673 localizado por descrição",
      `ID do Log: ${historicalLog?.id}, Descrição: ${historicalLog?.description}`
    );
  }

  // =========================================================================
  // CENÁRIO 12: Confirmação de que novos eventos SUBSCRIPTION_ACTIVATE recebem entityId = payment.id
  // =========================================================================
  {
    const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } });
    const expectedPrice = Number(proPlan?.priceMonth || 19.90);

    const testPaymentId = "test_payment_entity_id_999999";
    const testPaymentData = {
      id: testPaymentId,
      status: "approved",
      transaction_amount: expectedPrice,
      external_reference: JSON.stringify({
        userId: adminUser.id,
        planName: "PRO",
        billingCycle: "month",
      }),
    };

    // Limpar eventos prévios se existirem
    await prisma.webhookEvent.deleteMany({
      where: {
        OR: [
          { eventId: `mp_payment_${testPaymentId}` },
          { eventId: `mp_claim_${testPaymentId}` },
        ],
      },
    });
    await prisma.subscription.deleteMany({ where: { userId: adminUser.id } });

    // Executa processMercadoPagoNotification com mock aprovado
    await processMercadoPagoNotification(testPaymentId, testPaymentData);

    // Consulta o log de auditoria gerado pelo processamento da notificação
    const createdLog = await prisma.activityLog.findFirst({
      where: {
        userId: adminUser.id,
        action: "SUBSCRIPTION_ACTIVATE",
        entityId: testPaymentId,
      },
      orderBy: { createdAt: "desc" },
    });

    const hasEntityId = createdLog?.entityId === testPaymentId;

    // Limpar os artefatos de teste gerados
    if (createdLog) {
      await prisma.activityLog.delete({ where: { id: createdLog.id } });
    }
    await prisma.webhookEvent.deleteMany({
      where: {
        OR: [
          { eventId: `mp_payment_${testPaymentId}` },
          { eventId: `mp_claim_${testPaymentId}` },
        ],
      },
    });

    assert(
      hasEntityId,
      "Cenário 12: Novos eventos SUBSCRIPTION_ACTIVATE registram entityId = payment.id com sucesso",
      `Log criado com entityId: ${createdLog?.entityId}`
    );
  }

  // =========================================================================
  // RESULTADOS
  // =========================================================================
  console.log(`\n${CYAN}----------------------------------------------------------------${RESET}`);
  console.log(`Total de Testes Executados: ${totalTests}`);
  console.log(`${GREEN}Aprovados: ${passedTests}${RESET}`);
  if (failedTests > 0) {
    console.log(`${RED}Falhas: ${failedTests}${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}Todos os 12 cenários foram aprovados com 100% de sucesso!${RESET}\n`);
  }
}

runAdminLogsSearchTestSuite()
  .catch((err) => {
    console.error("Erro fatal ao executar suíte de testes de logs:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
