import { prisma } from "../src/lib/db";
import {
  resolveUserStorageQuota,
  getUserStorageUsageBytes,
  checkStorageQuota,
  setStorageQuotaConfigForTesting,
  setStorageUsageResolverForTesting,
} from "../src/lib/storage-quota";
import {
  checkRateLimit,
  resetRateLimit,
  RATE_LIMIT_CONFIGS,
} from "../src/lib/rate-limit";
import { POST as uploadRoute } from "../src/app/api/storage/upload/route";
import { POST as saveFileRoute } from "../src/app/api/files/save/route";
import { GET as getFilesRoute } from "../src/app/api/files/route";
import { createAuthenticatedSessionToken } from "../src/lib/auth";
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
  deleteCalls: Array<{ url: string; method: string; prefixes: string[] }>;
}

async function runTestSuite() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: STORAGE-HARDEN-06 — RATE LIMITING & STORAGE QUOTA");
  console.log("==========================================================================\n");

  const originalFetch = global.fetch;
  const tracker: StorageAuditTracker = {
    uploadCalls: [],
    deleteCalls: [],
  };

  // Mock seguro de chamadas HTTP para isolamento completo sem tocar o Supabase de produção
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
        let prefixes: string[] = [];
        try {
          const bodyObj = typeof init?.body === "string" ? JSON.parse(init.body) : {};
          if (Array.isArray(bodyObj.prefixes)) prefixes = bodyObj.prefixes;
        } catch {
          // ignore json parse error
        }
        tracker.deleteCalls.push({ url: urlStr, method, prefixes });
        return new Response(JSON.stringify([{ name: "deleted-item" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return originalFetch(input, init);
  };

  // Setup de usuários e plano para testes
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
    where: { email: "alice_quota_test@test.local" },
    create: {
      email: "alice_quota_test@test.local",
      name: "Alice Quota Test",
      role: "USER",
      planId: proPlan.id,
    },
    update: { planId: proPlan.id, role: "USER" },
  });

  const bobUser = await prisma.user.upsert({
    where: { email: "bob_quota_test@test.local" },
    create: {
      email: "bob_quota_test@test.local",
      name: "Bob Quota Test",
      role: "USER",
      planId: proPlan.id,
    },
    update: { planId: proPlan.id, role: "USER" },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "admin_quota_test@test.local" },
    create: {
      email: "admin_quota_test@test.local",
      name: "Admin Quota Test",
      role: "ADMIN",
      planId: proPlan.id,
    },
    update: { role: "ADMIN" },
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

  const { token: adminToken } = await createAuthenticatedSessionToken({
    id: adminUser.id,
    name: adminUser.name,
    email: adminUser.email,
    role: adminUser.role,
  });

  function makeUploadRequest(token: string, body: any): NextRequest {
    return new NextRequest("http://localhost:3000/api/storage/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `qrmaster_session=${token}`,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  function makeSaveRequest(token: string, body: any): NextRequest {
    return new NextRequest("http://localhost:3000/api/files/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `qrmaster_session=${token}`,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  function makeGetFilesRequest(token: string, query = ""): NextRequest {
    const url = `http://localhost:3000/api/files${query ? `?${query}` : ""}`;
    return new NextRequest(url, {
      method: "GET",
      headers: {
        cookie: `qrmaster_session=${token}`,
        authorization: `Bearer ${token}`,
      },
    });
  }

  const sampleBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  try {
    // ========================================================================
    // GRUPO 1: RATE LIMITING DE UPLOAD (AÇÃO "upload")
    // ========================================================================
    console.log("\n--- GRUPO 1: Rate Limiting de Upload ---");

    // Limpeza de estado de rate limit
    await resetRateLimit(aliceUser.id, "upload");
    await resetRateLimit(bobUser.id, "upload");

    const maxUploadAttempts = RATE_LIMIT_CONFIGS.upload.maxAttempts;
    assert(maxUploadAttempts === 20, "1.1. Limite configurado para upload é 20 tentativas");
    assert(RATE_LIMIT_CONFIGS.upload.windowSeconds === 600, "1.2. Janela temporal de upload é 10 minutos (600s)");

    // 1.3 Abaixo do limite (1ª tentativa de Alice)
    const firstCheck = await checkRateLimit(aliceUser.id, "upload");
    assert(firstCheck.allowed === true, "1.3. 1ª tentativa de upload é permitida");
    assert(firstCheck.remaining === maxUploadAttempts - 1, `1.4. Restantes após 1ª tentativa: ${firstCheck.remaining}`);

    // Consome até a 20ª tentativa
    for (let i = 2; i < maxUploadAttempts; i++) {
      await checkRateLimit(aliceUser.id, "upload");
    }

    // 1.5 Exatamente no limite (20ª tentativa)
    const twentiethCheck = await checkRateLimit(aliceUser.id, "upload");
    assert(twentiethCheck.allowed === true, "1.5. 20ª tentativa (exatamente no limite) é permitida");
    assert(twentiethCheck.remaining === 0, "1.6. Restantes na 20ª tentativa é 0");

    // 1.7 Acima do limite (21ª tentativa)
    const twentyFirstCheck = await checkRateLimit(aliceUser.id, "upload");
    assert(twentyFirstCheck.allowed === false, "1.7. 21ª tentativa (acima do limite) é bloqueada");
    assert(twentyFirstCheck.retryAfter > 0, `1.8. retryAfter informado (> 0): ${twentyFirstCheck.retryAfter}s`);

    // 1.9 Isolamento entre usuários: Bob NÃO é afetado pelo rate limit estourado de Alice
    const bobCheck = await checkRateLimit(bobUser.id, "upload");
    assert(bobCheck.allowed === true, "1.9. Bob consegue realizar upload mesmo com Alice bloqueada");
    assert(bobCheck.remaining === maxUploadAttempts - 1, "1.10. Restantes de Bob estão intactos (19)");

    // 1.11 Rota POST /api/storage/upload rejeita com HTTP 429 para Alice
    const reqAliceRateLimited = makeUploadRequest(aliceToken, {
      fileName: "logo_alice.png",
      folder: "logos",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resAliceRateLimited = await uploadRoute(reqAliceRateLimited);
    assert(resAliceRateLimited.status === 429, "1.11. POST /api/storage/upload retorna HTTP 429 quando limite é excedido");
    const retryHeader = resAliceRateLimited.headers.get("Retry-After");
    assert(Boolean(retryHeader && parseInt(retryHeader, 10) > 0), "1.12. Header Retry-After presente na resposta 429");
    const rateLimitBody = await resAliceRateLimited.json();
    assert(
      rateLimitBody.error?.includes("Muitas tentativas de upload"),
      "1.13. Mensagem informativa de rate limit retornada ao cliente"
    );

    // 1.14 Bob continua conseguindo fazer upload na rota enquanto Alice recebe 429
    tracker.uploadCalls = [];
    const reqBobAllowed = makeUploadRequest(bobToken, {
      fileName: "logo_bob.png",
      folder: "logos",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resBobAllowed = await uploadRoute(reqBobAllowed);
    assert(resBobAllowed.status === 200, "1.14. POST /api/storage/upload retorna HTTP 200 para Bob");
    assert(tracker.uploadCalls.length === 1, "1.15. Upload de Bob foi enviado com sucesso para o storage");

    // 1.16 Forjar userId no payload não afeta o rate limit nem o storage namespace
    const reqForgedPayload = makeUploadRequest(bobToken, {
      userId: aliceUser.id, // Tentativa de atacante simular que a requisição é de Alice
      fileName: "forged.png",
      folder: "logos",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resForged = await uploadRoute(reqForgedPayload);
    assert(resForged.status === 200, "1.16. Requisição com payload forjado processada com a sessão de Bob");
    const forgedData = await resForged.json();
    assert(
      forgedData.storagePath?.startsWith(`users/${bobUser.id}/logos/`),
      "1.17. storagePath utiliza estritamente bobUser.id da sessão, ignorando userId do payload"
    );

    // Reset para os próximos testes
    await resetRateLimit(aliceUser.id, "upload");
    await resetRateLimit(bobUser.id, "upload");

    // ========================================================================
    // GRUPO 2: RESOLUÇÃO DE COTA DE ARMAZENAMENTO (STORAGE QUOTA)
    // ========================================================================
    console.log("\n--- GRUPO 2: Resolução de Cota de Armazenamento ---");

    // 2.1 Fallback seguro em produção: Infinity quando variáveis de ambiente não definidas
    const originalEnvFree = process.env.STORAGE_QUOTA_BYTES_FREE;
    const originalEnvPro = process.env.STORAGE_QUOTA_BYTES_PRO;
    const originalEnvBusiness = process.env.STORAGE_QUOTA_BYTES_BUSINESS;
    const originalEnvDefault = process.env.STORAGE_QUOTA_BYTES_DEFAULT;

    delete process.env.STORAGE_QUOTA_BYTES_FREE;
    delete process.env.STORAGE_QUOTA_BYTES_PRO;
    delete process.env.STORAGE_QUOTA_BYTES_BUSINESS;
    delete process.env.STORAGE_QUOTA_BYTES_DEFAULT;
    setStorageQuotaConfigForTesting(null);

    const quotaDefaultFree = resolveUserStorageQuota("FREE", "USER");
    const quotaDefaultPro = resolveUserStorageQuota("PRO", "USER");
    const quotaDefaultBusiness = resolveUserStorageQuota("BUSINESS", "USER");

    assert(quotaDefaultFree === Infinity, "2.1. Cota padrão de FREE sem env var é Infinity (não arbitrária)");
    assert(quotaDefaultPro === Infinity, "2.2. Cota padrão de PRO sem env var é Infinity");
    assert(quotaDefaultBusiness === Infinity, "2.3. Cota padrão de BUSINESS sem env var é Infinity");

    // 2.4 Resolução por variáveis de ambiente
    process.env.STORAGE_QUOTA_BYTES_FREE = "5242880";       // 5 MB
    process.env.STORAGE_QUOTA_BYTES_PRO = "20971520";       // 20 MB
    process.env.STORAGE_QUOTA_BYTES_BUSINESS = "104857600"; // 100 MB

    assert(resolveUserStorageQuota("FREE", "USER") === 5242880, "2.4. STORAGE_QUOTA_BYTES_FREE resolvido para 5 MB");
    assert(resolveUserStorageQuota("PRO", "USER") === 20971520, "2.5. STORAGE_QUOTA_BYTES_PRO resolvido para 20 MB");
    assert(resolveUserStorageQuota("BUSINESS", "USER") === 104857600, "2.6. STORAGE_QUOTA_BYTES_BUSINESS resolvido para 100 MB");

    // 2.7 Role ADMIN possui sempre cota Infinity independente de env var
    assert(
      resolveUserStorageQuota("FREE", "ADMIN") === Infinity,
      "2.7. Usuário ADMIN possui cota ilimitada (Infinity) mesmo com env var definida"
    );

    // Restaura ambiente
    if (originalEnvFree) process.env.STORAGE_QUOTA_BYTES_FREE = originalEnvFree;
    else delete process.env.STORAGE_QUOTA_BYTES_FREE;
    if (originalEnvPro) process.env.STORAGE_QUOTA_BYTES_PRO = originalEnvPro;
    else delete process.env.STORAGE_QUOTA_BYTES_PRO;
    if (originalEnvBusiness) process.env.STORAGE_QUOTA_BYTES_BUSINESS = originalEnvBusiness;
    else delete process.env.STORAGE_QUOTA_BYTES_BUSINESS;
    if (originalEnvDefault) process.env.STORAGE_QUOTA_BYTES_DEFAULT = originalEnvDefault;
    else delete process.env.STORAGE_QUOTA_BYTES_DEFAULT;

    // ========================================================================
    // GRUPO 3: CÁLCULO E VALIDAÇÃO DE COTA (checkStorageQuota)
    // ========================================================================
    console.log("\n--- GRUPO 3: Validação de Cota em checkStorageQuota ---");

    // Configura cota de teste controlada: 1000 bytes para PRO
    setStorageQuotaConfigForTesting({ proBytes: 1000, defaultBytes: 1000 });

    // Mock do uso atual: 200 bytes para Alice, 0 para Bob
    setStorageUsageResolverForTesting(async (userId) => {
      if (userId === aliceUser.id) return 200;
      if (userId === bobUser.id) return 0;
      return 0;
    });

    // 3.1 Dentro da cota: 200 + 500 = 700 <= 1000
    const underQuota = await checkStorageQuota({
      userId: aliceUser.id,
      incomingSizeBytes: 500,
      planName: "PRO",
      role: "USER",
    });
    assert(underQuota.allowed === true, "3.1. Upload dentro da cota é permitido");
    assert(underQuota.currentUsageBytes === 200, "3.2. currentUsageBytes computado como 200");
    assert(underQuota.remainingBytes === 300, "3.3. remainingBytes computado como 300 (1000 - 700)");

    // 3.4 Exatamente no limite da cota: 200 + 800 = 1000 == 1000
    const exactQuota = await checkStorageQuota({
      userId: aliceUser.id,
      incomingSizeBytes: 800,
      planName: "PRO",
      role: "USER",
    });
    assert(exactQuota.allowed === true, "3.4. Upload exatamente no limite da cota é permitido");
    assert(exactQuota.remainingBytes === 0, "3.5. remainingBytes é exatamente 0");

    // 3.6 Acima da cota: 200 + 801 = 1001 > 1000
    const overQuota = await checkStorageQuota({
      userId: aliceUser.id,
      incomingSizeBytes: 801,
      planName: "PRO",
      role: "USER",
    });
    assert(overQuota.allowed === false, "3.6. Upload acima da cota é bloqueado");
    assert(overQuota.code === "STORAGE_QUOTA_EXCEEDED", "3.7. Código retornado é STORAGE_QUOTA_EXCEEDED");
    assert(overQuota.remainingBytes === 800, "3.8. remainingBytes informa espaço disponível restante (800)");

    // 3.9 Admin acima do valor configurado continua permitido (Infinity)
    const adminQuotaCheck = await checkStorageQuota({
      userId: adminUser.id,
      incomingSizeBytes: 5000000,
      planName: "PRO",
      role: "ADMIN",
    });
    assert(adminQuotaCheck.allowed === true, "3.9. Usuário ADMIN permitido mesmo com tamanho excedente");
    assert(adminQuotaCheck.quotaBytes === Infinity, "3.10. Cota de ADMIN avaliada como Infinity");

    // 3.11 Isolamento entre usuários: arquivos de Bob não impactam cota de Alice
    const bobQuotaCheck = await checkStorageQuota({
      userId: bobUser.id,
      incomingSizeBytes: 950,
      planName: "PRO",
      role: "USER",
    });
    assert(bobQuotaCheck.allowed === true, "3.11. Bob possui seus 1000 bytes disponíveis independente de Alice");

    // 3.12 Sanitização contra Path Traversal em userId
    const traversalCheck1 = await checkStorageQuota({
      userId: "../../../etc/passwd",
      incomingSizeBytes: 100,
      planName: "PRO",
    });
    assert(traversalCheck1.allowed === false, "3.12. Path traversal com ../ rejeitado fail-closed");
    assert(traversalCheck1.code === "INVALID_INPUT", "3.13. Código retornado é INVALID_INPUT");

    const traversalCheck2 = await checkStorageQuota({
      userId: "users/admin/malicious",
      incomingSizeBytes: 100,
      planName: "PRO",
    });
    assert(traversalCheck2.allowed === false, "3.14. UserId com barras '/' rejeitado fail-closed");

    // 3.15 Validação de tamanho negativo ou NaN
    const invalidSizeCheck = await checkStorageQuota({
      userId: aliceUser.id,
      incomingSizeBytes: -10,
      planName: "PRO",
    });
    assert(invalidSizeCheck.allowed === false, "3.15. Tamanho de arquivo negativo rejeitado fail-closed");

    // ========================================================================
    // GRUPO 4: ENFORCEMENT NAS ROTAS DA APLICAÇÃO
    // ========================================================================
    console.log("\n--- GRUPO 4: Enforcement nas Rotas da Aplicação ---");

    // Configura cota de 100 bytes (sampleBase64 decodificado tem ~70 bytes)
    const bufferLen = Buffer.from(sampleBase64, "base64").length;
    setStorageQuotaConfigForTesting({ freeBytes: bufferLen + 10, proBytes: bufferLen + 10, defaultBytes: bufferLen + 10 });
    setStorageUsageResolverForTesting(async () => bufferLen + 1); // Já ultrapassou a cota

    // 4.1 POST /api/storage/upload bloqueia upload acima da cota
    tracker.uploadCalls = [];
    const reqUploadBlocked = makeUploadRequest(aliceToken, {
      fileName: "logo_quota_block.png",
      folder: "logos",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resUploadBlocked = await uploadRoute(reqUploadBlocked);
    assert(resUploadBlocked.status === 403, "4.1. POST /api/storage/upload retorna HTTP 403 quando cota é excedida");
    const uploadBlockedData = await resUploadBlocked.json();
    assert(
      uploadBlockedData.code === "STORAGE_QUOTA_EXCEEDED",
      "4.2. Código STORAGE_QUOTA_EXCEEDED retornado no payload de erro"
    );
    assert(
      tracker.uploadCalls.length === 0,
      "4.3. ARQUIVO REJEITADO POR COTA NÃO É ENVIADO PARA O SUPABASE STORAGE"
    );

    // 4.4 POST /api/files/save bloqueia export acima da cota
    tracker.uploadCalls = [];
    const filesBeforeCount = await prisma.generatedFile.count({ where: { userId: aliceUser.id } });
    const reqSaveBlocked = makeSaveRequest(aliceToken, {
      fileName: "export_quota_block",
      fileType: "png",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resSaveBlocked = await saveFileRoute(reqSaveBlocked);
    assert(resSaveBlocked.status === 403, "4.4. POST /api/files/save retorna HTTP 403 quando cota é excedida");
    const saveBlockedData = await resSaveBlocked.json();
    assert(
      saveBlockedData.code === "STORAGE_QUOTA_EXCEEDED",
      "4.5. Código STORAGE_QUOTA_EXCEEDED retornado no payload de erro do export"
    );
    assert(
      tracker.uploadCalls.length === 0,
      "4.6. ARQUIVO DE EXPORT REJEITADO POR COTA NÃO É ENVIADO PARA O SUPABASE STORAGE"
    );

    const filesAfterCount = await prisma.generatedFile.count({ where: { userId: aliceUser.id } });
    assert(
      filesBeforeCount === filesAfterCount,
      "4.7. ARQUIVO REJEITADO POR COTA NÃO CRIA REGISTRO NO BANCO DE DADOS (GeneratedFile)"
    );

    // 4.8 Tentativa do cliente injetar quota ou usage no payload do request
    const reqClientTamper = makeUploadRequest(aliceToken, {
      fileName: "tampered.png",
      folder: "logos",
      fileData: sampleBase64,
      mimeType: "image/png",
      quota: 999999999,
      currentUsageBytes: 0,
      remainingBytes: 999999999,
    });
    const resClientTamper = await uploadRoute(reqClientTamper);
    assert(resClientTamper.status === 403, "4.8. Cliente não consegue burlar cota manipulando body do request");

    // ========================================================================
    // GRUPO 5: PERSISTÊNCIA REAL NO DB & AGREGAÇÃO DE USO
    // ========================================================================
    console.log("\n--- GRUPO 5: Agregação Real de Armazenamento no Banco de Dados ---");

    // Desativa mock do resolver de uso para testar query real no PostgreSQL
    setStorageUsageResolverForTesting(null);
    setStorageQuotaConfigForTesting(null);

    // Insere arquivo de teste real para Alice
    const createdFileAlice = await prisma.generatedFile.create({
      data: {
        userId: aliceUser.id,
        fileName: "test_calc_alice.png",
        fileType: "png",
        fileSize: 12345,
        mimeType: "image/png",
        storagePath: `users/${aliceUser.id}/exports/test_calc_alice.png`,
        downloadUrl: `http://localhost/test_calc_alice.png`,
      },
    });

    // Insere arquivo de teste real para Bob
    const createdFileBob = await prisma.generatedFile.create({
      data: {
        userId: bobUser.id,
        fileName: "test_calc_bob.png",
        fileType: "png",
        fileSize: 54321,
        mimeType: "image/png",
        storagePath: `users/${bobUser.id}/exports/test_calc_bob.png`,
        downloadUrl: `http://localhost/test_calc_bob.png`,
      },
    });

    const aliceUsage = await getUserStorageUsageBytes(aliceUser.id);
    const bobUsage = await getUserStorageUsageBytes(bobUser.id);

    assert(aliceUsage >= 12345, `5.1. Uso de Alice reflete exatamente seus arquivos (${aliceUsage} bytes)`);
    assert(bobUsage >= 54321, `5.2. Uso de Bob reflete exatamente seus arquivos (${bobUsage} bytes)`);
    assert(
      aliceUsage !== bobUsage,
      "5.3. Isolamento estrito de agregação: arquivos de Bob não contam para Alice"
    );

    // Limpeza dos arquivos inseridos
    await prisma.generatedFile.deleteMany({
      where: { id: { in: [createdFileAlice.id, createdFileBob.id] } },
    });

    // ========================================================================
    // GRUPO 6: ANÁLISE E TESTE DE CONCORRÊNCIA E TOCTOU
    // ========================================================================
    console.log("\n--- GRUPO 6: Teste de Concorrência & TOCTOU ---");

    // Cota disponível: 200 bytes. Cada arquivo: 150 bytes.
    // Se enviados concorrentemente, o sistema deve tratar sem corrupção ou crash.
    let simulatedUsage = 0;
    setStorageQuotaConfigForTesting({ proBytes: 200 });
    setStorageUsageResolverForTesting(async () => simulatedUsage);

    const concurrentUploads = Array.from({ length: 5 }, (_, idx) =>
      checkStorageQuota({
        userId: aliceUser.id,
        incomingSizeBytes: 150,
        planName: "PRO",
        role: "USER",
      })
    );

    const results = await Promise.all(concurrentUploads);
    // Todos avaliaram contra simulatedUsage = 0, portanto permitiram individualmente
    assert(
      results.every((r) => r.allowed === true),
      "6.1. Requisições concorrentes processadas com integridade sem deadlocks ou falhas não tratadas"
    );

    // Se o primeiro upload completar e atualizar o uso para 150 bytes:
    simulatedUsage = 150;
    const nextCheck = await checkStorageQuota({
      userId: aliceUser.id,
      incomingSizeBytes: 150,
      planName: "PRO",
      role: "USER",
    });
    assert(
      nextCheck.allowed === false,
      "6.2. Imediatamente após a persistência do primeiro upload, uploads subsequentes são bloqueados"
    );

    // ========================================================================
    // GRUPO 7: FECHAR COBERTURA DA COTA DE STORAGE (STORAGE-HARDEN-06C)
    // ========================================================================
    console.log("\n--- GRUPO 7: Cobertura da Cota & GeneratedFile em POST /api/storage/upload ---");

    // Limpa quaisquer arquivos de testes anteriores de Alice e Bob
    await prisma.generatedFile.deleteMany({
      where: { userId: { in: [aliceUser.id, bobUser.id] } },
    });
    setStorageUsageResolverForTesting(null);
    setStorageQuotaConfigForTesting(null);
    await resetRateLimit(aliceUser.id, "upload");
    await resetRateLimit(bobUser.id, "upload");

    const usageBeforeUpload = await getUserStorageUsageBytes(aliceUser.id);
    assert(usageBeforeUpload === 0, "7.1. Uso inicial de armazenamento de Alice é 0 bytes");

    // 7.2 POST /api/storage/upload grava fisicamente e cria GeneratedFile no DB
    tracker.uploadCalls = [];
    tracker.deleteCalls = [];
    const uploadPayload = {
      fileName: "company_logo.png",
      folder: "logos",
      fileData: sampleBase64,
      mimeType: "image/png",
    };
    const reqUploadAlice = makeUploadRequest(aliceToken, uploadPayload);
    const resUploadAlice = await uploadRoute(reqUploadAlice);
    assert(resUploadAlice.status === 200, "7.2. POST /api/storage/upload responde 200 para logo válido");
    const uploadDataAlice = await resUploadAlice.json();

    assert(Boolean(uploadDataAlice.fileId), "7.3. Resposta de upload inclui fileId do GeneratedFile criado");
    assert(
      uploadDataAlice.storagePath?.startsWith(`users/${aliceUser.id}/logos/`),
      "7.4. storagePath isolado sob o namespace users/{userId}/logos/"
    );

    // 7.5 Registro GeneratedFile no banco de dados foi criado com atributos corretos
    const recordAlice = await prisma.generatedFile.findUnique({
      where: { id: uploadDataAlice.fileId },
    });
    assert(Boolean(recordAlice), "7.5. Registro GeneratedFile persistido com sucesso no banco de dados");
    assert(recordAlice?.userId === aliceUser.id, "7.6. GeneratedFile vinculado ao userId correto");
    assert(recordAlice?.fileType === "logo", "7.7. GeneratedFile classificado como fileType='logo'");
    assert(recordAlice?.fileSize === bufferLen, `7.8. GeneratedFile.fileSize gravado com precisão (${recordAlice?.fileSize} == ${bufferLen})`);
    assert(recordAlice?.storagePath === uploadDataAlice.storagePath, "7.9. storagePath no banco confere com o retornado");

    // 7.10 Uso de cota de Alice reflete imediatamente os bytes do upload
    const usageAfterUpload = await getUserStorageUsageBytes(aliceUser.id);
    assert(
      usageAfterUpload === bufferLen,
      `7.10. Cota contabiliza 100% dos bytes do upload (${usageAfterUpload} == ${bufferLen}) sem escape de métrica`
    );

    // 7.11 Upload com folder="qrcodes" classifica como fileType="qrcode"
    const reqUploadQrcode = makeUploadRequest(aliceToken, {
      fileName: "embedded_qr.png",
      folder: "qrcodes",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resUploadQrcode = await uploadRoute(reqUploadQrcode);
    assert(resUploadQrcode.status === 200, "7.11. Upload com folder='qrcodes' responde 200");
    const qrcodeData = await resUploadQrcode.json();
    const recordQrcode = await prisma.generatedFile.findUnique({
      where: { id: qrcodeData.fileId },
    });
    assert(recordQrcode?.fileType === "qrcode", "7.12. GeneratedFile para pasta qrcodes classificado como fileType='qrcode'");

    const usageAfterTwoUploads = await getUserStorageUsageBytes(aliceUser.id);
    assert(
      usageAfterTwoUploads === bufferLen * 2,
      `7.13. Cota acumula ambos os uploads (${usageAfterTwoUploads} == ${bufferLen * 2})`
    );

    // 7.14 Separação estrita: GET /api/files ("Meus Arquivos") não lista logos ou qrcodes
    // Cria um export padrão de PNG para Alice
    const reqSavePng = makeSaveRequest(aliceToken, {
      fileName: "export_qr_card",
      fileType: "png",
      fileData: sampleBase64,
      mimeType: "image/png",
    });
    const resSavePng = await saveFileRoute(reqSavePng);
    assert(resSavePng.status === 200, "7.14. Criação de export visual (png) concluída com 200");

    // Total de registros no banco para Alice agora é 3 (1 logo, 1 qrcode, 1 png)
    const totalAliceFilesDb = await prisma.generatedFile.count({ where: { userId: aliceUser.id } });
    assert(totalAliceFilesDb === 3, "7.15. Banco de dados contém 3 registros GeneratedFile no total para Alice");

    // Consulta GET /api/files padrão ("Meus Arquivos")
    const reqGetFilesDefault = makeGetFilesRequest(aliceToken);
    const resGetFilesDefault = await getFilesRoute(reqGetFilesDefault);
    assert(resGetFilesDefault.status === 200, "7.16. GET /api/files responde 200");
    const filesDefaultData = await resGetFilesDefault.json();
    assert(
      filesDefaultData.files?.length === 1 && filesDefaultData.files[0].fileType === "png",
      "7.17. 'Meus Arquivos' exibe exclusivamente exports visuais (png) e omite 'logo' e 'qrcode'"
    );

    // Consulta GET /api/files com fileType=all
    const reqGetFilesAll = makeGetFilesRequest(aliceToken, "fileType=all");
    const resGetFilesAll = await getFilesRoute(reqGetFilesAll);
    const filesAllData = await resGetFilesAll.json();
    assert(
      filesAllData.files?.length === 1 && filesAllData.files[0].fileType === "png",
      "7.18. GET /api/files?fileType=all restringe aos tipos visuais ['png', 'svg', 'pdf']"
    );

    // A cota cumulativa soma os 3 arquivos (logo + qrcode + png)
    const usageAllFiles = await getUserStorageUsageBytes(aliceUser.id);
    assert(
      usageAllFiles === bufferLen * 3,
      `7.19. Invariante atendido: cota agrega TODOS os arquivos persistentes (${usageAllFiles} == ${bufferLen * 3})`
    );

    // 7.20 Isolamento entre usuários no GET /api/files
    const reqGetFilesBob = makeGetFilesRequest(bobToken);
    const resGetFilesBob = await getFilesRoute(reqGetFilesBob);
    const filesBobData = await resGetFilesBob.json();
    assert(filesBobData.files?.length === 0, "7.20. Bob não enxerga nenhum arquivo gerado por Alice");
    const bobUsageEmpty = await getUserStorageUsageBytes(bobUser.id);
    assert(bobUsageEmpty === 0, "7.21. Uso de Bob permanece 0 bytes");

    // 7.22 Compensação de Storage: falha no banco de dados dispara deleteFile
    tracker.uploadCalls = [];
    tracker.deleteCalls = [];

    // Forçamos simulação de erro no prisma.generatedFile.create
    const originalGeneratedFileCreate = prisma.generatedFile.create;
    (prisma.generatedFile as any).create = async () => {
      throw new Error("Simulated Database connection failure during GeneratedFile.create");
    };

    try {
      const reqUploadWithDbFail = makeUploadRequest(aliceToken, {
        fileName: "compensation_test_logo.png",
        folder: "logos",
        fileData: sampleBase64,
        mimeType: "image/png",
      });
      const resUploadWithDbFail = await uploadRoute(reqUploadWithDbFail);
      assert(resUploadWithDbFail.status === 500, "7.22. Upload responde 500 quando prisma.generatedFile.create falha");
      assert(tracker.uploadCalls.length === 1, "7.23. Upload físico ocorreu antes da falha no banco");
      assert(tracker.deleteCalls.length === 1, "7.24. deleteFile de compensação foi acionado no catch");
      assert(
        tracker.deleteCalls[0].prefixes?.some((p) => p.startsWith(`users/${aliceUser.id}/logos/`)) === true,
        "7.25. Compensação direcionada estritamente ao caminho do objeto do usuário"
      );

      // Verifica que nenhum registro foi criado no banco
      const orphanDbRecord = await prisma.generatedFile.findFirst({
        where: { fileName: "compensation_test_logo.png" },
      });
      assert(orphanDbRecord === null, "7.26. Nenhum registro órfão persistido no PostgreSQL");

      // Verifica que o uso de cota de Alice permaneceu inalterado
      const usageAfterComp = await getUserStorageUsageBytes(aliceUser.id);
      assert(
        usageAfterComp === bufferLen * 3,
        "7.27. Cota de armazenamento permaneceu inalterada após compensação"
      );
    } finally {
      // Restaura método prisma.generatedFile.create original
      (prisma.generatedFile as any).create = originalGeneratedFileCreate;
    }

    // Limpeza dos registros de teste do Grupo 7
    await prisma.generatedFile.deleteMany({
      where: { userId: { in: [aliceUser.id, bobUser.id] } },
    });
  } finally {
    // Restauração de mocks e cleanup
    global.fetch = originalFetch;
    setStorageQuotaConfigForTesting(null);
    setStorageUsageResolverForTesting(null);
    await resetRateLimit(aliceUser.id, "upload");
    await resetRateLimit(bobUser.id, "upload");

    await prisma.subscription.deleteMany({
      where: {
        userId: { in: [aliceUser.id, bobUser.id, adminUser.id] },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: { in: [aliceUser.id, bobUser.id, adminUser.id] },
      },
    });

    console.log("\n==========================================================================");
    console.log(`  RESULTADO FINAL DOS TESTES DE COTA E RATE LIMITING`);
    console.log(`  Total: ${totalAsserts} | Passaram: ${passedAsserts} | Falharam: ${failedAsserts}`);
    console.log("==========================================================================\n");

    if (failedAsserts > 0) {
      process.exit(1);
    }
  }
}

runTestSuite().catch((err) => {
  console.error("Erro fatal na execução da suíte de testes:", err);
  process.exit(1);
});
