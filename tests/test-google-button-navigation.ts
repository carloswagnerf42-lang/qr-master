import fs from "fs";
import path from "path";

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

async function runButtonTests() {
  console.log("=== INICIANDO TESTES DOS BOTÕES DE AUTENTICAÇÃO GOOGLE ===");

  const buttonComponentPath = path.join(process.cwd(), "src/components/auth/GoogleSignInButton.tsx");
  const loginPagePath = path.join(process.cwd(), "src/app/(auth)/login/page.tsx");
  const registerPagePath = path.join(process.cwd(), "src/app/(auth)/register/page.tsx");

  assert(fs.existsSync(buttonComponentPath), "GoogleSignInButton.tsx existe");
  assert(fs.existsSync(loginPagePath), "login/page.tsx existe");
  assert(fs.existsSync(registerPagePath), "register/page.tsx existe");

  const buttonCode = fs.readFileSync(buttonComponentPath, "utf-8");
  const loginCode = fs.readFileSync(loginPagePath, "utf-8");
  const registerCode = fs.readFileSync(registerPagePath, "utf-8");

  // 1. GoogleSignInButton implementation checks
  assert(buttonCode.includes('href="/api/auth/google"'), "Botão possui href direto para '/api/auth/google'");
  assert(
    buttonCode.includes('window.location.href = "/api/auth/google"'),
    "Botão executa navegação via window.location.href = '/api/auth/google' no clique"
  );
  assert(
    buttonCode.includes('"Cadastrar com Google"') && buttonCode.includes('"Entrar com Google"'),
    "Botão suporta os textos 'Cadastrar com Google' e 'Entrar com Google'"
  );
  assert(
    !buttonCode.includes("window.google?.accounts?.id.prompt"),
    "Botão não depende do prompt/GIS bloqueável no cliente para iniciar o fluxo"
  );

  // 2. /register page checks
  assert(
    registerCode.includes('<GoogleSignInButton') && registerCode.includes('text="signup_with"'),
    "Página /register renderiza GoogleSignInButton com text='signup_with' ('Cadastrar com Google')"
  );
  assert(
    !registerCode.includes("disabled={true}"),
    "Página /register não possui disabled fixo no botão Google"
  );

  // 3. /login page checks
  assert(
    loginCode.includes('<GoogleSignInButton') && loginCode.includes('text="signin_with"'),
    "Página /login renderiza GoogleSignInButton com text='signin_with' ('Entrar com Google')"
  );
  assert(
    !loginCode.includes("disabled={true}"),
    "Página /login não possui disabled fixo no botão Google"
  );

  // 4. Verification that GET /api/auth/google is registered
  const googleRoutePath = path.join(process.cwd(), "src/app/api/auth/google/route.ts");
  const googleRouteCode = fs.readFileSync(googleRoutePath, "utf-8");
  assert(
    googleRouteCode.includes("export async function GET"),
    "Rota /api/auth/google exporta método GET para iniciar o fluxo OAuth"
  );
  assert(
    googleRouteCode.includes("/api/auth/callback/google"),
    "Rota /api/auth/google aponta redirect_uri para o callback correto"
  );

  console.log("\n=========================================");
  console.log(`TOTAL PASS: ${passCount} | TOTAL FAIL: ${failCount}`);
  console.log("=========================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runButtonTests().catch((err) => {
  console.error("Erro no teste dos botões:", err);
  process.exit(1);
});
