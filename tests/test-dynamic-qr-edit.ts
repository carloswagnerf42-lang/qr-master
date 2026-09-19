/**
 * Testes Específicos: Edição de QR Codes Dinâmicos, Preservação de ShortCode,
 * Autorização / Anti-IDOR e Validação de URL
 */

import { validateAndNormalizeDestination } from "../src/lib/dynamic-redirect";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (detail) console.error(`    ${YELLOW}Detalhes:${RESET} ${detail}`);
  }
}

interface MockQR {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  type: string;
  isDynamic: boolean;
  shortCode: string | null;
  destination: string;
  status: "ACTIVE" | "INACTIVE";
  categoryId?: string | null;
  campaignId?: string | null;
  scanCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MockActivityLog {
  userId: string;
  action: string;
  entityId: string;
  description: string;
  createdAt: Date;
}

async function runDynamicQREditTests() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   ✏️  BATERIA DE TESTES: EDIÇÃO DE QR CODES DINÂMICOS & SEGURANÇA   ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  // Banco de dados em memória simulando estado real
  const mockDb = {
    qrs: [
      {
        id: "qr_alice_dyn_01",
        userId: "usr_alice",
        name: "Cardápio Principal - Mesas",
        description: "QR impresso nos displays de acrílico das mesas",
        type: "url",
        isDynamic: true,
        shortCode: "CARDAPIO1",
        destination: "https://restaurante.com.br/cardapio-inverno",
        status: "ACTIVE" as const,
        categoryId: "cat_restaurante",
        campaignId: "camp_inverno",
        scanCount: 342,
        createdAt: new Date(Date.now() - 30 * 86400000),
        updatedAt: new Date(Date.now() - 30 * 86400000),
      },
      {
        id: "qr_alice_static_02",
        userId: "usr_alice",
        name: "Wi-Fi Escritório",
        description: "QR estático",
        type: "wifi",
        isDynamic: false,
        shortCode: null,
        destination: "WIFI:S:Escritorio;T:WPA;P:senha123;;",
        status: "ACTIVE" as const,
        categoryId: null,
        campaignId: null,
        scanCount: 15,
        createdAt: new Date(Date.now() - 10 * 86400000),
        updatedAt: new Date(Date.now() - 10 * 86400000),
      },
    ] as MockQR[],
    logs: [] as MockActivityLog[],
  };

  // Simulador do controlador PUT /api/qr/[id]
  function simulatePutQr(
    sessionUserId: string | null,
    qrId: string,
    body: {
      name?: string;
      description?: string | null;
      destination?: string;
      categoryId?: string | null;
      campaignId?: string | null;
      status?: "ACTIVE" | "INACTIVE";
    }
  ) {
    if (!sessionUserId) {
      return { status: 401, error: "Não autorizado" };
    }

    // 1. Busca estrita por id e userId (Anti-IDOR)
    const existing = mockDb.qrs.find((q) => q.id === qrId && q.userId === sessionUserId);
    if (!existing) {
      return { status: 404, error: "QR Code não encontrado" };
    }

    // 2. Validação e sanitização de destino
    let finalDestination = existing.destination;
    if (body.destination !== undefined) {
      const destValidation = validateAndNormalizeDestination(body.destination, existing.shortCode);
      if (!destValidation.valid || !destValidation.sanitizedUrl) {
        return { status: 400, error: destValidation.error || "Destino inválido." };
      }
      finalDestination = destValidation.sanitizedUrl;
    }

    // 3. Atualização preservando estritamente shortCode e isDynamic
    const updated: MockQR = {
      ...existing,
      name: body.name !== undefined ? body.name.trim() : existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      destination: finalDestination,
      categoryId: body.categoryId !== undefined ? body.categoryId : existing.categoryId,
      campaignId: body.campaignId !== undefined ? body.campaignId : existing.campaignId,
      status: body.status !== undefined ? body.status : existing.status,
      updatedAt: new Date(),
      // Garante que shortCode e isDynamic NUNCA são modificados pela edição
      shortCode: existing.shortCode,
      isDynamic: existing.isDynamic,
      scanCount: existing.scanCount, // Preserva scans
    };

    const idx = mockDb.qrs.findIndex((q) => q.id === qrId);
    mockDb.qrs[idx] = updated;

    // Registra log de atividade
    mockDb.logs.push({
      userId: sessionUserId,
      action: "UPDATE_QR",
      entityId: updated.id,
      description: `QR Code "${updated.name}" foi atualizado.`,
      createdAt: new Date(),
    });

    return { status: 200, success: true, qrCode: updated };
  }

  // Simulador da rota pública de redirecionamento /q/[shortCode]
  function simulateRedirect(shortCode: string) {
    const qr = mockDb.qrs.find((q) => q.shortCode === shortCode);
    if (!qr) return { status: 404, error: "QR Code Não Encontrado" };
    if (qr.status !== "ACTIVE") return { status: 403, error: "QR Code Pausado" };
    return { status: 307, location: qr.destination };
  }

  // ====================================================================
  // CENÁRIO 1: Edição do Destino mantendo o mesmo shortCode e URL pública
  // ====================================================================
  console.log(`${YELLOW}▶ 1. Preservação de shortCode e Redirecionamento Dinâmico em Tempo Real:${RESET}`);

  const qrOriginal = mockDb.qrs.find((q) => q.id === "qr_alice_dyn_01")!;
  const appOrigin = "https://qrmasterpro.vercel.app";
  const publicPrintedUrl = `${appOrigin}/q/${qrOriginal.shortCode}`;

  // Verificação inicial: aponta para cardapio-inverno
  const initialRedirect = simulateRedirect(qrOriginal.shortCode!);
  assert(initialRedirect.status === 307, "Redirecionamento inicial retorna status 307");
  assert(initialRedirect.location === "https://restaurante.com.br/cardapio-inverno", "Destino inicial correto: cardapio-inverno");

  // Alice edita o QR para o cardápio de verão
  const editResult = simulatePutQr("usr_alice", "qr_alice_dyn_01", {
    name: "Cardápio Principal - Verão",
    destination: "https://restaurante.com.br/cardapio-verao-2026",
    description: "Atualizado para a temporada de verão",
  });

  assert(editResult.status === 200, "Edição do QR Code concluída com sucesso (status 200)");
  assert(editResult.qrCode?.name === "Cardápio Principal - Verão", "Nome atualizado corretamente");
  assert(editResult.qrCode?.destination === "https://restaurante.com.br/cardapio-verao-2026", "Destino no banco atualizado para novo endereço");
  assert(editResult.qrCode?.shortCode === "CARDAPIO1", "shortCode 'CARDAPIO1' FOI RIGOROSAMENTE PRESERVADO");
  assert(editResult.qrCode?.isDynamic === true, "Propriedade isDynamic continua true");

  // Verificação do redirecionamento após a edição:
  const newRedirect = simulateRedirect("CARDAPIO1");
  assert(newRedirect.status === 307, "Mesmo código /q/CARDAPIO1 continua respondendo com 307");
  assert(
    newRedirect.location === "https://restaurante.com.br/cardapio-verao-2026",
    "Mesmo código /q/CARDAPIO1 agora redireciona INSTANTANEAMENTE para o novo destino (cardapio-verao-2026)"
  );

  // Verificação da imagem impressa:
  const qrImageEncodedValue = `${appOrigin}/q/${editResult.qrCode?.shortCode}`;
  assert(
    qrImageEncodedValue === publicPrintedUrl,
    "Valor codificado na matriz do QR Code é 100% IDÊNTICO (NÃO exige reimpressão nem novo download)"
  );


  // ====================================================================
  // CENÁRIO 2: Preservação de Métricas, Scans e Histórico
  // ====================================================================
  console.log(`\n${YELLOW}▶ 2. Preservação de Scans, Métricas e ActivityLog:${RESET}`);

  const qrAfterEdit = mockDb.qrs.find((q) => q.id === "qr_alice_dyn_01")!;
  assert(qrAfterEdit.scanCount === 342, "Contagem de 342 escaneamentos foi preservada intacta");

  const logEntry = mockDb.logs.find((l) => l.entityId === "qr_alice_dyn_01" && l.action === "UPDATE_QR");
  assert(logEntry !== undefined, "Ação de atualização registrada em ActivityLog (UPDATE_QR)");
  assert(logEntry?.userId === "usr_alice", "ID do usuário associado ao log é usr_alice");


  // ====================================================================
  // CENÁRIO 3: Segurança e Prevenção de IDOR (Controle de Posse)
  // ====================================================================
  console.log(`\n${YELLOW}▶ 3. Controle de Acesso e Prevenção de IDOR:${RESET}`);

  // Usuário invasor Bob tenta editar o QR de Alice
  const bobHackerAttempt = simulatePutQr("usr_bob_hacker", "qr_alice_dyn_01", {
    name: "QR Hackeado",
    destination: "https://phishing-malicioso.com",
  });

  assert(bobHackerAttempt.status === 404, "Tentativa de edição por outro usuário (Bob) é REJEITADA com 404");
  
  // Confirma que o QR de Alice não sofreu nenhuma alteração
  const aliceQrAfterAttack = mockDb.qrs.find((q) => q.id === "qr_alice_dyn_01")!;
  assert(
    aliceQrAfterAttack.destination === "https://restaurante.com.br/cardapio-verao-2026",
    "Destino de Alice permanece inalterado e seguro contra IDOR"
  );
  assert(aliceQrAfterAttack.name === "Cardápio Principal - Verão", "Nome permanece inalterado");

  // Tentativa anônima (sem sessão)
  const anonAttempt = simulatePutQr(null, "qr_alice_dyn_01", { destination: "https://teste.com" });
  assert(anonAttempt.status === 401, "Tentativa anônima é rejeitada com 401");


  // ====================================================================
  // CENÁRIO 4: Sanitização de URLs e Prevenção de Injeção de Protocolos
  // ====================================================================
  console.log(`\n${YELLOW}▶ 4. Sanitização de Destino e Proteção contra Protocolos Perigosos:${RESET}`);

  // Tentativa de injetar javascript:alert
  const xssAttempt = simulatePutQr("usr_alice", "qr_alice_dyn_01", {
    destination: "javascript:alert(document.cookie)",
  });
  assert(xssAttempt.status === 400, "Edição com 'javascript:' é bloqueada (status 400)");

  // Tentativa de injetar data:
  const dataAttempt = simulatePutQr("usr_alice", "qr_alice_dyn_01", {
    destination: "data:text/html,<script>evil()</script>",
  });
  assert(dataAttempt.status === 400, "Edição com 'data:' é bloqueada (status 400)");

  // Tentativa de loop autorreferencial (apontando para si mesmo)
  const loopAttempt = simulatePutQr("usr_alice", "qr_alice_dyn_01", {
    destination: "https://qrmasterpro.vercel.app/q/CARDAPIO1",
  });
  assert(loopAttempt.status === 400, "Tentativa de loop apontando para o próprio shortCode é bloqueada");

  // Normalização automática de URL sem https://
  const normAttempt = simulatePutQr("usr_alice", "qr_alice_dyn_01", {
    destination: "novosite.com.br/pagina",
  });
  assert(normAttempt.status === 200, "URL sem protocolo é aceita e normalizada");
  assert(normAttempt.qrCode?.destination === "https://novosite.com.br/pagina", "Prefixo https:// adicionado com sucesso");


  // ====================================================================
  // CENÁRIO 5: Comportamento com QR Code Estático
  // ====================================================================
  console.log(`\n${YELLOW}▶ 5. Edição de QR Code Estático (Preservação do Modo Estático):${RESET}`);

  const staticEdit = simulatePutQr("usr_alice", "qr_alice_static_02", {
    name: "Wi-Fi Recepção",
    destination: "WIFI:S:Recepcao;T:WPA;P:outrasenha;;",
  });

  assert(staticEdit.status === 200, "QR estático editado com sucesso");
  assert(staticEdit.qrCode?.name === "Wi-Fi Recepção", "Nome do QR estático atualizado");
  assert(staticEdit.qrCode?.isDynamic === false, "isDynamic CONTINUA FALSE (não vira dinâmico)");
  assert(staticEdit.qrCode?.shortCode === null, "shortCode CONTINUA NULL (sem rota de redirecionamento)");


  // ====================================================================
  // CENÁRIO 6: Alternância de Status (Ativo / Pausado) na Edição
  // ====================================================================
  console.log(`\n${YELLOW}▶ 6. Controle de Status (Pausar e Reativar):${RESET}`);

  // Pausar QR
  const pauseEdit = simulatePutQr("usr_alice", "qr_alice_dyn_01", {
    status: "INACTIVE",
  });
  assert(pauseEdit.status === 200, "Status alterado para INACTIVE");
  assert(simulateRedirect("CARDAPIO1").status === 403, "QR pausado bloqueia redirecionamento com 403 (Pausado)");

  // Reativar QR
  const reactivateEdit = simulatePutQr("usr_alice", "qr_alice_dyn_01", {
    status: "ACTIVE",
  });
  assert(reactivateEdit.status === 200, "Status reativado para ACTIVE");
  assert(simulateRedirect("CARDAPIO1").status === 307, "QR reativado volta a redirecionar com 307");


  // ====================================================================
  // RESUMO DOS TESTES DE EDIÇÃO
  // ====================================================================
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   TOTAL DE TESTES DE EDIÇÃO DINÂMICA: ${totalTests}                   ${RESET}`);
  console.log(`${GREEN}   APROVADOS: ${passedTests}                                           ${RESET}`);
  console.log(`${failedTests > 0 ? RED : GREEN}   FALHAS: ${failedTests}                                              ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runDynamicQREditTests().catch((err) => {
  console.error("Erro na bateria de testes de edição de QR Code:", err);
  process.exit(1);
});
