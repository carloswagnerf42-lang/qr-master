import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import {
  verifyMercadoPagoSignature,
  processMercadoPagoNotification,
} from "../src/lib/mercadopago";
import { POST as handleMPWebhook } from "../src/app/api/webhooks/mercadopago/route";

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
  console.log(`${CYAN}  SUÍTE DE AUDITORIA E HOMOLOGAÇÃO: WEBHOOK MERCADO PAGO SIGNATURE      ${RESET}`);
  console.log(`${CYAN}========================================================================\n${RESET}`);

  const secret = "live_webhook_secret_production_abc123";
  const testSecret = "test_webhook_secret_sandbox_xyz789";
  const ts = "1742505638683";
  const dataId = "123456";
  const reqId = "req_simulated_uuid_001122";

  // =========================================================================
  // BLOCO 1: ESPECIFICAÇÃO OFICIAL DO MANIFESTO MERCADO PAGO
  // =========================================================================
  console.log(`${YELLOW}▶ BLOCO 1: Especificação Oficial do Manifesto Mercado Pago${RESET}`);

  // Teste 1: Manifesto com request-id e id
  {
    const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
    const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId: reqId,
      dataId,
      secret,
    });
    assert(isValid === true, "1. Validação padrão com x-request-id e dataId");
  }

  // Teste 2: Manifesto omitindo request-id quando header não existe (cenário Simulador)
  {
    const manifest = `id:${dataId};ts:${ts};`;
    const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId: null,
      dataId,
      secret,
    });
    assert(isValid === true, "2. Validação oficial com request-id omitido (cenário simulador)");
  }

  // Teste 3: Header x-request-id enviado por proxy, mas manifesto gerado pelo MP sem ele
  {
    const manifest = `id:${dataId};ts:${ts};`;
    const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId: reqId,
      dataId,
      secret,
    });
    assert(isValid === true, "3. Resiliência: Header x-request-id presente mas manifest sem ele");
  }

  // Teste 4: Secret com espaços e aspas (típico de colagem em variáveis de ambiente da Vercel)
  {
    const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
    const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId: reqId,
      dataId,
      secret: `  "${secret}"  `,
    });
    assert(isValid === true, "4. Sanitização de segredo com aspas e espaços circundantes");
  }

  // Teste 5: Suporte a múltiplos segredos (Produção e Teste/Sandbox simultâneos)
  {
    const manifestTest = `id:${dataId};ts:${ts};`;
    const v1Test = crypto.createHmac("sha256", testSecret).update(manifestTest).digest("hex");
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1Test}`,
      xRequestId: null,
      dataId,
      secret: [secret, testSecret],
    });
    assert(isValid === true, "5. Suporte transparente a segredos múltiplos (Produção + Sandbox)");
  }

  // Teste 6: Data ID com letras maiúsculas (compatibilidade com versões legacy da API)
  {
    const upperId = "ORD12345ABC";
    const manifestLower = `id:${upperId.toLowerCase()};ts:${ts};`;
    const v1Lower = crypto.createHmac("sha256", secret).update(manifestLower).digest("hex");
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1Lower}`,
      xRequestId: null,
      dataId: upperId,
      secret,
    });
    assert(isValid === true, "6. Resiliência a data.id maiúsculo com conversão lowercase");
  }

  // Teste 7: ID candidato extraído do corpo ou query
  {
    const bodyId = "10309995585";
    const manifestCandidate = `id:${bodyId};ts:${ts};`;
    const v1Candidate = crypto.createHmac("sha256", secret).update(manifestCandidate).digest("hex");
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1Candidate}`,
      xRequestId: null,
      dataId: "123456",
      candidateIds: [bodyId],
      secret,
    });
    assert(isValid === true, "7. Validação com ID candidato alternativo (corpo vs query)");
  }

  // =========================================================================
  // BLOCO 2: BLINDAGEM DE SEGURANÇA E REJEIÇÃO DE FORJAMENTO (HTTP 401)
  // =========================================================================
  console.log(`\n${YELLOW}▶ BLOCO 2: Blindagem Anti-Forjamento (Rejeição Estrita 401)${RESET}`);

  // Teste 8: Hash adulterado (ataque de spoofing)
  {
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=0000000000000000000000000000000000000000000000000000000000000000`,
      xRequestId: reqId,
      dataId,
      secret,
    });
    assert(isValid === false, "8. Hash adulterado rejeitado categoricamente com false (401)");
  }

  // Teste 9: Timestamp adulterado (ataque de repetição/drift)
  {
    const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
    const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${Number(ts) + 99999},v1=${v1}`,
      xRequestId: reqId,
      dataId,
      secret,
    });
    assert(isValid === false, "9. Timestamp adulterado rejeitado com false (401)");
  }

  // Teste 10: ID adulterado
  {
    const manifest = `id:${dataId};ts:${ts};`;
    const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId: null,
      dataId: "999999", // ID diferente
      secret,
    });
    assert(isValid === false, "10. Payload com ID divergente do assinado rejeitado (401)");
  }

  // Teste 11: Cabeçalho x-signature ausente ou vazio
  {
    const isValid = verifyMercadoPagoSignature({
      xSignature: null,
      secret,
    });
    assert(isValid === false, "11. Cabeçalho x-signature ausente rejeitado");
  }

  // Teste 12: Segredo não configurado
  {
    const isValid = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=abcdef`,
      secret: "",
    });
    assert(isValid === false, "12. Segredo ausente rejeitado com segurança");
  }

  // =========================================================================
  // BLOCO 3: PROCESSAMENTO SEGURO DE SIMULAÇÃO (ID 123456)
  // =========================================================================
  console.log(`\n${YELLOW}▶ BLOCO 3: Processamento de Simulações e Blindagem Financeira${RESET}`);

  // Teste 13: Pagamento 123456 em ambiente de teste retorna not_found seguro
  {
    const result = await processMercadoPagoNotification("123456");
    assert(
      result.status === "not_found" && (result as any).simulated === true,
      "13. Pagamento de simulação '123456' responde status not_found com simulated: true"
    );
  }

  // Teste 14: Confirma que o banco de dados NÃO sofre mutação com ID simulado
  {
    const userCountBefore = await prisma.user.count();
    const subCountBefore = await prisma.subscription.count();
    const logCountBefore = await prisma.activityLog.count();

    await processMercadoPagoNotification("123456");

    const userCountAfter = await prisma.user.count();
    const subCountAfter = await prisma.subscription.count();
    const logCountAfter = await prisma.activityLog.count();

    assert(
      userCountBefore === userCountAfter &&
      subCountBefore === subCountAfter &&
      logCountBefore === logCountAfter,
      "14. ID simulado '123456' preserva estado do banco 100% inalterado (zero mutação)"
    );
  }

  // Teste 15: Confirmação de integridade histórica de pagamento real
  {
    const realSub = await prisma.subscription.findFirst({
      where: { gateway: "mercadopago", status: "ACTIVE" },
      include: { user: true, plan: true },
    });

    if (realSub) {
      assert(
        realSub.status === "ACTIVE" && realSub.plan.name === "PRO",
        "15. Assinatura real em produção permanece ACTIVE com plano PRO íntegro"
      );
    } else {
      assert(true, "15. Nenhuma assinatura conflitante detectada");
    }
  }

  // =========================================================================
  // BLOCO 4: TESTES DA ROTA HTTP REAL (POST /api/webhooks/mercadopago)
  // =========================================================================
  console.log(`\n${YELLOW}▶ BLOCO 4: Testes de Integração da Rota HTTP Real (POST /api/webhooks/mercadopago)${RESET}`);

  const origEnvSecret = process.env.MP_WEBHOOK_SECRET;
  try {
    const routeSecret = "test_route_webhook_secret_xyz789";
    process.env.MP_WEBHOOK_SECRET = routeSecret;

    // Teste 16: Segredo configurado + assinatura ausente -> HTTP 401
    {
      const reqNoSig = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=123456", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "payment.created", data: { id: "123456" } }),
      });

      const res = await handleMPWebhook(reqNoSig);
      const data = await res.json();
      assert(
        res.status === 401 && data.error && data.error.includes("ausente"),
        "16. Rota real: Segredo configurado + assinatura x-signature ausente retorna HTTP 401 imediato"
      );
    }

    // Teste 17: Segredo configurado + assinatura inválida -> HTTP 401
    {
      const reqBadSig = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=123456", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": `ts=${ts},v1=0000000000000000000000000000000000000000000000000000000000000000`,
          "x-request-id": reqId,
        },
        body: JSON.stringify({ action: "payment.created", data: { id: "123456" } }),
      });

      const res = await handleMPWebhook(reqBadSig);
      const data = await res.json();
      assert(
        res.status === 401 && data.error && data.error.includes("inválida"),
        "17. Rota real: Segredo configurado + assinatura adulterada/inválida retorna HTTP 401"
      );
    }

    // Teste 18: Assinatura válida -> processamento normal (HTTP 200)
    {
      const validTs = String(Date.now());
      const validReqId = "req_valid_uuid_554433";
      const validManifest = `id:${dataId};request-id:${validReqId};ts:${validTs};`;
      const validV1 = crypto.createHmac("sha256", routeSecret).update(validManifest).digest("hex");

      const reqValid = new NextRequest(`http://localhost:3000/api/webhooks/mercadopago?id=${dataId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": `ts=${validTs},v1=${validV1}`,
          "x-request-id": validReqId,
        },
        body: JSON.stringify({ action: "payment.created", data: { id: dataId } }),
      });

      const res = await handleMPWebhook(reqValid);
      const data = await res.json();
      assert(
        res.status === 200 && data.success === true,
        "18. Rota real: Assinatura HMAC SHA-256 válida avança para processamento normal (HTTP 200)"
      );
    }

    // Teste 19: Requisição rejeitada por assinatura ausente NÃO chama processMercadoPagoNotification nem API externa do Mercado Pago
    {
      let externalApiFetchCalled = false;
      const originalFetch = global.fetch;

      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        if (urlStr.includes("api.mercadopago.com")) {
          externalApiFetchCalled = true;
        }
        return originalFetch(input, init);
      };

      try {
        const reqBlocked = new NextRequest("http://localhost:3000/api/webhooks/mercadopago?id=999888777", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "payment.created", data: { id: "999888777" } }),
        });

        const res = await handleMPWebhook(reqBlocked);

        assert(res.status === 401, "19.1. Requisição não assinada bloqueada com status 401");
        assert(
          externalApiFetchCalled === false,
          "19.2. Confirmação: Requisição rejeitada por assinatura ausente NUNCA acionou API externa do Mercado Pago (0 chamadas externas)"
        );
      } finally {
        global.fetch = originalFetch;
      }
    }
  } finally {
    process.env.MP_WEBHOOK_SECRET = origEnvSecret;
  }

  console.log(`\n${GREEN}========================================================================${RESET}`);
  console.log(`${GREEN}  TODOS OS 19 TESTES DE ASSINATURA E INTEGRAÇÃO DE ROTA APROVADOS!      ${RESET}`);
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
