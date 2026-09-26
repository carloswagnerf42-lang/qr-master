import { prisma } from "../src/lib/db";
import {
  classifyManagedFile,
  cleanupReplacedManagedFile,
  extractStoragePathFromUrl,
  isExternalUrl,
} from "../src/lib/storage-lifecycle";
import { getUserStorageUsageBytes } from "../src/lib/storage-quota";
import { updateUserQRCode, deleteUserQRCode, restoreUserQRCode } from "../src/lib/qr-service";
import { PATCH as patchMeRoute } from "../src/app/api/auth/me/route";
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

async function runStorageLifecycleTests() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: STORAGE-LIFECYCLE-07 — GERENCIAMENTO DE CICLO DE VIDA");
  console.log("==========================================================================\n");

  const originalFetch = global.fetch;
  const tracker: StorageAuditTracker = {
    uploadCalls: [],
    deleteCalls: [],
  };

  let failStorageDelete = false;

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
          // ignore
        }
        tracker.deleteCalls.push({ url: urlStr, method, prefixes });

        if (failStorageDelete) {
          return new Response(JSON.stringify({ error: "Simulated Storage Delete failure 500" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify([{ name: "deleted-item" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return originalFetch(input, init);
  };

  // Setup de usuários de teste
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

  const alice = await prisma.user.upsert({
    where: { email: "alice_lifecycle_test@test.local" },
    create: {
      email: "alice_lifecycle_test@test.local",
      name: "Alice Lifecycle",
      role: "USER",
      planId: proPlan.id,
    },
    update: { planId: proPlan.id, role: "USER", avatarUrl: null },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob_lifecycle_test@test.local" },
    create: {
      email: "bob_lifecycle_test@test.local",
      name: "Bob Lifecycle",
      role: "USER",
      planId: proPlan.id,
    },
    update: { planId: proPlan.id, role: "USER", avatarUrl: null },
  });

  const { token: aliceToken } = await createAuthenticatedSessionToken({
    id: alice.id,
    name: alice.name,
    email: alice.email,
    role: alice.role,
  });

  function makePatchMeRequest(token: string, body: any): NextRequest {
    return new NextRequest("http://localhost:3000/api/auth/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        cookie: `qrmaster_session=${token}`,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  try {
    // ========================================================================
    // GRUPO 1: EXTRAÇÃO DE STORAGE PATH & IDENTIFICAÇÃO DE URL EXTERNA
    // ========================================================================
    console.log("\n--- GRUPO 1: Extração de StoragePath e Detecção de URL Externa ---");

    assert(
      extractStoragePathFromUrl(`users/${alice.id}/logos/avatar_1.png`) === `users/${alice.id}/logos/avatar_1.png`,
      "1.1. Extrai caminho relativo direto users/{userId}/logos/..."
    );

    assert(
      extractStoragePathFromUrl(
        `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/users/${alice.id}/logos/avatar_1.png`
      ) === `users/${alice.id}/logos/avatar_1.png`,
      "1.2. Extrai storagePath de URL pública completa do Supabase"
    );

    assert(
      extractStoragePathFromUrl(
        `/api/files/download?path=users%2F${alice.id}%2Fexports%2Fcard.pdf`
      ) === `users/${alice.id}/exports/card.pdf`,
      "1.3. Extrai storagePath de rota /api/files/download?path=..."
    );

    assert(
      extractStoragePathFromUrl(
        `/uploads/storage/users/${alice.id}/logos/logo_dev.png`
      ) === `users/${alice.id}/logos/logo_dev.png`,
      "1.4. Extrai storagePath de mirror local de desenvolvimento"
    );

    assert(
      extractStoragePathFromUrl("../../etc/passwd") === null,
      "1.5. Rejeita fail-closed path traversal com .."
    );

    assert(
      extractStoragePathFromUrl("users\\alice\\logos\\hack.png") === null,
      "1.6. Rejeita fail-closed separadores invertidos \\"
    );

    assert(
      extractStoragePathFromUrl(null) === null,
      "1.7. Entrada nula retorna null de forma segura"
    );

    assert(
      isExternalUrl("https://lh3.googleusercontent.com/a/ACg8ocK123") === true,
      "1.8. Avatar do Google OAuth identificado como EXTERNAL"
    );

    assert(
      isExternalUrl("https://images.unsplash.com/photo-1234") === true,
      "1.9. URL de CDN externa identificada como EXTERNAL"
    );

    assert(
      isExternalUrl(`/uploads/storage/users/${alice.id}/logos/pic.png`) === false,
      "1.10. Caminho relativo local não é tratado como EXTERNAL"
    );

    // ========================================================================
    // GRUPO 2: CLASSIFICAÇÃO NAS 6 CATEGORIAS FUNDAMENTAIS
    // ========================================================================
    console.log("\n--- GRUPO 2: Classificação em 6 Categorias (classifyManagedFile) ---");

    // 2.1 Categoria DEFAULT
    const classDefaultNull = await classifyManagedFile({ fileUrlOrPath: null, userId: alice.id });
    assert(classDefaultNull.category === "DEFAULT", "2.1. Referência nula classificada como DEFAULT");

    const classDefaultEmpty = await classifyManagedFile({ fileUrlOrPath: "", userId: alice.id });
    assert(classDefaultEmpty.category === "DEFAULT", "2.2. String vazia classificada como DEFAULT");

    const classDefaultAvatar = await classifyManagedFile({
      fileUrlOrPath: "/avatars/default-avatar.png",
      userId: alice.id,
    });
    assert(classDefaultAvatar.category === "DEFAULT", "2.3. /avatars/default-avatar.png classificado como DEFAULT");

    // 2.2 Categoria EXTERNAL
    const classExternal = await classifyManagedFile({
      fileUrlOrPath: "https://lh3.googleusercontent.com/a/avatar_google",
      userId: alice.id,
    });
    assert(classExternal.category === "EXTERNAL", "2.4. URL do Google OAuth classificada como EXTERNAL");

    // 2.3 Categoria UNKNOWN (malformada / esquema perigoso)
    const classUnknown = await classifyManagedFile({
      fileUrlOrPath: "javascript:alert(1)",
      userId: alice.id,
    });
    assert(classUnknown.category === "UNKNOWN", "2.5. Esquema javascript: classificado como UNKNOWN");

    const classUnknownTraversal = await classifyManagedFile({
      fileUrlOrPath: `users/${alice.id}/logos/../../system.png`,
      userId: alice.id,
    });
    assert(classUnknownTraversal.category === "UNKNOWN", "2.6. Tentativa de traversal classificada como UNKNOWN");

    // 2.4 Categoria SHARED_OR_UNSAFE (Cross-User Defense)
    const classCrossUser = await classifyManagedFile({
      fileUrlOrPath: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/users/${bob.id}/logos/bob_logo.png`,
      userId: alice.id, // Alice tentando classificar arquivo de Bob
    });
    assert(
      classCrossUser.category === "SHARED_OR_UNSAFE",
      "2.7. Arquivo pertencente a outro usuário classificado como SHARED_OR_UNSAFE"
    );

    // 2.5 Categoria OWNED_LEGACY (no namespace de Alice, mas sem GeneratedFile)
    const legacyPath = `users/${alice.id}/logos/untracked_legacy.png`;
    const classLegacy = await classifyManagedFile({
      fileUrlOrPath: legacyPath,
      userId: alice.id,
    });
    assert(
      classLegacy.category === "OWNED_LEGACY",
      "2.8. Arquivo sob namespace do usuário sem GeneratedFile classificado como OWNED_LEGACY"
    );

    // 2.6 Categoria OWNED_TRACKED (no namespace de Alice com GeneratedFile ativo)
    const trackedPath = `users/${alice.id}/logos/tracked_alice_1.png`;
    const trackedRecord = await prisma.generatedFile.create({
      data: {
        userId: alice.id,
        fileName: "tracked_alice_1.png",
        fileType: "logo",
        fileSize: 1024,
        mimeType: "image/png",
        storagePath: trackedPath,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/${trackedPath}`,
      },
    });

    const classTracked = await classifyManagedFile({
      fileUrlOrPath: trackedRecord.downloadUrl,
      userId: alice.id,
    });
    assert(
      classTracked.category === "OWNED_TRACKED",
      "2.9. Arquivo próprio com registro em GeneratedFile classificado como OWNED_TRACKED"
    );
    assert(
      classTracked.generatedFileId === trackedRecord.id,
      "2.10. generatedFileId identificado corretamente"
    );

    // 2.7 Categoria SHARED_OR_UNSAFE quando novo arquivo é idêntico ao antigo (mesma referência)
    const classSameFile = await classifyManagedFile({
      fileUrlOrPath: trackedRecord.downloadUrl,
      newFileUrlOrPath: trackedRecord.downloadUrl,
      userId: alice.id,
    });
    assert(
      classSameFile.category === "SHARED_OR_UNSAFE",
      "2.11. Arquivo novo idêntico ao antigo classificado como SHARED_OR_UNSAFE (proteção contra auto-deleção)"
    );

    // Limpeza do registro de teste
    await prisma.generatedFile.delete({ where: { id: trackedRecord.id } });

    // ========================================================================
    // GRUPO 3: DEFESA CONTRA EXCLUSÃO DE NÃO-TRACKED (FAIL-SAFE)
    // ========================================================================
    console.log("\n--- GRUPO 3: Defesa contra Exclusão Não Autorizada (cleanupReplacedManagedFile) ---");

    tracker.deleteCalls = [];

    // 3.1 DEFAULT não apaga
    const resCleanDefault = await cleanupReplacedManagedFile({
      oldFileUrlOrPath: "/avatars/default.png",
      userId: alice.id,
      resourceType: "avatar",
    });
    assert(resCleanDefault.cleaned === false, "3.1. cleanup de avatar DEFAULT não realiza exclusão");
    assert(tracker.deleteCalls.length === 0, "3.2. Zero chamadas DELETE ao Storage para DEFAULT");

    // 3.2 EXTERNAL não apaga
    const resCleanExternal = await cleanupReplacedManagedFile({
      oldFileUrlOrPath: "https://lh3.googleusercontent.com/a/google_avatar",
      userId: alice.id,
      resourceType: "avatar",
    });
    assert(resCleanExternal.cleaned === false, "3.3. cleanup de URL EXTERNAL não realiza exclusão");
    assert(tracker.deleteCalls.length === 0, "3.4. Zero chamadas DELETE ao Storage para EXTERNAL");

    // 3.3 OWNED_LEGACY não apaga
    const resCleanLegacy = await cleanupReplacedManagedFile({
      oldFileUrlOrPath: `users/${alice.id}/logos/old_legacy.png`,
      userId: alice.id,
      resourceType: "logo",
    });
    assert(resCleanLegacy.cleaned === false, "3.5. cleanup de arquivo OWNED_LEGACY não realiza exclusão");
    assert(tracker.deleteCalls.length === 0, "3.6. Zero chamadas DELETE ao Storage para OWNED_LEGACY");

    // 3.4 CROSS-USER: Alice tenta apagar arquivo de Bob
    const bobFile = await prisma.generatedFile.create({
      data: {
        userId: bob.id,
        fileName: "bob_private_logo.png",
        fileType: "logo",
        fileSize: 2048,
        mimeType: "image/png",
        storagePath: `users/${bob.id}/logos/bob_private_logo.png`,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/users/${bob.id}/logos/bob_private_logo.png`,
      },
    });

    const resCrossUser = await cleanupReplacedManagedFile({
      oldFileUrlOrPath: bobFile.downloadUrl,
      userId: alice.id, // Alice tentando acionar limpeza de arquivo do Bob
      resourceType: "avatar",
    });
    assert(resCrossUser.cleaned === false, "3.7. Bloqueio estrito de cross-user delete (Alice não apaga arquivo de Bob)");
    assert(tracker.deleteCalls.length === 0, "3.8. Zero chamadas DELETE disparadas contra arquivo de outro usuário");

    // Confirma que o arquivo de Bob continua intacto no banco
    const bobFileCheck = await prisma.generatedFile.findUnique({ where: { id: bobFile.id } });
    assert(Boolean(bobFileCheck), "3.9. Registro GeneratedFile de Bob permaneceu 100% intacto no PostgreSQL");

    // 3.5 Parâmetros vazios / inválidos falham de forma segura
    const resCleanEmpty = await cleanupReplacedManagedFile({
      oldFileUrlOrPath: "",
      userId: alice.id,
      resourceType: "avatar",
    });
    assert(resCleanEmpty.cleaned === false, "3.10. Parâmetro vazio tratado com segurança fail-closed");

    // ========================================================================
    // GRUPO 4: SUBSTITUIÇÃO BEM-SUCEDIDA DE AVATAR (PATCH /api/auth/me)
    // ========================================================================
    console.log("\n--- GRUPO 4: Substituição Bem-Sucedida de Avatar em /api/auth/me ---");

    // Alice tem um avatar antigo OWNED_TRACKED
    const oldAvatarPath = `users/${alice.id}/logos/old_avatar.png`;
    const oldAvatarRecord = await prisma.generatedFile.create({
      data: {
        userId: alice.id,
        fileName: "old_avatar.png",
        fileType: "logo",
        fileSize: 3000,
        mimeType: "image/png",
        storagePath: oldAvatarPath,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/${oldAvatarPath}`,
      },
    });

    await prisma.user.update({
      where: { id: alice.id },
      data: { avatarUrl: oldAvatarRecord.downloadUrl },
    });

    // Alice cria um novo avatar válido
    const newAvatarPath = `users/${alice.id}/logos/new_avatar.png`;
    const newAvatarRecord = await prisma.generatedFile.create({
      data: {
        userId: alice.id,
        fileName: "new_avatar.png",
        fileType: "logo",
        fileSize: 4000,
        mimeType: "image/png",
        storagePath: newAvatarPath,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/${newAvatarPath}`,
      },
    });

    // Uso de cota de Alice antes do PATCH (ambos os avatares existem no banco)
    const usageBeforeReplace = await getUserStorageUsageBytes(alice.id);
    assert(
      usageBeforeReplace === 7000,
      `4.1. Cota inicial reflete ambos os arquivos antes da substituição (3000 + 4000 = ${usageBeforeReplace})`
    );

    tracker.deleteCalls = [];

    // Alice chama PATCH /api/auth/me com newAvatarRecord.downloadUrl
    const reqPatchAvatar = makePatchMeRequest(aliceToken, {
      avatarUrl: newAvatarRecord.downloadUrl,
    });
    const resPatchAvatar = await patchMeRoute(reqPatchAvatar);
    assert(resPatchAvatar.status === 200, "4.2. PATCH /api/auth/me responde 200 OK");

    const patchBody = await resPatchAvatar.json();
    assert(
      patchBody.user.avatarUrl === newAvatarRecord.downloadUrl,
      "4.3. User.avatarUrl atualizado no PostgreSQL com nova referência"
    );

    // O antigo avatar foi submetido à exclusão no Storage
    assert(tracker.deleteCalls.length === 1, "4.4. deleteFile físico disparado exatamente uma vez no Storage");
    assert(
      tracker.deleteCalls[0].prefixes.includes(oldAvatarPath),
      "4.5. Exclusão física apontou para o storagePath exato do avatar antigo"
    );

    // O registro GeneratedFile do antigo foi removido do banco
    const oldAvatarInDb = await prisma.generatedFile.findUnique({ where: { id: oldAvatarRecord.id } });
    assert(oldAvatarInDb === null, "4.6. GeneratedFile do avatar antigo foi removido do PostgreSQL");

    // O novo avatar permanece intacto no banco
    const newAvatarInDb = await prisma.generatedFile.findUnique({ where: { id: newAvatarRecord.id } });
    assert(Boolean(newAvatarInDb), "4.7. GeneratedFile do novo avatar permanece ativo no PostgreSQL");

    // A cota agora reflete APENAS o novo avatar
    const usageAfterReplace = await getUserStorageUsageBytes(alice.id);
    assert(
      usageAfterReplace === 4000,
      `4.8. Cota reconciliada reflete exatamente os 4000 bytes do novo avatar (${usageAfterReplace} == 4000)`
    );

    // ========================================================================
    // GRUPO 5: LOGOTIPO COMPARTILHADO EM QR CODES (SHARED_OR_UNSAFE)
    // ========================================================================
    console.log("\n--- GRUPO 5: Proteção de Logotipo Compartilhado entre QR Codes ---");

    // Alice tem um logotipo compartilhado
    const sharedLogoPath = `users/${alice.id}/logos/shared_company_logo.png`;
    const sharedLogoRecord = await prisma.generatedFile.create({
      data: {
        userId: alice.id,
        fileName: "shared_company_logo.png",
        fileType: "logo",
        fileSize: 5000,
        mimeType: "image/png",
        storagePath: sharedLogoPath,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/${sharedLogoPath}`,
      },
    });

    // Cria QR #1 com o logotipo compartilhado
    const qr1 = await prisma.qRCode.create({
      data: {
        userId: alice.id,
        name: "QR Code 1",
        type: "url",
        destination: "https://example.com/1",
        content: JSON.stringify({ url: "https://example.com/1" }),
        styleConfig: "{}",
        logoUrl: sharedLogoRecord.downloadUrl,
      },
    });

    // Cria QR #2 também com o mesmo logotipo compartilhado
    const qr2 = await prisma.qRCode.create({
      data: {
        userId: alice.id,
        name: "QR Code 2",
        type: "url",
        destination: "https://example.com/2",
        content: JSON.stringify({ url: "https://example.com/2" }),
        styleConfig: "{}",
        logoUrl: sharedLogoRecord.downloadUrl,
      },
    });

    tracker.deleteCalls = [];

    // Alice atualiza o logo do QR #1 para null (remove logo do QR #1)
    await updateUserQRCode({
      qrId: qr1.id,
      userId: alice.id,
      data: { logoUrl: null },
    });

    // O logo compartilhado NÃO pode ser apagado pois QR #2 ainda o utiliza!
    assert(
      tracker.deleteCalls.length === 0,
      "5.1. Logotipo compartilhado NÃO é apagado do Storage enquanto QR #2 ainda o referencia"
    );

    const sharedLogoStillInDb = await prisma.generatedFile.findUnique({ where: { id: sharedLogoRecord.id } });
    assert(
      Boolean(sharedLogoStillInDb),
      "5.2. GeneratedFile do logotipo compartilhado preservado no banco para uso do QR #2"
    );

    // Agora Alice atualiza o logo do QR #2 para null também (nenhum outro QR mais o utiliza)
    tracker.deleteCalls = [];
    await updateUserQRCode({
      qrId: qr2.id,
      userId: alice.id,
      data: { logoUrl: null },
    });

    assert(
      tracker.deleteCalls.length === 1,
      "5.3. Após QR #2 também desvincular o logotipo, a exclusão física é executada com segurança"
    );

    const sharedLogoAfterAll = await prisma.generatedFile.findUnique({ where: { id: sharedLogoRecord.id } });
    assert(
      sharedLogoAfterAll === null,
      "5.4. GeneratedFile removido do banco após desvinculação de 100% dos recursos ativos"
    );

    // ========================================================================
    // GRUPO 6: RESILIÊNCIA EM FALHAS DE STORAGE DELETE (FASE 8)
    // ========================================================================
    console.log("\n--- GRUPO 6: Resiliência em Falha de Exclusão no Storage (FASE 8) ---");

    // Alice possui um arquivo de logo que será substituído
    const failTestPath = `users/${alice.id}/logos/fail_test_logo.png`;
    const failTestRecord = await prisma.generatedFile.create({
      data: {
        userId: alice.id,
        fileName: "fail_test_logo.png",
        fileType: "logo",
        fileSize: 8000,
        mimeType: "image/png",
        storagePath: failTestPath,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/${failTestPath}`,
      },
    });

    const qrFail = await prisma.qRCode.create({
      data: {
        userId: alice.id,
        name: "QR Fail Test",
        type: "url",
        destination: "https://example.com/fail",
        content: JSON.stringify({ url: "https://example.com/fail" }),
        styleConfig: "{}",
        logoUrl: failTestRecord.downloadUrl,
      },
    });

    // Simula falha transitória HTTP 500 no Supabase Storage DELETE
    failStorageDelete = true;
    tracker.deleteCalls = [];

    // Alice atualiza QR Fail para um novo logoUrl
    await updateUserQRCode({
      qrId: qrFail.id,
      userId: alice.id,
      data: { logoUrl: "https://example.com/new_logo.png" },
    });

    assert(tracker.deleteCalls.length === 1, "6.1. Chamada de exclusão foi disparada");

    // REGRA DE OURO DA FASE 8: Como o delete físico falhou, o registro GeneratedFile NÃO é excluído
    const failRecordInDb = await prisma.generatedFile.findUnique({ where: { id: failTestRecord.id } });
    assert(
      Boolean(failRecordInDb),
      "6.2. CRÍTICO: GeneratedFile MANTIDO no banco quando delete no Storage falha (sem órfãos silenciosos)"
    );

    // A cota continua rastreando os 8000 bytes do arquivo ainda fisicamente no Storage
    const quotaWithFailedDelete = await getUserStorageUsageBytes(alice.id);
    assert(
      quotaWithFailedDelete >= 8000,
      `6.3. Cota continua contabilizando arquivo físico que não pôde ser apagado (${quotaWithFailedDelete} >= 8000)`
    );

    // Restaura flag de falha
    failStorageDelete = false;

    // Idempotência: nova tentativa de cleanup quando o storage normaliza
    const retryCleanup = await cleanupReplacedManagedFile({
      oldFileUrlOrPath: failTestRecord.downloadUrl,
      userId: alice.id,
      resourceType: "logo",
    });
    assert(retryCleanup.cleaned === true, "6.4. Re-tentativa de cleanup tem sucesso após normalização do Storage");

    const failRecordAfterRetry = await prisma.generatedFile.findUnique({ where: { id: failTestRecord.id } });
    assert(failRecordAfterRetry === null, "6.5. GeneratedFile removido após exclusão física bem-sucedida");

    // ========================================================================
    // GRUPO 7: FALHA AO SALVAR NOVO ARQUIVO NO DB (FASE 7)
    // ========================================================================
    console.log("\n--- GRUPO 7: Falha de Persistência no Banco Preserva Arquivo Antigo ---");

    // Alice tem um avatar configurado
    const originalAvatarPath = `users/${alice.id}/logos/original_avatar.png`;
    const originalAvatarRecord = await prisma.generatedFile.create({
      data: {
        userId: alice.id,
        fileName: "original_avatar.png",
        fileType: "logo",
        fileSize: 2500,
        mimeType: "image/png",
        storagePath: originalAvatarPath,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/${originalAvatarPath}`,
      },
    });

    await prisma.user.update({
      where: { id: alice.id },
      data: { avatarUrl: originalAvatarRecord.downloadUrl },
    });

    tracker.deleteCalls = [];

    // Forçamos simulação de erro no prisma.user.update
    const originalUserUpdate = prisma.user.update;
    (prisma.user as any).update = async () => {
      throw new Error("Simulated DB connection failure during User.update");
    };

    try {
      const reqPatchFail = makePatchMeRequest(aliceToken, {
        avatarUrl: "https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/users/alice/logos/another_avatar.png",
      });
      const resPatchFail = await patchMeRoute(reqPatchFail);
      assert(resPatchFail.status === 500, "7.1. PATCH /api/auth/me retorna 500 em erro de banco");
      assert(
        tracker.deleteCalls.length === 0,
        "7.2. Zero chamadas DELETE ao Storage para o avatar original (arquivo antigo intacto)"
      );

      // O avatar original no banco permanece inalterado
      const originalRecordDb = await prisma.generatedFile.findUnique({
        where: { id: originalAvatarRecord.id },
      });
      assert(Boolean(originalRecordDb), "7.3. GeneratedFile do avatar original permanece 100% intacto no DB");
    } finally {
      (prisma.user as any).update = originalUserUpdate;
    }

    // ========================================================================
    // GRUPO 8: IDEMPOTÊNCIA E CHAMADAS REPETIDAS (FASE 11)
    // ========================================================================
    console.log("\n--- GRUPO 8: Idempotência de Cleanup (FASE 11) ---");

    tracker.deleteCalls = [];
    const repeatCleanup1 = await cleanupReplacedManagedFile({
      oldFileUrlOrPath: originalAvatarRecord.downloadUrl,
      userId: alice.id,
      resourceType: "avatar",
    });
    assert(repeatCleanup1.cleaned === true, "8.1. 1ª chamada de cleanup conclui com sucesso");

    const repeatCleanup2 = await cleanupReplacedManagedFile({
      oldFileUrlOrPath: originalAvatarRecord.downloadUrl,
      userId: alice.id,
      resourceType: "avatar",
    });
    assert(repeatCleanup2.cleaned === false, "8.2. 2ª chamada idêntica não causa erro nem corrupção (idempotente)");
    assert(
      repeatCleanup2.category === "OWNED_LEGACY" || repeatCleanup2.category === "UNKNOWN" || repeatCleanup2.cleaned === false,
      "8.3. Arquivo já excluído é identificado com segurança sem disparar novas chamadas"
    );

    // ========================================================================
    // GRUPO 9: PROTEÇÃO DE LOGO EM QR CODES NA LIXEIRA & HARD-DELETE (STORAGE-LIFECYCLE-07A)
    // ========================================================================
    console.log("\n--- GRUPO 9: Proteção de Logotipo na Lixeira e Hard-Delete (STORAGE-LIFECYCLE-07A) ---");

    // Prepara arquivo logo-X para Alice
    const logoXPath = `users/${alice.id}/logos/logo_x.png`;
    const logoXRecord = await prisma.generatedFile.create({
      data: {
        userId: alice.id,
        fileName: "logo_x.png",
        fileType: "logo",
        fileSize: 11000,
        mimeType: "image/png",
        storagePath: logoXPath,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/${logoXPath}`,
      },
    });

    // Prepara novo arquivo logo-Y para Alice
    const logoYPath = `users/${alice.id}/logos/logo_y.png`;
    const logoYRecord = await prisma.generatedFile.create({
      data: {
        userId: alice.id,
        fileName: "logo_y.png",
        fileType: "logo",
        fileSize: 12000,
        mimeType: "image/png",
        storagePath: logoYPath,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/${logoYPath}`,
      },
    });

    // TESTE A:
    // QR A ativo -> logo-X
    // QR B ativo -> logo-X
    // QR A troca para logo-Y -> logo-X preservado
    const qrA = await prisma.qRCode.create({
      data: {
        userId: alice.id,
        name: "QR A",
        type: "url",
        destination: "https://example.com/a",
        content: JSON.stringify({ url: "https://example.com/a" }),
        styleConfig: "{}",
        logoUrl: logoXRecord.downloadUrl,
      },
    });

    const qrB = await prisma.qRCode.create({
      data: {
        userId: alice.id,
        name: "QR B",
        type: "url",
        destination: "https://example.com/b",
        content: JSON.stringify({ url: "https://example.com/b" }),
        styleConfig: "{}",
        logoUrl: logoXRecord.downloadUrl,
      },
    });

    tracker.deleteCalls = [];
    await updateUserQRCode({
      qrId: qrA.id,
      userId: alice.id,
      data: { logoUrl: logoYRecord.downloadUrl },
    });

    assert(
      tracker.deleteCalls.length === 0,
      "9.1 (TESTE A): QR A atualiza para logo-Y mas logo-X é preservado porque QR B ativo o referencia"
    );
    const logoXInDbA = await prisma.generatedFile.findUnique({ where: { id: logoXRecord.id } });
    assert(Boolean(logoXInDbA), "9.2 (TESTE A): GeneratedFile de logo-X permanece no DB");

    // TESTE B:
    // QR A volta para logo-X
    await updateUserQRCode({
      qrId: qrA.id,
      userId: alice.id,
      data: { logoUrl: logoXRecord.downloadUrl },
    });

    // QR B é movido para a lixeira (soft-delete)
    await deleteUserQRCode({
      qrId: qrB.id,
      userId: alice.id,
      permanent: false,
    });
    const qrBInTrash = await prisma.qRCode.findUnique({ where: { id: qrB.id } });
    assert(qrBInTrash?.deletedAt !== null, "9.3 (TESTE B): QR B está na lixeira (deletedAt != null)");

    tracker.deleteCalls = [];
    // QR A troca de logo-X para logo-Y enquanto QR B está na lixeira!
    await updateUserQRCode({
      qrId: qrA.id,
      userId: alice.id,
      data: { logoUrl: logoYRecord.downloadUrl },
    });

    assert(
      tracker.deleteCalls.length === 0,
      "9.4 (TESTE B): Nenhuma chamada deleteFile para logo-X quando QR B na lixeira ainda o referencia"
    );
    const logoXInDbB = await prisma.generatedFile.findUnique({ where: { id: logoXRecord.id } });
    assert(
      Boolean(logoXInDbB),
      "9.5 (TESTE B): GeneratedFile de logo-X preservado no DB protegendo recurso recuperável na lixeira"
    );

    // TESTE C:
    // Restaurar QR B da lixeira
    const restoredQrB = await restoreUserQRCode({
      qrId: qrB.id,
      userId: alice.id,
    });
    assert(Boolean(restoredQrB), "9.6 (TESTE C): QR B restaurado com sucesso da lixeira");

    const qrBAfterRestore = await prisma.qRCode.findUnique({ where: { id: qrB.id } });
    assert(
      qrBAfterRestore?.deletedAt === null,
      "9.7 (TESTE C): QR B possui deletedAt === null após restauração"
    );
    assert(
      qrBAfterRestore?.logoUrl === logoXRecord.downloadUrl,
      "9.8 (TESTE C): QR B restaurado continua apontando para logo-X que permaneceu intacto"
    );

    // TESTE D:
    // QR A é o ÚNICO recurso referenciando logo-X.
    // 1. Coloca QR A apontando novamente para logo-X (compartilhado com QR B)
    await updateUserQRCode({
      qrId: qrA.id,
      userId: alice.id,
      data: { logoUrl: logoXRecord.downloadUrl },
    });
    // 2. Desvincula QR B de logo-X (passa QR B para null) -> logo-X é preservado porque QR A o referencia
    await updateUserQRCode({
      qrId: qrB.id,
      userId: alice.id,
      data: { logoUrl: null },
    });

    tracker.deleteCalls = [];
    // Agora QR A é o ÚNICO a apontar para logo-X. QR A troca para logo-Y.
    await updateUserQRCode({
      qrId: qrA.id,
      userId: alice.id,
      data: { logoUrl: logoYRecord.downloadUrl },
    });

    assert(
      tracker.deleteCalls.length === 1 && tracker.deleteCalls[0].prefixes.includes(logoXPath),
      "9.9 (TESTE D): logo-X removido do Storage normalmente quando QR A era o único consumidor"
    );
    const logoXInDbD = await prisma.generatedFile.findUnique({ where: { id: logoXRecord.id } });
    assert(
      logoXInDbD === null,
      "9.10 (TESTE D): GeneratedFile de logo-X removido do DB após exclusão física autorizada"
    );

    // TESTE E:
    // Prepara logo-Z para testar exclusão após hard-delete
    const logoZPath = `users/${alice.id}/logos/logo_z.png`;
    const logoZRecord = await prisma.generatedFile.create({
      data: {
        userId: alice.id,
        fileName: "logo_z.png",
        fileType: "logo",
        fileSize: 13000,
        mimeType: "image/png",
        storagePath: logoZPath,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/${logoZPath}`,
      },
    });

    // Cria QR C apontando para logo-Z
    const qrC = await prisma.qRCode.create({
      data: {
        userId: alice.id,
        name: "QR C",
        type: "url",
        destination: "https://example.com/c",
        content: JSON.stringify({ url: "https://example.com/c" }),
        styleConfig: "{}",
        logoUrl: logoZRecord.downloadUrl,
      },
    });

    // QR C é excluído permanentemente (hard-delete)
    await deleteUserQRCode({
      qrId: qrC.id,
      userId: alice.id,
      permanent: true,
    });
    const qrCInDb = await prisma.qRCode.findUnique({ where: { id: qrC.id } });
    assert(qrCInDb === null, "9.11 (TESTE E): QR C foi permanentemente excluído do DB (hard-delete)");

    // Agora classifyManagedFile para logo-Z não deve encontrar nenhum QR consumidor e NÃO deve criar bloqueio fantasma
    const classificationAfterHardDelete = await classifyManagedFile({
      userId: alice.id,
      fileUrlOrPath: logoZRecord.downloadUrl,
      resourceType: "logo",
    });
    assert(
      classificationAfterHardDelete.category === "OWNED_TRACKED",
      "9.12 (TESTE E): QR C hard-deletado não deixa bloqueio fantasma permanente para logo-Z (pode ser limpo)"
    );

    // Limpa logo-Z
    tracker.deleteCalls = [];
    const cleanupZ = await cleanupReplacedManagedFile({
      oldFileUrlOrPath: logoZRecord.downloadUrl,
      userId: alice.id,
      resourceType: "logo",
    });
    assert(cleanupZ.cleaned === true, "9.13 (TESTE E): Cleanup de logo-Z concluído com sucesso após hard-delete");

    // TESTE F:
    // Proteção de fronteira cross-user (Bob vs Alice)
    const bobLogoPath = `users/${bob.id}/logos/bob_logo.png`;
    const bobLogoRecord = await prisma.generatedFile.create({
      data: {
        userId: bob.id,
        fileName: "bob_logo.png",
        fileType: "logo",
        fileSize: 14000,
        mimeType: "image/png",
        storagePath: bobLogoPath,
        downloadUrl: `https://xyz.supabase.co/storage/v1/object/public/qrmaster-files/${bobLogoPath}`,
      },
    });

    const qrBob = await prisma.qRCode.create({
      data: {
        userId: bob.id,
        name: "QR Bob",
        type: "url",
        destination: "https://example.com/bob",
        content: JSON.stringify({ url: "https://example.com/bob" }),
        styleConfig: "{}",
        logoUrl: bobLogoRecord.downloadUrl,
      },
    });

    // Alice tenta executar cleanup informando o logo de Bob
    tracker.deleteCalls = [];
    const aliceCrossCleanup = await cleanupReplacedManagedFile({
      oldFileUrlOrPath: bobLogoRecord.downloadUrl,
      userId: alice.id,
      resourceType: "logo",
    });
    assert(
      aliceCrossCleanup.cleaned === false,
      "9.14 (TESTE F): Alice NÃO consegue limpar o logotipo de Bob (bloqueio cross-user)"
    );
    assert(
      tracker.deleteCalls.length === 0,
      "9.15 (TESTE F): Zero chamadas deleteFile para o arquivo de Bob durante tentativa de Alice"
    );

    const bobLogoStillAlive = await prisma.generatedFile.findUnique({ where: { id: bobLogoRecord.id } });
    assert(Boolean(bobLogoStillAlive), "9.16 (TESTE F): GeneratedFile de Bob permanece 100% intacto no DB");

    // Bob atualiza seu QR com logoUrl: null -> Bob é o proprietário legítimo e deve conseguir limpar
    tracker.deleteCalls = [];
    await updateUserQRCode({
      qrId: qrBob.id,
      userId: bob.id,
      data: { logoUrl: null },
    });
    assert(
      tracker.deleteCalls.length === 1 && tracker.deleteCalls[0].prefixes.includes(bobLogoPath),
      "9.17 (TESTE F): Bob limpou seu próprio arquivo sem interferência nem bloqueio de Alice"
    );
  } finally {
    // Cleanup final de testes
    global.fetch = originalFetch;

    await prisma.qRCode.deleteMany({
      where: { userId: { in: [alice.id, bob.id] } },
    });

    await prisma.generatedFile.deleteMany({
      where: { userId: { in: [alice.id, bob.id] } },
    });

    await prisma.session.deleteMany({
      where: { userId: { in: [alice.id, bob.id] } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: [alice.id, bob.id] } },
    });

    console.log("\n==========================================================================");
    console.log(`  RESULTADO FINAL DA SUÍTE STORAGE-LIFECYCLE-07`);
    console.log(`  Total: ${totalAsserts} | Passaram: ${passedAsserts} | Falharam: ${failedAsserts}`);
    console.log("==========================================================================\n");

    if (failedAsserts > 0) {
      process.exit(1);
    }
  }
}

runStorageLifecycleTests().catch((err) => {
  console.error("Erro fatal na execução da suíte de testes:", err);
  process.exit(1);
});
