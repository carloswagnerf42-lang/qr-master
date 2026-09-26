import { prisma } from "../src/lib/db";
import { POST as saveFileRoute } from "../src/app/api/files/save/route";
import { createAuthenticatedSessionToken } from "../src/lib/auth";
import { checkRateLimit, resetRateLimit, RATE_LIMIT_CONFIGS } from "../src/lib/rate-limit";
import { getUserStorageUsageBytes } from "../src/lib/storage-quota";
import { NextRequest } from "next/server";

let totalAsserts = 0;
let passedAsserts = 0;
let failedAsserts = 0;

function assert(condition: boolean, title: string, detail?: string) {
  totalAsserts++;
  if (condition) {
    console.log(`  ✅ PASS: ${title}`);
    passedAsserts++;
  } else {
    console.error(`  ❌ FAIL: ${title}${detail ? ` — ${detail}` : ""}`);
    failedAsserts++;
  }
}

interface StorageAuditTracker {
  uploadCalls: Array<{ url: string; method: string }>;
  deleteCalls: Array<{ url: string; method: string }>;
}

function makeSaveRequest(token: string | null, body: any): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["cookie"] = `qrmaster_session=${token}`;
    headers["authorization"] = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost:3000/api/files/save", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function runTestSuite() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: SECURITY-RATELIMIT-10A — RATE LIMIT EM /api/files/save");
  console.log("==========================================================================\n");

  const originalFetch = global.fetch;
  const tracker: StorageAuditTracker = {
    uploadCalls: [],
    deleteCalls: [],
  };

  // Mock de isolamento para chamadas ao Supabase Storage REST API
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (urlStr.includes("/storage/v1/object/")) {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST" || method === "PUT") {
        tracker.uploadCalls.push({ url: urlStr, method });
        return new Response(JSON.stringify({ Key: "mock-key", Id: "mock-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "DELETE") {
        tracker.deleteCalls.push({ url: urlStr, method });
        return new Response(JSON.stringify([{ name: "deleted-item" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return originalFetch(input, init);
  };

  try {
    // 1. Setup de plano PRO e usuários de teste
    let proPlan = await prisma.plan.findFirst({ where: { name: "PRO" } });
    if (!proPlan) {
      proPlan = await prisma.plan.create({
        data: {
          name: "PRO",
          displayName: "Plano Pro",
          priceMonth: 29,
          priceYear: 290,
          maxQRCodes: 15,
          customLogo: true,
          exportSvg: true,
          exportPdf: true,
        },
      });
    }

    const aliceUser = await prisma.user.upsert({
      where: { email: "alice_save_ratelimit@test.local" },
      create: {
        email: "alice_save_ratelimit@test.local",
        name: "Alice Save RL Test",
        role: "USER",
        planId: proPlan.id,
      },
      update: { planId: proPlan.id, role: "USER" },
    });

    const bobUser = await prisma.user.upsert({
      where: { email: "bob_save_ratelimit@test.local" },
      create: {
        email: "bob_save_ratelimit@test.local",
        name: "Bob Save RL Test",
        role: "USER",
        planId: proPlan.id,
      },
      update: { planId: proPlan.id, role: "USER" },
    });

    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await prisma.subscription.upsert({
      where: { userId: aliceUser.id },
      create: {
        userId: aliceUser.id,
        planId: proPlan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: future,
      },
      update: {
        planId: proPlan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: future,
      },
    });

    await prisma.subscription.upsert({
      where: { userId: bobUser.id },
      create: {
        userId: bobUser.id,
        planId: proPlan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: future,
      },
      update: {
        planId: proPlan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: future,
      },
    });

    // Limpa registros prévios dos testes
    await prisma.generatedFile.deleteMany({
      where: { userId: { in: [aliceUser.id, bobUser.id] } },
    });

    // Reseta rate limits anteriores
    await resetRateLimit(aliceUser.id, "upload");
    await resetRateLimit(bobUser.id, "upload");

    const { token: aliceToken } = await createAuthenticatedSessionToken({
      id: aliceUser.id,
      name: aliceUser.name,
      email: aliceUser.email,
      role: aliceUser.role,
    });

    const { token: bobToken } = await createAuthenticatedSessionToken({
      id: bobUser.id,
      name: bobUser.name,
      email: bobUser.email,
      role: bobUser.role,
    });

    const sampleBase64 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64").toString("base64");

    // ========================================================================
    // TESTE A: Usuário Não Autenticado
    // ========================================================================
    console.log("--- TESTE A: Requisição Não Autenticada ---");
    const unauthReq = makeSaveRequest(null, {
      fileName: "unauth_test",
      fileType: "png",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const unauthRes = await saveFileRoute(unauthReq);
    assert(unauthRes.status === 401, "A1. POST /api/files/save sem autenticação retorna HTTP 401");
    const unauthData = await unauthRes.json();
    assert(unauthData.error === "Não autorizado", "A2. Mensagem de erro é 'Não autorizado'");

    // ========================================================================
    // TESTE B: Usuário Autenticado Dentro do Limite
    // ========================================================================
    console.log("\n--- TESTE B: Usuário Autenticado Dentro do Limite ---");
    tracker.uploadCalls = [];
    const initialFilesAlice = await prisma.generatedFile.count({ where: { userId: aliceUser.id } });

    const reqValid1 = makeSaveRequest(aliceToken, {
      fileName: "export_alice_1",
      fileType: "png",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resValid1 = await saveFileRoute(reqValid1);
    assert(resValid1.status === 200, "B1. Primeira requisição de Alice responde HTTP 200 OK");
    const resValidData = await resValid1.json();
    assert(resValidData.success === true, "B2. Resposta contém success = true");
    assert(Boolean(resValidData.file?.id), "B3. Registro GeneratedFile retornado com ID");
    assert(tracker.uploadCalls.length === 1, "B4. Upload ao Storage acionado exatamente 1 vez");

    const filesAliceAfter1 = await prisma.generatedFile.count({ where: { userId: aliceUser.id } });
    assert(filesAliceAfter1 === initialFilesAlice + 1, "B5. GeneratedFile persistido no banco de dados");

    // ========================================================================
    // TESTE C: Usuário Autenticado Excedendo o Limite (Bucket 'upload' maxAttempts=20)
    // ========================================================================
    console.log("\n--- TESTE C: Exaustão do Limite de Frequência ---");
    const maxAttempts = RATE_LIMIT_CONFIGS.upload.maxAttempts; // 20
    assert(maxAttempts === 20, `C0. Limite do bucket 'upload' configurado como ${maxAttempts} requisições`);

    // Já realizamos 1 requisição em B1. Realizamos mais (maxAttempts - 1) para atingir exatamente o teto.
    for (let i = 2; i <= maxAttempts; i++) {
      const reqLoop = makeSaveRequest(aliceToken, {
        fileName: `export_alice_${i}`,
        fileType: "png",
        fileData: sampleBase64,
        mimeType: "image/png",
      });
      const resLoop = await saveFileRoute(reqLoop);
      assert(resLoop.status === 200, `C1.${i}. Requisição ${i}/${maxAttempts} dentro do limite responde 200`);
    }

    // A requisição (maxAttempts + 1) = 21 deve ser terminantemente bloqueada
    tracker.uploadCalls = [];
    const filesBeforeBlock = await prisma.generatedFile.count({ where: { userId: aliceUser.id } });
    const usageBeforeBlock = await getUserStorageUsageBytes(aliceUser.id);

    const reqBlocked = makeSaveRequest(aliceToken, {
      fileName: "export_alice_blocked",
      fileType: "png",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resBlocked = await saveFileRoute(reqBlocked);

    assert(resBlocked.status === 429, "C2. Requisição 21/20 é bloqueada com HTTP 429 Too Many Requests");
    const blockedData = await resBlocked.json();
    assert(blockedData.code === "RATE_LIMITED", "C3. Payload de erro possui code = 'RATE_LIMITED'");
    assert(typeof blockedData.retryAfter === "number" && blockedData.retryAfter > 0, "C4. retryAfter retornado no JSON maior que zero");
    assert(resBlocked.headers.get("Retry-After") !== null, "C5. Cabeçalho HTTP Retry-After está presente");
    assert(resBlocked.headers.get("X-RateLimit-Limit") === "20", "C6. Cabeçalho X-RateLimit-Limit reflete 20");
    assert(resBlocked.headers.get("X-RateLimit-Remaining") === "0", "C7. Cabeçalho X-RateLimit-Remaining indica 0");

    // ========================================================================
    // TESTE D: Isolamento Entre Usuários (Usuário B Não é Afetado)
    // ========================================================================
    console.log("\n--- TESTE D: Isolamento Multi-Tenant entre Usuários ---");
    const reqBob = makeSaveRequest(bobToken, {
      fileName: "export_bob_1",
      fileType: "png",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resBob = await saveFileRoute(reqBob);
    assert(resBob.status === 200, "D1. Bob não é afetado pelo rate limit de Alice e obtém HTTP 200");
    const bobData = await resBob.json();
    assert(bobData.success === true, "D2. Operação de Bob salva arquivo com sucesso");

    // Alice continua bloqueada imediatamente em seguida
    const reqAliceAgain = makeSaveRequest(aliceToken, {
      fileName: "export_alice_still_blocked",
      fileType: "png",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resAliceAgain = await saveFileRoute(reqAliceAgain);
    assert(resAliceAgain.status === 429, "D3. Alice continua bloqueada com 429");

    // ========================================================================
    // TESTE E: Expiração/Reset do Rate Limit Permite Novas Requisições
    // ========================================================================
    console.log("\n--- TESTE E: Recuperação Após Expiração / Reset ---");
    await resetRateLimit(aliceUser.id, "upload");

    const reqAliceReset = makeSaveRequest(aliceToken, {
      fileName: "export_alice_after_reset",
      fileType: "png",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resAliceReset = await saveFileRoute(reqAliceReset);
    assert(resAliceReset.status === 200, "E1. Após reset do limitador, Alice volta a ter requisições autorizadas (HTTP 200)");

    // Esgota Alice novamente para os testes de efeitos colaterais
    for (let i = 2; i <= maxAttempts; i++) {
      await saveFileRoute(makeSaveRequest(aliceToken, {
        fileName: `export_alice_exhaust_${i}`,
        fileType: "png",
        fileData: sampleBase64,
        mimeType: "image/png",
      }));
    }

    // ========================================================================
    // TESTE F: Requisição Bloqueada Não Cria GeneratedFile
    // ========================================================================
    console.log("\n--- TESTE F: Proteção de Banco de Dados (GeneratedFile) ---");
    const filesCountBeforeF = await prisma.generatedFile.count({ where: { userId: aliceUser.id } });
    tracker.uploadCalls = [];

    const reqBlockedF = makeSaveRequest(aliceToken, {
      fileName: "export_fail_f",
      fileType: "png",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resBlockedF = await saveFileRoute(reqBlockedF);
    assert(resBlockedF.status === 429, "F1. Requisição bloqueada com 429");

    const filesCountAfterF = await prisma.generatedFile.count({ where: { userId: aliceUser.id } });
    assert(filesCountBeforeF === filesCountAfterF, "F2. Zero registros criados em GeneratedFile durante bloqueio");

    // ========================================================================
    // TESTE G: Requisição Bloqueada Não Executa Upload no Storage
    // ========================================================================
    console.log("\n--- TESTE G: Proteção do Serviço de Storage Físico ---");
    assert(tracker.uploadCalls.length === 0, "G1. Nenhuma requisição POST/PUT disparada contra o Supabase Storage");

    // ========================================================================
    // TESTE H: Requisição Bloqueada Não Altera Contabilização de Armazenamento
    // ========================================================================
    console.log("\n--- TESTE H: Proteção de Cota de Armazenamento ---");
    const usageAfterF = await getUserStorageUsageBytes(aliceUser.id);
    const expectedUsage = await prisma.generatedFile.aggregate({
      where: { userId: aliceUser.id },
      _sum: { fileSize: true },
    });
    assert(usageAfterF === (expectedUsage._sum.fileSize || 0), "H1. Cota e uso de armazenamento permanecem estritamente inalterados");

    // ========================================================================
    // TESTE I: Identificador Derivado da Sessão Server-Side (Não do Cliente)
    // ========================================================================
    console.log("\n--- TESTE I: Identificador Derivado Server-Side Anti-Spoofing ---");
    const reqSpoofedUserId = makeSaveRequest(aliceToken, {
      userId: bobUser.id, // Tentativa do atacante de passar userId de outro usuário no body
      sessionUserId: bobUser.id,
      fileName: "spoofed_user_export",
      fileType: "png",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resSpoofedUserId = await saveFileRoute(reqSpoofedUserId);
    assert(resSpoofedUserId.status === 429, "I1. Injeção de userId no payload não contorna o bloqueio de Alice");

    // ========================================================================
    // TESTE J: Injeção de Propriedades Variadas no Payload Não Burlar Rate Limit
    // ========================================================================
    console.log("\n--- TESTE J: Anti-Evasão por Manipulação de Payload ---");
    const evasionPayloads = [
      { fileName: "different_name.png", fileType: "png" },
      { fileName: "vector.svg", fileType: "svg", fileData: "<svg></svg>" },
      { fileName: "document.pdf", fileType: "pdf" },
      { qrCodeId: "cuid_arbitrary_123456", fileName: "with_qr.png", fileType: "png" },
      { fileId: "some_other_file_id", fileName: "with_file_id.png", fileType: "png" },
    ];

    for (let idx = 0; idx < evasionPayloads.length; idx++) {
      const payload = evasionPayloads[idx];
      const reqEvasion = makeSaveRequest(aliceToken, {
        fileData: sampleBase64,
        mimeType: "image/png",
        ...payload,
      });
      const resEvasion = await saveFileRoute(reqEvasion);
      assert(
        resEvasion.status === 429,
        `J1.${idx + 1}. Tentativa de evasão com ${Object.keys(payload).join("+")} rejeitada com 429`
      );
    }

    // ========================================================================
    // CLEANUP
    // ========================================================================
    await prisma.generatedFile.deleteMany({
      where: { userId: { in: [aliceUser.id, bobUser.id] } },
    });
    await resetRateLimit(aliceUser.id, "upload");
    await resetRateLimit(bobUser.id, "upload");

  } finally {
    global.fetch = originalFetch;
  }

  console.log("\n==========================================================================");
  console.log(`  TOTAL DE ASSERÇÕES: ${totalAsserts}`);
  console.log(`  APROVADAS:          ${passedAsserts}`);
  console.log(`  FALHAS:             ${failedAsserts}`);
  console.log("==========================================================================");

  if (failedAsserts > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Erro fatal na execução da suíte de testes:", err);
  process.exit(1);
});
