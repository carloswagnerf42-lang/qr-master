import fs from "fs";
import path from "path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] ${message}`);
}

async function run() {
  console.log("\n=======================================================");
  console.log("📚 SUÍTE DE TESTES: AJUDA & DOCS /dashboard/help");
  console.log("=======================================================\n");

  const sidebarPath = path.resolve(__dirname, "../src/components/layout/Sidebar.tsx");
  const helpPagePath = path.resolve(__dirname, "../src/app/(dashboard)/dashboard/help/page.tsx");

  assert(fs.existsSync(sidebarPath), "Sidebar.tsx existe");
  assert(fs.existsSync(helpPagePath), "src/app/(dashboard)/dashboard/help/page.tsx existe");

  const sidebarContent = fs.readFileSync(sidebarPath, "utf-8");
  const helpContent = fs.readFileSync(helpPagePath, "utf-8");

  console.log("--- 1. NAVEGAÇÃO DA SIDEBAR ---");
  assert(
    sidebarContent.includes('{ name: "Ajuda & Docs", href: "/dashboard/help", icon: HelpCircle }'),
    "Sidebar aponta 'Ajuda & Docs' estritamente para '/dashboard/help'"
  );
  assert(
    !sidebarContent.includes('{ name: "Ajuda & Docs", href: "#"'),
    "Sidebar não possui mais href='#' para 'Ajuda & Docs'"
  );

  console.log("\n--- 2. CABEÇALHO E ESTRUTURA DO LAYOUT ---");
  assert(
    helpContent.includes('title="Ajuda & Documentação"'),
    "Página inclui título oficial 'Ajuda & Documentação'"
  );
  assert(
    helpContent.includes('subtitle="Encontre respostas rápidas, políticas e informações oficiais do QR MASTER."'),
    "Página inclui subtítulo oficial"
  );
  assert(
    helpContent.includes("<Header"),
    "Página utiliza o componente Header padrão do dashboard"
  );

  console.log("\n--- 3. SEÇÃO 1: PERGUNTAS FREQUENTES (ACCORDION) ---");
  const expectedQuestions = [
    "O que é um QR Code Dinâmico?",
    "Os QR Codes expiram?",
    "Qual a diferença entre QR estático e dinâmico?",
    "Como funciona o Analytics?",
    "O plano FREE precisa de cartão?",
    "Como funciona o limite de QR Codes?",
    "Posso cancelar quando quiser?",
    "Como funciona o pagamento?",
  ];

  for (const q of expectedQuestions) {
    assert(helpContent.includes(q), `FAQ contém a pergunta obrigatória: '${q}'`);
  }

  assert(
    helpContent.includes("toggleFaq") && helpContent.includes("openFaqIndex"),
    "Accordion implementa gerenciamento de estado para expandir/recolher"
  );
  assert(
    helpContent.includes("aria-expanded={isOpen}"),
    "Accordion inclui acessibilidade aria-expanded"
  );
  assert(
    helpContent.includes("ChevronDown"),
    "Accordion exibe ícone Chevron com rotação indicadora de abertura"
  );

  console.log("\n--- 4. SEÇÃO 2: POLÍTICAS (CARDS) ---");
  assert(
    helpContent.includes("Política de Privacidade"),
    "Card 1 contém o título 'Política de Privacidade'"
  );
  assert(
    helpContent.includes("Como protegemos seus dados e informações de escaneamento."),
    "Card 1 contém a descrição exata solicitada"
  );
  assert(
    helpContent.includes('href="/privacy"'),
    "Card 1 possui botão abrindo '/privacy'"
  );
  assert(
    helpContent.includes("Ler Política"),
    "Card 1 possui texto de botão 'Ler Política'"
  );

  assert(
    helpContent.includes("Termos de Uso"),
    "Card 2 contém o título 'Termos de Uso'"
  );
  assert(
    helpContent.includes("Regras de utilização da plataforma QR MASTER."),
    "Card 2 contém a descrição exata solicitada"
  );
  assert(
    helpContent.includes('href="/terms"'),
    "Card 2 possui botão abrindo '/terms'"
  );
  assert(
    helpContent.includes("Ler Termos"),
    "Card 2 possui texto de botão 'Ler Termos'"
  );

  console.log("\n--- 5. SEÇÃO 3: SUPORTE WHATSAPP ---");
  assert(
    helpContent.includes("bg-emerald-950"),
    "Card de suporte possui fundo verde escuro destacado (bg-emerald-950)"
  );
  assert(
    helpContent.includes("Precisa de ajuda?"),
    "Card de suporte contém o título 'Precisa de ajuda?'"
  );
  assert(
    helpContent.includes("Nossa equipe responde diretamente pelo WhatsApp."),
    "Card de suporte contém o texto 'Nossa equipe responde diretamente pelo WhatsApp.'"
  );
  assert(
    helpContent.includes("Falar no WhatsApp"),
    "Card de suporte contém botão 'Falar no WhatsApp'"
  );
  assert(
    helpContent.includes("bg-emerald-500"),
    "Botão do WhatsApp é verde destacado (bg-emerald-500)"
  );
  assert(
    helpContent.includes('href="https://wa.me/5531985029353"'),
    "Botão do WhatsApp aponta para o número oficial https://wa.me/5531985029353"
  );
  assert(
    helpContent.includes('target="_blank"') && helpContent.includes('rel="noopener noreferrer"'),
    "Link do WhatsApp abre com segurança em nova aba (target='_blank' e rel='noopener noreferrer')"
  );

  console.log("\n=======================================================");
  console.log("🎉 SUÍTE /dashboard/help CONCLUÍDA COM 100% DE SUCESSO!");
  console.log("=======================================================\n");
}

run();
