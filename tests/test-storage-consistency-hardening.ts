import { prisma } from "../src/lib/db";
import {
  deleteUserStorageFolder,
  deleteFile,
  resolveBucketFromPath,
  resolveStorageBucket,
} from "../src/lib/storage";
import { POST as saveFileRoute } from "../src/app/api/files/save/route";
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

interface MockStorageItem {
  name: string;
  id?: string | null;
}

interface MockBucketStore {
  [bucketName: string]: MockStorageItem[];
}

interface StorageAuditTracker {
  deleteCalls: Array<{ bucket: string; prefixes: string[] }>;
  listCalls: Array<{ bucket: string; prefix: string }>;
  uploadCalls: Array<{ bucket: string; path: string }>;
}

async function runStorageHardeningTests() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: STORAGE-HARDEN-05 — STORAGE CONSISTENCY HARDENING");
  console.log("==========================================================================\n");

  const originalFetch = global.fetch;

  // Buckets configurados
  const publicBucket = process.env.SUPABASE_STORAGE_BUCKET || "qrmaster-files";
  const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || "qrmaster-private";

  // Armazém virtual de arquivos simulados no Supabase
  let mockStore: MockBucketStore = {
    [publicBucket]: [],
    [privateBucket]: [],
  };

  const tracker: StorageAuditTracker = {
    deleteCalls: [],
    listCalls: [],
    uploadCalls: [],
  };

  // Flags para simulação de falhas transitórias
  let failPublicList = false;
  let failPublicDelete = false;
  let failPrivateList = false;
  let failPrivateDelete = false;
  let failUpload = false;

  function resetTracker() {
    tracker.deleteCalls = [];
    tracker.listCalls = [];
    tracker.uploadCalls = [];
    failPublicList = false;
    failPublicDelete = false;
    failPrivateList = false;
    failPrivateDelete = false;
    failUpload = false;
  }

  // Interceptador de fetch para simular Supabase REST API
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // 1. Simulação de LIST
    if (url.includes("/storage/v1/object/list/")) {
      const parts = url.split("/storage/v1/object/list/")[1].split("?")[0];
      const bucket = parts;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      const prefix = body.prefix || "";

      tracker.listCalls.push({ bucket, prefix });

      if (bucket === publicBucket && failPublicList) {
        return new Response(JSON.stringify({ error: "Simulated public list error 500" }), { status: 500 });
      }
      if (bucket === privateBucket && failPrivateList) {
        return new Response(JSON.stringify({ error: "Simulated private list error 500" }), { status: 500 });
      }

      // Filtra itens do mockStore que correspondem ao prefixo
      const allItems = mockStore[bucket] || [];
      const matched = allItems.filter((item) => item.name.startsWith(prefix));

      // Mapeia para retorno relativo conforme Supabase
      const relativeItems = matched.map((item) => {
        const subName = item.name.slice(prefix.length);
        return {
          name: subName,
          id: item.id !== undefined ? item.id : "mock_id_" + item.name,
        };
      });

      return new Response(JSON.stringify(relativeItems), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Simulação de DELETE
    if (url.includes("/storage/v1/object/") && init?.method === "DELETE") {
      const parts = url.split("/storage/v1/object/")[1].split("?")[0];
      const bucket = parts;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      const prefixes: string[] = body.prefixes || [];

      tracker.deleteCalls.push({ bucket, prefixes });

      if (bucket === publicBucket && failPublicDelete) {
        return new Response(JSON.stringify({ error: "Simulated public delete error 500" }), { status: 500 });
      }
      if (bucket === privateBucket && failPrivateDelete) {
        return new Response(JSON.stringify({ error: "Simulated private delete error 500" }), { status: 500 });
      }

      // Remove itens do mockStore
      mockStore[bucket] = (mockStore[bucket] || []).filter((item) => !prefixes.includes(item.name));

      return new Response(JSON.stringify(prefixes.map((p) => ({ message: "Successfully deleted", name: p }))), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Simulação de UPLOAD
    if (url.includes("/storage/v1/object/") && init?.method === "POST") {
      const pathSuffix = url.split("/storage/v1/object/")[1];
      const slashIndex = pathSuffix.indexOf("/");
      const bucket = pathSuffix.slice(0, slashIndex);
      const filePath = pathSuffix.slice(slashIndex + 1);

      tracker.uploadCalls.push({ bucket, path: filePath });

      if (failUpload) {
        return new Response(JSON.stringify({ error: "Simulated upload failure 500" }), { status: 500 });
      }

      mockStore[bucket] = mockStore[bucket] || [];
      mockStore[bucket].push({ name: filePath, id: "mock_upload_" + Date.now() });

      return new Response(JSON.stringify({ Key: `${bucket}/${filePath}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Se for outra URL (ex: banco de dados ou externa), delega
    return originalFetch(input, init);
  };

  try {
    // ==========================================================================
    // GRUPO A: ACCOUNT STORAGE CLEANUP (deleteUserStorageFolder)
    // ==========================================================================
    console.log("▶ GRUPO A: Account Storage Cleanup (deleteUserStorageFolder)\n");

    const userIdA = "usr_alice_consistency_test";
    const userIdB = "usr_bob_consistency_test";

    // --------------------------------------------------------------------------
    // A1. Usuário possui objeto em qrmaster-files
    // --------------------------------------------------------------------------
    resetTracker();
    mockStore[publicBucket] = [{ name: `users/${userIdA}/logos/brand_logo.png`, id: "pub_1" }];
    mockStore[privateBucket] = [];

    const resA1 = await deleteUserStorageFolder(userIdA);
    assert(resA1 === true, "A1. deleteUserStorageFolder retorna true quando há arquivos em qrmaster-files");
    const pubDelA1 = tracker.deleteCalls.find((c) => c.bucket === publicBucket);
    assert(
      Boolean(pubDelA1 && pubDelA1.prefixes.includes(`users/${userIdA}/logos/brand_logo.png`)),
      "A1. Objeto em qrmaster-files foi selecionado e excluído com o prefixo exato"
    );

    // --------------------------------------------------------------------------
    // A2. Usuário possui objeto em qrmaster-private
    // --------------------------------------------------------------------------
    resetTracker();
    mockStore[publicBucket] = [];
    mockStore[privateBucket] = [{ name: `users/${userIdA}/exports/qr_export.pdf`, id: "priv_1" }];

    const resA2 = await deleteUserStorageFolder(userIdA);
    assert(resA2 === true, "A2. deleteUserStorageFolder retorna true quando há arquivos em qrmaster-private");
    const privDelA2 = tracker.deleteCalls.find((c) => c.bucket === privateBucket);
    assert(
      Boolean(privDelA2 && privDelA2.prefixes.includes(`users/${userIdA}/exports/qr_export.pdf`)),
      "A2. Objeto privado em qrmaster-private foi selecionado e excluído com o prefixo exato"
    );

    // --------------------------------------------------------------------------
    // A3. Usuário possui objetos nos dois buckets (limpeza bicameral)
    // --------------------------------------------------------------------------
    resetTracker();
    mockStore[publicBucket] = [{ name: `users/${userIdA}/qrcodes/qr_vector.svg`, id: "pub_3" }];
    mockStore[privateBucket] = [{ name: `users/${userIdA}/exports/report.png`, id: "priv_3" }];

    const resA3 = await deleteUserStorageFolder(userIdA);
    assert(resA3 === true, "A3. deleteUserStorageFolder retorna true na limpeza simultânea dos dois buckets");
    const pubDelA3 = tracker.deleteCalls.find((c) => c.bucket === publicBucket);
    const privDelA3 = tracker.deleteCalls.find((c) => c.bucket === privateBucket);
    assert(
      Boolean(pubDelA3 && pubDelA3.prefixes.includes(`users/${userIdA}/qrcodes/qr_vector.svg`)),
      "A3. Objeto em qrmaster-files foi devidamente excluído"
    );
    assert(
      Boolean(privDelA3 && privDelA3.prefixes.includes(`users/${userIdA}/exports/report.png`)),
      "A3. Objeto em qrmaster-private foi devidamente excluído"
    );

    // --------------------------------------------------------------------------
    // A4. Bucket público vazio
    // --------------------------------------------------------------------------
    resetTracker();
    mockStore[publicBucket] = [];
    mockStore[privateBucket] = [{ name: `users/${userIdA}/exports/export_only.png`, id: "priv_4" }];

    const resA4 = await deleteUserStorageFolder(userIdA);
    assert(resA4 === true, "A4. Operação bem-sucedida quando bucket público está vazio");
    assert(
      tracker.deleteCalls.some((c) => c.bucket === privateBucket),
      "A4. Bucket privado é limpo normalmente mesmo quando o público está vazio"
    );

    // --------------------------------------------------------------------------
    // A5. Bucket privado vazio
    // --------------------------------------------------------------------------
    resetTracker();
    mockStore[publicBucket] = [{ name: `users/${userIdA}/logos/avatar.png`, id: "pub_5" }];
    mockStore[privateBucket] = [];

    const resA5 = await deleteUserStorageFolder(userIdA);
    assert(resA5 === true, "A5. Operação bem-sucedida quando bucket privado está vazio");
    assert(
      tracker.deleteCalls.some((c) => c.bucket === publicBucket),
      "A5. Bucket público é limpo normalmente mesmo quando o privado está vazio"
    );

    // --------------------------------------------------------------------------
    // A6. Ambos vazios (idempotência segura)
    // --------------------------------------------------------------------------
    resetTracker();
    mockStore[publicBucket] = [];
    mockStore[privateBucket] = [];

    const resA6 = await deleteUserStorageFolder(userIdA);
    assert(resA6 === true, "A6. Ambos buckets vazios retorna true de forma idempotente e segura");
    assert(tracker.deleteCalls.length === 0, "A6. Nenhuma chamada desnecessária de exclusão quando vazios");

    // --------------------------------------------------------------------------
    // A7. Existem arquivos de outro usuário (isolamento estrito multi-tenant)
    // --------------------------------------------------------------------------
    resetTracker();
    mockStore[publicBucket] = [
      { name: `users/${userIdA}/logos/alice_logo.png`, id: "pub_alice" },
      { name: `users/${userIdB}/logos/bob_logo.png`, id: "pub_bob" },
    ];
    mockStore[privateBucket] = [
      { name: `users/${userIdA}/exports/alice_doc.pdf`, id: "priv_alice" },
      { name: `users/${userIdB}/exports/bob_doc.pdf`, id: "priv_bob" },
    ];

    const resA7 = await deleteUserStorageFolder(userIdA);
    assert(resA7 === true, "A7. Limpeza do usuário A concluída");
    const allDeletedPrefixesA7 = tracker.deleteCalls.flatMap((c) => c.prefixes);
    assert(
      !allDeletedPrefixesA7.some((p) => p.includes(userIdB)),
      "A7. Arquivos do usuário B NUNCA foram selecionados ou excluídos"
    );
    assert(
      allDeletedPrefixesA7.includes(`users/${userIdA}/logos/alice_logo.png`),
      "A7. Arquivo público de Alice foi devidamente excluído"
    );
    assert(
      allDeletedPrefixesA7.includes(`users/${userIdA}/exports/alice_doc.pdf`),
      "A7. Arquivo privado de Alice foi devidamente excluído"
    );
    assert(
      mockStore[publicBucket].some((i) => i.name.includes(userIdB)),
      "A7. Arquivo de Bob permanece preservado no mockStore público"
    );
    assert(
      mockStore[privateBucket].some((i) => i.name.includes(userIdB)),
      "A7. Arquivo de Bob permanece preservado no mockStore privado"
    );

    // --------------------------------------------------------------------------
    // A8. userId vazio (fail-closed)
    // --------------------------------------------------------------------------
    resetTracker();
    const resA8 = await deleteUserStorageFolder("");
    assert(resA8 === false, "A8. userId vazio falha fechado retornando false");
    assert(tracker.listCalls.length === 0, "A8. Nenhuma requisição ao storage disparada com userId vazio");

    // --------------------------------------------------------------------------
    // A9. userId apenas whitespace (fail-closed)
    // --------------------------------------------------------------------------
    resetTracker();
    const resA9 = await deleteUserStorageFolder("   \t  \n  ");
    assert(resA9 === false, "A9. userId whitespace falha fechado retornando false");
    assert(tracker.listCalls.length === 0, "A9. Nenhuma requisição ao storage disparada com userId whitespace");

    // --------------------------------------------------------------------------
    // A10. Tentativas de path traversal e injeção no userId
    // --------------------------------------------------------------------------
    resetTracker();
    const resA10a = await deleteUserStorageFolder("../victim");
    const resA10b = await deleteUserStorageFolder("victim/../root");
    const resA10c = await deleteUserStorageFolder("user/admin");
    const resA10d = await deleteUserStorageFolder("user\\admin");
    const resA10e = await deleteUserStorageFolder("/");
    assert(
      resA10a === false && resA10b === false && resA10c === false && resA10d === false && resA10e === false,
      "A10. Todas as tentativas de path traversal ('..', '/', '\\') falham fechado"
    );
    assert(tracker.listCalls.length === 0, "A10. Nenhuma consulta disparada contra o storage em tentativas de traversal");

    // --------------------------------------------------------------------------
    // A11. Falha no bucket público
    // --------------------------------------------------------------------------
    resetTracker();
    failPublicList = true;
    mockStore[publicBucket] = [{ name: `users/${userIdA}/logos/logo.png`, id: "p1" }];
    mockStore[privateBucket] = [{ name: `users/${userIdA}/exports/doc.pdf`, id: "pr1" }];

    const resA11 = await deleteUserStorageFolder(userIdA);
    assert(resA11 === false, "A11. Retorna false indicando falha parcial quando bucket público falha");
    const privDelA11 = tracker.deleteCalls.find((c) => c.bucket === privateBucket);
    assert(
      Boolean(privDelA11 && privDelA11.prefixes.includes(`users/${userIdA}/exports/doc.pdf`)),
      "A11. Bucket privado continua sendo tentado e limpo mesmo após falha no bucket público"
    );

    // --------------------------------------------------------------------------
    // A12. Falha no bucket privado
    // --------------------------------------------------------------------------
    resetTracker();
    failPrivateList = true;
    mockStore[publicBucket] = [{ name: `users/${userIdA}/logos/logo.png`, id: "p1" }];
    mockStore[privateBucket] = [{ name: `users/${userIdA}/exports/doc.pdf`, id: "pr1" }];

    const resA12 = await deleteUserStorageFolder(userIdA);
    assert(resA12 === false, "A12. Retorna false indicando falha parcial quando bucket privado falha");
    const pubDelA12 = tracker.deleteCalls.find((c) => c.bucket === publicBucket);
    assert(
      Boolean(pubDelA12 && pubDelA12.prefixes.includes(`users/${userIdA}/logos/logo.png`)),
      "A12. Bucket público foi devidamente limpo antes da falha no bucket privado"
    );

    // --------------------------------------------------------------------------
    // A13. Falha em um bucket não provoca deleção fora do namespace no outro bucket
    // --------------------------------------------------------------------------
    resetTracker();
    failPublicList = true;
    mockStore[publicBucket] = [];
    mockStore[privateBucket] = [
      { name: `users/${userIdA}/exports/target.png`, id: "pr_a" },
      { name: `users/${userIdB}/exports/protected.png`, id: "pr_b" },
    ];

    const resA13 = await deleteUserStorageFolder(userIdA);
    assert(resA13 === false, "A13. Retorna false devido ao bucket público");
    const privDelA13 = tracker.deleteCalls.find((c) => c.bucket === privateBucket);
    assert(
      Boolean(privDelA13 && privDelA13.prefixes.includes(`users/${userIdA}/exports/target.png`)),
      "A13. Apenas o namespace do usuário Alice foi excluído no bucket privado"
    );
    assert(
      !privDelA13?.prefixes.some((p) => p.includes(userIdB)),
      "A13. O namespace do usuário Bob permaneceu intocado no bucket privado"
    );

    // ==========================================================================
    // GRUPO B: FILE SAVE COMPENSATION (POST /api/files/save)
    // ==========================================================================
    console.log("\n▶ GRUPO B: File Save Compensation (POST /api/files/save)\n");

    // Setup de usuário e sessão para a rota
    const plan = (await prisma.plan.findFirst()) || (await prisma.plan.create({
      data: { name: "PRO", displayName: "Pro Plan", priceMonth: 29, priceYear: 290 },
    }));

    const testUser = await prisma.user.upsert({
      where: { email: "user_compensation_test@test.local" },
      create: {
        email: "user_compensation_test@test.local",
        name: "User Compensation Test",
        role: "USER",
        planId: plan.id,
      },
      update: {},
    });

    const { token: userToken } = await createAuthenticatedSessionToken({
      id: testUser.id,
      name: testUser.name,
      email: testUser.email,
      role: testUser.role,
    });

    function makeSaveRequest(body: any): NextRequest {
      return new NextRequest("http://localhost:3000/api/files/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `qrmaster_session=${userToken}`,
          authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify(body),
      });
    }

    // --------------------------------------------------------------------------
    // B1. uploadFile sucesso + DB create sucesso -> NÃO chamar compensação
    // --------------------------------------------------------------------------
    resetTracker();
    const reqB1 = makeSaveRequest({
      fileName: "b1_sucesso.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resB1 = await saveFileRoute(reqB1);
    assert(resB1.status === 200, "B1. Rota retorna 200 quando upload e banco funcionam");
    assert(tracker.uploadCalls.length === 1, "B1. Upload foi executado uma vez");
    assert(tracker.deleteCalls.length === 0, "B1. Nenhuma chamada de compensação deleteFile quando tudo tem sucesso");

    // Limpa registro gerado
    const dataB1 = await resB1.json();
    if (dataB1?.file?.id) {
      await prisma.generatedFile.delete({ where: { id: dataB1.file.id } }).catch(() => {});
    }

    // --------------------------------------------------------------------------
    // B2. uploadFile falha -> DB create não executado; compensação desnecessária
    // --------------------------------------------------------------------------
    resetTracker();
    failUpload = true;
    let originalCreateCalledB2 = false;
    const originalCreate = prisma.generatedFile.create;
    (prisma.generatedFile as any).create = async (...args: any[]) => {
      originalCreateCalledB2 = true;
      return originalCreate.apply(prisma.generatedFile, args as any);
    };

    const reqB2 = makeSaveRequest({
      fileName: "b2_falha_upload.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resB2 = await saveFileRoute(reqB2);
    (prisma.generatedFile as any).create = originalCreate;

    assert(resB2.status === 500, "B2. Rota retorna status 500 quando upload falha");
    assert(!originalCreateCalledB2, "B2. prisma.generatedFile.create NÃO foi acionado");
    assert(tracker.deleteCalls.length === 0, "B2. Compensação NÃO foi acionada pois nenhum objeto foi salvo");

    // --------------------------------------------------------------------------
    // B3, B4, B5, B6. uploadFile sucesso + DB create falha -> compensação acionada
    // --------------------------------------------------------------------------
    resetTracker();
    let interceptedStoragePathB3 = "";
    (prisma.generatedFile as any).create = async () => {
      throw new Error("Simulated database failure: PrismaClientKnownRequestError P2002");
    };

    const reqB3 = makeSaveRequest({
      fileName: "b3_falha_db.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resB3 = await saveFileRoute(reqB3);
    (prisma.generatedFile as any).create = originalCreate;

    assert(resB3.status === 500, "B3. Rota propaga status 500 quando DB falha");
    const dataB3 = await resB3.json();
    assert(
      dataB3.error === "Não foi possível salvar o arquivo. Tente novamente.",
      "B3. Resposta externa recebe mensagem segura sanitizada sem expor detalhes do banco"
    );
    assert(tracker.deleteCalls.length >= 1, "B3. deleteFile compensatório foi chamado após falha no DB");

    // B4: Confirmar storagePath
    const uploadedPath = tracker.uploadCalls[0]?.path;
    const deletedPrefixesB4 = tracker.deleteCalls.flatMap((c) => c.prefixes);
    assert(
      Boolean(uploadedPath && deletedPrefixesB4.includes(uploadedPath)),
      "B4. deleteFile compensatório recebeu exatamente o storagePath retornado pelo upload"
    );

    // B5: Confirmar folder e bucket de export privado
    const resolvedBucketForExport = resolveBucketFromPath(uploadedPath);
    assert(
      resolvedBucketForExport === privateBucket,
      "B5. Objeto de export foi devidamente mapeado para o bucket privado qrmaster-private"
    );
    assert(
      uploadedPath.startsWith(`users/${testUser.id}/exports/`),
      "B5. storagePath está estritamente contido em users/{userId}/exports/"
    );

    // B6: Objeto não fica órfão
    assert(
      !mockStore[privateBucket].some((i) => i.name === uploadedPath),
      "B6. Objeto foi removido do storage pela compensação, impedindo orfandade"
    );

    // --------------------------------------------------------------------------
    // B7. Falha DB + compensação falha -> erro externo permanece sanitizado
    // --------------------------------------------------------------------------
    resetTracker();
    failPrivateDelete = true; // Simula falha na própria compensação
    (prisma.generatedFile as any).create = async () => {
      throw new Error("Erro Crítico de Persistência no Banco");
    };

    const reqB7 = makeSaveRequest({
      fileName: "b7_double_fault.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resB7 = await saveFileRoute(reqB7);
    (prisma.generatedFile as any).create = originalCreate;

    assert(resB7.status === 500, "B7. Rota retorna status 500 mesmo quando a compensação falha");
    const dataB7 = await resB7.json();
    assert(
      dataB7.error === "Não foi possível salvar o arquivo. Tente novamente.",
      "B7. Erro externo permanece 100% sanitizado mesmo se a compensação falhar"
    );

    // --------------------------------------------------------------------------
    // B8. Compensação jamais remove arquivo de outro usuário
    // --------------------------------------------------------------------------
    resetTracker();
    let otherUserDeletionBlocked = false;
    try {
      // Tentativa de invocar deleteFile com caminho de Alice mas session de Bob
      await deleteFile(`users/${userIdA}/exports/private_doc.png`, userIdB);
    } catch (err: any) {
      if (err.message.includes("Tentativa de exclusão de arquivo não autorizado")) {
        otherUserDeletionBlocked = true;
      }
    }
    assert(otherUserDeletionBlocked, "B8. deleteFile bloqueia com erro tentativas de exclusão com userId incompatível");
    assert(tracker.deleteCalls.length === 0, "B8. Nenhuma requisição DELETE disparada contra storage para outro usuário");

    // --------------------------------------------------------------------------
    // B9. Compensação jamais recebe prefixo genérico
    // --------------------------------------------------------------------------
    resetTracker();
    let genericPrefixBlocked = false;
    try {
      await deleteFile("users/test/", "test");
    } catch {
      genericPrefixBlocked = true;
    }
    // deleteFile exige caminho específico de arquivo, rejeitando prefixos de diretório
    assert(genericPrefixBlocked, "B9. deleteFile rejeita fail-closed prefixo genérico de diretório");
    const deleteCallsB9 = tracker.deleteCalls.filter((c) => c.prefixes.includes("users/test/"));
    assert(deleteCallsB9.length === 0, "B9. Nenhuma requisição DELETE disparada contra storage para prefixo genérico");

    // --------------------------------------------------------------------------
    // B10. Fluxo normal continua criando GeneratedFile corretamente
    // --------------------------------------------------------------------------
    resetTracker();
    const reqB10 = makeSaveRequest({
      fileName: "b10_fluxo_normal.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resB10 = await saveFileRoute(reqB10);
    assert(resB10.status === 200, "B10. Fluxo normal responde HTTP 200");
    const dataB10 = await resB10.json();
    assert(dataB10.success === true, "B10. Resposta indica success = true");
    assert(Boolean(dataB10.file?.id), "B10. Registro do GeneratedFile foi retornado com ID válido");

    // Confirma que o registro existe no banco
    const createdFileInDb = await prisma.generatedFile.findUnique({
      where: { id: dataB10.file.id },
    });
    assert(createdFileInDb !== null, "B10. GeneratedFile foi persistido no PostgreSQL com sucesso");
    assert(
      createdFileInDb?.userId === testUser.id,
      "B10. GeneratedFile está devidamente associado ao session.id do usuário autenticado"
    );

    // Limpeza do registro de teste B10
    if (createdFileInDb) {
      await prisma.generatedFile.delete({ where: { id: createdFileInDb.id } });
    }

    // ==========================================================================
    // GRUPO C: TESTES ADVERSARIAIS DE SANITIZAÇÃO E VAZAMENTO DE ERROS (C1 a C10)
    // ==========================================================================
    console.log("\n▶ GRUPO C: Testes Adversariais de Sanitização e Vazamento de Erros (STORAGE-HARDEN-05B)\n");

    // C1: upload sucesso + DB sucesso -> HTTP/fluxo normal preservado
    resetTracker();
    const reqC1 = makeSaveRequest({
      fileName: "c1_normal_flow.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resC1 = await saveFileRoute(reqC1);
    assert(resC1.status === 200, "C1. Fluxo normal responde HTTP 200");
    const dataC1 = await resC1.json();
    assert(dataC1.success === true && Boolean(dataC1.file?.id), "C1. GeneratedFile retornado com sucesso");
    if (dataC1.file?.id) {
      await prisma.generatedFile.delete({ where: { id: dataC1.file.id } }).catch(() => {});
    }

    // C2: upload sucesso + DB falha -> compensação deleteFile executada
    resetTracker();
    (prisma.generatedFile as any).create = async () => {
      throw new Error("Generic DB error");
    };
    const reqC2 = makeSaveRequest({
      fileName: "c2_comp_check.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resC2 = await saveFileRoute(reqC2);
    (prisma.generatedFile as any).create = originalCreate;
    assert(resC2.status === 500, "C2. Falha de DB resulta em status 500");
    assert(tracker.deleteCalls.length >= 1, "C2. Compensação deleteFile executada no storage");
    const uploadedPathC2 = tracker.uploadCalls[0]?.path;
    assert(
      tracker.deleteCalls.some((c) => c.prefixes.includes(uploadedPathC2)),
      "C2. Objeto exato criado pelo upload foi submetido para exclusão na compensação"
    );

    // C3 & C4: DB falha contendo mensagem sensível simulada
    resetTracker();
    const sensitiveDbMessage = "Prisma P2002 Unique constraint failed on database.internal.local password=SUPER_SECRET_PRISMA_KEY";
    (prisma.generatedFile as any).create = async () => {
      throw new Error(sensitiveDbMessage);
    };
    const reqC3 = makeSaveRequest({
      fileName: "c3_sensitive_error.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resC3 = await saveFileRoute(reqC3);
    (prisma.generatedFile as any).create = originalCreate;
    const bodyTextC3 = await resC3.text();
    const dataC3 = JSON.parse(bodyTextC3);

    assert(!bodyTextC3.includes("SUPER_SECRET_PRISMA_KEY"), "C3. Mensagem bruta contendo segredo NÃO aparece no body HTTP");
    assert(!bodyTextC3.includes("P2002"), "C3. Código de erro interno do Prisma P2002 NÃO vaza para o cliente");
    assert(!bodyTextC3.includes("database.internal.local"), "C3. Host de banco de dados interno NÃO vaza para o cliente");
    assert(dataC3.error === "Não foi possível salvar o arquivo. Tente novamente.", "C4. Resposta HTTP utiliza mensagem genérica padronizada");

    // C5: DB falha + compensação sucesso -> erro externo permanece sanitizado
    resetTracker();
    (prisma.generatedFile as any).create = async () => {
      throw new Error("Connection lost postgresql://user:secretpass@db.local:5432/main");
    };
    const reqC5 = makeSaveRequest({
      fileName: "c5_comp_ok.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resC5 = await saveFileRoute(reqC5);
    (prisma.generatedFile as any).create = originalCreate;
    const dataC5 = await resC5.json();
    assert(resC5.status === 500, "C5. Status permanece 500 quando DB falha e compensação sucede");
    assert(dataC5.error === "Não foi possível salvar o arquivo. Tente novamente.", "C5. Erro externo permanece 100% sanitizado");

    // C6: DB falha + compensação também falha -> erro externo permanece sanitizado
    resetTracker();
    failPrivateDelete = true;
    (prisma.generatedFile as any).create = async () => {
      throw new Error("DB Error with sensitive context schema=public table=GeneratedFile");
    };
    const reqC6 = makeSaveRequest({
      fileName: "c6_double_fault.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resC6 = await saveFileRoute(reqC6);
    (prisma.generatedFile as any).create = originalCreate;
    const dataC6 = await resC6.json();
    assert(resC6.status === 500, "C6. Status permanece 500 em dupla falha");
    assert(dataC6.error === "Não foi possível salvar o arquivo. Tente novamente.", "C6. Erro externo permanece 100% sanitizado mesmo se a compensação falhar");

    // C7: Erro da compensação não substitui o erro principal (status 500)
    assert(resC6.status === 500, "C7. Falha na compensação não mascara nem altera o status 500 do erro principal");

    // C8: Nenhum secret fictício utilizado no teste aparece no response body
    const reqC8 = makeSaveRequest({
      fileName: "c8_secrets.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    (prisma.generatedFile as any).create = async () => {
      throw new Error("SECRET_TOKEN_XYZ_123456789_LEAK_TEST");
    };
    const resC8 = await saveFileRoute(reqC8);
    (prisma.generatedFile as any).create = originalCreate;
    const bodyC8 = await resC8.text();
    assert(!bodyC8.includes("SECRET_TOKEN_XYZ_123456789_LEAK_TEST"), "C8. Secret fictício jamais aparece no response body");

    // C9: Erros de autenticação/autorização existentes continuam preservados
    const unauthReq = new NextRequest("http://localhost:3000/api/files/save", {
      method: "POST",
      body: JSON.stringify({ fileName: "test.png", fileType: "png", fileData: "dummy" }),
    });
    const unauthRes = await saveFileRoute(unauthReq);
    assert(unauthRes.status === 401, "C9. Requisição sem sessão continua retornando 401");
    const unauthData = await unauthRes.json();
    assert(unauthData.error === "Não autorizado", "C9. Mensagem de 401 permanece 'Não autorizado'");

    const invalidReq = makeSaveRequest({});
    const invalidRes = await saveFileRoute(invalidReq);
    assert(invalidRes.status === 400, "C9. Requisição com dados incompletos continua retornando 400");

    // C10: Nenhuma compensação ocorre quando o upload falha antes da criação do objeto
    resetTracker();
    failUpload = true;
    const reqC10 = makeSaveRequest({
      fileName: "c10_fail_upload.png",
      fileType: "png",
      fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const resC10 = await saveFileRoute(reqC10);
    assert(resC10.status === 500, "C10. Falha de upload retorna 500");
    assert(tracker.deleteCalls.length === 0, "C10. Zero chamadas de compensação quando o upload falha na origem");

    // Limpeza de usuários de teste
    await prisma.session.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.user.deleteMany({
      where: { email: "user_compensation_test@test.local" },
    });

  } finally {
    // Restaura fetch global original
    global.fetch = originalFetch;
  }

  console.log("\n==========================================================================");
  console.log(`  RESULTADO DA SUÍTE: ${passedAsserts}/${totalAsserts} APROVADOS (${failedAsserts} FALHAS)`);
  console.log("==========================================================================\n");

  if (failedAsserts > 0) {
    throw new Error(`Suíte de testes falhou com ${failedAsserts} erros.`);
  }
}

runStorageHardeningTests().catch((err) => {
  console.error("Erro fatal na execução da suíte de testes:", err);
  process.exit(1);
});
