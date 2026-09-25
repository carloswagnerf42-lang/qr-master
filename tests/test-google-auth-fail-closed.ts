import { verifyGoogleIdToken } from "../src/lib/google-auth";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failCount++;
  }
}

async function runTests() {
  console.log("==========================================================");
  console.log("🛡️ AUTH-HARDEN-01: TESTES DE AUDIENCE FAIL-CLOSED E MOCK");
  console.log("==========================================================");

  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  try {
    // ------------------------------------------------------------------------
    // Teste A: Client ID ausente no ambiente -> token deve ser rejeitado (Fail-Closed)
    // ------------------------------------------------------------------------
    console.log("\n▶ Teste A: Client ID ausente no ambiente:");
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    delete process.env.ENABLE_TEST_AUTH;
    (process.env as any).NODE_ENV = "production";

    // Mock fetch que retornaria token válido emitido pelo Google
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          iss: "https://accounts.google.com",
          aud: "any-client-id.apps.googleusercontent.com",
          sub: "1234567890",
          email: "victim@example.com",
          email_verified: "true",
          name: "Vitima",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const resA = await verifyGoogleIdToken("valid_real_looking_token_123");
    assert(resA === null, "Token rejeitado quando GOOGLE_CLIENT_ID não está configurado");

    // ------------------------------------------------------------------------
    // Teste B: aud divergente do Client ID esperado -> token deve ser rejeitado
    // ------------------------------------------------------------------------
    console.log("\n▶ Teste B: aud incorreto / divergente:");
    process.env.GOOGLE_CLIENT_ID = "qrmaster-legit-client-id.apps.googleusercontent.com";
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    (process.env as any).NODE_ENV = "production";

    // Tokeninfo retornando token emitido para outra aplicação (aud diferente)
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          iss: "https://accounts.google.com",
          aud: "attacker-third-party-app.apps.googleusercontent.com",
          sub: "1234567890",
          email: "victim@example.com",
          email_verified: "true",
          name: "Vitima",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const resB = await verifyGoogleIdToken("cross_app_token_456");
    assert(resB === null, "Token rejeitado quando aud pertence a outra aplicação (Cross-App Token)");

    // ------------------------------------------------------------------------
    // Teste F: aud ausente na resposta do tokeninfo -> token deve ser rejeitado
    // ------------------------------------------------------------------------
    console.log("\n▶ Teste F: aud ausente no payload:");
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          iss: "https://accounts.google.com",
          sub: "1234567890",
          email: "victim@example.com",
          email_verified: "true",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const resF = await verifyGoogleIdToken("token_without_aud");
    assert(resF === null, "Token rejeitado quando aud está ausente na resposta do Google");

    // ------------------------------------------------------------------------
    // Teste C: aud correto -> validação bem-sucedida preservada
    // ------------------------------------------------------------------------
    console.log("\n▶ Teste C: aud correto e correspondente:");
    process.env.GOOGLE_CLIENT_ID = "qrmaster-legit-client-id.apps.googleusercontent.com";
    (process.env as any).NODE_ENV = "production";

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          iss: "https://accounts.google.com",
          aud: "qrmaster-legit-client-id.apps.googleusercontent.com",
          sub: "google_user_sub_999",
          email: "legit@qrmasterdigital.com",
          email_verified: "true",
          name: "Usuario Legitimo",
          picture: "https://lh3.googleusercontent.com/photo.jpg",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const resC = await verifyGoogleIdToken("legit_valid_token_789");
    assert(resC !== null, "Token aceito quando aud corresponde exatamente ao GOOGLE_CLIENT_ID");
    assert(resC?.email === "legit@qrmasterdigital.com", "E-mail extraído corretamente");
    assert(resC?.sub === "google_user_sub_999", "Sub ID extraído corretamente");
    assert(resC?.emailVerified === true, "emailVerified é true");

    // ------------------------------------------------------------------------
    // Teste D: NODE_ENV=production + ENABLE_TEST_AUTH=true + test_mock_token -> rejeitado
    // ------------------------------------------------------------------------
    console.log("\n▶ Teste D: Bloqueio estrito de test_mock_token em produção:");
    (process.env as any).NODE_ENV = "production";
    process.env.ENABLE_TEST_AUTH = "true";
    delete process.env.GOOGLE_CLIENT_ID;

    const mockPayload = {
      sub: "hacker_sub_000",
      email: "admin@qrmasterdigital.com",
      name: "Atacante Mock",
      emailVerified: true,
    };
    const mockToken = "test_mock_token:" + Buffer.from(JSON.stringify(mockPayload)).toString("base64");

    const resD = await verifyGoogleIdToken(mockToken);
    assert(resD === null, "test_mock_token REJEITADO em NODE_ENV=production mesmo com ENABLE_TEST_AUTH=true");

    // ------------------------------------------------------------------------
    // Teste E: Ambiente de teste permitido + mock habilitado -> comportamento preservado
    // ------------------------------------------------------------------------
    console.log("\n▶ Teste E: Preservação de test_mock_token em ambiente de teste/dev:");
    (process.env as any).NODE_ENV = "test";
    process.env.ENABLE_TEST_AUTH = "true";

    const testPayload = {
      sub: "mock_test_sub_555",
      email: "dev@qrmasterdigital.com",
      name: "Desenvolvedor Teste",
      emailVerified: true,
    };
    const validTestMockToken = "test_mock_token:" + Buffer.from(JSON.stringify(testPayload)).toString("base64");

    const resE = await verifyGoogleIdToken(validTestMockToken);
    assert(resE !== null, "test_mock_token aceito em NODE_ENV=test quando ENABLE_TEST_AUTH=true");
    assert(resE?.sub === "mock_test_sub_555", "Sub do mock extraído com sucesso");
    assert(resE?.email === "dev@qrmasterdigital.com", "E-mail do mock extraído com sucesso");
  } finally {
    // Restaura ambiente original
    process.env = originalEnv;
    global.fetch = originalFetch;
  }

  console.log("\n==========================================================");
  console.log(`TOTAL DE ASSERÇÕES: ${passCount + failCount}`);
  console.log(`APROVADAS:          ${passCount}`);
  console.log(`FALHAS:             ${failCount}`);
  console.log("==========================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
