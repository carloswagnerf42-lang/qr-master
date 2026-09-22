import fs from "fs";
import path from "path";
import { calculateAnnualDiscountPercent } from "../src/lib/permissions";

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

async function runLandingPageTestSuite() {
  console.log("\n=======================================================");
  console.log("🚀 INICIANDO TESTES DA LANDING PAGE COMERCIAL (FASE 2)");
  console.log("=======================================================\n");

  const homePage = readFile("src/app/page.tsx");
  const landingHeader = readFile("src/components/landing/LandingHeader.tsx");
  const heroDemo = readFile("src/components/landing/HeroDemo.tsx");
  const pricingAndFaq = readFile("src/components/landing/PricingAndFaq.tsx");
  const dashboard = readFile("src/app/(dashboard)/dashboard/page.tsx");
  const myQrs = readFile("src/app/(dashboard)/my-qrs/page.tsx");
  const termsPage = readFile("src/app/terms/page.tsx");
  const privacyPage = readFile("src/app/privacy/page.tsx");

  console.log("--- 1. HERO SECTION & PROPOSTA DE VALOR ---");
  {
    assert(
      homePage.includes("QR Codes inteligentes para") &&
        homePage.includes("conectar, editar e medir resultados."),
      "Headline oficial presente na íntegra"
    );

    assert(
      homePage.includes(
        "Crie QR Codes estáticos e dinâmicos com a sua marca, acompanhe métricas de acesso em tempo real e altere o destino do link sempre que precisar — sem reimprimir nada."
      ),
      "Subheadline oficial presente na íntegra"
    );

    assert(
      homePage.includes("Começar grátis") && homePage.includes('href="/register"'),
      "CTA primário 'Começar grátis' apontando para /register presente"
    );

    assert(
      homePage.includes("Ver planos") && homePage.includes('href="#pricing"'),
      "CTA secundário 'Ver planos' ancorado em #pricing presente"
    );

    assert(
      homePage.includes("Sem cartão • Até 5 QR Codes no plano FREE"),
      "Microcopy de fricção zero 'Sem cartão • Até 5 QR Codes no plano FREE' presente"
    );

    assert(
      homePage.includes("<HeroDemo />") || homePage.includes("<HeroDemo"),
      "Demonstração interativa HeroDemo integrada na Hero section"
    );

    assert(
      heroDemo.includes("DINÂMICO") && heroDemo.includes("Simular troca de link agora"),
      "HeroDemo demonstra badge DINÂMICO e simulação de troca de link em tempo real"
    );
  }

  console.log("\n--- 2. NAVEGAÇÃO & HEADER RESPONSIVO ---");
  {
    assert(
      homePage.includes("<LandingHeader />") || homePage.includes("<LandingHeader"),
      "LandingHeader integrado na página inicial"
    );

    const requiredAnchors = ["#features", "#how-it-works", "#pricing", "#faq"];
    for (const anchor of requiredAnchors) {
      assert(
        landingHeader.includes(`href="${anchor}"`),
        `LandingHeader possui âncora de navegação para ${anchor}`
      );
    }

    assert(
      landingHeader.includes("Criar conta grátis") && landingHeader.includes('href="/register"'),
      "LandingHeader possui botão 'Criar conta grátis' para /register"
    );

    assert(
      landingHeader.includes("Entrar") && landingHeader.includes('href="/login"'),
      "LandingHeader possui link 'Entrar' para /login"
    );

    assert(
      landingHeader.includes("isOpen") &&
        landingHeader.includes("setIsOpen") &&
        landingHeader.includes("aria-label"),
      "LandingHeader possui estado e acessibilidade para gaveta/menu mobile"
    );

    // Validação dos IDs de destino no DOM
    assert(homePage.includes('id="features"'), "Elemento de destino id='features' presente no DOM");
    assert(
      homePage.includes('id="how-it-works"'),
      "Elemento de destino id='how-it-works' presente no DOM"
    );
    assert(
      pricingAndFaq.includes('id="pricing"'),
      "Elemento de destino id='pricing' presente no DOM (PricingAndFaq)"
    );
    assert(
      pricingAndFaq.includes('id="faq"'),
      "Elemento de destino id='faq' presente no DOM (PricingAndFaq)"
    );
  }

  console.log("\n--- 3. PILARES DE BENEFÍCIO (#features) ---");
  {
    assert(
      homePage.includes("Mais que um QR Code: uma ferramenta de conexão com o seu público"),
      "Título da seção de benefícios presente"
    );

    const benefitPillars = [
      "QR Codes Dinâmicos",
      "Edição em Tempo Real",
      "Analytics de Acesso",
      "Personalização Visual",
      "Alta Resolução (SVG e PNG)",
      "Segurança e Privacidade",
      "Módulo de Campanhas",
      "Criação Imediata",
    ];

    for (const pillar of benefitPillars) {
      assert(
        homePage.includes(pillar),
        `Pilar de benefício '${pillar}' presente na grade`
      );
    }

    assert(
      homePage.includes("Exclusivo BUSINESS"),
      "Badge 'Exclusivo BUSINESS' claramente indicado no card de Módulo de Campanhas"
    );
  }

  console.log("\n--- 4. SEÇÃO DIDÁTICA DO QR DINÂMICO ---");
  {
    assert(
      homePage.includes("Mude o destino sem trocar o QR Code"),
      "Headline da explicação do QR Dinâmico presente"
    );

    assert(
      homePage.includes(
        "Economize custos de reimpressão e nunca mais perca um cliente com link quebrado."
      ),
      "Subheadline da explicação do QR Dinâmico presente"
    );

    assert(
      homePage.includes("Crie seu QR Code Dinâmico") &&
        homePage.includes("Imprima ou divulgue") &&
        homePage.includes("Precisa mudar a promoção?") &&
        homePage.includes("O QR impresso continua o mesmo"),
      "Fluxo sequencial de 4 passos do QR Dinâmico presente"
    );

    assert(
      homePage.includes("QR Code Estático") &&
        homePage.includes("Destino fixo para sempre") &&
        homePage.includes("Destino editável a qualquer momento"),
      "Comparativo de contraste visual entre QR Estático e QR Dinâmico presente"
    );
  }

  console.log("\n--- 5. SEÇÃO ANALYTICS & PRIVACIDADE ---");
  {
    assert(
      homePage.includes("Saiba o que acontece depois do scan"),
      "Headline da seção Analytics presente"
    );

    assert(
      homePage.includes(
        "Exemplo de visualização das métricas disponíveis no painel para entender o comportamento de acesso aos seus QR Codes."
      ),
      "Subheadline da seção Analytics presente e identificada como exemplo"
    );

    assert(
      homePage.includes("Demonstração ilustrativa"),
      "Badge 'Demonstração ilustrativa' visível na seção de Analytics"
    );

    const analyticsFeatures = [
      "Total de Escaneamentos",
      "Dispositivos mais usados",
      "Sistemas & Navegadores",
      "Navegadores mais usados",
      "Linha do Tempo & Picos",
      "Média Diária & Comparativo",
    ];

    for (const feature of analyticsFeatures) {
      assert(
        homePage.includes(feature),
        `Card ilustrativo de analytics '${feature}' presente`
      );
    }
  }

  console.log("\n--- 6. CASOS DE USO DO QR MASTER ---");
  {
    assert(
      homePage.includes("Um QR MASTER para cada ideia"),
      "Headline dos casos de uso presente"
    );

    const useCases = [
      "Restaurantes e Bares",
      "Embalagens e Produtos",
      "Eventos e Ingressos",
      "Comércio e Varejo",
      "Cartões de Visita",
      "Campanhas de Marketing",
      "Imobiliárias e Corretores",
      "Criadores de Conteúdo",
    ];

    for (const uc of useCases) {
      assert(homePage.includes(uc), `Caso de uso '${uc}' presente nos cards`);
    }
  }

  console.log("\n--- 7. COMO FUNCIONA (#how-it-works) ---");
  {
    assert(
      homePage.includes("Comece a usar em menos de 2 minutos"),
      "Headline de 'Como Funciona' presente"
    );

    assert(
      homePage.includes("Crie seu QR Code") &&
        homePage.includes("Publique onde quiser") &&
        homePage.includes("Acompanhe os resultados"),
      "Os 3 passos do fluxo estão presentes"
    );

    assert(
      homePage.includes("Criar meu primeiro QR Code agora"),
      "CTA 'Criar meu primeiro QR Code agora' presente na seção"
    );
  }

  console.log("\n--- 8. PLANOS, PREÇOS E DESCONTOS ---");
  {
    assert(
      pricingAndFaq.includes("R$ 0") || pricingAndFaq.includes("Gratuito"),
      "Plano FREE informado com preço R$ 0 / Gratuito"
    );
    assert(
      pricingAndFaq.includes("19,90") && pricingAndFaq.includes("99,00"),
      "Preços do Plano PRO (R$ 19,90/mês e R$ 99,00/ano) informados"
    );
    assert(
      pricingAndFaq.includes("29,90") && pricingAndFaq.includes("199,00"),
      "Preços do Plano BUSINESS (R$ 29,90/mês e R$ 199,00/ano) informados"
    );

    const proDiscount = calculateAnnualDiscountPercent(19.9, 99.0);
    const bizDiscount = calculateAnnualDiscountPercent(29.9, 199.0);
    assert(proDiscount >= 58 && proDiscount <= 59, `Desconto PRO anual calculado: ${proDiscount}%`);
    assert(bizDiscount >= 44 && bizDiscount <= 45, `Desconto BUSINESS anual: ${bizDiscount}%`);

    assert(
      pricingAndFaq.includes("calculateAnnualDiscountPercent"),
      "Uso de calculateAnnualDiscountPercent para cálculo dinâmico na UI"
    );
  }

  console.log("\n--- 9. FAQ COM AS 8 PERGUNTAS OFICIAIS ---");
  {
    const requiredFaqQuestions = [
      "O que é um QR Code Dinâmico?",
      "Os QR Codes expiram se eu parar de pagar?",
      "Qual a diferença entre QR estático e dinâmico?",
      "Como funciona o Analytics?",
      "O plano FREE precisa de cartão?",
      "Como funciona o limite de QR Codes?",
      "Posso cancelar ou deixar de renovar?",
      "Como funciona o pagamento?",
    ];

    for (const q of requiredFaqQuestions) {
      assert(pricingAndFaq.includes(q), `Pergunta FAQ '${q}' presente`);
    }
  }

  console.log("\n--- 10. SEGURANÇA, PRIVACIDADE & CONFIANÇA ---");
  {
    assert(
      homePage.includes("Mercado Pago") &&
        homePage.includes("Privacidade por Design") &&
        homePage.includes("Infraestrutura em Nuvem"),
      "Pilares de confiança (Mercado Pago, Privacidade por Design, Infraestrutura em Nuvem) presentes"
    );

    assert(
      homePage.includes("SHA-256") || pricingAndFaq.includes("SHA-256"),
      "Menção explícita à anonimização por hash SHA-256 para privacidade"
    );
  }

  console.log("\n--- 11. CTA FINAL & FOOTER INSTITUCIONAL ---");
  {
    assert(
      homePage.includes("Seu próximo QR Code começa aqui."),
      "Headline do CTA final presente"
    );

    assert(
      homePage.includes(
        "Crie sua conta gratuita em menos de 1 minuto e comece a gerar conexões reais com o seu público."
      ),
      "Subheadline do CTA final presente"
    );

    assert(
      homePage.includes("Master Digital"),
      "Menção institucional à Master Digital presente no Footer"
    );

    assert(
      homePage.includes("https://wa.me/5531985029353"),
      "Link oficial de WhatsApp da Master Digital presente"
    );

    assert(
      homePage.includes('href="/terms"') && homePage.includes('href="/privacy"'),
      "Links para Termos de Uso e Política de Privacidade presentes no Footer"
    );
  }

  console.log("\n--- 12. PÁGINAS LEGAIS (/terms e /privacy) ---");
  {
    assert(
      termsPage.includes("Termos de Uso") && termsPage.includes("Master Digital"),
      "Página /terms existe e menciona os Termos de Uso da Master Digital"
    );

    assert(
      privacyPage.includes("Política de Privacidade") &&
        privacyPage.includes("LGPD") &&
        privacyPage.includes("SHA-256"),
      "Página /privacy existe e detalha conformidade LGPD com SHA-256"
    );
  }

  console.log("\n--- 13. AUDITORIA DE TYPO '+ + Criar QR Code' ---");
  {
    assert(
      !dashboard.includes("<span>+ Criar QR Code</span>") &&
        !dashboard.includes("+ + Criar QR Code"),
      "Dashboard não possui duplicação '+ + Criar QR Code'"
    );

    assert(
      !myQrs.includes("<span>+ Criar QR Code</span>") &&
        !myQrs.includes("+ + Criar QR Code"),
      "Página My QRs não possui duplicação '+ + Criar QR Code'"
    );
  }

  console.log("\n--- 14. AUSÊNCIA DE DEPOIMENTOS/MÉTRICAS FALSAS ---");
  {
    const forbiddenClaims = [
      "99.9% de satisfação",
      "Mais de 50.000 clientes satisfeitos",
      "Recomendado por 10.000 empresas",
      "Avaliação 5 estrelas no Trustpilot",
      "Depoimento de",
    ];

    for (const claim of forbiddenClaims) {
      assert(
        !homePage.includes(claim) && !pricingAndFaq.includes(claim),
        `Ausência de alegação fabricada ou métrica inflada: '${claim}'`
      );
    }
  }

  console.log("\n=======================================================");
  console.log(`🎉 SUÍTE DA LANDING PAGE CONCLUÍDA: ${passedTests}/${totalTests} testes aprovados!`);
  console.log("=======================================================\n");
}

runLandingPageTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 FALHA NA SUÍTE DA LANDING PAGE:", err);
    process.exit(1);
  });
