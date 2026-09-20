import fs from "fs";
import path from "path";
import { calculateAnnualDiscountPercent } from "../src/lib/permissions";
import { REASON_CONFIG } from "../src/components/UpgradeModal";

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

async function runCopyAndWhatsAppTestSuite() {
  console.log("\n=======================================================");
  console.log("🔍 INICIANDO TESTES DE COPY E SUPORTE VIA WHATSAPP");
  console.log("=======================================================\n");

  const files = {
    settings: readFile("src/app/(dashboard)/settings/page.tsx"),
    upgradeModal: readFile("src/components/UpgradeModal.tsx"),
    pricingAndFaq: readFile("src/components/landing/PricingAndFaq.tsx"),
    homePage: readFile("src/app/page.tsx"),
    dashboard: readFile("src/app/(dashboard)/dashboard/page.tsx"),
    create: readFile("src/app/(dashboard)/create/page.tsx"),
    sidebar: readFile("src/components/layout/Sidebar.tsx"),
    login: readFile("src/app/(auth)/login/page.tsx"),
  };

  console.log("--- 1. AUSÊNCIA DE TEXTOS PROIBIDOS / ALEGAÇÕES NÃO COMPROVADAS ---");
  {
    // A) "Mais Popular" / "MAIS POPULAR"
    assert(
      !files.settings.includes("Mais Popular") && !files.settings.includes("MAIS POPULAR"),
      "Ausência de 'Mais Popular' na página de configurações e planos"
    );
    assert(
      !files.pricingAndFaq.includes("Mais Popular") && !files.pricingAndFaq.includes("MAIS POPULAR"),
      "Ausência de 'Mais Popular' na landing page / tabela de preços"
    );
    assert(
      !files.pricingAndFaq.includes("Mais Completo"),
      "Ausência de 'Mais Completo' substituído por identificação factual 'Plano PRO'"
    );

    // B) "Plano PRO Oficial"
    assert(
      !files.upgradeModal.includes("Plano PRO Oficial"),
      "Ausência de 'Plano PRO Oficial' no UpgradeModal"
    );

    // C) "Cobrança Mensal Recorrente"
    assert(
      !files.settings.includes("Cobrança Mensal Recorrente"),
      "Ausência de 'Cobrança Mensal Recorrente' no checkout de configurações"
    );

    // D) "Liberação imediata em segundos" / "assim que pago no banco"
    assert(
      !files.settings.includes("Liberação imediata em segundos"),
      "Ausência de 'Liberação imediata em segundos' no checkout Pix"
    );
    assert(
      !files.settings.includes("assim que pago no banco"),
      "Ausência de 'assim que pago no banco' no checkout Pix"
    );

    // E) Alegações inadequadas de "em tempo real"
    assert(
      !files.upgradeModal.includes("Redirecionamento em tempo real"),
      "UpgradeModal não alega redirecionamento em tempo real com SLA/alta disponibilidade"
    );
    assert(
      !files.upgradeModal.includes("Métricas & Analytics LGPD em Tempo Real"),
      "UpgradeModal não usa 'em tempo real' para analytics sem websocket"
    );
    assert(
      !files.dashboard.includes("Painel em Tempo Real"),
      "Dashboard não usa 'Painel em Tempo Real' sem websocket"
    );
    assert(
      !files.dashboard.includes("Métricas & Analytics LGPD em Tempo Real"),
      "Dashboard usa descrição factual para métricas e estatísticas"
    );
    assert(
      !files.create.includes("Preview em Tempo Real"),
      "Create usa descrição factual 'Preview Interativo'"
    );
    assert(
      !files.login.includes("em tempo real"),
      "Página de Login não alega 'em tempo real' no hero"
    );
  }

  console.log("\n--- 2. PRESENÇA DE TEXTOS SUBSTITUTOS CORRETOS E FACTUAIS ---");
  {
    // A) UpgradeModal
    assert(
      files.upgradeModal.includes("Plano PRO"),
      "UpgradeModal utiliza identificação factual 'Plano PRO'"
    );
    assert(
      REASON_CONFIG["DYNAMIC_QR"].highlights.includes("Altere o destino do QR sempre que precisar"),
      "UpgradeModal possui highlight factual para edição de destino quando precisar"
    );
    assert(
      REASON_CONFIG["ANALYTICS"].title === "Métricas e Estatísticas de Escaneamentos",
      "UpgradeModal possui título factual para métricas e estatísticas"
    );

    // B) Settings
    assert(
      files.settings.includes("Plano mensal — 30 dias de acesso"),
      "Settings utiliza 'Plano mensal — 30 dias de acesso' informando modelo pré-pago"
    );
    assert(
      files.settings.includes("Plano anual — 365 dias de acesso"),
      "Settings utiliza 'Plano anual — 365 dias de acesso' informando período anual"
    );
    assert(
      files.settings.includes("Ativação após a confirmação do pagamento pelo Mercado Pago."),
      "Settings descreve ativação do Pix após confirmação pelo Mercado Pago"
    );
  }

  console.log("\n--- 3. CÁLCULO CONSISTENTE DE DESCONTOS ANUAIS ---");
  {
    // PRO: 19.90 mensal vs 99.00 anual
    const proDiscount = calculateAnnualDiscountPercent(19.9, 99.0);
    // (19.9 * 12 - 99) / (19.9 * 12) = (238.8 - 99) / 238.8 = 139.8 / 238.8 = 58.54% -> 59% or 58%
    assert(proDiscount >= 58 && proDiscount <= 59, `Desconto PRO anual calculado consistentemente: ${proDiscount}%`);

    // BUSINESS: 29.90 mensal vs 199.00 anual
    const bizDiscount = calculateAnnualDiscountPercent(29.9, 199.0);
    // (29.9 * 12 - 199) / (29.9 * 12) = (358.8 - 199) / 358.8 = 159.8 / 358.8 = 44.53% -> 45% or 44%
    assert(bizDiscount >= 44 && bizDiscount <= 45, `Desconto BUSINESS anual calculado consistentemente: ${bizDiscount}%`);

    // Não há constantes mágicas desconectadas no PricingAndFaq
    assert(
      files.pricingAndFaq.includes("calculateAnnualDiscountPercent"),
      "PricingAndFaq importa e utiliza calculateAnnualDiscountPercent para os descontos"
    );
  }

  console.log("\n--- 4. WHATSAPP OFICIAL & SEGURANÇA DOS LINKS ---");
  {
    const OFFICIAL_NUMBER = "5531985029353";
    const OFFICIAL_BASE = "https://wa.me/5531985029353";

    // A) Número oficial estritamente respeitado
    assert(
      files.settings.includes(OFFICIAL_BASE),
      "Settings utiliza URL oficial https://wa.me/5531985029353"
    );
    assert(
      files.sidebar.includes(OFFICIAL_BASE),
      "Sidebar utiliza URL oficial https://wa.me/5531985029353"
    );
    assert(
      files.pricingAndFaq.includes(OFFICIAL_BASE),
      "PricingAndFaq utiliza URL oficial https://wa.me/5531985029353"
    );
    assert(
      files.homePage.includes(OFFICIAL_BASE),
      "Landing Page Footer utiliza URL oficial https://wa.me/5531985029353"
    );

    // B) Mensagem de assinante (PRO / BUSINESS)
    const subscriberMsg = "Olá! Sou cliente do QR MASTER e preciso de ajuda.";
    const encodedSubscriberMsg = encodeURIComponent(subscriberMsg);
    assert(
      files.settings.includes(encodedSubscriberMsg),
      "Mensagem do suporte para assinantes está devidamente codificada com encodeURIComponent"
    );
    assert(
      files.sidebar.includes(encodedSubscriberMsg),
      "Mensagem da sidebar para assinantes está devidamente codificada com encodeURIComponent"
    );

    // C) Atributos de segurança e acessibilidade
    const allWhatsAppInstances = [
      { name: "settings", code: files.settings },
      { name: "sidebar", code: files.sidebar },
      { name: "pricingAndFaq", code: files.pricingAndFaq },
      { name: "homePage", code: files.homePage },
    ];

    for (const inst of allWhatsAppInstances) {
      assert(
        inst.code.includes('target="_blank"'),
        `Instância de WhatsApp em ${inst.name} possui target="_blank"`
      );
      assert(
        inst.code.includes('rel="noopener noreferrer"'),
        `Instância de WhatsApp em ${inst.name} possui rel="noopener noreferrer"`
      );
      assert(
        inst.code.includes("aria-label="),
        `Instância de WhatsApp em ${inst.name} possui atributo acessível aria-label`
      );
    }

    // D) Ausência total de dados pessoais sensíveis na URL
    const sensitiveTokens = [
      "user.email",
      "user.name",
      "user.id",
      "user.phone",
      "session.id",
      "session.email",
      "subscriptionId",
      "paymentId",
      "password",
      "token",
    ];

    for (const inst of allWhatsAppInstances) {
      const waUrls = inst.code.match(/https:\/\/wa\.me\/[^\s"'>]+/g) || [];
      for (const url of waUrls) {
        for (const token of sensitiveTokens) {
          assert(
            !url.includes(`\${${token}}`) && !url.includes(`{${token}}`),
            `URL do WhatsApp em ${inst.name} não interpola dado pessoal sensível (${token})`
          );
        }
      }
    }
  }

  console.log("\n--- 5. DISTINÇÃO ENTRE ASSINANTES (PRO/BUSINESS) E FREE ---");
  {
    // A) Na Sidebar:
    assert(
      files.sidebar.includes('quota?.planName === "PRO" || quota?.planName === "BUSINESS"'),
      "Sidebar exibe 'Suporte WhatsApp' condicionado exclusivamente a planos PRO ou BUSINESS"
    );

    // B) Em Settings:
    assert(
      files.settings.includes('userPlan?.name === "PRO" || userPlan?.name === "BUSINESS"'),
      "Settings exibe 'Suporte via WhatsApp' para assinantes PRO e BUSINESS"
    );
    assert(
      files.settings.includes("Suporte via WhatsApp") && files.settings.includes("Chamar no WhatsApp"),
      "Settings possui chamada específica de suporte para assinantes"
    );
    assert(
      files.settings.includes("Contato") && files.settings.includes("Falar pelo WhatsApp"),
      "Settings possui contato geral distinto para usuários do plano FREE"
    );

    // C) Ausência de botão flutuante global
    assert(
      !files.homePage.includes("fixed bottom-") && !files.sidebar.includes("fixed bottom-4 right-4"),
      "Não foi introduzido botão flutuante global em todas as telas"
    );
  }

  console.log("\n=======================================================");
  console.log(`🎉 SUÍTE DE COPY & WHATSAPP CONCLUÍDA: ${passedTests}/${totalTests} testes aprovados!`);
  console.log("=======================================================\n");
}

runCopyAndWhatsAppTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 FALHA NA SUÍTE DE COPY & WHATSAPP:", err);
    process.exit(1);
  });
