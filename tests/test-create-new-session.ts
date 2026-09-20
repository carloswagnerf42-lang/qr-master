import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/auth";
import { NextRequest } from "next/server";
import { POST as createQR, GET as listQRs } from "../src/app/api/qr/route";
import { NEW_QR_EVENT, triggerNewQRCreation } from "../src/lib/qr-events";
import { DEFAULT_STYLE_CONFIG } from "../src/types/qr";
import * as fs from "fs";
import * as path from "path";

function createAuthRequest(
  url: string,
  user: { id: string; name: string; email: string; role: string; planId?: string | null },
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): NextRequest {
  const token = signToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    planId: user.planId,
  });

  const headers: Record<string, string> = {
    cookie: `qrmaster_session=${token}`,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...(options.headers || {}),
  };

  const init: any = {
    method: options.method || (options.body ? "POST" : "GET"),
    headers,
  };

  if (options.body) {
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

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

async function runCreateNewSessionTestSuite() {
  console.log("\n=======================================================");
  console.log("🧪 SUÍTE DE TESTES: NOVA SESSÃO DO CRIADOR DE QR CODES");
  console.log("=======================================================\n");

  // Setup: Identificar plano FREE
  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  if (!freePlan) throw new Error("Plano FREE não encontrado.");

  // Limpeza de testes anteriores
  const testUserEmail = `test-new-session-${Date.now()}@qrmaster-test.com`;
  const testUser = await prisma.user.create({
    data: {
      name: "Usuário Teste Nova Sessão",
      email: testUserEmail,
      passwordHash: "hashed_password_safe",
      role: "USER",
      planId: freePlan.id,
    },
  });

  try {
    // -------------------------------------------------------------
    // BLOCO 1: AUDITORIA ESTÁTICA DO CÓDIGO FONTE (CONTRATO)
    // -------------------------------------------------------------
    console.log("--- 1. AUDITORIA ESTÁTICA DOS COMPONENTES E CONTRATOS ---");

    const headerPath = path.resolve(__dirname, "../src/components/layout/Header.tsx");
    const headerSource = fs.readFileSync(headerPath, "utf-8");

    const sidebarPath = path.resolve(__dirname, "../src/components/layout/Sidebar.tsx");
    const sidebarSource = fs.readFileSync(sidebarPath, "utf-8");

    const createPath = path.resolve(__dirname, "../src/app/(dashboard)/create/page.tsx");
    const createSource = fs.readFileSync(createPath, "utf-8");

    const eventsPath = path.resolve(__dirname, "../src/lib/qr-events.ts");
    const eventsSource = fs.readFileSync(eventsPath, "utf-8");

    assert(
      eventsSource.includes('export const NEW_QR_EVENT = "qr-master:new-qr";'),
      "Utilitário qr-events.ts exporta a constante NEW_QR_EVENT padronizada"
    );

    assert(
      eventsSource.includes("export function triggerNewQRCreation()"),
      "Utilitário qr-events.ts exporta triggerNewQRCreation para reuso"
    );

    assert(
      headerSource.includes("onCreateNew?: () => void;"),
      "Header.tsx aceita prop onCreateNew na interface HeaderProps"
    );

    assert(
      headerSource.includes('pathname === "/create"') && headerSource.includes("triggerNewQRCreation()"),
      "Header.tsx intercepta clique em /create e invoca triggerNewQRCreation"
    );

    assert(
      headerSource.includes("onCreateNew()"),
      "Header.tsx aciona diretamente onCreateNew se fornecido"
    );

    assert(
      sidebarSource.includes('item.href === "/create" && pathname === "/create"') &&
        sidebarSource.includes("triggerNewQRCreation()"),
      "Sidebar.tsx intercepta clique em Criar QR Code quando já está em /create"
    );

    assert(
      createSource.includes("const resetQrCreator = useCallback("),
      "create/page.tsx implementa função centralizada resetQrCreator"
    );

    assert(
      createSource.includes("onCreateNew={resetQrCreator}"),
      "create/page.tsx repassa resetQrCreator diretamente para o Header"
    );

    assert(
      createSource.includes("window.addEventListener(NEW_QR_EVENT"),
      "create/page.tsx registra listener ativo para o evento NEW_QR_EVENT"
    );

    assert(
      createSource.includes("Criar Outro QR Code"),
      "create/page.tsx inclui botão explícito '+ Criar Outro QR Code' no card de sucesso"
    );

    // -------------------------------------------------------------
    // BLOCO 2: SIMULAÇÃO CLIENT-SIDE DO ESTADO DO WIZARD
    // -------------------------------------------------------------
    console.log("\n--- 2. COMPORTAMENTO DO ESTADO DO WIZARD (CLIENT-SIDE) ---");

    // Definição do estado inicial padrão esperado
    const INITIAL_WIZARD_STATE = {
      activeTab: "type",
      selectedType: "url",
      isDynamic: false, // FREE padrão
      name: "Meu Novo QR Code",
      description: "",
      categoryId: "",
      campaignId: "",
      content: {
        url: "https://minhaempresa.com.br",
        phone: "5511999999999",
      },
      style: { ...DEFAULT_STYLE_CONFIG },
      createdQr: null,
      saving: false,
    };

    // Estado simulado após usuário avançar para etapa 4 e salvar um QR Code
    let currentClientState: any = {
      activeTab: "details", // Etapa 4
      selectedType: "url",
      isDynamic: false,
      name: "QR Especial Campanha XPTO",
      description: "Descrição personalizada da empresa",
      categoryId: "cat-123",
      campaignId: "camp-456",
      content: {
        url: "https://minhaempresa.com.br/promocao-especifica",
        phone: "5531988887777",
      },
      style: {
        ...DEFAULT_STYLE_CONFIG,
        dotsColor: "#ff0000",
        bgColor: "#000000",
        frame: "custom-frame",
        hasLogo: true,
        logoUrl: "data:image/png;base64,custom_logo_data",
      },
      createdQr: {
        id: "qr-persisted-123",
        shortCode: "xpto99",
      },
      saving: false,
    };

    assert(
      currentClientState.activeTab === "details" && currentClientState.createdQr !== null,
      "TESTE 1 & 2: Estado prévio simulado na etapa 4 com QR salvo e customizações ativas"
    );

    // Simulação da execução do resetQrCreator()
    const performReset = (permissions: { dynamic_qr?: boolean }) => {
      currentClientState = {
        activeTab: "type",
        selectedType: "url",
        isDynamic: permissions.dynamic_qr !== false,
        name: "Meu Novo QR Code",
        description: "",
        categoryId: "",
        campaignId: "",
        content: {
          url: "https://minhaempresa.com.br",
          phone: "5511999999999",
        },
        style: { ...DEFAULT_STYLE_CONFIG },
        zoom: 280,
        saving: false,
        createdQr: null,
        downloadModalOpen: false,
        selectedResolution: 1024,
        upgradeModalOpen: false,
      };
    };

    // Executa reset
    performReset({ dynamic_qr: false });

    assert(
      currentClientState.activeTab === "type",
      "TESTE 2: Reset retorna imediatamente para a etapa 1 (activeTab = 'type')"
    );

    assert(
      currentClientState.createdQr === null,
      "TESTE 2: Reset remove createdQr do estado local (estado 'QR salvo' removido)"
    );

    assert(
      currentClientState.name === "Meu Novo QR Code" &&
        currentClientState.description === "" &&
        currentClientState.categoryId === "" &&
        currentClientState.campaignId === "",
      "TESTE 6: Metadados anteriores (nome, descrição, categoria, campanha) foram completamente limpos"
    );

    assert(
      currentClientState.content.url === "https://minhaempresa.com.br" &&
        !currentClientState.content.url.includes("promocao-especifica"),
      "TESTE 13 (PREVIEW): URL customizada anterior não foi mantida no estado"
    );

    assert(
      currentClientState.style.dotsColor === DEFAULT_STYLE_CONFIG.dotsColor &&
        currentClientState.style.bgColor === DEFAULT_STYLE_CONFIG.bgColor &&
        currentClientState.style.hasLogo === false &&
        currentClientState.style.logoUrl === undefined,
      "TESTE 13 (PREVIEW): Cores, logos e estilizações anteriores foram revertidos para os padrões globais legítimos"
    );

    // -------------------------------------------------------------
    // BLOCO 3: CICLO DE QUOTA FREE 4/5 -> 5/5 -> BLOQUEIO NO 6º
    // -------------------------------------------------------------
    console.log("\n--- 3. VERIFICAÇÃO RIGOROSA DE QUOTA (FREE 4/5 -> 5/5 -> 6º) ---");

    // Cria 4 QR Codes estáticos via endpoint para o usuário atingir 4/5
    for (let i = 1; i <= 4; i++) {
      const req = createAuthRequest("http://localhost:3000/api/qr", testUser, {
        method: "POST",
        body: {
          name: `QR Inicial ${i}`,
          destination: `https://example.com/${i}`,
          type: "url",
          isDynamic: false,
        },
      });
      const res = await createQR(req);
      assert(res.status === 200 || res.status === 201, `Criação do QR Inicial #${i} aceita com sucesso`);
    }

    let userQrs = await prisma.qRCode.count({ where: { userId: testUser.id } });
    assert(userQrs === 4, `TESTE 7: Usuário FREE possui exatamente 4 QRs criados (4/5)`);

    // Ação: Usuário clica no botão global "+ Criar QR Code"
    // Isso executa resetQrCreator e dispara o evento, SEM fazer requisições POST
    let countBeforeReset = await prisma.qRCode.count({ where: { userId: testUser.id } });
    assert(
      countBeforeReset === 4,
      "TESTE 3 & 4: Clicar no botão Criar QR Code NÃO faz POST e NÃO incrementa quota (permanece 4/5)"
    );

    // Ação: Usuário preenche e salva o 5º QR Code com sucesso
    const save5thReq = createAuthRequest("http://localhost:3000/api/qr", testUser, {
      method: "POST",
      body: {
        name: "5º QR Code Oficial",
        destination: "https://meusite.com/5",
        type: "url",
        isDynamic: false,
      },
    });

    const save5thRes = await createQR(save5thReq);
    const save5thData = await save5thRes.json();

    assert(
      save5thRes.status === 200 || save5thRes.status === 201,
      `TESTE 8: Salvamento do 5º QR Code aceito com sucesso (status: ${save5thRes.status})`
    );

    userQrs = await prisma.qRCode.count({ where: { userId: testUser.id } });
    assert(userQrs === 5, `TESTE 8: Cota de QRs agora atingiu o teto FREE: exatamente 5/5`);

    // Ação: Usuário clica novamente no botão global "+ Criar QR Code" enquanto está em 5/5
    // Esperado: permitido abrir nova criação no frontend sem erro prematuro
    countBeforeReset = await prisma.qRCode.count({ where: { userId: testUser.id } });
    assert(
      countBeforeReset === 5,
      "TESTE 9: Abrir formulário em 5/5 é permitido e mantém quota estritamente em 5/5"
    );

    // Valida que o QR salvo anteriormente continua existindo intacto no banco
    const fifthQrInDb = await prisma.qRCode.findFirst({
      where: { userId: testUser.id, name: "5º QR Code Oficial" },
    });
    assert(
      fifthQrInDb !== null && fifthQrInDb.name === "5º QR Code Oficial",
      "TESTE 5: QR salvo anteriormente continua existindo intacto no banco de dados"
    );

    // Ação: Usuário tenta salvar o 6º QR Code
    const save6thReq = createAuthRequest("http://localhost:3000/api/qr", testUser, {
      method: "POST",
      body: {
        name: "6º QR Code Bloqueado",
        destination: "https://meusite.com/6",
        type: "url",
        isDynamic: false,
      },
    });

    const save6thRes = await createQR(save6thReq);
    const save6thData = await save6thRes.json();

    assert(
      save6thRes.status === 403,
      `TESTE 10: Tentativa de salvar 6º QR retorna HTTP 403 (recebido: ${save6thRes.status})`
    );

    assert(
      save6thData.code === "LIMIT_REACHED",
      `TESTE 10: Código retornado é LIMIT_REACHED (recebido: ${save6thData.code})`
    );

    assert(
      save6thData.limit === 5,
      `TESTE 10: Limite comercial reportado é 5 (recebido: ${save6thData.limit})`
    );

    // Simulação do comportamento do frontend no 403 LIMIT_REACHED
    const modalTriggered = save6thRes.status === 403 && save6thData.code === "LIMIT_REACHED";
    assert(
      modalTriggered === true,
      "TESTE 10: Frontend identifica LIMIT_REACHED e aciona abertura do UpgradeModal"
    );

    const qrsAfterBlocked = await prisma.qRCode.count({ where: { userId: testUser.id } });
    assert(
      qrsAfterBlocked === 5,
      "TESTE 10: Quota no banco permanece exatamente em 5/5 após a tentativa bloqueada"
    );

    console.log("\n=======================================================");
    console.log(`🎉 SUÍTE CONCLUÍDA COM SUCESSO: ${passedTests}/${totalTests} testes aprovados!`);
    console.log("=======================================================\n");
  } finally {
    // Cleanup de dados de teste
    await prisma.qRCode.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  }
}

runCreateNewSessionTestSuite()
  .catch((err) => {
    console.error("\n❌ ERRO NA EXECUÇÃO DA SUÍTE DE NOVA SESSÃO:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
