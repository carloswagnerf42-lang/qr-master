import { getMercadoPagoPaymentStatus } from "../src/lib/mercadopago";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function expectAccessDenied(
  paymentId: string,
  expectedUserId: string,
  mockPaymentData: Record<string, unknown>,
  label: string
) {
  let caughtError: any = null;
  try {
    await getMercadoPagoPaymentStatus(paymentId, expectedUserId, mockPaymentData);
  } catch (err: any) {
    caughtError = err;
  }

  const isDenied =
    caughtError !== null &&
    caughtError.status === 403 &&
    typeof caughtError.message === "string" &&
    caughtError.message.includes("Acesso negado");

  assert(isDenied, `${label} -> rejeitado com HTTP 403 Acesso negado`);
}

async function runTests() {
  console.log("==================================================================");
  console.log("  SUITE DE TESTES: SECURITY-AUTHZ-02 (POTENCIAL-01 FAIL-CLOSED)");
  console.log("==================================================================\n");

  const ownerUserId = "user_owner_authz_02_abc";
  const attackerUserId = "user_attacker_authz_02_xyz";

  // 1. Pagamento próprio (funcionamento normal preservado)
  console.log("1. Pagamento pertencente ao usuário autenticado (funcionamento normal):");
  {
    const ownPendingPayment = {
      id: "mp_pay_own_1001",
      status: "pending",
      status_detail: "pending_waiting_transfer",
      date_approved: null,
      external_reference: JSON.stringify({
        userId: ownerUserId,
        planName: "PRO",
        billingCycle: "month",
      }),
    };

    const res = await getMercadoPagoPaymentStatus(
      "mp_pay_own_1001",
      ownerUserId,
      ownPendingPayment
    );

    assert(
      res.paymentId === "mp_pay_own_1001" &&
        res.status === "pending" &&
        res.statusDetail === "pending_waiting_transfer" &&
        res.isApproved === false &&
        res.planName === "PRO",
      "1.1. Pagamento próprio retorna status normalmente quando external_reference.userId === expectedUserId"
    );
  }

  // 2. Pagamento pertencente a outro usuário
  console.log("\n2. Pagamento pertencente a outro usuário (IDOR / acesso horizontal):");
  {
    const otherUserPayment = {
      id: "mp_pay_other_1002",
      status: "pending",
      external_reference: JSON.stringify({
        userId: ownerUserId,
        planName: "PRO",
      }),
    };

    await expectAccessDenied(
      "mp_pay_other_1002",
      attackerUserId,
      otherUserPayment,
      "2.1. Pagamento de outro usuário (parsed.userId !== expectedUserId)"
    );
  }

  // 3. external_reference ausente (undefined e null)
  console.log("\n3. external_reference ausente:");
  {
    await expectAccessDenied(
      "mp_pay_no_ref_1003",
      ownerUserId,
      {
        id: "mp_pay_no_ref_1003",
        status: "pending",
      },
      "3.1. external_reference undefined"
    );

    await expectAccessDenied(
      "mp_pay_null_ref_1004",
      ownerUserId,
      {
        id: "mp_pay_null_ref_1004",
        status: "pending",
        external_reference: null,
      },
      "3.2. external_reference null"
    );
  }

  // 4. external_reference vazio
  console.log("\n4. external_reference vazio:");
  {
    await expectAccessDenied(
      "mp_pay_empty_ref_1005",
      ownerUserId,
      {
        id: "mp_pay_empty_ref_1005",
        status: "pending",
        external_reference: "",
      },
      "4.1. external_reference string vazia (\"\")"
    );

    await expectAccessDenied(
      "mp_pay_spaces_ref_1006",
      ownerUserId,
      {
        id: "mp_pay_spaces_ref_1006",
        status: "pending",
        external_reference: "    ",
      },
      "4.2. external_reference apenas espaços (\"    \")"
    );
  }

  // 5. external_reference não é JSON válido
  console.log("\n5. external_reference JSON inválido ou não-objeto:");
  {
    await expectAccessDenied(
      "mp_pay_bad_json_1007",
      ownerUserId,
      {
        id: "mp_pay_bad_json_1007",
        status: "pending",
        external_reference: "not-a-json-string",
      },
      "5.1. external_reference texto puro não-JSON"
    );

    await expectAccessDenied(
      "mp_pay_malformed_json_1008",
      ownerUserId,
      {
        id: "mp_pay_malformed_json_1008",
        status: "pending",
        external_reference: "{\"userId\": \"incomplete",
      },
      "5.2. external_reference JSON truncado/malformado"
    );

    await expectAccessDenied(
      "mp_pay_array_json_1009",
      ownerUserId,
      {
        id: "mp_pay_array_json_1009",
        status: "pending",
        external_reference: JSON.stringify([ownerUserId]),
      },
      "5.3. external_reference JSON array em vez de objeto"
    );

    await expectAccessDenied(
      "mp_pay_null_json_1010",
      ownerUserId,
      {
        id: "mp_pay_null_json_1010",
        status: "pending",
        external_reference: "null",
      },
      "5.4. external_reference JSON literal \"null\""
    );
  }

  // 6. external_reference não possui userId
  console.log("\n6. external_reference sem campo userId:");
  {
    await expectAccessDenied(
      "mp_pay_missing_userid_1011",
      ownerUserId,
      {
        id: "mp_pay_missing_userid_1011",
        status: "pending",
        external_reference: JSON.stringify({ planName: "PRO", billingCycle: "month" }),
      },
      "6.1. external_reference JSON válido porém sem propriedade userId"
    );
  }

  // 7. external_reference possui userId vazio ou inválido
  console.log("\n7. external_reference com userId vazio ou inválido:");
  {
    await expectAccessDenied(
      "mp_pay_empty_userid_1012",
      ownerUserId,
      {
        id: "mp_pay_empty_userid_1012",
        status: "pending",
        external_reference: JSON.stringify({ userId: "", planName: "PRO" }),
      },
      "7.1. external_reference com userId string vazia (\"\")"
    );

    await expectAccessDenied(
      "mp_pay_whitespace_userid_1013",
      ownerUserId,
      {
        id: "mp_pay_whitespace_userid_1013",
        status: "pending",
        external_reference: JSON.stringify({ userId: "   ", planName: "PRO" }),
      },
      "7.2. external_reference com userId apenas espaços (\"   \")"
    );

    await expectAccessDenied(
      "mp_pay_null_userid_1014",
      ownerUserId,
      {
        id: "mp_pay_null_userid_1014",
        status: "pending",
        external_reference: JSON.stringify({ userId: null, planName: "PRO" }),
      },
      "7.3. external_reference com userId null"
    );

    await expectAccessDenied(
      "mp_pay_empty_expected_1015",
      "",
      {
        id: "mp_pay_empty_expected_1015",
        status: "pending",
        external_reference: JSON.stringify({ userId: ownerUserId, planName: "PRO" }),
      },
      "7.4. expectedUserId vazio (\"\") também falha fechado com 403"
    );
  }

  // 8. Garantia de bloqueio antes de efeitos colaterais em pagamentos aprovados
  console.log("\n8. Bloqueio antes de processMercadoPagoNotification em pagamento approved:");
  {
    await expectAccessDenied(
      "mp_pay_approved_no_ref_1016",
      attackerUserId,
      {
        id: "mp_pay_approved_no_ref_1016",
        status: "approved",
        transaction_amount: 19.9,
        currency_id: "BRL",
      },
      "8.1. Pagamento approved sem external_reference é bloqueado antes de processar ativação"
    );
  }

  console.log("\n==================================================================");
  console.log(`  RESULTADO FINAL: ${passed} PASS / ${failed} FAIL`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erro fatal nos testes SECURITY-AUTHZ-02:", err);
  process.exit(1);
});
