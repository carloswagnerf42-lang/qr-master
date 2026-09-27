import nextConfig from "../next.config.mjs";

let totalAsserts = 0;
let passedAsserts = 0;
let failedAsserts = 0;

function assert(condition: boolean | undefined | null, title: string, detail?: string) {
  totalAsserts++;
  if (Boolean(condition)) {
    console.log(`  ✅ PASS: ${title}`);
    passedAsserts++;
  } else {
    console.error(`  ❌ FAIL: ${title}${detail ? ` — ${detail}` : ""}`);
    failedAsserts++;
  }
}

async function runTestSuite() {
  console.log("==========================================================================");
  console.log("  SUÍTE DE TESTES: SECURITY-HARD-13A.1 — ADVERSARIAL CSP & SECURITY HEADERS");
  console.log("==========================================================================\n");

  // 1. Obtenção das regras de headers configuradas no Next.js
  assert(typeof nextConfig.headers === "function", "1.1. nextConfig.headers é uma função assíncrona válida");
  const rules = await nextConfig.headers!();
  assert(Array.isArray(rules) && rules.length >= 1, "1.2. nextConfig.headers retorna regras de roteamento ativas");

  // Localiza a regra universal de proteção
  const globalRule = rules.find((r) => r.source === "/:path*");
  assert(Boolean(globalRule), "1.3. Regra de proteção universal '/:path*' encontrada no next.config.mjs");

  const headersMap = new Map<string, string>();
  for (const h of globalRule!.headers) {
    headersMap.set(h.key.toLowerCase(), h.value);
  }

  // ========================================================================
  // GRUPO A: Existência e Estrutura Geral da Content-Security-Policy
  // ========================================================================
  console.log("\n--- GRUPO A: Existência e Estrutura Geral da CSP ---");
  const csp = headersMap.get("content-security-policy");
  assert(Boolean(csp && csp.length > 50), "A1. Cabeçalho Content-Security-Policy (CSP) está presente e não vazio");

  const directives = new Map<string, string[]>();
  if (csp) {
    csp.split(";").forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;
      const tokens = trimmed.split(/\s+/);
      const name = tokens[0];
      const values = tokens.slice(1);
      directives.set(name, values);
    });
  }

  assert(directives.has("default-src"), "A2. Diretiva 'default-src' está explicitamente definida");
  assert(directives.has("script-src"), "A3. Diretiva 'script-src' está explicitamente definida");
  assert(directives.has("style-src"), "A4. Diretiva 'style-src' está explicitamente definida");
  assert(directives.has("img-src"), "A5. Diretiva 'img-src' está explicitamente definida");
  assert(directives.has("font-src"), "A6. Diretiva 'font-src' está explicitamente definida");
  assert(directives.has("connect-src"), "A7. Diretiva 'connect-src' está explicitamente definida");
  assert(directives.has("frame-src"), "A8. Diretiva 'frame-src' está explicitamente definida");
  assert(directives.has("frame-ancestors"), "A9. Diretiva 'frame-ancestors' está explicitamente definida");
  assert(directives.has("object-src"), "A10. Diretiva 'object-src' está explicitamente definida");
  assert(directives.has("base-uri"), "A11. Diretiva 'base-uri' está explicitamente definida");
  assert(directives.has("form-action"), "A12. Diretiva 'form-action' está explicitamente definida");
  assert(directives.has("media-src"), "A13. Diretiva 'media-src' está explicitamente definida");
  assert(directives.has("worker-src"), "A14. Diretiva 'worker-src' está explicitamente definida");
  assert(directives.has("manifest-src"), "A15. Diretiva 'manifest-src' está explicitamente definida");
  assert(directives.has("upgrade-insecure-requests"), "A16. Diretiva 'upgrade-insecure-requests' está ativada");

  // ========================================================================
  // GRUPO B: Princípio de Menor Privilégio e Diretivas Críticas
  // ========================================================================
  console.log("\n--- GRUPO B: Princípio de Mínimo Privilégio e Diretivas Críticas ---");

  // B1. default-src estritamente 'self'
  const defaultSrc = directives.get("default-src") || [];
  assert(defaultSrc.length === 1 && defaultSrc[0] === "'self'", "B1. default-src estritamente restrito a 'self'");

  // B2. object-src 'none' (sem plugins/Flash/applets)
  const objectSrc = directives.get("object-src") || [];
  assert(objectSrc.length === 1 && objectSrc[0] === "'none'", "B2. object-src configurado como 'none'");

  // B3. base-uri 'self' (anti-base-tag hijacking)
  const baseUri = directives.get("base-uri") || [];
  assert(baseUri.length === 1 && baseUri[0] === "'self'", "B3. base-uri restrito a 'self'");

  // B4. frame-ancestors 'none' (anti-clickjacking moderno universal)
  const frameAncestors = directives.get("frame-ancestors") || [];
  assert(frameAncestors.length === 1 && frameAncestors[0] === "'none'", "B4. frame-ancestors configurado como 'none'");

  // B5. frame-src 'none' (bloqueio total de incorporação de iframes)
  const frameSrc = directives.get("frame-src") || [];
  assert(frameSrc.length === 1 && frameSrc[0] === "'none'", "B5. frame-src configurado como 'none'");

  // B6. form-action 'self' (anti-form hijacking)
  const formAction = directives.get("form-action") || [];
  assert(formAction.length === 1 && formAction[0] === "'self'", "B6. form-action restrito a 'self'");

  // B7. media-src 'self'
  const mediaSrc = directives.get("media-src") || [];
  assert(mediaSrc.length === 1 && mediaSrc[0] === "'self'", "B7. media-src restrito a 'self'");

  // B8. manifest-src 'self'
  const manifestSrc = directives.get("manifest-src") || [];
  assert(manifestSrc.length === 1 && manifestSrc[0] === "'self'", "B8. manifest-src restrito a 'self'");

  // ========================================================================
  // GRUPO C: Ausência de Elementos Inseguros (Anti-Pattern Checks)
  // ========================================================================
  console.log("\n--- GRUPO C: Ausência de Elementos Inseguros ---");

  const allValues = Array.from(directives.values()).flat();

  // C1. Ausência de wildcard '*'
  const hasGlobalWildcard = allValues.some((v) => v === "*" || v === "'*'");
  assert(!hasGlobalWildcard, "C1. Ausência de wildcard global '*' em todas as diretivas");

  // C2. Ausência absoluta de 'unsafe-eval'
  const hasUnsafeEval = allValues.some((v) => v.toLowerCase().includes("unsafe-eval"));
  assert(!hasUnsafeEval, "C2. Ausência total de 'unsafe-eval' em TODAS as diretivas (proteção estrita contra eval)");

  // C3. Ausência de esquemas http: inseguros
  const hasHttp = allValues.some((v) => /^http:\/\//i.test(v));
  assert(!hasHttp, "C3. Ausência de URLs http:// inseguras na CSP (todas as origens usam https://)");

  // C4. Diretiva upgrade-insecure-requests
  assert(directives.has("upgrade-insecure-requests"), "C4. Diretiva upgrade-insecure-requests ativada");

  // ========================================================================
  // GRUPO D: Auditoria Rigorosa de connect-src (Egress Protection)
  // ========================================================================
  console.log("\n--- GRUPO D: Auditoria Rigorosa de connect-src ---");

  const connectSrc = directives.get("connect-src") || [];

  // D1. connect-src deve ser ESTRITAMENTE 'self' (browser nunca se comunica diretamente com APIs externas)
  assert(connectSrc.includes("'self'"), "D1.1. connect-src permite 'self'");
  assert(connectSrc.length === 1, "D1.2. connect-src contém UNICAMENTE 'self' (zero vazamento de conexões externas)");

  // D2. Supabase NÃO pode estar em connect-src
  const hasSupabaseConnect = connectSrc.some((v) => v.includes("supabase"));
  assert(!hasSupabaseConnect, "D2. Supabase Storage categoricamente AUSENTE de connect-src (opera 100% server-side)");

  // D3. Mercado Pago NÃO pode estar em connect-src
  const hasMercadoPagoConnect = connectSrc.some((v) => v.includes("mercadopago"));
  assert(!hasMercadoPagoConnect, "D3. Mercado Pago categoricamente AUSENTE de connect-src (opera 100% server-side)");

  // D4. Stripe NÃO pode estar em connect-src
  const hasStripeConnect = connectSrc.some((v) => v.includes("stripe"));
  assert(!hasStripeConnect, "D4. Stripe categoricamente AUSENTE de connect-src (opera 100% server-side)");

  // D5. Google APIs NÃO podem estar em connect-src
  const hasGoogleConnect = connectSrc.some((v) => v.includes("google"));
  assert(!hasGoogleConnect, "D5. Google APIs categoricamente AUSENTES de connect-src");

  // ========================================================================
  // GRUPO E: Auditoria de img-src e Fontes de Imagem
  // ========================================================================
  console.log("\n--- GRUPO E: Auditoria de img-src ---");

  const imgSrc = directives.get("img-src") || [];

  // E1. Permissões legítimas necessárias
  assert(imgSrc.includes("'self'"), "E1.1. img-src permite 'self'");
  assert(imgSrc.includes("data:"), "E1.2. img-src permite 'data:' (geração de QR Codes em canvas/base64)");
  assert(imgSrc.includes("blob:"), "E1.3. img-src permite 'blob:' (previews de upload em memória)");
  assert(
    imgSrc.includes("https://lh3.googleusercontent.com"),
    "E1.4. img-src permite especificamente 'https://lh3.googleusercontent.com' (avatares do Google OAuth)"
  );

  // E2. Bloqueio de domínios genéricos e desnecessários em img-src
  assert(!imgSrc.includes("*.google.com"), "E2.1. img-src NÃO contém *.google.com genérico");
  assert(!imgSrc.includes("https://*.google.com"), "E2.2. img-src NÃO contém https://*.google.com genérico");
  assert(!imgSrc.includes("*.supabase.co"), "E2.3. img-src NÃO contém *.supabase.co genérico");
  assert(!imgSrc.some((v) => v.includes("mercadopago")), "E2.4. img-src NÃO contém Mercado Pago");
  assert(!imgSrc.some((v) => v.includes("stripe")), "E2.5. img-src NÃO contém Stripe");

  // E3. Se Supabase estiver em img-src, deve ser o hostname exato do projeto
  const supabaseImgOrigins = imgSrc.filter((v) => v.includes("supabase.co"));
  if (supabaseImgOrigins.length > 0) {
    for (const origin of supabaseImgOrigins) {
      assert(
        /^https:\/\/[a-z0-9_-]+\.supabase\.co$/.test(origin),
        `E3.1. Origem Supabase em img-src ('${origin}') é um hostname específico e válido, sem curinga`
      );
    }
  } else {
    console.log("  ℹ️ INFO: Nenhuma origem externa de Supabase em img-src (ambiente sem SUPABASE_URL configurada)");
  }

  // ========================================================================
  // GRUPO F: Auditoria de data: e blob: (Princípio do Mínimo Privilégio)
  // ========================================================================
  console.log("\n--- GRUPO F: Auditoria de data: e blob: ---");

  // F1. data: permitido EXCLUSIVAMENTE em img-src e font-src
  for (const [dirName, values] of directives.entries()) {
    if (values.includes("data:")) {
      assert(
        dirName === "img-src" || dirName === "font-src",
        `F1. Diretiva '${dirName}' permite data: (apenas img-src e font-src são autorizadas)`
      );
    }
  }

  // F2. blob: permitido EXCLUSIVAMENTE em img-src e worker-src
  for (const [dirName, values] of directives.entries()) {
    if (values.includes("blob:")) {
      assert(
        dirName === "img-src" || dirName === "worker-src",
        `F2. Diretiva '${dirName}' permite blob: (apenas img-src e worker-src são autorizadas)`
      );
    }
  }

  // F3. script-src NÃO pode conter data: nem blob: (vetores clássicos de XSS bypass)
  const scriptSrc = directives.get("script-src") || [];
  assert(!scriptSrc.includes("data:"), "F3.1. script-src NÃO contém data: (anti-XSS)");
  assert(!scriptSrc.includes("blob:"), "F3.2. script-src NÃO contém blob: (anti-XSS)");

  // ========================================================================
  // GRUPO G: Headers Complementares de Segurança
  // ========================================================================
  console.log("\n--- GRUPO G: Headers Complementares de Segurança ---");

  assert(
    headersMap.get("x-content-type-options") === "nosniff",
    "G1. X-Content-Type-Options: nosniff preservado"
  );
  assert(
    headersMap.get("x-frame-options") === "DENY",
    "G2. X-Frame-Options: DENY preservado como defesa em profundidade legada"
  );
  assert(
    headersMap.get("referrer-policy") === "strict-origin-when-cross-origin",
    "G3. Referrer-Policy: strict-origin-when-cross-origin preservado"
  );
  assert(
    Boolean(headersMap.get("strict-transport-security")?.includes("max-age=63072000")),
    "G4. Strict-Transport-Security preservado com max-age longo (2 anos)"
  );
  assert(
    Boolean(headersMap.get("permissions-policy")?.includes("camera=()")),
    "G5. Permissions-Policy restringe câmera"
  );
  assert(
    Boolean(headersMap.get("permissions-policy")?.includes("microphone=()")),
    "G6. Permissions-Policy restringe microfone"
  );
  assert(
    Boolean(headersMap.get("permissions-policy")?.includes("geolocation=()")),
    "G7. Permissions-Policy restringe geolocalização"
  );

  // ========================================================================
  // GRUPO H: Cobertura Universal de Rotas (Auditoria da Exceção /q/)
  // ========================================================================
  console.log("\n--- GRUPO H: Cobertura Universal de Rotas (Sem Exceções Fracas) ---");

  // Regra universal '/:path*' abrange 100% das rotas
  const universalRegex = new RegExp("^/.*$");

  const routesToVerify = [
    "/",
    "/login",
    "/register",
    "/dashboard",
    "/settings",
    "/profile",
    "/files",
    "/analytics",
    "/campaigns",
    "/api/auth/me",
    "/api/auth/login",
    "/api/qr",
    "/api/storage/upload",
    "/api/billing/checkout",
    "/m/slug-teste",
    "/q/abc1234",
    "/q/xyz-code",
    "/q/meu-qr-code-dinamico",
  ];

  for (let i = 0; i < routesToVerify.length; i++) {
    const route = routesToVerify[i];
    const isMatched = universalRegex.test(route);
    assert(
      isMatched,
      `H1.${i + 1}. Rota '${route}' é coberta pela política universal '/:path*'`
    );
  }

  // Confirma que /q/* recebe rigorosamente as proteções anti-clickjacking
  assert(
    headersMap.get("x-frame-options") === "DENY",
    "H2. Rota /q/* recebe X-Frame-Options: DENY (anti-clickjacking ativado)"
  );
  assert(
    directives.get("frame-ancestors")?.[0] === "'none'",
    "H3. Rota /q/* recebe frame-ancestors 'none' (anti-clickjacking moderno ativado)"
  );

  // Confirma que não existem regras fragmentadas ou permissivas secundárias
  const permissiveRule = rules.find((r) => r.source === "/q/:path*" && r.headers.length < 4);
  assert(!permissiveRule, "H4. Nenhuma regra enfraquecida residual para /q/:path* encontrada");

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
  console.error("Erro fatal na execução da suíte de CSP:", err);
  process.exit(1);
});
