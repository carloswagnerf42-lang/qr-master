import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import {
  POST as handleMPWebhook,
  GET as handleMPWebhookGet,
} from "../src/app/api/webhooks/mercadopago/route";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`${GREEN}✔ APROVADO: ${testName}${RESET}`);
  } else {
    console.error(`${RED}✖ FALHOU: ${testName}${RESET}`);
    throw new Error(`Falha no teste: ${testName}`);
  }
}

async function runTests() {
  console.log(`${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}  SUÍTE DE AUDITORIA E TESTE: MP-HARDEN-01 (GET PASSIVO & POST FAIL-CLOSED) ${RESET}`);
  console.log(`${CYAN}========================================================================\n${RESET}`);

  // Backup original env vars
  const origNodeEnv = process.env.NODE_ENV;
  const origMpSecret = process.env.MP_WEBHOOK_SECRET;
  const origMpTestSecret = process.env.MP_TEST_WEBHOOK_SECRET;
  const origMercadoPagoSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  try {
    // =========================================================================
    // BLOCO 1: MP-HARDEN-01-A — GET ESTREITAMENTE PASSIVO (HEALTH-CHECK)
    // =========================================================================
    console.log(`${YELLOW}▶ BLOCO 1: MP-HARDEN-01-A — GET Estritamente Passivo (Zero Efeitos Colaterais)${RESET}`);

    // Teste 1: GET simples sem query params
    {
      const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago", {
        method: "GET",
      });
      const res = await handleMPWebhookGet(req);
      const data = await res.json();
      assert(
        res.status === 200 && data.status === "Mercado Pago Webhook Endpoint Ativo",
        "1. GET simples responde 200 com status 'Mercado Pago Webhook Endpoint Ativo'"
      );
    }

    // Teste 2: GET com query params ?topic=payment&id=123456 NÃO processa pagamento nem muta banco
    {
      const usersBefore = await prisma.user.count();
      const subsBefore = await prisma.subscription.count();
      const logsBefore = await prisma.activityLog.count();

      const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?topic=payment&id=123456", {
        method: "GET",
      });
      const res = await handleMPWebhookGet(req);
      const data = await res.json();

      const usersAfter = await prisma.user.count();
      const subsAfter = await prisma.subscription.count();
      const logsAfter = await prisma.activityLog.count();

      assert(
        res.status === 200 &&
        data.status === "Mercado Pago Webhook Endpoint Ativo" &&
        !data.success &&
        usersBefore === usersAfter &&
        subsBefore === subsAfter &&
        logsBefore === logsAfter,
        "2. GET ?topic=payment&id=123456 NÃO executa processamento financeiro (zero mutações no banco)"
      );
    }

    // Teste 3: GET com múltiplos parâmetros adversários (id, topic, data.id, type) permanece passivo
    {
      const req = new NextRequest(
        "http://localhost:3000/api/webhooks/mercadopago?topic=payment&id=999999&type=payment&data.id=999999",
        { method: "GET" }
      );
      const res = await handleMPWebhookGet(req);
      const data = await res.json();
      assert(
        res.status === 200 && data.status === "Mercado Pago Webhook Endpoint Ativo",
        "3. GET com parâmetros adversários permanece healthcheck passivo 200 sem invocar processamento"
      );
    }

    // =========================================================================
    // BLOCO 2: MP-HARDEN-01-B — POST FAIL-CLOSED EM PRODUÇÃO
    // =========================================================================
    console.log(`\n${YELLOW}▶ BLOCO 2: MP-HARDEN-01-B — POST Fail-Closed em Produção (NODE_ENV=production)${RESET}`);

    // Configurar ambiente como produção
    (process.env as any).NODE_ENV = "production";
    delete process.env.MP_WEBHOOK_SECRET;
    delete process.env.MP_TEST_WEBHOOK_SECRET;
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;

    // Teste 4: Produção sem MP_WEBHOOK_SECRET configurado -> HTTP 503 Fail-Closed
    {
      const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=123456", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payment.created", data: { id: "123456" } }),
      });
      const res = await handleMPWebhook(req);
      const data = await res.json();
      assert(
        res.status === 503 && data.error === "Webhook Mercado Pago não configurado.",
        "4. Produção sem MP_WEBHOOK_SECRET retorna HTTP 503 Fail-Closed imediato"
      );
    }

    // Teste 5: Produção com apenas MP_TEST_WEBHOOK_SECRET (sem prod secret) -> HTTP 503 (segredo de teste NÃO é aceito em prod)
    {
      process.env.MP_TEST_WEBHOOK_SECRET = "test_sandbox_secret_should_not_work_in_prod";
      delete process.env.MP_WEBHOOK_SECRET;
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET;

      const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=123456", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payment.created", data: { id: "123456" } }),
      });
      const res = await handleMPWebhook(req);
      const data = await res.json();
      assert(
        res.status === 503 && data.error === "Webhook Mercado Pago não configurado.",
        "5. Produção rejeita MP_TEST_WEBHOOK_SECRET como segredo de produção (retorna 503)"
      );
    }

    // Agora configurar segredo de produção válido para os testes 6 a 9
    const prodSecret = "prod_webhook_live_secret_key_8899aabb";
    process.env.MP_WEBHOOK_SECRET = prodSecret;
    delete process.env.MP_TEST_WEBHOOK_SECRET;

    // Teste 6: Produção com segredo configurado + cabeçalho x-signature ausente -> HTTP 401
    {
      const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=123456", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payment.created", data: { id: "123456" } }),
      });
      const res = await handleMPWebhook(req);
      const data = await res.json();
      assert(
        res.status === 401 && data.error && data.error.includes("ausente"),
        "6. Produção com x-signature ausente retorna HTTP 401 não autenticado"
      );
    }

    // Teste 7: Produção com segredo configurado + assinatura adulterada/falsa -> HTTP 401
    {
      const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=123456", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": "ts=1742500000000,v1=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb",
          "x-request-id": "req_prod_test_001",
        },
        body: JSON.stringify({ action: "payment.created", data: { id: "123456" } }),
      });
      const res = await handleMPWebhook(req);
      const data = await res.json();
      assert(
        res.status === 401 && data.error && data.error.includes("inválida"),
        "7. Produção com x-signature inválida/adulterada retorna HTTP 401"
      );
    }

    // Teste 8: Produção: requisição assinada com MP_TEST_WEBHOOK_SECRET é rejeitada (401)
    {
      const fakeTestSecret = "test_sandbox_secret_xyz";
      const ts = String(Date.now());
      const reqId = "req_test_sig_002";
      const dataId = "123456";
      const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
      const testV1 = crypto.createHmac("sha256", fakeTestSecret).update(manifest).digest("hex");

      const req = new NextRequest(`http://localhost:3000/api/webhooks/mercadopago?id=${dataId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": `ts=${ts},v1=${testV1}`,
          "x-request-id": reqId,
        },
        body: JSON.stringify({ action: "payment.created", data: { id: dataId } }),
      });
      const res = await handleMPWebhook(req);
      assert(
        res.status === 401,
        "8. Produção: assinatura gerada com segredo de teste/sandbox é categoricamente rejeitada (401)"
      );
    }

    // Teste 9: Produção: requisição com assinatura HMAC SHA-256 legítima com MP_WEBHOOK_SECRET -> HTTP 200
    {
      const ts = String(Date.now());
      const reqId = "req_legit_prod_003";
      const dataId = "123456";
      const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
      const validV1 = crypto.createHmac("sha256", prodSecret).update(manifest).digest("hex");

      const req = new NextRequest(`http://localhost:3000/api/webhooks/mercadopago?id=${dataId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": `ts=${ts},v1=${validV1}`,
          "x-request-id": reqId,
        },
        body: JSON.stringify({ action: "payment.created", data: { id: dataId } }),
      });
      const res = await handleMPWebhook(req);
      const data = await res.json();
      assert(
        res.status === 200 && data.success === true,
        "9. Produção: assinatura válida com MP_WEBHOOK_SECRET autentica e processa com sucesso (HTTP 200)"
      );
    }

    // Teste 10: Produção: ping sem ID com assinatura válida responde HTTP 200
    {
      const ts = String(Date.now());
      const reqId = "req_ping_prod_004";
      // Manifesto para ping sem ID: request-id + ts
      const manifest = `request-id:${reqId};ts:${ts};`;
      const validV1 = crypto.createHmac("sha256", prodSecret).update(manifest).digest("hex");

      const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": `ts=${ts},v1=${validV1}`,
          "x-request-id": reqId,
        },
        body: JSON.stringify({ action: "test.ping" }),
      });
      const res = await handleMPWebhook(req);
      const data = await res.json();
      assert(
        res.status === 200 && data.received === true,
        "10. Produção: ping assinado legitimamente responde 200 received: true"
      );
    }

    // Teste 11: Produção: ping sem ID e SEM assinatura é rejeitado com HTTP 401
    {
      const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test.ping" }),
      });
      const res = await handleMPWebhook(req);
      assert(
        res.status === 401,
        "11. Produção: ping sem assinatura é rejeitado com HTTP 401 (sem bypass de autenticação)"
      );
    }

    // =========================================================================
    // BLOCO 3: AMBIENTE NÃO-PRODUÇÃO (DESENVOLVIMENTO / TESTES LOCAIS)
    // =========================================================================
    console.log(`\n${YELLOW}▶ BLOCO 3: Ambiente Não-Produção (Flexibilidade de Sandbox e Testes Locais)${RESET}`);

    (process.env as any).NODE_ENV = "test";
    delete process.env.MP_WEBHOOK_SECRET;
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;

    // Teste 12: Em ambiente de teste com MP_TEST_WEBHOOK_SECRET, autentica com o segredo de teste
    {
      const testSecret = "sandbox_secret_for_tests_only_9988";
      process.env.MP_TEST_WEBHOOK_SECRET = testSecret;

      const ts = String(Date.now());
      const reqId = "req_test_env_005";
      const dataId = "123456";
      const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
      const validV1 = crypto.createHmac("sha256", testSecret).update(manifest).digest("hex");

      const req = new NextRequest(`http://localhost:3000/api/webhooks/mercadopago?id=${dataId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": `ts=${ts},v1=${validV1}`,
          "x-request-id": reqId,
        },
        body: JSON.stringify({ action: "payment.created", data: { id: dataId } }),
      });
      const res = await handleMPWebhook(req);
      const data = await res.json();
      assert(
        res.status === 200 && data.success === true,
        "12. Ambiente Não-Produção: aceita MP_TEST_WEBHOOK_SECRET para testes e sandbox"
      );
    }

    // Teste 13: Em ambiente de teste sem nenhum segredo configurado, não bloqueia com 503
    {
      delete process.env.MP_WEBHOOK_SECRET;
      delete process.env.MP_TEST_WEBHOOK_SECRET;
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET;

      const req = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=123456", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payment.created", data: { id: "123456" } }),
      });
      const res = await handleMPWebhook(req);
      assert(
        res.status !== 503,
        "13. Ambiente Não-Produção sem segredo: permite execução de suítes locais sem falhar com 503"
      );
    }
  } finally {
    // Restore original env vars
    (process.env as any).NODE_ENV = origNodeEnv;
    if (origMpSecret !== undefined) process.env.MP_WEBHOOK_SECRET = origMpSecret;
    else delete process.env.MP_WEBHOOK_SECRET;

    if (origMpTestSecret !== undefined) process.env.MP_TEST_WEBHOOK_SECRET = origMpTestSecret;
    else delete process.env.MP_TEST_WEBHOOK_SECRET;

    if (origMercadoPagoSecret !== undefined) process.env.MERCADOPAGO_WEBHOOK_SECRET = origMercadoPagoSecret;
    else delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  }

  console.log(`\n${GREEN}========================================================================${RESET}`);
  console.log(`${GREEN}  TODOS OS 13 TESTES DE HARDENING MP-HARDEN-01 APROVADOS COM SUCESSO!   ${RESET}`);
  console.log(`${GREEN}========================================================================\n${RESET}`);
}

runTests()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
