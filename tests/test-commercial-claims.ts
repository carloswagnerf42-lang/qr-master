import fs from "fs";
import path from "path";

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ""}`);
    throw new Error(`Assertion failed: ${testName} - ${detail || ""}`);
  }
}

function readFile(relPath: string): string {
  const fullPath = path.join(process.cwd(), relPath);
  return fs.readFileSync(fullPath, "utf-8");
}

async function runCommercialClaimsTestSuite() {
  console.log("\n=======================================================");
  console.log("🛡️ AUDITORIA DE VERACIDADE COMERCIAL & CONFORMIDADE FACTUAL");
  console.log("=======================================================\n");

  const homePage = readFile("src/app/page.tsx");
  const pricingAndFaq = readFile("src/components/landing/PricingAndFaq.tsx");
  const privacyPage = readFile("src/app/privacy/page.tsx");
  const termsPage = readFile("src/app/terms/page.tsx");

  console.log("--- 1. AUSÊNCIA DE RECURSOS NÃO IMPLEMENTADOS NA LANDING PAGE ---");
  {
    // A) Domínio Próprio / Whitelabel (não existe no schema, DNS ou rotas)
    assert(
      !homePage.includes("Domínio Próprio / Whitelabel") &&
        !homePage.includes("Whitelabel") &&
        !pricingAndFaq.includes("Whitelabel") &&
        !pricingAndFaq.includes("Domínio Próprio"),
      "Ausência de promessa de Whitelabel ou Domínio Próprio na landing page"
    );

    // B) Geolocalização no Analytics (Cidades / Regiões)
    assert(
      !homePage.includes("Cidades e Regiões") &&
        !homePage.includes("São Paulo, SP") &&
        !homePage.includes("Belo Horizonte, MG") &&
        !homePage.includes("Rio de Janeiro, RJ"),
      "Ausência de estatísticas fictícias de cidades e regiões no Analytics"
    );

    assert(
      !pricingAndFaq.includes("cidades"),
      "FAQ de Analytics não alega métricas de cidades inexistentes no produto"
    );

    // C) Módulos verticais não existentes
    assert(
      !homePage.includes("validação de garantia"),
      "Ausência de módulo vertical de 'validação de garantia' (substituído por link para manual/vídeo)"
    );
    assert(
      !homePage.includes("conversão geográfica"),
      "Ausência de 'conversão geográfica' em marketing (substituído por métricas de cliques por período)"
    );
    assert(
      !homePage.includes("links de check-in"),
      "Ausência de 'links de check-in' para eventos (substituído por página de credenciamento e programação)"
    );
  }

  console.log("\n--- 2. AUSÊNCIA DE ALEGAÇÕES JURÍDICAS OU TÉCNICAS ABSOLUTAS ---");
  {
    // A) 100% LGPD / LGPD Compliant
    assert(
      !homePage.includes("LGPD Compliant") &&
        !pricingAndFaq.includes("(100% LGPD)") &&
        !pricingAndFaq.includes("100% LGPD") &&
        !homePage.includes("total conformidade LGPD"),
      "Ausência de termos absolutos '100% LGPD' ou 'LGPD Compliant' como certificação formal"
    );

    // B) 100% seguro ou garantias absolutas
    assert(
      !homePage.includes("100% seguro") &&
        !homePage.includes("100% blindado") &&
        !pricingAndFaq.includes("100% seguro"),
      "Ausência de alegações de segurança absoluta ('100% seguro')"
    );

    // C) Alta disponibilidade sem contrato de SLA
    assert(
      !homePage.includes("Alta Disponibilidade"),
      "Ausência de alegação formal de 'Alta Disponibilidade' sem SLA corporativo"
    );

    // D) CNPJ não preenchido
    assert(
      !homePage.includes("CNPJ e operação"),
      "Rodapé não alega CNPJ genérico sem dados formais da empresa"
    );
  }

  console.log("\n--- 3. PRESENÇA DE RECURSOS REAIS E DESIGNAÇÕES FACTUAIS ---");
  {
    // A) Módulo de Campanhas (recurso real no schema e UI)
    assert(
      homePage.includes("Módulo de Campanhas"),
      "Landing Page apresenta 'Módulo de Campanhas' no lugar de Whitelabel"
    );
    assert(
      homePage.includes("Exclusivo BUSINESS"),
      "Card de Campanhas destaca 'Exclusivo BUSINESS'"
    );

    // B) Disclaimer explícito na demonstração do Analytics
    assert(
      homePage.includes("Demonstração ilustrativa"),
      "Badge 'Demonstração ilustrativa' presente na seção de Analytics"
    );
    assert(
      homePage.includes("Exemplo de visualização das métricas disponíveis no painel"),
      "Texto explicita que o painel de analytics exibido é uma demonstração de exemplo"
    );

    // C) Navegadores mais usados (métrica real)
    assert(
      homePage.includes("Navegadores mais usados"),
      "Analytics ilustra métrica real agregada de Navegadores"
    );

    // D) Média Diária & Comparativo (métrica real)
    assert(
      homePage.includes("Média Diária & Comparativo"),
      "Analytics ilustra métrica real de Média Diária e Comparativo de período"
    );

    // E) Privacidade por Design & Hash SHA-256
    assert(
      homePage.includes("Privacidade por Design"),
      "Pilar de segurança utiliza 'Privacidade por Design'"
    );
    assert(
      homePage.includes("hash unidirecional SHA-256") || homePage.includes("hash SHA-256"),
      "Explicação técnica factual sobre proteção com hash SHA-256 sem armazenar IP bruto"
    );
    assert(
      homePage.includes("Infraestrutura em Nuvem"),
      "Pilar de infraestrutura utiliza 'Infraestrutura em Nuvem' (Vercel)"
    );
  }

  console.log("\n--- 4. POLÍTICA DE PRIVACIDADE & CONFORMIDADE LGPD FACTUAL ---");
  {
    assert(
      privacyPage.includes("Privacidade por Design & Proteção de Dados"),
      "Página /privacy possui badge 'Privacidade por Design & Proteção de Dados'"
    );
    assert(
      !privacyPage.includes("país/região aproximada"),
      "Página /privacy não declara coleta de país/região aproximada nos scans"
    );
    assert(
      privacyPage.includes("Não armazenamos o endereço IP puro") &&
        privacyPage.includes("hash SHA-256"),
      "Página /privacy detalha expressamente o hash SHA-256 irreversível de IP"
    );
    assert(
      termsPage.includes("Termos de Uso") && termsPage.includes("Master Digital"),
      "Página /terms detalha os termos da Master Digital"
    );
  }

  console.log("\n--- 5. PLANOS, PREÇOS, LIMITES E SUPORTE ---");
  {
    // A) Cotas
    assert(
      pricingAndFaq.includes("5 QR Codes") &&
        pricingAndFaq.includes("15 QR Codes") &&
        pricingAndFaq.includes("QR Codes Ilimitados"),
      "Tabela de preços declara rigorosamente as cotas de 5 (FREE), 15 (PRO) e Ilimitado (BUSINESS)"
    );

    // B) Preços
    assert(
      pricingAndFaq.includes("19,90") &&
        pricingAndFaq.includes("99,00") &&
        pricingAndFaq.includes("29,90") &&
        pricingAndFaq.includes("199,00"),
      "Preços oficiais mantidos com exatidão (R$ 19,90/R$ 99 e R$ 29,90/R$ 199)"
    );

    // C) Modelo Pré-pago
    assert(
      pricingAndFaq.includes("30 ou 365 dias") &&
        pricingAndFaq.includes("sem contratos de fidelidade"),
      "FAQ esclarece modelo pré-pago por período de 30 ou 365 dias sem fidelidade"
    );

    // D) Suporte WhatsApp com links protegidos
    assert(
      homePage.includes("https://wa.me/5531985029353") &&
        homePage.includes('target="_blank"') &&
        homePage.includes('rel="noopener noreferrer"'),
      "Link de atendimento do WhatsApp é seguro e aponta para número oficial da Master Digital"
    );
  }

  console.log("\n=======================================================");
  console.log(`🎉 SUÍTE DE VERACIDADE COMERCIAL CONCLUÍDA: ${passedTests}/${totalTests} testes aprovados!`);
  console.log("=======================================================\n");
}

runCommercialClaimsTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 FALHA NA SUÍTE DE VERACIDADE COMERCIAL:", err);
    process.exit(1);
  });
