/**
 * Suíte de Testes Automatizados: Métricas, Analytics, Agregações e Segurança
 * Cobre os 25 cenários obrigatórios especificados na auditoria de Analytics.
 */

import { prisma } from "../src/lib/db";
import { NextRequest } from "next/server";
import { GET as getAnalytics } from "../src/app/api/analytics/route";
import { signToken } from "../src/lib/auth";
import { parseUserAgent } from "../src/lib/user-agent";

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

async function runAnalyticsSuite() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   📊 BATERIA DE AUDITORIA & TESTES: ANALYTICS E TELEMETRIA     ${RESET}`);
  console.log(`${CYAN}================================================================\n${RESET}`);

  // Preparação de dados de teste isolados
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    include: { plan: true },
  });

  if (!adminUser) {
    throw new Error("Usuário ADMIN não encontrado para executar suíte de analytics!");
  }

  const proPlan = await prisma.plan.findFirst({
    where: { name: "PRO" },
  });

  // Criar Usuário B (Vítima/Invasor) para testes anti-IDOR
  const testUserB = await prisma.user.upsert({
    where: { email: "user_b_analytics_test@qrmaster.com" },
    update: { planId: proPlan?.id },
    create: {
      email: "user_b_analytics_test@qrmaster.com",
      name: "User B Test",
      passwordHash: "fake_hash_test_b",
      role: "USER",
      planId: proPlan?.id,
    },
  });

  if (proPlan) {
    await prisma.subscription.upsert({
      where: { userId: testUserB.id },
      update: {
        planId: proPlan.id,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      create: {
        userId: testUserB.id,
        planId: proPlan.id,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Criar QR Codes de teste
  const testQRA = await prisma.qRCode.create({
    data: {
      userId: adminUser.id,
      name: "QR Analytics Test User A",
      type: "url",
      isDynamic: true,
      shortCode: `anA_${Date.now().toString().slice(-6)}`,
      destination: "https://example.com/analytics-a",
      content: JSON.stringify({ url: "https://example.com/analytics-a" }),
      styleConfig: "{}",
    },
  });

  const testQRB = await prisma.qRCode.create({
    data: {
      userId: testUserB.id,
      name: "QR Analytics Test User B",
      type: "url",
      isDynamic: true,
      shortCode: `anB_${Date.now().toString().slice(-6)}`,
      destination: "https://example.com/analytics-b",
      content: JSON.stringify({ url: "https://example.com/analytics-b" }),
      styleConfig: "{}",
    },
  });

  const adminToken = signToken({
    id: adminUser.id,
    name: adminUser.name,
    email: adminUser.email,
    role: adminUser.role,
  });

  const userBToken = signToken({
    id: testUserB.id,
    name: testUserB.name,
    email: testUserB.email,
    role: testUserB.role,
  });

  const now = new Date();

  try {
    // Inserir scans controlados para Test User A
    // 1. Scans no período atual (últimos 3 dias)
    const scan1 = await prisma.qRCodeScan.create({
      data: {
        qrCodeId: testQRA.id,
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 dia atrás
        device: "Mobile",
        browser: "Safari",
        os: "iOS",
        ipHash: "hash_user_a_01",
      },
    });

    const scan2 = await prisma.qRCodeScan.create({
      data: {
        qrCodeId: testQRA.id,
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 dia atrás (mesmo dia do pico)
        device: "Mobile",
        browser: "Chrome",
        os: "Android",
        ipHash: "hash_user_a_02",
      },
    });

    const scan3 = await prisma.qRCodeScan.create({
      data: {
        qrCodeId: testQRA.id,
        timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 dias atrás
        device: "Desktop",
        browser: "Chrome",
        os: "Windows",
        ipHash: "hash_user_a_03",
      },
    });

    // 2. Scan no período anterior (35 dias atrás)
    const scanPrev = await prisma.qRCodeScan.create({
      data: {
        qrCodeId: testQRA.id,
        timestamp: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000), // 35 dias atrás (período anterior de 30d)
        device: "Tablet",
        browser: "Safari",
        os: "iOS",
        ipHash: "hash_user_a_prev",
      },
    });

    // 3. Scan pertencente ao Usuário B (não deve vazar para Usuário A)
    const scanUserB = await prisma.qRCodeScan.create({
      data: {
        qrCodeId: testQRB.id,
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        device: "Desktop",
        browser: "Firefox",
        os: "Linux",
        ipHash: "hash_user_b_01",
      },
    });

    // Helper para chamar GET /api/analytics
    async function callApi(period: string, qrCodeId?: string, token = adminToken) {
      const url = `https://qrmasterpro.vercel.app/api/analytics?period=${period}${qrCodeId ? `&qrCodeId=${qrCodeId}` : ""}`;
      const req = new NextRequest(url, {
        headers: {
          Cookie: `qrmaster_session=${token}`,
        },
      });
      const res = await getAnalytics(req);
      const json = await res.json();
      return { status: res.status, json };
    }

    // =========================================================================
    // CENÁRIO 1: Total de Scans do Período Atual
    // =========================================================================
    console.log(`${YELLOW}▶ 1. Validação do Total de Scans & Isolamento do Período:${RESET}`);
    const res30d = await callApi("30d", testQRA.id);
    assert(res30d.status === 200, "API responde com 200 OK para período de 30 dias");
    assert(res30d.json.metrics.totalScans === 3, `Total de scans é exatamente 3 (obtido: ${res30d.json.metrics.totalScans})`);

    // =========================================================================
    // CENÁRIO 2: Média Diária (totalScans / diasDoPeriodo)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 2. Validação da Média Diária (totalScans / 30 dias):${RESET}`);
    // 3 scans / 30 dias = 0.1
    assert(res30d.json.metrics.dailyAverage === 0.1, `Média diária esperada 0.1 (obtido: ${res30d.json.metrics.dailyAverage})`);

    // =========================================================================
    // CENÁRIO 3: Pico Diário (Quantidade Máxima)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 3. Validação do Pico Diário:${RESET}`);
    // 2 scans ocorreram no dia de ontem
    assert(res30d.json.metrics.maxDayScans === 2, `Pico diário em um dia é 2 (obtido: ${res30d.json.metrics.maxDayScans})`);

    // =========================================================================
    // CENÁRIO 4: Data do Dia Mais Ativo
    // =========================================================================
    console.log(`\n${YELLOW}▶ 4. Validação da Data do Dia Mais Ativo:${RESET}`);
    assert(typeof res30d.json.metrics.maxDayDate === "string" && res30d.json.metrics.maxDayDate.includes("/"), `Data do pico formatada em DD/MM/AAAA (obtido: ${res30d.json.metrics.maxDayDate})`);

    // =========================================================================
    // CENÁRIO 5: Agrupamento Cronológico da Timeline
    // =========================================================================
    console.log(`\n${YELLOW}▶ 5. Agrupamento Cronológico da Timeline:${RESET}`);
    assert(Array.isArray(res30d.json.timeline), "Timeline é um array estruturado");
    assert(res30d.json.timeline.length >= 30, `Timeline possui ao menos 30 entradas de dias (tamanho: ${res30d.json.timeline.length})`);

    // =========================================================================
    // CENÁRIO 6: Reconciliação Matemática: sum(timeline.scans) === totalScans
    // =========================================================================
    console.log(`\n${YELLOW}▶ 6. Reconciliação Obrigatória: Soma do Gráfico === Total de Scans:${RESET}`);
    const sumTimeline = res30d.json.timeline.reduce((acc: number, item: any) => acc + item.scans, 0);
    assert(sumTimeline === res30d.json.metrics.totalScans, `Soma da timeline (${sumTimeline}) é RIGOROSAMENTE IGUAL ao totalScans (${res30d.json.metrics.totalScans})`);

    // =========================================================================
    // CENÁRIO 7: Período Anterior & Comparativo Real de Crescimento
    // =========================================================================
    console.log(`\n${YELLOW}▶ 7. Comparativo Matemático com Período Anterior:${RESET}`);
    // Período anterior (35 dias atrás) teve 1 scan. Atual teve 3 scans.
    // Crescimento: ((3 - 1) / 1) * 100 = +200.0%
    assert(res30d.json.metrics.previousScansCount === 1, `Scans do período anterior detectados: 1 (obtido: ${res30d.json.metrics.previousScansCount})`);
    assert(res30d.json.metrics.growthPercentage === 200, `Crescimento calculado: +200% (obtido: ${res30d.json.metrics.growthPercentage}%)`);
    assert(res30d.json.metrics.growthStatus === "positive", "Status de crescimento é 'positive'");
    assert(res30d.json.metrics.growthLabel === "+200% vs período anterior", `Label de crescimento correto: ${res30d.json.metrics.growthLabel}`);

    // =========================================================================
    // CENÁRIO 8: Crescimento Quando Período Anterior = 0 e Atual > 0
    // =========================================================================
    console.log(`\n${YELLOW}▶ 8. Tratamento Sem Dados no Período Anterior:${RESET}`);
    // Nos últimos 7 dias: atual = 3, anterior (8 a 14 dias atrás) = 0
    const res7d = await callApi("7d", testQRA.id);
    assert(res7d.json.metrics.previousScansCount === 0, "Período anterior nos 7d é 0");
    assert(res7d.json.metrics.growthPercentage === null, "growthPercentage é null quando anterior é 0 (sem infinito ou fake 18.4%)");
    assert(res7d.json.metrics.growthStatus === "no_previous_data", "Status marcado como 'no_previous_data'");
    assert(res7d.json.metrics.growthLabel === "Sem dados no período anterior", `Label correto: ${res7d.json.metrics.growthLabel}`);

    // =========================================================================
    // CENÁRIO 9: Crescimento Quando Atual = 0 e Anterior = 0
    // =========================================================================
    console.log(`\n${YELLOW}▶ 9. Tratamento Quando Atual = 0 e Anterior = 0:${RESET}`);
    // Criar QR sem scans
    const emptyQR = await prisma.qRCode.create({
      data: {
        userId: adminUser.id,
        name: "QR Empty",
        type: "url",
        destination: "https://empty.com",
        content: "{}",
        styleConfig: "{}",
      },
    });
    const resEmpty = await callApi("30d", emptyQR.id);
    assert(resEmpty.json.metrics.totalScans === 0, "Total de scans do QR vazio é 0");
    assert(resEmpty.json.metrics.dailyAverage === 0, "Média diária é 0");
    assert(resEmpty.json.metrics.maxDayScans === 0, "Pico diário é 0");
    assert(resEmpty.json.metrics.maxDayDate === null, "Data do pico é null");
    assert(resEmpty.json.metrics.growthStatus === "neutral", "Status é neutral");
    assert(resEmpty.json.metrics.growthLabel === "Sem variação (0 acessos)", `Label neutro: ${resEmpty.json.metrics.growthLabel}`);
    await prisma.qRCode.delete({ where: { id: emptyQR.id } });

    // =========================================================================
    // CENÁRIO 10: Ausência Comprovada de Conversões Fictícias
    // =========================================================================
    console.log(`\n${YELLOW}▶ 10. Ausência de Conversões Fictícias (Eliminação do 98.2%):${RESET}`);
    assert(res30d.json.metrics.conversionRate === null, "conversionRate é estritamente null (sem 98.2% fictício)");
    assert(res30d.json.metrics.conversionStatus === "not_configured", "conversionStatus é 'not_configured'");
    assert(res30d.json.metrics.conversionLabel === "Sem metas de conversão configuradas", "conversionLabel é explícito");

    // =========================================================================
    // CENÁRIO 11: Isolamento de Dados entre Usuários (Anti-IDOR)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 11. Isolamento entre Usuários (Anti-IDOR):${RESET}`);
    // Usuário A não vê os scans do Usuário B
    const allScansA = await callApi("30d", undefined, adminToken);
    const hasScanB = allScansA.json.browserData.some((b: any) => b.name === "Firefox"); // Scan do Usuário B era Firefox
    assert(!hasScanB, "Scans do Usuário B (Firefox) NÃO APARECEM no analytics do Usuário A");

    // =========================================================================
    // CENÁRIO 12: Tentativa de Acesso ao QR de Outro Usuário via Query Param
    // =========================================================================
    console.log(`\n${YELLOW}▶ 12. Bloqueio Anti-IDOR com Query Param qrCodeId:${RESET}`);
    // Admin tenta consultar qrCodeId do Usuário B
    const idorAttempt1 = await callApi("30d", testQRB.id, adminToken);
    assert(idorAttempt1.status === 404, "Admin tentando consultar QR do Usuário B retorna HTTP 404");
    assert(idorAttempt1.json.error !== undefined, "Retorna mensagem de erro explícita contra IDOR");

    // Usuário B tenta consultar qrCodeId do Admin
    const idorAttempt2 = await callApi("30d", testQRA.id, userBToken);
    assert(idorAttempt2.status === 404, "Usuário B tentando consultar QR do Admin retorna HTTP 404");
    assert(idorAttempt2.json.error !== undefined, "Retorna mensagem de erro explícita contra IDOR para Usuário B");

    // =========================================================================
    // CENÁRIO 13: Filtro "Hoje" (24 horas)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 13. Filtro 'Hoje' (Agrupamento por Hora 00h às 23h):${RESET}`);
    const resToday = await callApi("today", testQRA.id);
    assert(resToday.status === 200, "Filtro 'today' responde com 200");
    assert(resToday.json.timeline.length === 24, `Timeline de 'today' possui exatamente 24 horas (obtido: ${resToday.json.timeline.length})`);
    assert(resToday.json.timeline[0].date === "00:00", "Primeira hora da timeline é 00:00");
    assert(resToday.json.timeline[23].date === "23:00", "Última hora da timeline é 23:00");

    // =========================================================================
    // CENÁRIO 14: Filtro "Últimos 90 dias"
    // =========================================================================
    console.log(`\n${YELLOW}▶ 14. Filtro 'Últimos 90 dias':${RESET}`);
    const res90d = await callApi("90d", testQRA.id);
    assert(res90d.status === 200, "Filtro 90d responde com 200");
    assert(res90d.json.metrics.totalScans === 4, `Total de scans em 90d inclui o scan de 35 dias atrás (obtido: ${res90d.json.metrics.totalScans})`);
    const sum90d = res90d.json.timeline.reduce((acc: number, item: any) => acc + item.scans, 0);
    assert(sum90d === 4, `Reconciliação 90d: soma da timeline (${sum90d}) === totalScans (4)`);

    // =========================================================================
    // CENÁRIO 15: Filtro "Últimos 12 meses"
    // =========================================================================
    console.log(`\n${YELLOW}▶ 15. Filtro 'Últimos 12 meses':${RESET}`);
    const res12m = await callApi("12m", testQRA.id);
    assert(res12m.status === 200, "Filtro 12m responde com 200");
    assert(res12m.json.metrics.totalScans === 4, "Total em 12m corresponde a 4 scans");

    // =========================================================================
    // CENÁRIO 16: Telemetria Real de Dispositivos (Mobile / Desktop)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 16. Telemetria Real de Dispositivos:${RESET}`);
    // No testQRA temos 2 Mobile e 1 Desktop nos 30d
    const mobileData = res30d.json.deviceData.find((d: any) => d.name === "Mobile");
    const desktopData = res30d.json.deviceData.find((d: any) => d.name === "Desktop");
    assert(mobileData?.value === 2, `Dispositivos Mobile = 2 (obtido: ${mobileData?.value})`);
    assert(desktopData?.value === 1, `Dispositivos Desktop = 1 (obtido: ${desktopData?.value})`);

    // =========================================================================
    // CENÁRIO 17: Telemetria Real de Sistemas Operacionais (iOS / Android / Windows)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 17. Telemetria Real de Sistemas Operacionais:${RESET}`);
    const iosOS = res30d.json.osData.find((o: any) => o.name === "iOS");
    const androidOS = res30d.json.osData.find((o: any) => o.name === "Android");
    const winOS = res30d.json.osData.find((o: any) => o.name === "Windows");
    assert(iosOS?.value === 1, `iOS = 1 (obtido: ${iosOS?.value})`);
    assert(androidOS?.value === 1, `Android = 1 (obtido: ${androidOS?.value})`);
    assert(winOS?.value === 1, `Windows = 1 (obtido: ${winOS?.value})`);

    // =========================================================================
    // CENÁRIO 18: Telemetria Real de Navegadores (Chrome / Safari)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 18. Telemetria Real de Navegadores:${RESET}`);
    const chromeB = res30d.json.browserData.find((b: any) => b.name === "Chrome");
    const safariB = res30d.json.browserData.find((b: any) => b.name === "Safari");
    assert(chromeB?.value === 2, `Chrome = 2 (obtido: ${chromeB?.value})`);
    assert(safariB?.value === 1, `Safari = 1 (obtido: ${safariB?.value})`);

    // =========================================================================
    // CENÁRIO 19: Distribuição Horária (00h às 23h)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 19. Mapa de Calor Horário (24 Horas):${RESET}`);
    assert(res30d.json.hourlyDistribution.length === 24, "Distribuição horária possui 24 posições");
    const sumHourly = res30d.json.hourlyDistribution.reduce((acc: number, h: any) => acc + h.scans, 0);
    assert(sumHourly === res30d.json.metrics.totalScans, `Soma dos horários (${sumHourly}) === totalScans (${res30d.json.metrics.totalScans})`);

    // =========================================================================
    // CENÁRIO 20: Privacidade e Anonimização de IP (LGPD)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 20. Auditoria de Privacidade e Anonimização de IP:${RESET}`);
    const sampleParsed = parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "189.100.20.50");
    assert(sampleParsed.ipHash.length === 16, "ipHash possui tamanho fixo truncado de 16 chars");
    assert(/^[0-9a-f]+$/.test(sampleParsed.ipHash), "ipHash é uma string hexadecimal irreversível");
    assert(!sampleParsed.ipHash.includes("189.100"), "IP bruto nunca é salvo nem transmitido");

    // =========================================================================
    // CENÁRIO 21: Parser de Dispositivos e Sistemas Desconhecidos
    // =========================================================================
    console.log(`\n${YELLOW}▶ 21. Parser com User-Agents Não Reconhecidos / Desconhecidos:${RESET}`);
    const unknownParsed = parseUserAgent("CustomBot/1.0", "127.0.0.1");
    assert(unknownParsed.device === "Desktop", "Dispositivo genérico categorizado com fallback seguro");
    assert(unknownParsed.browser === "Other", "Navegador desconhecido categorizado como 'Other'");
    assert(unknownParsed.os === "Other", "OS desconhecido categorizado como 'Other'");

    // =========================================================================
    // CENÁRIO 22: Autenticação Requerida (401 para Sessão Ausente)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 22. Bloqueio de Acesso Não Autenticado:${RESET}`);
    const reqAnon = new NextRequest("https://qrmasterpro.vercel.app/api/analytics?period=30d");
    const resAnon = await getAnalytics(reqAnon);
    assert(resAnon.status === 401, "Requisição anônima rejeitada com 401 Unauthorized");

    // =========================================================================
    // CENÁRIO 23: Não Regressão - Inexistência de Mocks 98.2 ou 18.4 no Retorno
    // =========================================================================
    console.log(`\n${YELLOW}▶ 23. Verificação de Ausência de 98.2 e 18.4 Hardcoded na API:${RESET}`);
    const rawJsonString = JSON.stringify(res30d.json);
    assert(!rawJsonString.includes("98.2"), "Valor '98.2' NÃO ESTÁ PRESENTE no payload da API");
    assert(!rawJsonString.includes("18.4"), "Valor '18.4' NÃO ESTÁ PRESENTE no payload da API");

    // =========================================================================
    // CENÁRIO 24: Top QR Codes Acessados
    // =========================================================================
    console.log(`\n${YELLOW}▶ 24. Ranking de Top QR Codes do Usuário:${RESET}`);
    assert(Array.isArray(res30d.json.topQRs), "topQRs retornado como lista ordenada");
    assert(res30d.json.topQRs.length <= 5, "topQRs limitado aos 5 mais acessados");

    // =========================================================================
    // CENÁRIO 25: Consistência Geral e Reconciliação Total entre Métricas
    // =========================================================================
    console.log(`\n${YELLOW}▶ 25. Validação da Invariante Geral de Consistência:${RESET}`);
    const sumDevices = res30d.json.deviceData.reduce((acc: number, d: any) => acc + d.value, 0);
    assert(sumDevices === res30d.json.metrics.totalScans, `Soma dos dispositivos (${sumDevices}) === totalScans (${res30d.json.metrics.totalScans})`);

    console.log(`\n${CYAN}================================================================${RESET}`);
    console.log(`${CYAN}   TOTAL DE CENÁRIOS DE ANALYTICS VALIDADOS: ${totalTests}      ${RESET}`);
    console.log(`${GREEN}   APROVADOS: ${passedTests}                                           ${RESET}`);
    console.log(`${failedTests > 0 ? RED : GREEN}   FALHAS: ${failedTests}                                              ${RESET}`);
    console.log(`${CYAN}================================================================\n${RESET}`);

    if (failedTests > 0) {
      process.exit(1);
    }
  } finally {
    // Limpeza de dados de teste
    console.log("Limpando registros de teste de telemetria...");
    await prisma.qRCodeScan.deleteMany({
      where: { qrCodeId: { in: [testQRA.id, testQRB.id] } },
    });
    await prisma.qRCode.deleteMany({
      where: { id: { in: [testQRA.id, testQRB.id] } },
    });
    await prisma.user.delete({
      where: { id: testUserB.id },
    });
    console.log("Registros de teste excluídos com sucesso.");
  }
}

runAnalyticsSuite()
  .catch((err) => {
    console.error("\n❌ FALHA NA SUÍTE DE TESTES DE ANALYTICS:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
