import { prisma } from "../src/lib/db";
import { NextRequest } from "next/server";
import { GET as resolveQR } from "../src/app/q/[shortCode]/route";
import { PUT as updateQR } from "../src/app/api/qr/[id]/route";
import { generateSecureShortCode } from "../src/lib/short-code";
import { signToken } from "../src/lib/auth";

async function runDynamicQRLifecycleTest() {
  console.log("=== TESTE DE REGRESSÃO: CICLO DE VIDA DO QR CODE DINÂMICO ===");

  // 1. Obter usuário admin existente
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (!adminUser) {
    throw new Error("Nenhum usuário ADMIN encontrado para teste!");
  }

  const testShortCode = `tst_${generateSecureShortCode(6)}`;
  console.log(`\n1. Criando QR dinâmico de teste: shortCode = ${testShortCode}`);

  const initialDestination = "https://google.com/";
  const initialContent = JSON.stringify({ url: initialDestination });

  const createdQR = await prisma.qRCode.create({
    data: {
      userId: adminUser.id,
      name: "QR Teste Regressão",
      type: "url",
      isDynamic: true,
      shortCode: testShortCode,
      destination: initialDestination,
      content: initialContent,
      status: "ACTIVE",
      styleConfig: "{}",
    },
  });

  console.log(`   ✓ Criado com ID: ${createdQR.id}, shortCode: ${createdQR.shortCode}`);

  try {
    // 2. Testar resolução inicial
    console.log("\n2. Testando resolução inicial via GET /q/[shortCode]...");
    const reqInitial = new NextRequest(`https://qrmasterpro.vercel.app/q/${testShortCode}`, {
      headers: { "user-agent": "iPhone Camera / Safari" },
    });

    const resInitial = await resolveQR(reqInitial, { params: { shortCode: testShortCode } });
    console.log(`   Status: ${resInitial.status} (esperado 307)`);
    console.log(`   Location: ${resInitial.headers.get("location")} (esperado ${initialDestination})`);

    if (resInitial.status !== 307 || resInitial.headers.get("location") !== initialDestination) {
      throw new Error(`Resolução inicial falhou! Status: ${resInitial.status}, Location: ${resInitial.headers.get("location")}`);
    }

    // 3. Atualizar destino simulando PUT /api/qr/[id]
    const newDestination = "https://www.youtube.com/";
    console.log(`\n3. Executando atualização de destino para: ${newDestination}`);

    const sessionToken = signToken({
      id: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
    });

    const putPayload = {
      name: "QR Teste Regressão (Editado)",
      destination: newDestination,
      status: "ACTIVE",
    };

    const reqPut = new NextRequest(`https://qrmasterpro.vercel.app/api/qr/${createdQR.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `qrmaster_session=${sessionToken}`,
      },
      body: JSON.stringify(putPayload),
    });

    const resPut = await updateQR(reqPut, { params: { id: createdQR.id } });
    const putData = await resPut.json();
    console.log(`   Status do PUT: ${resPut.status}`);
    console.log(`   Sucesso: ${putData.success}`);

    if (resPut.status !== 200 || !putData.success) {
      throw new Error(`PUT /api/qr/[id] falhou: ${JSON.stringify(putData)}`);
    }

    // 4. Verificar preservação e integridade no banco
    console.log("\n4. Verificando integridade no banco de dados após edição...");
    const reloadedQR = await prisma.qRCode.findUnique({
      where: { id: createdQR.id },
    });

    if (!reloadedQR) throw new Error("QR Code não encontrado após atualização!");

    console.log(`   ID preservado: ${reloadedQR.id === createdQR.id}`);
    console.log(`   ShortCode preservado: ${reloadedQR.shortCode === testShortCode} (${reloadedQR.shortCode})`);
    console.log(`   isDynamic preservado: ${reloadedQR.isDynamic === true}`);
    console.log(`   Destination atualizado: ${reloadedQR.destination === newDestination} (${reloadedQR.destination})`);

    const parsedContent = JSON.parse(reloadedQR.content);
    console.log(`   Content sincronizado: ${parsedContent.url === newDestination} (${parsedContent.url})`);

    if (reloadedQR.shortCode !== testShortCode) throw new Error("REGRESSÃO: shortCode foi alterado!");
    if (reloadedQR.destination !== newDestination) throw new Error("REGRESSÃO: destination não foi atualizado!");
    if (parsedContent.url !== newDestination) throw new Error("REGRESSÃO: content não foi sincronizado!");

    // 5. Testar resolução pós-edição
    console.log("\n5. Testando resolução pós-edição via GET /q/[shortCode]...");
    const reqAfter = new NextRequest(`https://qrmasterpro.vercel.app/q/${testShortCode}`, {
      headers: { "user-agent": "Android Samsung Camera" },
    });

    const resAfter = await resolveQR(reqAfter, { params: { shortCode: testShortCode } });
    console.log(`   Status: ${resAfter.status} (esperado 307)`);
    console.log(`   Location: ${resAfter.headers.get("location")} (esperado ${newDestination})`);

    if (resAfter.status !== 307 || resAfter.headers.get("location") !== newDestination) {
      throw new Error(`Resolução pós-edição falhou! Status: ${resAfter.status}, Location: ${resAfter.headers.get("location")}`);
    }

    // 6. Testar proteção anti-loop
    console.log("\n6. Testando proteção anti-loop contra auto-redirecionamento...");
    const loopPayload = {
      destination: `https://qrmasterpro.vercel.app/q/${testShortCode}`,
    };
    const reqLoop = new NextRequest(`https://qrmasterpro.vercel.app/api/qr/${createdQR.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `qrmaster_session=${sessionToken}`,
      },
      body: JSON.stringify(loopPayload),
    });
    const resLoop = await updateQR(reqLoop, { params: { id: createdQR.id } });
    console.log(`   Status de tentativa de loop: ${resLoop.status} (esperado 400)`);
    if (resLoop.status !== 400) {
      throw new Error(`Proteção anti-loop permitiu destino circular! Status: ${resLoop.status}`);
    }

    console.log("\n✓ TODOS OS TESTES DE REGRESSÃO PASSARAM COM 100% DE SUCESSO!");
  } finally {
    // 7. Cleanup
    console.log("\n7. Limpando registro de teste...");
    await prisma.qRCodeScan.deleteMany({ where: { qrCodeId: createdQR.id } });
    await prisma.activityLog.deleteMany({ where: { entityId: createdQR.id } });
    await prisma.qRCode.delete({ where: { id: createdQR.id } });
    console.log("   Registro de teste excluído.");
  }
}

runDynamicQRLifecycleTest()
  .catch((err) => {
    console.error("\n❌ FALHA NO TESTE DE REGRESSÃO:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
