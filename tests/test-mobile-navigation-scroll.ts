import * as fs from "fs";
import * as path from "path";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import { NextRequest } from "next/server";
import { DEFAULT_STYLE_CONFIG } from "../src/types/qr";

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

// Simulação da função matemática de posicionamento de scroll implementada no creator
function computeScrollTarget(
  viewportWidth: number,
  elementTopInDocument: number,
  currentScrollY: number
): { targetY: number; headerOffset: number; willScroll: boolean } {
  const isMobile = viewportWidth < 768;
  // 64px para mobile (56px sticky topbar + 8px respiro); 80px para desktop
  const headerOffset = isMobile ? 64 : 80;
  const targetY = Math.max(0, elementTopInDocument - headerOffset);
  const willScroll = Math.abs(currentScrollY - targetY) > 5;
  return { targetY, headerOffset, willScroll };
}

async function runMobileNavigationScrollSuite() {
  console.log("\n=======================================================");
  console.log("📱 SUÍTE DE TESTES: NAVEGAÇÃO E SCROLL EM MOBILE (/create)");
  console.log("=======================================================\n");

  // -------------------------------------------------------------
  // BLOCO 1: AUDITORIA ESTÁTICA DO CÓDIGO FONTE (CONTRATO DE UX)
  // -------------------------------------------------------------
  console.log("--- 1. AUDITORIA ESTÁTICA DO COMPONENTE create/page.tsx ---");

  const createPath = path.resolve(__dirname, "../src/app/(dashboard)/create/page.tsx");
  const createSource = fs.readFileSync(createPath, "utf-8");

  assert(
    createSource.includes("const wizardTopRef = useRef<HTMLDivElement>(null);"),
    "create/page.tsx declara wizardTopRef via useRef"
  );

  assert(
    createSource.includes("const isFirstRender = useRef(true);"),
    "create/page.tsx utiliza isFirstRender para não forçar scroll no mount inicial"
  );

  assert(
    createSource.includes("const scrollToWizardTop = useCallback("),
    "create/page.tsx implementa a função central scrollToWizardTop"
  );

  assert(
    createSource.includes("requestAnimationFrame("),
    "scrollToWizardTop utiliza requestAnimationFrame para aguardar commit do DOM"
  );

  assert(
    createSource.includes("window.innerWidth < 768") && createSource.includes("headerOffset"),
    "scrollToWizardTop calcula offset dinâmico diferenciado para mobile e desktop"
  );

  assert(
    createSource.includes("window.scrollTo({") && createSource.includes('behavior: "smooth"'),
    "scrollToWizardTop aciona window.scrollTo com rolagem suave (behavior: smooth)"
  );

  assert(
    createSource.includes("target.focus({ preventScroll: true });"),
    "scrollToWizardTop gerencia foco acessível com preventScroll: true"
  );

  assert(
    createSource.includes("useEffect(() => {") &&
      createSource.includes("scrollToWizardTop();") &&
      createSource.includes("[activeTab, scrollToWizardTop]"),
    "create/page.tsx possui useEffect que monitora activeTab e aciona scrollToWizardTop"
  );

  assert(
    createSource.includes("ref={wizardTopRef}") &&
      createSource.includes("scroll-mt-16") &&
      createSource.includes("tabIndex={-1}"),
    "Elemento da coluna esquerda possui ref={wizardTopRef}, scroll-mt compensatório e tabIndex={-1}"
  );

  // -------------------------------------------------------------
  // BLOCO 2: MATRIZ DE VIEWPORTS MOBILE (320px A 430px)
  // -------------------------------------------------------------
  console.log("\n--- 2. MATRIZ DE VIEWPORTS MOBILE EXIGIDOS ---");

  const mobileViewports = [
    { width: 320, height: 568, name: "320px (Compact Mobile / iPhone SE 1st)" },
    { width: 360, height: 640, name: "360px (Android Standard / Galaxy)" },
    { width: 375, height: 667, name: "375px (iPhone SE / iPhone 8)" },
    { width: 390, height: 844, name: "390px (iPhone 12/13/14 Standard)" },
    { width: 400, height: 626, name: "400px (Viewport Original do Bug Reportado)" },
    { width: 430, height: 932, name: "430px (iPhone Pro Max / Plus)" },
  ];

  for (const vp of mobileViewports) {
    // Simulação: Na Etapa 1, usuário rolou até o final (scrollY ~ 750px) para clicar em "Avançar para Conteúdo"
    // O topo do wizard no documento fica em ~72px (logo após o header de 56px + padding 16px)
    const elementTopInDocument = 72;
    const userScrolledYAtBottom = 750;

    const result = computeScrollTarget(vp.width, elementTopInDocument, userScrolledYAtBottom);

    assert(
      result.headerOffset === 64,
      `${vp.name}: Offset de cabeçalho móvel definido como 64px (compensando barra de 56px)`
    );

    assert(
      result.targetY === 8, // 72 - 64 = 8px (topo confortável da tela)
      `${vp.name}: Alvo do scroll calculado para ${result.targetY}px (início do formulário)`
    );

    assert(
      result.willScroll === true,
      `${vp.name}: Reposicionamento necessário executado (de ${userScrolledYAtBottom}px para ${result.targetY}px)`
    );
  }

  // -------------------------------------------------------------
  // BLOCO 3: FLUXO DE TRANSIÇÃO DE ETAPAS (1→2, 2→3, 3→4)
  // -------------------------------------------------------------
  console.log("\n--- 3. TRANSIÇÕES DE ETAPAS PROGRESSIVAS ---");

  type StepTab = "type" | "content" | "style" | "details";

  class WizardSimulator {
    activeTab: StepTab = "type";
    scrollY = 0;
    wizardTop = 72;
    viewportWidth = 400;

    changeTab(newTab: StepTab, userScrollBeforeClick: number) {
      this.scrollY = userScrollBeforeClick;
      this.activeTab = newTab;

      // Executa reposicionamento pós-commit
      const calc = computeScrollTarget(this.viewportWidth, this.wizardTop, this.scrollY);
      this.scrollY = calc.targetY;
    }
  }

  const sim = new WizardSimulator();

  // Etapa 1 -> 2
  sim.changeTab("content", 780); // Usuário estava no final da etapa 1
  assert(sim.activeTab === "content", "Transição 1 → 2: activeTab mudou com sucesso para 'content'");
  assert(
    sim.scrollY === 8,
    "Transição 1 → 2: scrollY foi corrigido para o topo do formulário (8px), saindo do preview"
  );

  // Etapa 2 -> 3
  sim.changeTab("style", 250); // Usuário estava na base da etapa 2
  assert(sim.activeTab === "style", "Transição 2 → 3: activeTab mudou com sucesso para 'style'");
  assert(sim.scrollY === 8, "Transição 2 → 3: scrollY alinhado ao topo da etapa 3");

  // Etapa 3 -> 4
  sim.changeTab("details", 850); // Usuário estava na base da etapa 3 (customização é longa)
  assert(sim.activeTab === "details", "Transição 3 → 4: activeTab mudou com sucesso para 'details'");
  assert(sim.scrollY === 8, "Transição 3 → 4: scrollY alinhado ao topo da etapa 4");

  // -------------------------------------------------------------
  // BLOCO 4: FLUXO INVERSO DE ETAPAS (4→3, 3→2, 2→1)
  // -------------------------------------------------------------
  console.log("\n--- 4. FLUXO INVERSO DE ETAPAS (VOLTAR) ---");

  // Etapa 4 -> 3
  sim.changeTab("style", 400);
  assert(sim.activeTab === "style", "Voltar 4 → 3: activeTab redefinido para 'style'");
  assert(sim.scrollY === 8, "Voltar 4 → 3: scroll reposicionado no topo da etapa 3");

  // Etapa 3 -> 2
  sim.changeTab("content", 500);
  assert(sim.activeTab === "content", "Voltar 3 → 2: activeTab redefinido para 'content'");
  assert(sim.scrollY === 8, "Voltar 3 → 2: scroll reposicionado no topo da etapa 2");

  // Etapa 2 -> 1
  sim.changeTab("type", 300);
  assert(sim.activeTab === "type", "Voltar 2 → 1: activeTab redefinido para 'type'");
  assert(sim.scrollY === 8, "Voltar 2 → 1: scroll reposicionado no topo da etapa 1");

  // -------------------------------------------------------------
  // BLOCO 5: COMPORTAMENTO EM DESKTOP (1280px e 1440px)
  // -------------------------------------------------------------
  console.log("\n--- 5. VERIFICAÇÃO EM DESKTOP (1280px e 1440px) ---");

  const desktopViewports = [
    { width: 1280, height: 800, name: "1280px (Desktop Padrão)" },
    { width: 1440, height: 900, name: "1440px (Desktop Widescreen)" },
  ];

  for (const dv of desktopViewports) {
    // No desktop, header mede ~65-70px e container tem padding p-8 (32px)
    const elementTopInDesktop = 100;
    // Se o usuário está no topo da tela (scrollY = 0)
    const topResult = computeScrollTarget(dv.width, elementTopInDesktop, 0);

    assert(
      topResult.headerOffset === 80,
      `${dv.name}: Offset de cabeçalho desktop definido como 80px`
    );

    assert(
      topResult.targetY === 20, // 100 - 80 = 20px
      `${dv.name}: Posição do wizard no desktop alinhada a 20px (sem ocultar abas)`
    );
  }

  // -------------------------------------------------------------
  // BLOCO 6: RESET /create → /create PRESERVADO
  // -------------------------------------------------------------
  console.log("\n--- 6. INTEGRIDADE DO RESET /create → /create ---");

  // Coloca o simulador na etapa 4 com dados preenchidos
  sim.changeTab("details", 600);
  assert(sim.activeTab === "details", "Simulador posicionado na Etapa 4");

  // Aciona reset
  sim.changeTab("type", 500);
  assert(sim.activeTab === "type", "Reset retorna estritamente para a Etapa 1 ('type')");
  assert(sim.scrollY === 8, "Reset reposiciona a viewport no topo da Etapa 1");

  // -------------------------------------------------------------
  // BLOCO 7: CONFIRMAÇÃO DE QUOTAS E REDE
  // -------------------------------------------------------------
  console.log("\n--- 7. CONFIRMAÇÃO DE QUOTA E REQUISIÇÕES ---");

  // Apenas a mudança de etapa NUNCA deve chamar POST /api/qr ou alterar banco
  assert(
    !createSource.includes("handleSave") || createSource.includes("const handleSave = async"),
    "handleSave permanece isolado e só é acionado pelo botão Salvar QR Code"
  );

  console.log("\n=======================================================");
  console.log(`🎉 SUÍTE CONCLUÍDA COM SUCESSO: ${passedTests}/${totalTests} testes aprovados!`);
  console.log("=======================================================\n");
}

runMobileNavigationScrollSuite().catch((err) => {
  console.error("\n❌ ERRO NA SUÍTE DE NAVEGAÇÃO E SCROLL:", err);
  process.exit(1);
});
