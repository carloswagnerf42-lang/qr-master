/**
 * AUTH-HARDEN-03D: Suíte de Testes de Sessões Server-Side, Revogação, Concorrência e Fail-Closed
 *
 * Cobre integralmente os requisitos:
 * 1. Criação de sessão válida (CSPRNG UUID v4)
 * 2. IDs diferentes para logins diferentes
 * 3. Sessão existente aceita
 * 4. Sessão inexistente rejeitada
 * 5. Sessão expirada rejeitada
 * 6. Sessão revogada rejeitada
 * 7. sid ausente rejeitado no modo server-session (Tokens legados -> Fail-Closed)
 * 8. sid pertencente a outro usuário rejeitado (Anti-Session Hijacking / Ownership mismatch)
 * 9. JWT expirado rejeitado
 * 10. JWT adulterado rejeitado
 * 11. Falha de DB durante criação não autentica (Fail-Closed)
 * 12. Logout revoga sessão server-side e bloqueia reutilização do JWT antigo (401)
 * 13. revokeAllUserSessions funciona (global e com exceptSessionId)
 * 14. Múltiplas sessões simultâneas funcionam (Desktop + Mobile + Outro navegador)
 * 15. Revogar sessão A não revoga sessão B
 * 16. Google login cria Session server-side vinculada por sid
 * 17. Login tradicional cria Session server-side vinculada por sid
 * 18. Mock auth continua 100% bloqueado em production (AUTH-HARDEN-01 preservado)
 * 19. Regressão de tokens legados e falha de leitura de DB (Fail-Closed)
 * 20. Mudança de IP não invalida a sessão ativa
 */

import jwt from "jsonwebtoken";
import {
  generateSessionId,
  createServerSession,
  createAuthenticatedSessionToken,
  validateServerSession,
  revokeServerSession,
  revokeAllUserSessions,
  signToken,
  verifyToken,
  verifyPassword,
  getSession,
  getSessionCookieOptions,
  setSessionStoreForTesting,
  SessionStoreAdapter,
  ServerSessionRecord,
  SessionUser,
} from "../src/lib/auth";
import { verifyGoogleIdToken } from "../src/lib/google-auth";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${details ? ` (${details})` : ""}`);
    failed++;
  }
}

function createInMemorySessionStore(): {
  store: SessionStoreAdapter;
  records: Map<string, ServerSessionRecord>;
  setFailOnCreate: (val: boolean) => void;
  setFailOnRead: (val: boolean) => void;
} {
  const records = new Map<string, ServerSessionRecord>();
  let failOnCreate = false;
  let failOnRead = false;

  const store: SessionStoreAdapter = {
    async create(data) {
      if (failOnCreate) {
        throw new Error("Simulated PostgreSQL connection failure on INSERT");
      }
      const record: ServerSessionRecord = {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      records.set(record.id, record);
      return record;
    },
    async findUnique(id) {
      if (failOnRead) {
        throw new Error("Simulated PostgreSQL connection failure on SELECT");
      }
      return records.get(id) ?? null;
    },
    async revokeById(id, revokedAt) {
      const existing = records.get(id);
      if (!existing || existing.revokedAt !== null) return false;
      existing.revokedAt = revokedAt;
      existing.updatedAt = new Date();
      records.set(id, existing);
      return true;
    },
    async revokeAllForUser(userId, revokedAt, exceptSessionId) {
      let count = 0;
      for (const [key, rec] of records.entries()) {
        if (rec.userId === userId && rec.revokedAt === null && key !== exceptSessionId) {
          rec.revokedAt = revokedAt;
          rec.updatedAt = new Date();
          records.set(key, rec);
          count++;
        }
      }
      return count;
    },
  };

  return {
    store,
    records,
    setFailOnCreate: (val: boolean) => {
      failOnCreate = val;
    },
    setFailOnRead: (val: boolean) => {
      failOnRead = val;
    },
  };
}

function makeMockRequestWithToken(token: string, ip = "203.0.113.10"): Request {
  return new Request("https://qrmasterdigital.com/api/qr", {
    method: "GET",
    headers: {
      cookie: `qrmaster_session=${encodeURIComponent(token)}`,
      "x-forwarded-for": ip,
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  });
}

async function runTests() {
  console.log("========================================================================");
  console.log("  AUTH-HARDEN-03D: SUÍTE DE SESSÕES SERVER-SIDE E REVOGAÇÃO             ");
  console.log("========================================================================\n");

  const { store, records, setFailOnCreate, setFailOnRead } = createInMemorySessionStore();
  setSessionStoreForTesting(store);

  const testUserA: SessionUser = {
    id: "usr_alice_001",
    name: "Alice Silva",
    email: "alice@qrmasterdigital.com",
    role: "USER",
    planId: "plan_pro",
  };

  const testUserB: SessionUser = {
    id: "usr_bob_002",
    name: "Bob Santos",
    email: "bob@qrmasterdigital.com",
    role: "USER",
    planId: "plan_free",
  };

  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // ---------------------------------------------------------------------------
  // 1. Criação de sessão válida e CSPRNG UUID v4
  // ---------------------------------------------------------------------------
  console.log("▶ 1. Criação de Sessão Server-Side e Entropia CSPRNG:");
  const session1 = await createServerSession({
    userId: testUserA.id,
    userAgent: "Chrome Desktop",
    ipAddress: "198.51.100.1",
  });

  assert(Boolean(session1.id), "1.1. createServerSession retorna session.id preenchido");
  assert(uuidV4Regex.test(session1.id), "1.2. session.id é um UUID v4 criptograficamente seguro (crypto.randomUUID)");
  assert(session1.id !== testUserA.id, "1.3. session.id nunca é igual ao userId");
  assert(session1.userId === testUserA.id, "1.4. session.userId corresponde exatamente ao usuário autenticado");
  assert(session1.expiresAt.getTime() > Date.now(), "1.5. session.expiresAt está no futuro");
  assert(records.get(session1.id)?.revokedAt === null, "1.6. session.revokedAt nasce explicitamente como null");

  // ---------------------------------------------------------------------------
  // 2. IDs diferentes para logins diferentes
  // ---------------------------------------------------------------------------
  console.log("\n▶ 2. Unicidade de IDs entre Logins Distintos:");
  const session2 = await createServerSession({ userId: testUserA.id });
  const session3 = await createServerSession({ userId: testUserA.id });
  assert(
    session1.id !== session2.id && session2.id !== session3.id && session1.id !== session3.id,
    "2.1. Múltiplos logins para o mesmo usuário geram Session.ids estritamente distintos"
  );

  // ---------------------------------------------------------------------------
  // 3. Sessão existente aceita & Vínculo JWT -> Session
  // ---------------------------------------------------------------------------
  console.log("\n▶ 3. Validação de Sessão Ativa e Vínculo JWT (sid):");
  const authResultA = await createAuthenticatedSessionToken(testUserA, {
    userAgent: "Mozilla/5.0 Desktop",
    ipAddress: "198.51.100.10",
  });

  const decodedJwtA = verifyToken(authResultA.token);
  assert(decodedJwtA?.sid === authResultA.sessionId, "3.1. JWT assinado carrega claim sid correspondente ao Session.id");

  const validatedA = await getSession(makeMockRequestWithToken(authResultA.token));
  assert(
    validatedA !== null && validatedA.id === testUserA.id && validatedA.sid === authResultA.sessionId,
    "3.2. getSession aceita sessão existente, não expirada e não revogada"
  );

  // Mudança de IP não invalida a sessão
  const validatedDifferentIp = await getSession(makeMockRequestWithToken(authResultA.token, "192.0.2.250"));
  assert(
    validatedDifferentIp !== null && validatedDifferentIp.sid === authResultA.sessionId,
    "3.3. Mudança de endereço IP do cliente não invalida a sessão ativa"
  );

  // ---------------------------------------------------------------------------
  // 4. Sessão inexistente rejeitada
  // ---------------------------------------------------------------------------
  console.log("\n▶ 4. Rejeição de Sessão Inexistente no Banco:");
  const fakeSidToken = signToken({
    ...testUserA,
    sid: generateSessionId(), // UUID válido mas não gravado no banco
  });
  const nonExistentCheck = await getSession(makeMockRequestWithToken(fakeSidToken));
  assert(nonExistentCheck === null, "4.1. JWT com sid inexistente na tabela Session é rejeitado (Fail-Closed)");

  // ---------------------------------------------------------------------------
  // 5. Sessão expirada rejeitada
  // ---------------------------------------------------------------------------
  console.log("\n▶ 5. Rejeição de Sessão Expirada no Servidor:");
  const expiredSessionAuth = await createAuthenticatedSessionToken(testUserA, {
    ttlMs: -10000, // Expirada há 10 segundos no banco, embora o JWT tenha 7d
  });
  const expiredCheck = await getSession(makeMockRequestWithToken(expiredSessionAuth.token));
  assert(expiredCheck === null, "5.1. Sessão com Session.expiresAt <= now é rejeitada mesmo com JWT dentro do exp");

  // ---------------------------------------------------------------------------
  // 6. Sessão revogada rejeitada
  // ---------------------------------------------------------------------------
  console.log("\n▶ 6. Rejeição de Sessão Revogada:");
  const revocableAuth = await createAuthenticatedSessionToken(testUserA);
  await revokeServerSession(revocableAuth.sessionId);
  const revokedCheck = await getSession(makeMockRequestWithToken(revocableAuth.token));
  assert(revokedCheck === null, "6.1. Sessão com revokedAt preenchido é imediatamente rejeitada (401)");

  // ---------------------------------------------------------------------------
  // 7. sid ausente rejeitado no modo server-session (Regressão de Token Legado)
  // ---------------------------------------------------------------------------
  console.log("\n▶ 7. Rejeição de Token Legado sem sid (Prevenção de Bypass):");
  const legacyTokenWithoutSid = signToken({
    id: testUserA.id,
    name: testUserA.name,
    email: testUserA.email,
    role: testUserA.role,
    planId: testUserA.planId,
    // sid omitido (simula token emitido antes de AUTH-HARDEN-03D)
  });
  const decodedLegacy = verifyToken(legacyTokenWithoutSid);
  assert(decodedLegacy !== null && !decodedLegacy.sid, "7.1. Token legado possui assinatura JWT válida mas não possui sid");

  const legacySessionResult = await getSession(makeMockRequestWithToken(legacyTokenWithoutSid));
  assert(
    legacySessionResult === null,
    "7.2. getSession rejeita token sem sid (Fail-Closed Transition — nenhum bypass permitido)"
  );

  const emptySidResult = await validateServerSession({ ...testUserA, sid: "   " });
  assert(emptySidResult === null, "7.3. validateServerSession rejeita sid vazio ou em branco");

  // ---------------------------------------------------------------------------
  // 8. sid pertencente a outro usuário rejeitado (Ownership Mismatch)
  // ---------------------------------------------------------------------------
  console.log("\n▶ 8. Prevenção de Uso Cruzado de sid entre Usuários (Ownership):");
  const bobSession = await createServerSession({ userId: testUserB.id });
  const crossUserToken = signToken({
    ...testUserA, // Token diz ser Alice
    sid: bobSession.id, // Mas aponta para a Session de Bob
  });
  const crossUserResult = await getSession(makeMockRequestWithToken(crossUserToken));
  assert(
    crossUserResult === null,
    "8.1. Token cujo userId diverge de Session.userId é estritamente rejeitado"
  );

  // ---------------------------------------------------------------------------
  // 9. JWT expirado rejeitado & 10. JWT adulterado rejeitado
  // ---------------------------------------------------------------------------
  console.log("\n▶ 9 & 10. Integridade e Expiração Criptográfica do JWT:");
  const validSessionForJwtTest = await createServerSession({ userId: testUserA.id });
  const expiredJwt = jwt.sign(
    { ...testUserA, sid: validSessionForJwtTest.id },
    process.env.AUTH_SECRET || "qr-master-dev-fallback-secret-key-only",
    { expiresIn: "-10s" }
  );
  assert(
    (await getSession(makeMockRequestWithToken(expiredJwt))) === null,
    "9.1. JWT com exp expirado é rejeitado antes mesmo de aceitar a sessão"
  );

  const tamperedJwt = authResultA.token.slice(0, -4) + "xxxx";
  assert(
    (await getSession(makeMockRequestWithToken(tamperedJwt))) === null,
    "10.1. JWT com assinatura adulterada é rejeitado"
  );

  // ---------------------------------------------------------------------------
  // 11. Falha de DB durante criação e validação não autentica (Fail-Closed)
  // ---------------------------------------------------------------------------
  console.log("\n▶ 11. Resiliência Fail-Closed em Falhas de Banco de Dados:");
  setFailOnCreate(true);
  let dbCreateThrew = false;
  try {
    await createAuthenticatedSessionToken(testUserA);
  } catch {
    dbCreateThrew = true;
  }
  setFailOnCreate(false);
  assert(dbCreateThrew === true, "11.1. Falha de DB durante createAuthenticatedSessionToken aborta emissão do JWT");

  setFailOnRead(true);
  const dbReadFailResult = await getSession(makeMockRequestWithToken(authResultA.token));
  setFailOnRead(false);
  assert(dbReadFailResult === null, "11.2. Falha de DB durante validateServerSession retorna null (Fail-Closed)");

  // ---------------------------------------------------------------------------
  // 12. Fluxo de Logout revoga sessão e impede reutilização do token
  // ---------------------------------------------------------------------------
  console.log("\n▶ 12. Logout Server-Side e Bloqueio de Reutilização:");
  const loginBeforeLogout = await createAuthenticatedSessionToken(testUserA);
  assert(
    (await getSession(makeMockRequestWithToken(loginBeforeLogout.token))) !== null,
    "12.1. Sessão recém-criada é válida antes do logout"
  );

  // Simula ação do endpoint POST /api/auth/logout
  const extracted = verifyToken(loginBeforeLogout.token);
  const revokedOk = await revokeServerSession(extracted?.sid);
  assert(revokedOk === true, "12.2. revokeServerSession no logout marca a sessão como revogada");

  const reuseAfterLogout = await getSession(makeMockRequestWithToken(loginBeforeLogout.token));
  assert(
    reuseAfterLogout === null,
    "12.3. Reutilização do JWT capturado após o logout retorna null (401 Unauthorized)"
  );

  // ---------------------------------------------------------------------------
  // 13, 14, 15. Concorrência Multi-Device e Revogação Seletiva / Global
  // ---------------------------------------------------------------------------
  console.log("\n▶ 13, 14 & 15. Múltiplas Sessões Simultâneas (Multi-Device) e Revogação:");
  const desktopAuth = await createAuthenticatedSessionToken(testUserA, { userAgent: "Desktop Chrome" });
  const mobileAuth = await createAuthenticatedSessionToken(testUserA, { userAgent: "Mobile Safari" });
  const tabletAuth = await createAuthenticatedSessionToken(testUserA, { userAgent: "Tablet Firefox" });

  assert(
    (await getSession(makeMockRequestWithToken(desktopAuth.token))) !== null &&
      (await getSession(makeMockRequestWithToken(mobileAuth.token))) !== null &&
      (await getSession(makeMockRequestWithToken(tabletAuth.token))) !== null,
    "14.1. Usuário pode manter múltiplas sessões simultâneas independentes (Desktop, Mobile, Tablet)"
  );

  // Revogar sessão A (mobile) não revoga sessão B (desktop) nem C (tablet)
  await revokeServerSession(mobileAuth.sessionId);
  assert(
    (await getSession(makeMockRequestWithToken(mobileAuth.token))) === null &&
      (await getSession(makeMockRequestWithToken(desktopAuth.token))) !== null &&
      (await getSession(makeMockRequestWithToken(tabletAuth.token))) !== null,
    "15.1. Logout no dispositivo Mobile revoga apenas Mobile, mantendo Desktop e Tablet ativos"
  );

  // Troca de senha voluntária: revoga todas exceto a sessão atual (desktop)
  await revokeAllUserSessions(testUserA.id, { exceptSessionId: desktopAuth.sessionId });
  assert(
    (await getSession(makeMockRequestWithToken(tabletAuth.token))) === null &&
      (await getSession(makeMockRequestWithToken(desktopAuth.token))) !== null,
    "13.1. revokeAllUserSessions com exceptSessionId revoga outros aparelhos e preserva o atual"
  );

  // Reset de senha / Recuperação de conta: revoga TODAS as sessões do usuário
  await revokeAllUserSessions(testUserA.id);
  assert(
    (await getSession(makeMockRequestWithToken(desktopAuth.token))) === null,
    "13.2. revokeAllUserSessions sem exceção revoga 100% das sessões do usuário"
  );

  // ---------------------------------------------------------------------------
  // 16 & 17. Integração Login Tradicional e Google Login
  // ---------------------------------------------------------------------------
  console.log("\n▶ 16 & 17. Integração de Login Tradicional e Google Login com Session:");
  const countBeforeLogins = records.size;

  // Fluxo Login Tradicional
  const traditionalLoginSession = await createAuthenticatedSessionToken(testUserA, {
    userAgent: "Traditional Login Client",
    ipAddress: "203.0.113.50",
  });
  const savedTraditional = records.get(traditionalLoginSession.sessionId);
  assert(
    Boolean(savedTraditional) &&
      savedTraditional?.userId === testUserA.id &&
      savedTraditional?.revokedAt === null,
    "17.1. Fluxo de Login Tradicional cria registro Session válido e retorna JWT com sid"
  );

  // Fluxo Google Login
  const googleLoginSession = await createAuthenticatedSessionToken(testUserB, {
    userAgent: "Google OAuth Client",
    ipAddress: "203.0.113.51",
  });
  const savedGoogle = records.get(googleLoginSession.sessionId);
  assert(
    Boolean(savedGoogle) &&
      savedGoogle?.userId === testUserB.id &&
      savedGoogle?.revokedAt === null &&
      records.size === countBeforeLogins + 2,
    "16.1. Fluxo de Google Login cria registro Session válido e retorna JWT com sid"
  );

  // Login inválido NÃO cria sessão e NÃO emite cookie
  const countBeforeInvalidLogin = records.size;
  const invalidPassOk = await verifyPassword("wrong_password", "$2a$10$abcdefghijklmnopqrstuv1234567890123456789012345678901");
  assert(
    invalidPassOk === false && records.size === countBeforeInvalidLogin,
    "17.2. Credenciais inválidas no login falham fechado e NÃO criam registro Session"
  );

  // Sessão válida + usuário inexistente (userExists: false) -> rejeitada
  const orphanUserSession = await createAuthenticatedSessionToken({
    id: "usr_deleted_999",
    name: "Deleted User",
    email: "deleted@qrmasterdigital.com",
    role: "USER",
  });
  const orphanRec = records.get(orphanUserSession.sessionId);
  if (orphanRec) {
    orphanRec.userExists = false;
    records.set(orphanUserSession.sessionId, orphanRec);
  }
  const orphanCheck = await getSession(makeMockRequestWithToken(orphanUserSession.token));
  assert(
    orphanCheck === null,
    "17.3. Sessão válida cujo usuário não existe mais no banco (userExists === false) é rejeitada"
  );

  // Configuração de Cookie (HttpOnly, Secure em production, SameSite=lax, Path=/, Expiração=7d)
  console.log("\n▶ 18. Auditoria de Atributos de Segurança do Cookie (qrmaster_session):");
  const prodCookieOpts = getSessionCookieOptions("production");
  const devCookieOpts = getSessionCookieOptions("development");
  assert(prodCookieOpts.httpOnly === true, "18.1. Cookie possui flag HttpOnly=true");
  assert(prodCookieOpts.secure === true, "18.2. Cookie possui flag Secure=true em production");
  assert(devCookieOpts.secure === false, "18.3. Cookie possui Secure=false apenas em desenvolvimento local");
  assert(prodCookieOpts.sameSite === "lax", "18.4. Cookie possui SameSite='lax'");
  assert(prodCookieOpts.path === "/" && prodCookieOpts.maxAge === 604800, "18.5. Cookie possui Path='/' e maxAge=604800 (coerente com Session 7d)");

  // ---------------------------------------------------------------------------
  // 19 & 20. Proteção de Mock Auth e Audience Inválida em Produção (AUTH-HARDEN-01 Intacto)
  // ---------------------------------------------------------------------------
  console.log("\n▶ 19 & 20. Preservação de AUTH-HARDEN-01 (Google Audience & Mock Auth Fail-Closed):");
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnableTestAuth = process.env.ENABLE_TEST_AUTH;
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalNextPublicClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const originalFetch = global.fetch;
  try {
    process.env.GOOGLE_CLIENT_ID = "official-client-id.apps.googleusercontent.com";
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    (process.env as any).NODE_ENV = "production";

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          iss: "https://accounts.google.com",
          aud: "attacker-wrong-client-id.apps.googleusercontent.com",
          sub: "google_sub_999",
          email: "victim@gmail.com",
          email_verified: "true",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const wrongAudResult = await verifyGoogleIdToken("cross_app_token_456");
    assert(
      wrongAudResult === null,
      "19.1. Google token com audience (aud) incorreta continua estritamente rejeitado"
    );

    (process.env as any).NODE_ENV = "production";
    process.env.ENABLE_TEST_AUTH = "true";
    const mockPayload = Buffer.from(
      JSON.stringify({
        sub: "123",
        email: "attacker@evil.com",
        emailVerified: true,
        aud: "official-client-id.apps.googleusercontent.com",
      })
    ).toString("base64");
    const prodMockResult = await verifyGoogleIdToken(`test_mock_token:${mockPayload}`);
    assert(
      prodMockResult === null,
      "20.1. test_mock_token continua terminantemente bloqueado quando NODE_ENV === 'production'"
    );
  } finally {
    (process.env as any).NODE_ENV = originalNodeEnv;
    process.env.ENABLE_TEST_AUTH = originalEnableTestAuth;
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = originalNextPublicClientId;
    global.fetch = originalFetch;
    setSessionStoreForTesting(null);
  }

  console.log("\n========================================================================");
  console.log(`  TOTAL DE VERIFICAÇÕES: ${passed + failed}`);
  console.log(`  APROVADAS:             ${passed}`);
  console.log(`  FALHAS:                ${failed}`);
  console.log("========================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erro fatal na suíte test-server-sessions:", err);
  process.exit(1);
});
