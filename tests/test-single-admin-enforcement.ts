import { prisma } from "../src/lib/db";
import { NextRequest } from "next/server";
import { PATCH } from "../src/app/api/admin/users/[id]/route";
import { signToken } from "../src/lib/auth";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

async function run() {
  console.log("=== INICIANDO TESTES DE SEGURANÇA E ADMIN EXCLUSIVO ===");

  // 1. Auditoria do Banco
  const allUsers = await prisma.user.findMany({
    include: {
      plan: true,
      subscription: true,
      qrCodes: true,
    },
  });

  assert(allUsers.length === 2, `Total de usuários no banco é exatamente 2 (atual: ${allUsers.length})`);

  const admins = allUsers.filter((u) => u.role === "ADMIN");
  assert(admins.length === 1, `Total de administradores no banco é exatamente 1 (atual: ${admins.length})`);
  assert(admins[0]?.email === "masterdigitalqr@gmail.com", `Administrador único é masterdigitalqr@gmail.com (atual: ${admins[0]?.email})`);
  assert(admins[0]?.plan?.name === "BUSINESS", `Plano do administrador é BUSINESS (atual: ${admins[0]?.plan?.name})`);

  // 2. Cliente real histórico
  const client = allUsers.find((u) => u.email === "itzjhonzin@gmail.com");
  assert(!!client, "Cliente itzjhonzin@gmail.com existe no banco");
  assert(client?.role === "USER", "Cliente possui papel USER");
  assert(client?.plan?.name === "PRO", "Plano do cliente permanece PRO");
  assert(client?.subscription?.gatewaySubscriptionId === "178856033673", "Assinatura Mercado Pago #178856033673 preservada intacta");
  assert(client?.subscription?.status === "ACTIVE", "Status da assinatura do cliente permanece ACTIVE");

  // 3. QR Code do cliente real
  const customerQr = await prisma.qRCode.findUnique({
    where: { shortCode: "Auejtw2I" },
  });
  assert(!!customerQr, "QR Code 'Auejtw2I' do cliente itzjhonzin@gmail.com existe intacto");
  assert(customerQr?.userId === client?.id, "QR Code pertence corretamente ao cliente itzjhonzin@gmail.com");

  // 4. Teste de tentativa de promoção de outro usuário para ADMIN
  const adminToken = signToken({
    id: admins[0].id,
    name: admins[0].name,
    email: admins[0].email,
    role: "ADMIN",
    planId: admins[0].planId,
  });

  const reqPromote = new NextRequest(`https://qrmasterdigital.com/api/admin/users/${client?.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `qrmaster_session=${adminToken}`,
    },
    body: JSON.stringify({ role: "ADMIN" }),
  });

  const resPromote = await PATCH(reqPromote, { params: { id: client?.id || "" } });
  assert(resPromote.status === 403, `Tentativa de promover usuário comum a ADMIN é bloqueada com HTTP 403 (recebido: ${resPromote.status})`);

  const bodyPromote = await resPromote.json();
  assert(
    bodyPromote.error && bodyPromote.error.includes("masterdigitalqr@gmail.com"),
    "Mensagem de erro explicita a exclusividade do administrador"
  );

  // 5. Teste de tentativa de rebaixar o administrador oficial
  const reqDemote = new NextRequest(`https://qrmasterdigital.com/api/admin/users/${admins[0].id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `qrmaster_session=${adminToken}`,
    },
    body: JSON.stringify({ role: "USER" }),
  });

  const resDemote = await PATCH(reqDemote, { params: { id: admins[0].id } });
  assert(resDemote.status === 403, `Tentativa de rebaixar o administrador oficial é bloqueada com HTTP 403 (recebido: ${resDemote.status})`);

  console.log("\n=========================================");
  console.log(`TOTAL PASS: ${passCount} | TOTAL FAIL: ${failCount}`);
  console.log("=========================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Erro fatal no teste:", err);
  process.exit(1);
});
