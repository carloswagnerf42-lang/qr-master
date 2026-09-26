import { prisma } from "../src/lib/db";
import {
  deleteUserGeneratedFile,
  validateFileIdentifiers,
  FileNotFoundError,
} from "../src/lib/file-service";
import { DELETE as deleteFileRoute } from "../src/app/api/files/[id]/route";
import { createAuthenticatedSessionToken } from "../src/lib/auth";
import { NextRequest } from "next/server";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

async function expectNotFound(fn: () => Promise<unknown>, label: string) {
  let threwExpected = false;
  try {
    await fn();
  } catch (err: any) {
    if (
      err instanceof FileNotFoundError ||
      err?.status === 404 ||
      err?.code === "NOT_FOUND" ||
      err?.message?.includes("Arquivo não encontrado")
    ) {
      threwExpected = true;
    } else {
      console.error(`Erro inesperado para ${label}:`, err);
    }
  }
  assert(threwExpected, `${label} -> rejeitado fail-closed com FileNotFoundError (404)`);
}

async function runTests() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: SECURITY-AUTHZ-05 — FILE MUTATION OWNERSHIP DEFENSE");
  console.log("==========================================================================\n");

  // --------------------------------------------------------------------------
  // CONTROLE EXPLÍCITO DE MOCK PARA STORAGE
  // --------------------------------------------------------------------------
  let storageDeleteCalls = 0;
  const deletedPrefixes: string[] = [];
  const originalFetch = global.fetch;

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.includes("/storage/v1/object")) {
      if (init?.method === "DELETE") {
        storageDeleteCalls++;
        if (typeof init?.body === "string") {
          try {
            const parsed = JSON.parse(init.body);
            if (Array.isArray(parsed.prefixes)) {
              deletedPrefixes.push(...parsed.prefixes);
            }
          } catch {}
        }
        return new Response(JSON.stringify([{ message: "Mock deleted successfully" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return originalFetch(input, init);
  };

  try {
    // --------------------------------------------------------------------------
    // GRUPO 1: Validação Rigorosa de Identificadores (Fail-Closed)
    // --------------------------------------------------------------------------
    console.log("▶ 1. Validação Rigorosa de Identificadores (Parâmetros Vazios / Whitespace / Inválidos):");

    // 1.1 fileId vazio
    await expectNotFound(
      () => deleteUserGeneratedFile({ fileId: "", userId: "usr_alice_123" }),
      "1.1. deleteUserGeneratedFile com fileId vazio"
    );

    // 1.2 fileId apenas espaços
    await expectNotFound(
      () => deleteUserGeneratedFile({ fileId: "    ", userId: "usr_alice_123" }),
      "1.2. deleteUserGeneratedFile com fileId apenas espaços em branco"
    );

    // 1.3 fileId nulo / indefinido
    await expectNotFound(
      () => deleteUserGeneratedFile({ fileId: null as any, userId: "usr_alice_123" }),
      "1.3. deleteUserGeneratedFile com fileId null"
    );

    // 1.4 userId vazio
    await expectNotFound(
      () => deleteUserGeneratedFile({ fileId: "file_123", userId: "" }),
      "1.4. deleteUserGeneratedFile com userId vazio"
    );

    // 1.5 userId apenas espaços
    await expectNotFound(
      () => deleteUserGeneratedFile({ fileId: "file_123", userId: "   \t  " }),
      "1.5. deleteUserGeneratedFile com userId apenas espaços em branco"
    );

    // 1.6 userId nulo / indefinido
    await expectNotFound(
      () => deleteUserGeneratedFile({ fileId: "file_123", userId: undefined as any }),
      "1.6. deleteUserGeneratedFile com userId undefined"
    );

    // 1.7 Ambos vazios
    await expectNotFound(
      () => deleteUserGeneratedFile({ fileId: "", userId: "" }),
      "1.7. deleteUserGeneratedFile com ambos identificadores vazios"
    );

    // 1.8 Validação direta na função utilitária validateFileIdentifiers
    let utilThrowsOnEmpty = false;
    try {
      validateFileIdentifiers("   ", "valid_user");
    } catch (e: any) {
      if (e instanceof FileNotFoundError) utilThrowsOnEmpty = true;
    }
    assert(utilThrowsOnEmpty, "1.8. validateFileIdentifiers rejeita fail-closed identificador vazio");

    // --------------------------------------------------------------------------
    // SETUP DE DADOS PARA TESTES DE OWNERSHIP
    // --------------------------------------------------------------------------
    const plan = (await prisma.plan.findFirst()) || (await prisma.plan.create({
      data: {
        name: "FREE",
        displayName: "Free Plan",
        priceMonth: 0,
        priceYear: 0,
      },
    }));

    const userA = await prisma.user.upsert({
      where: { email: "user_a_file_defense@test.local" },
      create: {
        email: "user_a_file_defense@test.local",
        name: "User Alice",
        role: "USER",
        planId: plan.id,
      },
      update: {},
    });

    const userB = await prisma.user.upsert({
      where: { email: "user_b_file_defense@test.local" },
      create: {
        email: "user_b_file_defense@test.local",
        name: "User Bob Attacker",
        role: "USER",
        planId: plan.id,
      },
      update: {},
    });

    // Limpeza de arquivos e sessões de testes anteriores
    await prisma.generatedFile.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });

    // Caminho simulado no namespace de Alice
    const aliceStorageRelPath = `users/${userA.id}/exports/relatorio_financeiro_alice.png`;

    // Criação do registro no banco para Alice
    const fileAlice = await prisma.generatedFile.create({
      data: {
        userId: userA.id,
        fileName: "relatorio_financeiro_alice.png",
        fileType: "png",
        fileSize: 4096,
        mimeType: "image/png",
        storagePath: aliceStorageRelPath,
        downloadUrl: `/uploads/storage/${aliceStorageRelPath}`,
      },
    });

    // --------------------------------------------------------------------------
    // GRUPO 2: Operações Adversárias do Usuário B sobre o Arquivo de Alice
    // --------------------------------------------------------------------------
    console.log("\n▶ 2. Operações Adversárias do Usuário B sobre o Arquivo de Alice (Bloqueio Fail-Closed):");

    // 2.1 Bob tenta excluir arquivo de Alice passando o fileId de Alice e seu próprio userId via objeto
    await expectNotFound(
      () =>
        deleteUserGeneratedFile({
          fileId: fileAlice.id,
          userId: userB.id,
        }),
      "2.1. Usuário B tentando excluir GeneratedFile de Alice via objeto de parâmetros"
    );

    // 2.2 Bob tenta excluir via argumentos posicionais (fileId, userId)
    await expectNotFound(
      () => deleteUserGeneratedFile(fileAlice.id, userB.id),
      "2.2. Usuário B tentando excluir GeneratedFile de Alice via argumentos posicionais"
    );

    // 2.3 Tentativa com ID de arquivo inexistente
    await expectNotFound(
      () =>
        deleteUserGeneratedFile({
          fileId: "cuid_inexistente_999999",
          userId: userB.id,
        }),
      "2.3. Usuário B tentando excluir ID inexistente"
    );

    // --------------------------------------------------------------------------
    // GRUPO 3: Verificação de Integridade e Ausência de Efeitos Colaterais
    // --------------------------------------------------------------------------
    console.log("\n▶ 3. Verificação de Integridade no Banco e Storage (Zero Efeitos Colaterais):");

    // 3.1 Registro de Alice no banco de dados permaneceu intacto
    const fileAliceInDb = await prisma.generatedFile.findUnique({
      where: { id: fileAlice.id },
    });
    assert(
      fileAliceInDb !== null && fileAliceInDb.id === fileAlice.id,
      "3.1. Registro de Alice no banco de dados permaneceu 100% intacto após tentativas adversárias de Bob"
    );

    // 3.2 Metadados do arquivo não foram alterados
    assert(
      fileAliceInDb?.fileName === "relatorio_financeiro_alice.png" &&
        fileAliceInDb?.userId === userA.id &&
        fileAliceInDb?.storagePath === aliceStorageRelPath,
      "3.2. Metadados do registro de Alice (fileName, userId, storagePath) permaneceram inalterados"
    );

    // 3.3 Nenhuma chamada de exclusão no storage ocorreu durante as tentativas de Bob
    assert(
      storageDeleteCalls === 0,
      "3.3. Nenhuma chamada de exclusão no Storage foi disparada durante as tentativas do atacante Bob"
    );
    assert(
      !deletedPrefixes.includes(aliceStorageRelPath),
      "3.4. Prefixo do arquivo de Alice não consta na lista de exclusão do Storage"
    );

    // --------------------------------------------------------------------------
    // GRUPO 4: Defesa Contra Injeção e Manipulação de Parâmetros
    // --------------------------------------------------------------------------
    console.log("\n▶ 4. Defesa Contra Injeção de Parâmetros e Isolamento de Namespace:");

    // 4.1 Inconsistência de prefixo no registro (registro com storagePath pertencente a outro usuário não exclui storage alheio)
    const poisonedFile = await prisma.generatedFile.create({
      data: {
        userId: userB.id,
        fileName: "malicious_pointer.png",
        fileType: "png",
        fileSize: 1024,
        mimeType: "image/png",
        storagePath: aliceStorageRelPath, // Aponta maliciosamente para o arquivo de Alice!
        downloadUrl: `/uploads/storage/${aliceStorageRelPath}`,
      },
    });

    await expectNotFound(
      () => deleteUserGeneratedFile(poisonedFile.id, userB.id),
      "4.1. Registro apontando para storagePath fora do namespace do próprio usuário falha fechado (anti-cross-tenant storage deletion)"
    );

    // Confirma que nenhuma chamada de exclusão atingiu o arquivo de Alice
    assert(
      !deletedPrefixes.includes(aliceStorageRelPath),
      "4.2. Tentativa de exclusão com registro envenenado não disparou remoção do arquivo de Alice no Storage"
    );

    // Limpa o registro malicioso criado
    await prisma.generatedFile.delete({ where: { id: poisonedFile.id } });

    // --------------------------------------------------------------------------
    // GRUPO 5: Teste da Rota HTTP (DELETE /api/files/[id])
    // --------------------------------------------------------------------------
    console.log("\n▶ 5. Teste da Rota HTTP (DELETE /api/files/[id]):");

    // 5.1 Rota sem sessão retorna 401 Unauthorized
    const unauthReq = new NextRequest("http://localhost:3000/api/files/" + fileAlice.id, {
      method: "DELETE",
    });
    const unauthRes = await deleteFileRoute(unauthReq, { params: { id: fileAlice.id } });
    assert(
      unauthRes.status === 401,
      "5.1. Requisição anônima à rota DELETE /api/files/[id] retorna 401 Unauthorized"
    );

    // 5.2 Bob autenticado tenta excluir o arquivo de Alice através da rota HTTP
    const { token: bobToken } = await createAuthenticatedSessionToken({
      id: userB.id,
      name: userB.name,
      email: userB.email,
      role: userB.role,
    });

    const bobAttackReq = new NextRequest("http://localhost:3000/api/files/" + fileAlice.id, {
      method: "DELETE",
      headers: {
        cookie: `qrmaster_session=${bobToken}`,
        authorization: `Bearer ${bobToken}`,
      },
    });
    const bobAttackRes = await deleteFileRoute(bobAttackReq, { params: { id: fileAlice.id } });
    assert(
      bobAttackRes.status === 404,
      "5.2. Usuário Bob autenticado tentando excluir arquivo de Alice via rota HTTP retorna 404 Arquivo não encontrado"
    );

    // Confirmação de que arquivo de Alice permanece no banco após a chamada HTTP do Bob
    const fileStillPresent = await prisma.generatedFile.findUnique({
      where: { id: fileAlice.id },
    });
    assert(
      fileStillPresent !== null,
      "5.3. Registro de Alice permaneceu no banco após a requisição HTTP adversarial de Bob"
    );

    // --------------------------------------------------------------------------
    // GRUPO 6: Operações Legítimas pelo Proprietário (Funcionamento Normal Preservado)
    // --------------------------------------------------------------------------
    console.log("\n▶ 6. Operações Legítimas pelo Proprietário (Funcionamento Normal Preservado):");

    // 6.1 Alice exclui seu próprio arquivo com sucesso via deleteUserGeneratedFile
    let aliceDeletionSucceeded = false;
    try {
      const deleteResult = await deleteUserGeneratedFile({
        fileId: fileAlice.id,
        userId: userA.id,
      });
      if (deleteResult.success && deleteResult.file.id === fileAlice.id) {
        aliceDeletionSucceeded = true;
      }
    } catch (err) {
      console.error("Erro na exclusão legítima por Alice:", err);
    }
    assert(aliceDeletionSucceeded, "6.1. Proprietária legítima (Alice) exclui seu próprio arquivo com sucesso");

    // 6.2 Registro foi efetivamente removido do banco
    const fileAliceAfterDelete = await prisma.generatedFile.findUnique({
      where: { id: fileAlice.id },
    });
    assert(
      fileAliceAfterDelete === null,
      "6.2. Registro do arquivo de Alice foi removido do banco de dados após exclusão legítima"
    );

    // 6.3 Exclusão física no Storage foi acionada para Alice
    assert(
      storageDeleteCalls >= 1,
      "6.3. Chamada de exclusão no Storage foi acionada para o arquivo legítimo de Alice"
    );
    assert(
      deletedPrefixes.includes(aliceStorageRelPath),
      "6.4. Prefixo do arquivo de Alice consta nas exclusões efetuadas no Storage"
    );

    // 6.5 Segunda exclusão do mesmo arquivo falha fail-closed (recurso já excluído)
    await expectNotFound(
      () => deleteUserGeneratedFile(fileAlice.id, userA.id),
      "6.5. Segunda tentativa de exclusão do mesmo arquivo retorna 404 (já excluído)"
    );

    // 6.6 Alice autenticada via rota HTTP excluindo um segundo arquivo dela
    const aliceStorageRelPath2 = `users/${userA.id}/exports/segundo_arquivo_alice.png`;
    const fileAlice2 = await prisma.generatedFile.create({
      data: {
        userId: userA.id,
        fileName: "segundo_arquivo_alice.png",
        fileType: "png",
        fileSize: 2048,
        mimeType: "image/png",
        storagePath: aliceStorageRelPath2,
        downloadUrl: `/uploads/storage/${aliceStorageRelPath2}`,
      },
    });

    const { token: aliceToken } = await createAuthenticatedSessionToken({
      id: userA.id,
      name: userA.name,
      email: userA.email,
      role: userA.role,
    });

    const aliceLegitReq = new NextRequest("http://localhost:3000/api/files/" + fileAlice2.id, {
      method: "DELETE",
      headers: {
        cookie: `qrmaster_session=${aliceToken}`,
        authorization: `Bearer ${aliceToken}`,
      },
    });
    const aliceLegitRes = await deleteFileRoute(aliceLegitReq, { params: { id: fileAlice2.id } });
    assert(
      aliceLegitRes.status === 200,
      "6.6. Alice autenticada exclui seu próprio arquivo via rota HTTP com status 200"
    );

    const fileAlice2After = await prisma.generatedFile.findUnique({
      where: { id: fileAlice2.id },
    });
    assert(
      fileAlice2After === null,
      "6.7. Registro do segundo arquivo de Alice foi devidamente removido do banco após chamada HTTP"
    );
    assert(
      deletedPrefixes.includes(aliceStorageRelPath2),
      "6.8. Prefixo do segundo arquivo de Alice foi devidamente submetido para exclusão no Storage"
    );

    // --------------------------------------------------------------------------
    // LIMPEZA FINAL
    // --------------------------------------------------------------------------
    await prisma.generatedFile.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
  } finally {
    // Restaura global.fetch original
    global.fetch = originalFetch;
  }

  // --------------------------------------------------------------------------
  // RESUMO FINAL
  // --------------------------------------------------------------------------
  console.log("\n==========================================================================");
  console.log(`  RESULTADO FINAL: ${passed} PASS / ${failed} FAIL`);
  console.log("==========================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erro fatal na execução da suíte:", err);
  process.exit(1);
});
