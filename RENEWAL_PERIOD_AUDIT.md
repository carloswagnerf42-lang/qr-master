# QR MASTER — AUDITORIA TÉCNICA E CORREÇÃO CONTROLADA
## RENOVAÇÃO ANTECIPADA E CÁLCULO DE PERÍODO DE VIGÊNCIA

**Data:** 20/09/2026  
**Ambiente:** Homologação Técnica / Produção  
**Componente:** `src/lib/mercadopago.ts` (`processMercadoPagoNotification`)  
**Status da Auditoria:** BUG COMERCIAL IDENTIFICADO, REPRODUZIDO E CORRIGIDO CIRURGICAMENTE (100% dos Testes de Regressão Aprovados)

---

## 1. COMPORTAMENTO ENCONTRADO ANTES DA ALTERAÇÃO

Antes da intervenção, o cálculo de expiração de assinaturas ativadas via Mercado Pago era efetuado de forma estática e cega em relação ao estado prévio do usuário:

```typescript
// CÓDIGO ANTERIOR (src/lib/mercadopago.ts: linhas 633-635)
const durationDays = isYearly ? 365 : 30;
const now = new Date();
const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
```

Esse valor `periodEnd` era repassado diretamente tanto para o `create` quanto para o `update` do `tx.subscription.upsert`:
```typescript
update: {
  planId: targetPlan.id,
  gateway: "mercadopago",
  gatewaySubscriptionId: gatewaySubId,
  status: "ACTIVE",
  currentPeriodStart: now,
  currentPeriodEnd: periodEnd, // <- Resetava para now + 30/365 dias
}
```

### Impacto Comercial do Comportamento Anterior
Se um assinante do plano **PRO mensal** com vencimento previsto para `10/10/2026` (restando 20 dias de vigência paga) efetuasse uma renovação antecipada em `20/09/2026`, o sistema calculava:
- `now` = 20/09/2026
- `periodEnd` = 20/09/2026 + 30 dias = `20/10/2026`

**Diagnóstico:** O cliente perdia integralmente os 20 dias restantes que já haviam sido quitados na fatura anterior. Em vez de usufruir de 50 dias de acesso (`10/10/2026 + 30 dias = 09/11/2026`), recebia apenas 30 dias a partir da nova compra.

---

## 2. ARQUIVOS E FUNÇÕES AUDITADAS

- [`src/lib/mercadopago.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/lib/mercadopago.ts):
  - Função `processMercadoPagoNotification(paymentId, mockPaymentData)`: núcleo atômico de transação financeira e ativação.
  - Função `getMercadoPagoPaymentStatus(paymentId, expectedUserId)`: endpoint de polling `/status` que repassa aprovações para a função acima.
- [`src/lib/permissions.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/lib/permissions.ts):
  - Função `calculateUserMonthlyQuotaWindow(createdAt, subscription)`: cálculo das janelas móveis de cota baseadas em `currentPeriodStart` e `currentPeriodEnd`.
  - Função `getUserPlanAndUsage(userId)`: resolução do plano efetivo e contagem de QRs criados no ciclo.
- [`src/app/api/webhooks/mercadopago/route.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/app/api/webhooks/mercadopago/route.ts): rota HTTP receptora de notificações IPN/Webhook.
- [`src/app/api/billing/mercadopago/status/route.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/app/api/billing/mercadopago/status/route.ts): rota HTTP de verificação síncrona com Anti-IDOR.

---

## 3. REPRODUÇÃO DO BUG COMERCIAL (FIXTURE ISOLADA)

A suíte [`tests/test-renewal-period.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/tests/test-renewal-period.ts) executou o cenário reproduzível antes da correção:
- **Usuário simulado:** `repro_test`
- **Plano:** PRO Mensal (R$ 19,90)
- **Status da Assinatura:** `ACTIVE`
- **Saldo restante:** 20 dias (`currentPeriodEnd = now + 20 dias`)
- **Nova compra legítima aprovada:** PRO Mensal (R$ 19,90)

**Resultado Observado no Código Anterior:**
```
[Auditoria] Dias de vigência restantes após renovação mensal: 30 dias
❌ [FAIL] 2.1. Renovação antecipada preserva os 20 dias restantes (obtido: 30 dias em vez de 50 dias)
```
**Classificação:** `BUG COMERCIAL — PERDA DE PERÍODO PAGO EM RENOVAÇÃO ANTECIPADA (CONFIRMADO)`.

---

## 4. CÁLCULO ANTES vs. CÁLCULO DEPOIS

### 4.1. Lógica Anterior
```typescript
const durationDays = isYearly ? 365 : 30;
const now = new Date();
const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
```

### 4.2. Lógica Corrigida (Cirúrgica e Defensiva)
```typescript
// Dentro da transação atômica tx.$transaction em src/lib/mercadopago.ts:
const existingSub = await tx.subscription.findUnique({
  where: { userId },
});

// Regra de Renovação do Mesmo Plano: preserva dias restantes se assinatura ainda estiver ativa
const isSamePlanRenewal =
  existingSub &&
  existingSub.status === "ACTIVE" &&
  existingSub.planId === targetPlan.id &&
  new Date(existingSub.currentPeriodEnd) > now;

const baseDate = isSamePlanRenewal
  ? new Date(existingSub.currentPeriodEnd)
  : now;

const periodEnd = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
```

---

## 5. MATRIZ DE AUDITORIA POR CENÁRIO

| # | Item de Auditoria | Comportamento Validado | Classificação |
|---|---|---|:---:|
| 1 | **Comportamento antes** | Resetava para `now + 30/365`, descartando saldo ativo | **PASS** |
| 2 | **Arquivos responsáveis** | `src/lib/mercadopago.ts` e `src/lib/permissions.ts` | **PASS** |
| 3 | **Reprodução do bug** | 20 dias restantes descartados comprovados em teste | **PASS** |
| 4 | **Cálculo antes** | `now + durationDays` cego | **PASS** |
| 5 | **Cálculo depois** | `baseDate = max(now, currentPeriodEnd) + durationDays` (mesmo plano) | **PASS** |
| 6 | **PRO mensal (A)** | 20 dias restantes -> estendido em exatamente +30 dias (~50 dias totais) | **PASS** |
| 7 | **PRO mensal (B)** | 1 dia restante -> estendido em exatamente +30 dias (~31 dias totais) | **PASS** |
| 8 | **PRO mensal (C)** | No vencimento exato (`now`) -> dura 30 dias exatos | **PASS** |
| 9 | **PRO mensal (D)** | Vencida há 1 dia -> recai em `now` (+30 dias a partir da aprovação) | **PASS** |
| 10 | **PRO mensal (E)** | Vencida há 30 dias -> recai em `now` (+30 dias a partir da aprovação) | **PASS** |
| 11 | **PRO mensal (F)** | Sem assinatura prévia -> dura 30 dias exatos a partir da aprovação | **PASS** |
| 12 | **PRO anual** | Antecipado (+365 dias sobre saldo) / Vencido (+365 dias sobre `now`) | **PASS** |
| 13 | **BUSINESS mensal** | Saldo existente preservado (+30 dias além do vencimento anterior) | **PASS** |
| 14 | **BUSINESS anual** | Saldo existente preservado (+365 dias além do vencimento anterior) | **PASS** |
| 15 | **Assinatura expirada** | Base recai estritamente em `now`, não adiciona tempo ao passado | **PASS** |
| 16 | **Primeira compra** | Concede exatamente 30/365 dias sem inventar período anterior | **PASS** |
| 17 | **Idempotência (1x..10x)** | Mesmo paymentId reprocessado 10 vezes estende período rigorosamente 1 vez | **PASS** |
| 18 | **Concorrência (2, 5, 10 workers)** | Lock atômico `P2002` garante 1 aprovação e deduplicação de concorrentes | **PASS** |
| 19 | **Webhook × Status** | Corrida tratada com shared claim `mp_claim_${paymentId}`, zero duplicatas | **PASS** |
| 20 | **PRO → BUSINESS (Upgrade)** | Substituição imediata para BUSINESS. Vigência inicia em `now` (30 dias de BUSINESS). Saldo de PRO não é somado sem pró-rata | **WARNING** |
| 21 | **Mudança de Ciclo** | PRO Mensal -> PRO Anual (mesmo plano): soma +365 dias ao saldo PRO | **PASS** |
| 22 | **currentPeriodStart** | Mantido como data da aprovação (`now`). Preserva novo ciclo mensal de cota | **PASS** |
| 23 | **Impacto em Quotas** | Usuário recebe cota renovada a partir do pagamento sem distorção | **PASS** |
| 24 | **Refund / Chargeback** | Reversão imediata para FREE sem exclusão de QR Codes ou dados | **PASS** |
| 25 | **Segurança de Pagamento** | Tolerância zero em centavos inteiros (`toCents`), anti-IDOR e anti-tampering | **PASS** |
| 26 | **Integridade #178856033673** | Transação histórica verificada antes e após os testes: 100% inalterada | **PASS** |
| 27 | **Zero Transações Reais** | Somente mocks sintéticos e fixtures em banco local foram utilizados | **PASS** |

---

## 6. ANÁLISE DETALHADA: UPGRADE PRO → BUSINESS

> [!WARNING]
> **POLÍTICA DE UPGRADE REQUER DECISÃO COMERCIAL**  
> Durante a auditoria (Fase 10), confirmou-se que a conversão **PRO → BUSINESS** não soma automaticamente os dias restantes de PRO aos dias de BUSINESS.  
> **Comportamento Atual:**
> 1. O plano do usuário é imediatamente atualizado para `BUSINESS`.
> 2. O limite de QR codes é imediatamente elevado para `999999` (comercialmente ilimitado).
> 3. A vigência de 30 dias de BUSINESS passa a contar de `now` até `now + 30 dias`.
> 4. Os dias remanescentes de PRO (cujo valor pago foi R$ 19,90) são substituídos pela nova assinatura de R$ 29,90.
> 
> **Por que não somar diretamente?**  
> Se um cliente possuir 25 dias restantes de PRO (pagos a R$ 0,66/dia) e comprar 1 mês de BUSINESS (que custa R$ 1,00/dia), somar diretamente 25 dias daria a ele 25 dias adicionais de BUSINESS (R$ 25,00) tendo pago apenas R$ 16,50 de PRO, gerando distorção financeira.  
> **Opções Comerciais para o Futuro:**
> - *Opção 1 (Vigente):* Substituição imediata com início do novo plano na compra.
> - *Opção 2 (Pró-rata financeiro):* Converter o valor financeiro não consumido do plano PRO em desconto no primeiro mês do BUSINESS via cupom.
> - *Opção 3 (Conversão de dias):* Converter os dias de PRO em dias de BUSINESS na proporção `19,90 / 29,90 = ~66%`.

---

## 7. ANÁLISE DA SEMÂNTICA DE `currentPeriodStart` (FASE 16)

Auditou-se se `currentPeriodStart` deveria ser mantido no início original da assinatura ou atualizado para `now` no momento da renovação.

1. **Dependência de Cotas (`calculateUserMonthlyQuotaWindow`):**
   ```typescript
   // src/lib/permissions.ts
   const monthQrCodeCount = await prisma.qRCode.count({
     where: {
       userId,
       deletedAt: null,
       createdAt: { gte: currentMonthStart },
     },
   });
   ```
2. **Conclusão Técnica:**
   - Ao manter `currentPeriodStart = now` (data da transação de renovação aprovada), a janela de criação de QR codes do cliente reinicia no instante em que ele pagou a renovação.
   - Isso garante que o cliente tenha imediatamente à sua disposição os 15 QR codes do novo ciclo contratado.
   - Se `currentPeriodStart` retroagisse à data antiga da primeira contratação, as criações realizadas nos 20 dias anteriores continuariam consumindo a cota do novo pagamento, o que frustraria o cliente.
   - Portanto, a decisão de manter `currentPeriodStart = now` e estender exclusivamente `currentPeriodEnd = max(now, currentPeriodEnd) + durationDays` é **tecnicamente e comercialmente ótima**.

---

## 8. INTEGRIDADE DA TRANSAÇÃO HISTÓRICA REAL (#178856033673)

- **ID do Pagamento:** `178856033673`
- **ID da Assinatura no Banco:** `cmu8hps850003e0kf40520blk`
- **Usuário:** `cmu7kt6i00001963f259rdlcj` (`itzjhonzin@gmail.com`)
- **Status:** `ACTIVE` (Preservado)
- **Plano:** `PRO` (Preservado)
- **Data Início:** `2026-09-19T14:36:05.862Z` (Preservado)
- **Data Vencimento:** `2026-10-19T14:36:05.862Z` (Preservado)
- **Auditoria de Logs:** 0 novos registros de atividade gerados.
- **Integridade:** **100% INTACTA**.

---

## 9. RESULTADOS DE TODAS AS REGRESSÕES

| Comando | Escopo | Asserções | Status |
|---|---|---|:---:|
| `npm run test:renewal-period` | Auditoria de renovação antecipada e preservação de vigência | 56 / 56 | **100% PASS** |
| `npm run test:checkout-cycle` | Ciclo comercial completo Mercado Pago, concorrência e idempotência | 69 / 69 | **100% PASS** |
| `npm run test:limits` | Limites de criação, bypass e concorrência de cotas | 58 / 58 | **100% PASS** |
| `npm run test:rate-limit` | Rate limit server-side em `POST /api/qr` | 76 / 76 | **100% PASS** |
| `npx prisma validate` | Validação do esquema Prisma | 1 / 1 | **100% PASS** |
| `npx tsc --noEmit` | Verificação estática de tipos TypeScript | 0 erros | **100% PASS** |
| `npm run build` | Compilação e empacotamento de produção Next.js | 37 rotas | **100% PASS** |

**Total de Asserções Automatizadas Validadas:** 260 asserções executadas com 100% de sucesso.
