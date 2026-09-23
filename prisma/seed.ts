import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generatePixPayload } from "../src/lib/pix";
import { formatQRDestination } from "../src/lib/qr-generator";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de dados [DEMO DATA] para QR MASTER...");

  // 1. Planos
  const freePlan = await prisma.plan.upsert({
    where: { name: "FREE" },
    update: {
      priceMonth: 0,
      priceYear: 0,
      maxQRCodes: 5,
      maxQRCodesYear: 5,
    },
    create: {
      name: "FREE",
      displayName: "Plano Grátis",
      priceMonth: 0,
      priceYear: 0,
      maxQRCodes: 5,
      maxQRCodesYear: 5,
      dynamicQRs: false,
      analytics: false,
      exportSvg: false,
      exportPdf: false,
      customLogo: false,
      campaigns: false,
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { name: "PRO" },
    update: {
      priceMonth: 19.9,
      priceYear: 99.0,
      maxQRCodes: 15,
      maxQRCodesYear: 15,
    },
    create: {
      name: "PRO",
      displayName: "Plano Pro",
      priceMonth: 19.9,
      priceYear: 99.0,
      maxQRCodes: 15,
      maxQRCodesYear: 15,
      dynamicQRs: true,
      analytics: true,
      exportSvg: true,
      exportPdf: true,
      customLogo: true,
      campaigns: true,
    },
  });

  const businessPlan = await prisma.plan.upsert({
    where: { name: "BUSINESS" },
    update: {
      priceMonth: 29.9,
      priceYear: 199.0,
      maxQRCodes: 999999,
      maxQRCodesYear: 999999,
    },
    create: {
      name: "BUSINESS",
      displayName: "Plano Business",
      priceMonth: 29.9,
      priceYear: 199.0,
      maxQRCodes: 999999,
      maxQRCodesYear: 999999,
      dynamicQRs: true,
      analytics: true,
      exportSvg: true,
      exportPdf: true,
      customLogo: true,
      campaigns: true,
    },
  });

  // 2. Usuário de Demonstração (Carlos)
  const passwordHash = await bcrypt.hash("senha123", 10);
  const demoUser = await prisma.user.upsert({
    where: { email: "carlos@qrmaster.com" },
    update: {},
    create: {
      name: "Carlos Silva",
      email: "carlos@qrmaster.com",
      passwordHash,
      role: "USER",
      company: "Nexus Digital",
      phone: "(11) 98765-4321",
      planId: proPlan.id,
      settings: {
        create: {
          theme: "system",
          language: "pt-BR",
          notifyNewScans: true,
          notifyWeeklyReport: true,
          notifyLimitAlert: true,
          analyticsConsent: true,
          dataRetentionDays: 365,
        },
      },
    },
  });

  // Usuário Administrador Exclusivo
  const adminHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "masterdigitalqr@gmail.com" },
    update: {
      role: "ADMIN",
      planId: businessPlan.id,
    },
    create: {
      name: "Master Digital",
      email: "masterdigitalqr@gmail.com",
      passwordHash: adminHash,
      role: "ADMIN",
      company: "QR MASTER Digital",
      planId: businessPlan.id,
      settings: {
        create: {
          theme: "dark",
          language: "pt-BR",
        },
      },
    },
  });

  // 3. Categorias [DEMO DATA]
  const catMarketing = await prisma.category.upsert({
    where: { userId_name: { userId: demoUser.id, name: "Marketing" } },
    update: {},
    create: {
      userId: demoUser.id,
      name: "Marketing",
      color: "#6366f1",
      icon: "Megaphone",
    },
  });

  const catRestaurante = await prisma.category.upsert({
    where: { userId_name: { userId: demoUser.id, name: "Restaurantes" } },
    update: {},
    create: {
      userId: demoUser.id,
      name: "Restaurantes",
      color: "#ec4899",
      icon: "Utensils",
    },
  });

  const catVendas = await prisma.category.upsert({
    where: { userId_name: { userId: demoUser.id, name: "Vendas" } },
    update: {},
    create: {
      userId: demoUser.id,
      name: "Vendas",
      color: "#10b981",
      icon: "ShoppingBag",
    },
  });

  const catRedes = await prisma.category.upsert({
    where: { userId_name: { userId: demoUser.id, name: "Redes Sociais" } },
    update: {},
    create: {
      userId: demoUser.id,
      name: "Redes Sociais",
      color: "#06b6d4",
      icon: "Share2",
    },
  });

  // 4. Campanhas [DEMO DATA]
  const campaignBF = await prisma.campaign.create({
    data: {
      userId: demoUser.id,
      name: "Black Friday 2026 [DEMO DATA]",
      description: "Campanha promocional de final de ano com cupons dinâmicos",
      status: "ACTIVE",
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-30"),
    },
  });

  // 5. QR Codes de Demonstração
  const defaultStyle = JSON.stringify({
    dotsColor: "#1e1b4b",
    dotsType: "rounded", // square, rounded, dots, classy
    cornerSquareType: "extra-rounded",
    cornerSquareColor: "#4f46e5",
    cornerDotColor: "#4f46e5",
    bgColor: "#ffffff",
    frame: "scan-me", // none, simple, scan-me, bottom-banner
    frameText: "APONTE A CÂMERA",
    frameColor: "#4f46e5",
    errorCorrectionLevel: "H",
    hasLogo: false,
  });

  // QR 1: WhatsApp Comercial (Dinâmico)
  const qrWhatsApp = await prisma.qRCode.create({
    data: {
      userId: demoUser.id,
      name: "WhatsApp da Loja [DEMO DATA]",
      description: "Atendimento comercial direto aos clientes da loja",
      type: "whatsapp",
      isDynamic: true,
      shortCode: "wa-loja",
      destination: formatQRDestination("whatsapp", {
        phone: "5511987654321",
        message: "Olá! Gostaria de saber mais sobre seus produtos e promoções.",
      }),
      content: JSON.stringify({
        phone: "5511987654321",
        message: "Olá! Gostaria de saber mais sobre seus produtos e promoções.",
      }),
      status: "ACTIVE",
      favorite: true,
      categoryId: catVendas.id,
      styleConfig: defaultStyle,
      scanCount: 142,
      lastScanAt: new Date(),
    },
  });

  // QR 2: Cardápio Digital (Dinâmico)
  const qrCardapio = await prisma.qRCode.create({
    data: {
      userId: demoUser.id,
      name: "Cardápio do Restaurante [DEMO DATA]",
      description: "Menu digital interativo das mesas do salão principal",
      type: "url",
      isDynamic: true,
      shortCode: "menu-rest",
      destination: "https://meucardapio.com/nexus-bistro",
      content: JSON.stringify({
        url: "https://meucardapio.com/nexus-bistro",
      }),
      status: "ACTIVE",
      favorite: true,
      categoryId: catRestaurante.id,
      styleConfig: JSON.stringify({
        ...JSON.parse(defaultStyle),
        dotsColor: "#be185d",
        cornerSquareColor: "#9d174d",
        cornerDotColor: "#9d174d",
        frame: "scan-me",
        frameText: "VER CARDÁPIO",
        frameColor: "#9d174d",
      }),
      scanCount: 388,
      lastScanAt: new Date(Date.now() - 1000 * 60 * 15),
    },
  });

  // QR 3: Pix Balcão (Estático)
  const pixPayload = generatePixPayload({
    pixKey: "carlos@qrmaster.com",
    merchantName: "CARLOS SILVA",
    merchantCity: "SAO PAULO",
    amount: 49.9,
    txId: "PEDIDO102",
    infoMessage: "Pagamento Nexus Store",
  });

  await prisma.qRCode.create({
    data: {
      userId: demoUser.id,
      name: "Pix Balcão R$ 49,90 [DEMO DATA]",
      description: "Cobrança rápida no caixa da loja",
      type: "pix",
      isDynamic: false,
      destination: pixPayload,
      content: JSON.stringify({
        pixKey: "carlos@qrmaster.com",
        merchantName: "CARLOS SILVA",
        merchantCity: "SAO PAULO",
        amount: 49.9,
        txId: "PEDIDO102",
        infoMessage: "Pagamento Nexus Store",
      }),
      status: "ACTIVE",
      favorite: false,
      categoryId: catVendas.id,
      styleConfig: JSON.stringify({
        ...JSON.parse(defaultStyle),
        dotsColor: "#065f46",
        cornerSquareColor: "#047857",
        cornerDotColor: "#059669",
        frame: "scan-me",
        frameText: "PAGAR COM PIX",
        frameColor: "#047857",
      }),
      scanCount: 57,
      lastScanAt: new Date(Date.now() - 1000 * 60 * 60),
    },
  });

  // QR 4: Promoção Black Friday (Dinâmico + Campanha)
  const qrBF = await prisma.qRCode.create({
    data: {
      userId: demoUser.id,
      name: "Promoção Setembro [DEMO DATA]",
      description: "Campanha especial com 50% de desconto nos serviços",
      type: "url",
      isDynamic: true,
      shortCode: "promo-setembro",
      destination: "https://nexusdigital.com.br/promocao",
      content: JSON.stringify({
        url: "https://nexusdigital.com.br/promocao",
      }),
      status: "ACTIVE",
      favorite: false,
      categoryId: catMarketing.id,
      campaignId: campaignBF.id,
      styleConfig: defaultStyle,
      scanCount: 89,
      lastScanAt: new Date(Date.now() - 1000 * 60 * 17),
    },
  });

  // QR 5: Wi-Fi Visitantes
  const wifiPayload = formatQRDestination("wifi", {
    ssid: "Nexus_Visitantes_5G",
    password: "ConexaoSegura2026",
    encryption: "WPA2",
    hidden: false,
  });

  await prisma.qRCode.create({
    data: {
      userId: demoUser.id,
      name: "Wi-Fi Escritório [DEMO DATA]",
      description: "Acesso à rede Wi-Fi para clientes e visitantes",
      type: "wifi",
      isDynamic: false,
      destination: wifiPayload,
      content: JSON.stringify({
        ssid: "Nexus_Visitantes_5G",
        password: "ConexaoSegura2026",
        encryption: "WPA2",
        hidden: false,
      }),
      status: "ACTIVE",
      favorite: false,
      styleConfig: defaultStyle,
      scanCount: 41,
      lastScanAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
    },
  });

  // QR 6: Instagram
  await prisma.qRCode.create({
    data: {
      userId: demoUser.id,
      name: "Instagram [DEMO DATA]",
      description: "Perfil institucional no Instagram",
      type: "social",
      isDynamic: true,
      shortCode: "insta-nexus",
      destination: "https://instagram.com/nexusdigital",
      content: JSON.stringify({
        socialPlatform: "instagram",
        socialUrl: "https://instagram.com/nexusdigital",
      }),
      status: "ACTIVE",
      favorite: true,
      categoryId: catRedes.id,
      styleConfig: defaultStyle,
      scanCount: 165,
      lastScanAt: new Date(Date.now() - 1000 * 60 * 60),
    },
  });

  // 6. Gerar Scans Realistas [DEMO DATA] nos últimos 30 dias
  console.log("📊 Inserindo histórico de scans realistas para alimentar os gráficos...");
  const targetQRs = [qrWhatsApp, qrCardapio, qrBF];
  const devices = ["Mobile", "Mobile", "Mobile", "Mobile", "Tablet", "Desktop", "Desktop"];
  const browsers = ["Chrome", "Chrome", "Safari", "Safari", "Edge", "Firefox"];
  const osList = ["iOS", "iOS", "Android", "Android", "Android", "Windows", "macOS"];
  const cities = ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Porto Alegre", "Brasília", "Salvador"];

  const now = new Date();
  const scansToInsert = [];

  for (let d = 30; d >= 0; d--) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() - d);

    // Variação de quantidade por dia (mais scans nos fins de semana e dias recentes)
    const baseDailyScans = 10 + Math.floor(Math.sin(d) * 6 + Math.random() * 12);

    for (let s = 0; s < baseDailyScans; s++) {
      const targetQR = targetQRs[Math.floor(Math.random() * targetQRs.length)];
      const scanHour = Math.floor(Math.random() * 24);
      const scanMinute = Math.floor(Math.random() * 60);
      const scanTimestamp = new Date(dayDate);
      scanTimestamp.setHours(scanHour, scanMinute, 0, 0);

      scansToInsert.push({
        qrCodeId: targetQR.id,
        timestamp: scanTimestamp,
        country: "Brasil",
        state: "SP",
        city: cities[Math.floor(Math.random() * cities.length)],
        device: devices[Math.floor(Math.random() * devices.length)],
        browser: browsers[Math.floor(Math.random() * browsers.length)],
        os: osList[Math.floor(Math.random() * osList.length)],
        referrer: Math.random() > 0.5 ? "direct" : "camera_scan",
        ipHash: `anon_${Math.random().toString(36).substring(2, 10)}`,
      });
    }
  }

  await prisma.qRCodeScan.createMany({
    data: scansToInsert,
  });

  // 7. Templates Prontos
  const templates = [
    {
      name: "WhatsApp Comercial",
      category: "Vendas",
      type: "whatsapp",
      description: "Ideal para lojas, prestadores de serviços e suporte direto.",
      content: JSON.stringify({
        phone: "5511999999999",
        message: "Olá! Vim através do QR Code e gostaria de atendimento.",
      }),
      styleConfig: JSON.stringify({
        dotsColor: "#15803d",
        dotsType: "rounded",
        cornerSquareColor: "#166534",
        cornerDotColor: "#22c55e",
        bgColor: "#ffffff",
        frame: "scan-me",
        frameText: "FALE NO WHATSAPP",
        frameColor: "#166534",
        errorCorrectionLevel: "H",
      }),
      isPopular: true,
    },
    {
      name: "Cardápio Digital",
      category: "Restaurantes",
      type: "url",
      description: "Para mesas de bares e restaurantes. Design elegante e clean.",
      content: JSON.stringify({
        url: "https://seurestaurante.com/cardapio",
      }),
      styleConfig: JSON.stringify({
        dotsColor: "#9f1239",
        dotsType: "classy",
        cornerSquareColor: "#881337",
        cornerDotColor: "#e11d48",
        bgColor: "#ffffff",
        frame: "scan-me",
        frameText: "VER CARDÁPIO",
        frameColor: "#881337",
        errorCorrectionLevel: "Q",
      }),
      isPopular: true,
    },
    {
      name: "Pix Balcão Rápido",
      category: "Pagamentos",
      type: "pix",
      description: "Facilite recebimentos imediatos com layout com alta legibilidade.",
      content: JSON.stringify({
        pixKey: "chave@pix.com.br",
        merchantName: "EMPRESA EXEMPLO",
        merchantCity: "SAO PAULO",
      }),
      styleConfig: JSON.stringify({
        dotsColor: "#0f766e",
        dotsType: "dots",
        cornerSquareColor: "#115e59",
        cornerDotColor: "#14b8a6",
        bgColor: "#ffffff",
        frame: "scan-me",
        frameText: "PAGAR COM PIX",
        frameColor: "#0f766e",
        errorCorrectionLevel: "H",
      }),
      isPopular: true,
    },
    {
      name: "Wi-Fi Visitantes",
      category: "Negócios",
      type: "wifi",
      description: "Conexão instantânea para salas de espera e recepções.",
      content: JSON.stringify({
        ssid: "WiFi_Empresa_5G",
        password: "SenhaSuperSegura",
        encryption: "WPA2",
      }),
      styleConfig: JSON.stringify({
        dotsColor: "#1d4ed8",
        dotsType: "rounded",
        cornerSquareColor: "#1e40af",
        cornerDotColor: "#3b82f6",
        bgColor: "#ffffff",
        frame: "scan-me",
        frameText: "CONECTAR AO WI-FI",
        frameColor: "#1e40af",
        errorCorrectionLevel: "M",
      }),
      isPopular: true,
    },
    {
      name: "Instagram & Bio",
      category: "Social",
      type: "social",
      description: "Atraia seguidores para suas redes sociais com estilo moderno.",
      content: JSON.stringify({
        socialPlatform: "instagram",
        socialUrl: "https://instagram.com/seu.perfil",
      }),
      styleConfig: JSON.stringify({
        dotsColor: "#c026d3",
        dotsType: "rounded",
        cornerSquareColor: "#a21caf",
        cornerDotColor: "#e879f9",
        bgColor: "#ffffff",
        frame: "scan-me",
        frameText: "SIGA NO INSTAGRAM",
        frameColor: "#a21caf",
        errorCorrectionLevel: "H",
      }),
      isPopular: true,
    },
  ];

  for (const t of templates) {
    await prisma.template.create({ data: t });
  }

  // 8. Logs de Atividade Inicial
  await prisma.activityLog.createMany({
    data: [
      {
        userId: demoUser.id,
        action: "LOGIN",
        description: "Login efetuado com sucesso via credenciais.",
      },
      {
        userId: demoUser.id,
        action: "CREATE_QR",
        entityId: qrWhatsApp.id,
        description: 'QR Code "WhatsApp da Loja" foi criado.',
      },
      {
        userId: demoUser.id,
        action: "CREATE_QR",
        entityId: qrCardapio.id,
        description: 'QR Code "Cardápio do Restaurante" foi criado.',
      },
    ],
  });

  console.log("✅ Seed finalizado com sucesso!");
  console.log("👤 Usuário Demo: carlos@qrmaster.com (senha: senha123)");
  console.log("🔑 Administrador Exclusivo: masterdigitalqr@gmail.com");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
