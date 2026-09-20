# AUDITORIA CIRÚRGICA — VALIDAÇÃO DE VALOR MERCADO PAGO / QR MASTER

**Data da Auditoria:** 20/09/2026  
**Ambiente:** QR MASTER Produção (`https://qrmasterpro.vercel.app`)  
**Escopo:** Validação monetária server-side exata contra adulteração de valores no Mercado Pago  

---

## RESUMO TÉCNICO DA AUDITORIA

- **REGRA ANTIGA:**  
  `expectedPrice > 0 && actualAmount < (expectedPrice - 0.50) && !payment._skipAmountCheck`  
  *Problemas identificados:* Usava float IEEE 754 (`Number(...)`), continha tolerância arbitrária de R$ 0,50 (permitindo que valores como R$ 19,40 ativassem o plano PRO mensal de R$ 19,90) e não validava valores superiores à tarifa esperada (ex: R$ 20,00 ou R$ 50,00 passavam na verificação).

- **REGRA NOVA:**  
  ```typescript
  const expectedAmountCents = toCents(expectedPrice);
  const actualAmountCents = toCents(payment.transaction_amount);

  const isAmountValid =
    expectedAmountCents !== null &&
    actualAmountCents !== null &&
    expectedAmountCents > 0 &&
    actualAmountCents === expectedAmountCents;

  if (!isAmountValid && !payment._skipAmountCheck) {
    // Rejeição estrita com registro no WebhookEvent (status: FAILED, eventType: payment.amount_mismatch)
    return { status: "amount_mismatch", ... };
  }
  ```

- **ARQUIVO ALTERADO:** [`src/lib/mercadopago.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/lib/mercadopago.ts)
- **CAMPO DO MERCADO PAGO UTILIZADO:** `payment.transaction_amount` (valor bruto oficial cobrado da transação, não deduzido de taxas da adquirente ou tarifas de vendedor)
- **CAMPO DO BANCO UTILIZADO:** `Plan.priceMonth` / `Plan.priceYear` (armazenados e consultados dinamicamente via Prisma ORM com base no `planId` do `external_reference`)
- **COMPARAÇÃO EM CENTAVOS/DECIMAL:** SIM, conversão determinística via função `toCents(...)` para inteiros seguros (`number` representando centavos inteiros), eliminando artefatos de representação binária do IEEE 754 (ex: `19.9 * 100 = 1989.9999999999998`).
- **TOLERÂNCIA R$0,50 REMOVIDA:** SIM
- **PAGAMENTO HISTÓRICO ALTERADO:** NÃO (o pagamento real `#178856033673` de homologação no valor de R$ 1,00 é protegido pela verificação de idempotência prévia e permanece 100% inalterado no banco, com status `ACTIVE` e vigência de 30 dias preservada)
- **TESTES:**
  - `tests/test-amount-validation.ts`: **59/59 asserções aprovadas**
  - `tests/test-mercadopago-idempotency.ts`: **37/37 asserções aprovadas**
  - `tests/test-mp-webhook-signature.ts`: **15/15 asserções aprovadas**
  - `tests/test-admin-logs-search.ts`: **12/12 asserções aprovadas**
  - `tests/test-mercadopago-audit.ts`: **48/48 asserções aprovadas**
- **TYPESCRIPT:** 0 erros (`npx tsc --noEmit` executado com código de saída 0)
- **BUILD:** 37/37 rotas estáticas e dinâmicas geradas com sucesso (`npm run build` executado com código de saída 0)
- **PRISMA VALIDATE:** Válido (`npx prisma validate` executado com código de saída 0)
- **COMMIT:** `fix(payments): enforce exact server-side Mercado Pago amount validation`

---

## TABELA DE CENÁRIOS E RESULTADOS

| CENÁRIO | ESPERADO | RESULTADO | EVIDÊNCIA / MOTIVO |
| :--- | :---: | :---: | :--- |
| **19.90 / PRO mensal** | **ACCEPT** | **ACCEPT** | `1990 === 1990` (centavos exatos correspondentes ao preço server-side) |
| **19.9 / PRO mensal** | **ACCEPT** | **ACCEPT** | `1990 === 1990` (normalização monetária correta de 1 casa decimal) |
| **19.89 / PRO mensal** | **REJECT** | **REJECT** | `1989 !== 1990` (rejeitado como `amount_mismatch`, 1 centavo a menos) |
| **19.40 / PRO mensal** | **REJECT** | **REJECT** | `1940 !== 1990` (antiga tolerância de R$ 0,50 completamente eliminada) |
| **19.39 / PRO mensal** | **REJECT** | **REJECT** | `1939 !== 1990` (rejeitado como `amount_mismatch`) |
| **20.00 / PRO mensal** | **REJECT** | **REJECT** | `2000 !== 1990` (rejeitado: pagamento superior sem regra explícita não concede plano) |
| **0.01 / PRO mensal** | **REJECT** | **REJECT** | `1 !== 1990` (rejeitado como `amount_mismatch`) |
| **0.00 / PRO mensal** | **REJECT** | **REJECT** | `0 !== 1990` (rejeitado como `amount_mismatch`) |
| **-19.90 / PRO mensal** | **REJECT** | **REJECT** | `null !== 1990` (valor negativo categoricamente rejeitado pelo `toCents`) |
| **NaN / PRO mensal** | **REJECT** | **REJECT** | `null !== 1990` (rejeitado pelo `toCents`) |
| **Infinity / PRO mensal** | **REJECT** | **REJECT** | `null !== 1990` (rejeitado pelo `toCents`) |
| **null / undefined** | **REJECT** | **REJECT** | `null !== 1990` (rejeitado pelo `toCents`) |
| **29.90 / BUSINESS mensal** | **ACCEPT** | **ACCEPT** | `2990 === 2990` (centavos exatos correspondentes ao preço server-side) |
| **29.89 / BUSINESS mensal** | **REJECT** | **REJECT** | `2989 !== 2990` (rejeitado como `amount_mismatch`) |
| **29.40 / BUSINESS mensal** | **REJECT** | **REJECT** | `2940 !== 2990` (rejeitado como `amount_mismatch`) |
| **30.00 / BUSINESS mensal** | **REJECT** | **REJECT** | `3000 !== 2990` (rejeitado como `amount_mismatch`) |
| **99.00 / PRO anual** | **ACCEPT** | **ACCEPT** | `9900 === 9900` (centavos exatos correspondentes ao plano anual PRO) |
| **98.99 / PRO anual** | **REJECT** | **REJECT** | `9899 !== 9900` (rejeitado como `amount_mismatch`) |
| **99.01 / PRO anual** | **REJECT** | **REJECT** | `9901 !== 9900` (rejeitado como `amount_mismatch`) |
| **199.00 / BUSINESS anual** | **ACCEPT** | **ACCEPT** | `19900 === 19900` (centavos exatos correspondentes ao plano anual BUSINESS) |
| **198.99 / BUSINESS anual** | **REJECT** | **REJECT** | `19899 !== 19900` (rejeitado como `amount_mismatch`) |
| **199.01 / BUSINESS anual** | **REJECT** | **REJECT** | `19901 !== 19900` (rejeitado como `amount_mismatch`) |

---

## BLINDAGEM CONTRA MANIPULAÇÃO DE PREÇO NO FRONTEND

Foi testada e comprovada a imunidade contra manipulações no cliente:
- Qualquer parâmetro de valor injetado pelo frontend (como `price: 0.01` ou `amount: 0.01` no corpo da requisição de checkout) é completamente desconsiderado pelo servidor.
- O endpoint `/api/billing/mercadopago/checkout` e a função `createMercadoPagoPreference` consultam exclusivamente os modelos server-side `prisma.plan.findUnique({ where: { name: planName } })`.
- O webhook e o endpoint de polling realizam a validação cruzada do valor bruto do Mercado Pago contra o preço registrado no banco no momento da ativação.
- Tentativas de forjar pagamentos de menor ou maior valor resultam em status `amount_mismatch`, criação de log de advertência no servidor e registro com status `FAILED` na tabela `WebhookEvent`, sem qualquer impacto cadastral para o usuário.
