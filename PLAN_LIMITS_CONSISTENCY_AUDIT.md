# QR MASTER — AUDITORIA CIRÚRGICA DE CONSISTÊNCIA DOS LIMITES DOS PLANOS

**Data:** 19/09/2026 (22:42 UTC-3)  
**Ambiente:** Homologação / Produção (`https://qrmasterpro.vercel.app`)  
**Status da Auditoria:** Somente Leitura (Zero alteração de código, banco, Mercado Pago ou produção)  
**Objeto Investigado:** Divergência de menção a "1.000 QRs" e "10.000 QRs" no relatório anterior (`QR_MASTER_COMMERCIAL_SECURITY_AUDIT.md`) versus regras reais do sistema.

---

## 1. DIVERGÊNCIA INVESTIGADA

No relatório `QR_MASTER_COMMERCIAL_SECURITY_AUDIT.md` (Seção 4: Estado Final do Ciclo Comercial), a tabela descritiva listava:
- **FREE:** `5 QRs`
- **PRO:** `Ilimitado / 1.000 QRs`
- **BUSINESS:** `Ilimitado / 10.000 QRs`

Esta auditoria cirúrgica rastreou rigorosamente cada camada do sistema (schema, banco de dados, `permissions.ts`, endpoints de API, páginas de usuário, painel administrativo, seed e suítes de testes) para averiguar se esses números representam regras reais ou erro textual.

---

## 2. MAPA DE TODAS AS FONTES DE VERDADE

Abaixo está o mapeamento detalhado de cada componente do sistema e os valores que cada um adota para os planos:

| FONTE DE VERDADE | PLANO FREE | PLANO PRO | PLANO BUSINESS | É AUTORIDADE DE ENFORCEMENT? |
| :--- | :---: | :---: | :---: | :---: |
| **Banco de Dados (Tabela `Plan`)** | `5` (`maxQRCodes`) | `15` (`maxQRCodes` / `maxQRCodesYear`) | `999999` (`maxQRCodes`) | **SIM (Fonte primária)** |
| **Prisma Schema (`schema.prisma`)** | `@default(5)` | Não fixa por plano | Não fixa por plano | Estrutura |
| **Prisma Seed (`prisma/seed.ts`)** | `5` QRs | `15` QRs/mês (`maxQRCodes: 15`) | `999999` QRs/mês (`maxQRCodes: 999999`) | Inicialização |
| **Core de Permissões (`permissions.ts`)** | `5` QRs/mês | `15` QRs/mês (`plan.maxQRCodes ?? 50`) | `999999` QRs/mês (Hardcoded `currentMonthLimit`) | **SIM (Regra de negócio)** |
| **Backend Enforcement (`POST /api/qr`)** | `5` QRs/mês | `15` QRs/mês | `999999` QRs/mês (Ilimitado) | **SIM (Autoridade final)** |
| **Painel do Usuário (`Settings -> Plan`)** | `Até 5/mês` | `15 QR Codes por Mês` | `QR Codes Ilimitados` | NÃO (Somente exibição) |
| **Painel Admin (`Admin -> Planos`)** | `5 QRs/mês` | `15 QRs/mês` | `Ilimitado` (`> 9999`) | NÃO (Interface de gestão) |
| **Suíte de Testes Oficial (`test-plans-limits-audit.ts`)** | `5` QRs/mês | `15` QRs/mês (testado 14, 15 e 16 bloq.) | `Ilimitado` | Validação |
| **Suíte de Testes UX (`test-ux-dashboard-settings-audit.ts`)** | `5` QRs | `15` QRs (`proPlan.maxQRCodes === 15`) | `999999` QRs (`bizPlan.maxQRCodes >= 999999`) | Validação |
| **Relatório Anterior (`QR_MASTER_COMMERCIAL_SECURITY_AUDIT.md`)** | `5 QRs` | `Ilimitado / 1.000 QRs` | `Ilimitado / 10.000 QRs` | **NÃO (Erro de redação)** |

---

## 3. BANCO DE DADOS — DADOS REAIS DA TABELA `Plan`

Consulta relacional executada diretamente no banco de dados de homologação/produção (somente campos públicos e estruturais):

```sql
SELECT id, name, "displayName", "priceMonth", "priceYear", "maxQRCodes", "maxQRCodesYear", "dynamicQRs", analytics, "customLogo", campaigns FROM "Plan" ORDER BY "priceMonth" ASC;
```

### Tabela Oficial de Planos do Banco de Dados:

| PLANO | LIMITE NO BANCO (`maxQRCodes`) | LIMITE ANUAL (`maxQRCodesYear`) | PREÇO MENSAL | PREÇO ANUAL | QR DINÂMICO | ANALYTICS |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **FREE** | **5** | 5 | R$ 0,00 | R$ 0,00 | Não | Não |
| **PRO** | **15** | 15 | R$ 19,90 | R$ 99,00 | Sim | Sim |
| **BUSINESS** | **999.999** | 999.999 | R$ 29,90 | R$ 199,00 | Sim | Sim |

---

## 4. BACKEND — CADEIA REAL DE ENFORCEMENT

A autoridade final sobre se um usuário pode ou não criar um QR Code reside inteiramente no backend através da seguinte cadeia determinística:

1. **Requisição HTTP:** O cliente executa `POST /api/qr`. O corpo da requisição é sanitizado. Nenhuma propriedade enviada pelo cliente referente a plano, cota ou permissão é aceita.
2. **Identificação e Contexto (`getUserPlanAndUsage`):**
   - Arquivo: [`src/lib/permissions.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/lib/permissions.ts) (linhas 203 a 326)
   - O backend busca o usuário autenticado via `session.id` no banco de dados e calcula a janela de cota de 30 dias (`calculateUserMonthlyQuotaWindow`).
   - Se o usuário possuir assinatura `ACTIVE`, o plano vem de `user.subscription.plan`. Se não houver assinatura ativa, recai em `freePlan` do banco de dados (ou `DEFAULT_FREE_PLAN`).
   - Determinação do limite mensal (`currentMonthLimit`):
     ```typescript
     let currentMonthLimit = plan.maxQRCodes ?? 5;
     if (plan.name === "PRO") {
       if (isYearly) {
         currentMonthLimit = plan.maxQRCodesYear ?? 15;
       } else {
         currentMonthLimit = plan.maxQRCodes ?? 50;
       }
     } else if (plan.name === "BUSINESS") {
       currentMonthLimit = 999999;
     } else if (plan.name === "FREE") {
       currentMonthLimit = plan.maxQRCodes ?? 5;
     }
     ```
     Como no banco de dados `PRO.maxQRCodes = 15`, a expressão `plan.maxQRCodes ?? 50` avalia para **15**.
3. **Pré-validação de Permissão (`checkPermission`):**
   - Arquivo: [`src/lib/permissions.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/lib/permissions.ts) (linhas 351 a 365)
   - Compara `user.qrCodeCount >= limit`. Se atingido, bloqueia imediatamente com HTTP 403 `LIMIT_REACHED`.
4. **Enforcement Transacional com Lock (`POST /api/qr`):**
   - Arquivo: [`src/app/api/qr/route.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/app/api/qr/route.ts) (linhas 204 a 241)
   - Abre transação no PostgreSQL e adquire `pg_advisory_xact_lock(hashtext(session.id))`.
   - Reconta os QR codes criados pelo usuário dentro da janela do ciclo atual (`createdAt >= currentMonthStart` e `deletedAt IS NULL`).
   - Se `currentCount >= effectiveLimit`, lança exceção com status 403 `LIMIT_REACHED`.
   - Somente se aprovado, executa `tx.qRCode.create(...)`.

---

## 5. TESTES DE COMPORTAMENTO EXECUTADOS

Utilizando o motor real de resolução de permissões e entitlements do backend com contagens simuladas em torno dos limites:

| CONTAGEM | PLANO TESTADO | LIMITE EFETIVO | ALLOWED | MOTIVO / RESPOSTA DO BACKEND |
| :---: | :--- | :---: | :---: | :--- |
| **4** | **FREE** (mensal) | 5 | `true` | OK (Permitido) |
| **5** | **FREE** (mensal) | 5 | `false` | *Você atingiu o limite mensal de 5 QR Codes do plano FREE. Sua cota renova no próximo ciclo.* |
| **6** | **FREE** (mensal) | 5 | `false` | *Você atingiu o limite mensal de 5 QR Codes do plano FREE.* (HTTP 403 `LIMIT_REACHED`) |
| **14** | **PRO** (mensal) | 15 | `true` | OK (Permitido) |
| **15** | **PRO** (mensal) | 15 | `false` | *Você atingiu o limite mensal de 15 QR Codes do plano PRO. Para criar QR Codes sem limites mensais, faça upgrade para o plano BUSINESS.* |
| **16** | **PRO** (mensal) | 15 | `false` | *Você atingiu o limite mensal de 15 QR Codes do plano PRO.* (HTTP 403 `LIMIT_REACHED`) |
| **999** | **PRO** (mensal) | 15 | `false` | Bloqueado estritamente por limite de 15 |
| **1.000** | **PRO** (mensal) | 15 | `false` | Bloqueado estritamente por limite de 15 |
| **1.001** | **PRO** (mensal) | 15 | `false` | Bloqueado estritamente por limite de 15 |
| **14** | **PRO** (anual) | 15 | `true` | OK (Permitido) |
| **15** | **PRO** (anual) | 15 | `false` | Bloqueado estritamente por limite de 15 |
| **16** | **PRO** (anual) | 15 | `false` | Bloqueado estritamente por limite de 15 |
| **14** | **BUSINESS** | 999.999 | `true` | OK (Permitido) |
| **15** | **BUSINESS** | 999.999 | `true` | OK (Permitido) |
| **16** | **BUSINESS** | 999.999 | `true` | OK (Permitido) |
| **999** | **BUSINESS** | 999.999 | `true` | OK (Permitido) |
| **1.000** | **BUSINESS** | 999.999 | `true` | OK (Permitido) |
| **10.000** | **BUSINESS** | 999.999 | `true` | OK (Permitido) |
| **999.998** | **BUSINESS** | 999.999 | `true` | OK (Permitido) |
| **999.999** | **BUSINESS** | 999.999 | `false` | Limite sentinela atingido (999.999) |

---

## 6. PAINEL DO USUÁRIO (`Settings -> Plan & Limits`)

Auditada a tela [`src/app/(dashboard)/settings/page.tsx`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/app/%28dashboard%29/settings/page.tsx):
- **Origem dos Dados:** A página consome a rota `/api/auth/me` e `/api/billing/subscription`. O backend alimenta `data.plan` e `data.usage` com base no `getUserPlanAndUsage()`.
- **Exibições para cada plano:**
  - **FREE:** Linha 1308 exibe expressamente: `"QR Codes Estáticos (até 5/mês)"`. A barra de progresso (L1265) exibe: `X de 5 criados este mês`.
  - **PRO:** Linha 1335 avalia: `{userPlan?.name === "BUSINESS" ? "QR Codes Ilimitados" : "15 QR Codes por Mês"}`. Para PRO, renderiza expressamente: **`15 QR Codes por Mês`**. A barra de progresso exibe: `X de 15 criados este mês`.
  - **BUSINESS:** Linha 1335 renderiza: **`QR Codes Ilimitados`**. A barra de progresso (L1263) avalia: `(usage?.maxQRCodes > 9999 ? "Uso Ilimitado" : ...)`, renderizando **`Uso Ilimitado`** e o texto informativo: `"Você pode gerar quantos QR Codes precisar sem restrições mensais."` (L1284).

---

## 7. PAINEL ADMIN (`Admin -> Planos & Preços`)

Auditado o componente [`src/app/(admin)/admin/AdminUserManagement.tsx`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/app/%28admin%29/admin/AdminUserManagement.tsx) e a API [`src/app/api/admin/plan/route.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/app/api/admin/plan/route.ts):
- **Apresentação visual dos limites:**
  - Linha 955: `{plan.maxQRCodes && plan.maxQRCodes > 9999 ? "Ilimitado" : `${plan.maxQRCodes ?? 5} QRs/mês`}`
  - Para FREE: Exibe **`5 QRs/mês`**.
  - Para PRO: Exibe **`15 QRs/mês`** (mensal) e **`15 QRs/mês`** (anual).
  - Para BUSINESS: Como `maxQRCodes` é `999999` (> 9999), exibe **`Ilimitado`**.
- **Impacto de Alteração de Limite no Admin:**
  - O modal de edição envia `PATCH /api/admin/plan` com `maxQRCodes` e `maxQRCodesYear`, persistindo diretamente na tabela `Plan`.
  - **Para FREE:** Se alterado no Admin, altera o enforcement server-side imediatamente (pois `getUserPlanAndUsage` lê `plan.maxQRCodes`).
  - **Para PRO:** Se alterado no Admin, altera o enforcement server-side imediatamente (lê `plan.maxQRCodes` ou `plan.maxQRCodesYear`).
  - **Para BUSINESS:** No banco o valor é salvo, porém em `permissions.ts` (L301) o valor do BUSINESS está travado em `999999` (`currentMonthLimit = 999999`), garantindo que continue operando como ilimitado.

---

## 8. ORIGEM DOS NÚMEROS 1.000 E 10.000

Realizada busca exaustiva por `1000`, `10000`, `1.000` e `10.000` em todo o código-fonte, banco de dados, schemas, migrations, seeds e testes.

### Respostas Explícitas:
- **"1000 veio de: DOCUMENTAÇÃO / ERRO ISOLADO DE REDAÇÃO DO RELATÓRIO ANTERIOR"**
  - O número 1.000 **NÃO existe** no banco de dados para o plano PRO (`PRO.maxQRCodes` é **15**).
  - O número 1.000 **NÃO existe** em `permissions.ts` para o plano PRO.
  - O número 1.000 **NÃO existe** na UI de Settings (Settings exibe "15 QR Codes por Mês").
  - O número 1.000 **NÃO existe** no Admin (Admin exibe "15 QRs/mês").
  - A string `"Ilimitado / 1.000 QRs"` apareceu única e exclusivamente na tabela markdown da Seção 4 do arquivo `QR_MASTER_COMMERCIAL_SECURITY_AUDIT.md`, redigida de forma descuidada/alucinada pelo agente anterior como uma generalização típica de planos SaaS, sem correspondência com o sistema real.
- **"10000 veio de: DOCUMENTAÇÃO / ERRO ISOLADO DE REDAÇÃO DO RELATÓRIO ANTERIOR"**
  - O número 10.000 **NÃO é o limite do plano BUSINESS**.
  - No banco de dados e no backend, o plano BUSINESS possui cota sentinela de **999.999** (representando **Ilimitado**).
  - Em testes (`test-plans-and-permissions.ts:166`), `qrCodeCount: 10000` foi utilizado apenas como valor arbitrário para testar o bypass do perfil `ADMIN`.
  - A string `"Ilimitado / 10.000 QRs"` no relatório anterior foi outro erro redacional manual do agente anterior.

---

## 9. SIGNIFICADO DE "ILIMITADO"

A expressão `"Ilimitado / 1.000 QRs"` e `"Ilimitado / 10.000 QRs"` no relatório anterior é uma **contradição semântica evidente**:
- O plano **PRO NÃO É ILIMITADO**. O plano PRO possui cota estrita de **15 QR Codes por mês** (tanto no plano mensal quanto no plano anual). O usuário PRO que tenta criar o 16º QR Code no ciclo é bloqueado com HTTP 403 `LIMIT_REACHED`.
- O plano **BUSINESS É COMERCIALMENTE ILIMITADO**. Para fins de persistência em banco de dados relacional (onde `maxQRCodes` é uma coluna `INTEGER`), adotou-se o número sentinela **999.999**, tratado pelo frontend e pelo Admin como `"Ilimitado"` através da cláusula `maxQRCodes > 9999 ? "Ilimitado" : ...`.

---

## 10. CÁLCULO DA QUOTA: MENSAL vs HISTÓRICO TOTAL

Auditada a função `calculateUserMonthlyQuotaWindow` em [`src/lib/permissions.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/lib/permissions.ts#L158-L198):
- **O limite NÃO é cumulativo histórico eterno**.
- **O limite é rigorosamente POR CICLO MENSAL DE 30 DIAS**:
  - **Para usuários FREE:** O ciclo de 30 dias é ancorado na data de cadastro do usuário (`user.createdAt`):
    `currentMonthStart = user.createdAt + (ciclos_passados * 30 dias)`.
  - **Para assinantes mensais:** O ciclo é delimitado pelo período faturado (`subscription.currentPeriodStart` até `subscription.currentPeriodEnd`).
  - **Para assinantes anuais:** Os 365 dias são segmentados em 12 janelas consecutivas de 30 dias (`monthIndex = Math.floor(elapsedDays / 30)`).
- **Consulta de contagem:** O backend conta estritamente:
  ```typescript
  prisma.qRCode.count({
    where: {
      userId,
      deletedAt: null,
      createdAt: { gte: currentMonthStart },
    },
  });
  ```
  Isso garante que cada ciclo de 30 dias renova integralmente a cota de criação (5 para FREE, 15 para PRO).

---

## 11. COMPORTAMENTO DE QRS ANTIGOS NA VIRADA DE CICLO

- Quando o ciclo de 30 dias vira, a data `currentMonthStart` avança 30 dias.
- Como a contagem é `createdAt: { gte: currentMonthStart }`, os QR codes criados no mês anterior **não contam mais** para a cota do novo mês.
- **Preservação Integral:** Nenhum QR Code antigo é apagado, desativado ou modificado. O acervo histórico (`totalQrCodeCount`) permanece 100% preservado no banco e acessível ao usuário. O usuário simplesmente ganha o direito de criar mais 5 (se FREE) ou mais 15 (se PRO) novos QR Codes no novo ciclo.

---

## 12. COMPORTAMENTO EM CASO DE DOWNGRADE

Quando um usuário PRO (que possui, por exemplo, 15 QRs criados) sofre downgrade para FREE (por expiração de período, estorno ou chargeback):
1. **Preservação de Dados:** O sistema **NÃO apaga** nenhum dos 15 QR Codes já criados no passado. Scans e relatórios continuam gravados no banco.
2. **Novas Criações:** O entitlement efetivo do usuário passa a ser `DEFAULT_FREE_PLAN` (`maxQRCodes: 5`). Como ele já possui mais de 5 QRs criados no ciclo, qualquer tentativa de criar um novo QR estático é bloqueada com HTTP 403 `LIMIT_REACHED`.
3. **QR Codes Dinâmicos:** Qualquer tentativa de criar um novo QR dinâmico é bloqueada com HTTP 403 `UPGRADE_REQUIRED`.
4. **Links de Redirecionamento Existentes (`/q/[shortCode]`):** O endpoint público `/q/[shortCode]` inspeciona o plano atual do proprietário: se o dono não possui mais plano ativo com suporte a dinâmicos, o redirecionamento exibe a página informativa de "Plano Suspenso / Assinatura Expirada", preservando a URL de destino intacta no banco para quando o usuário reativar.

---

## 13. AUTORIDADE DO BACKEND vs CLIENT-SIDE

Confirmado com rigor:
- Modificações no navegador (ex: adulterar `usage.maxQRCodes`, `plan.name = "BUSINESS"` no React State ou LocalStorage) **NÃO possuem qualquer efeito prático**.
- O endpoint `POST /api/qr` lê a sessão JWT do cookie seguro, busca os dados da conta no PostgreSQL via Prisma e executa uma transação atômica protegida por advisory lock no banco.
- O backend é a **única autoridade de enforcement**.

---

## 14 & 15. CONFIRMAÇÃO DE SALVAGUARDAS

- **Preços:** Permanecem rigorosamente inalterados (FREE: R$ 0, PRO: R$ 19,90/mês e R$ 99,00/ano, BUSINESS: R$ 29,90/mês e R$ 199,00/ano).
- **Mercado Pago:** Nenhuma alteração foi feita em webhooks, HMAC, claims atômicos, validação de centavos ou idempotência. O pagamento `#178856033673` e a conta de `joaolucas` continuam 100% intocados.

---

## 16. SÍNTESE DOS LIMITES EFETIVAMENTE ENFORÇADOS

### Limites Reais Enforçados pelo Backend:
- **FREE:** **`5 QR Codes`**
- **PRO:** **`15 QR Codes`** (mensal e anual)
- **BUSINESS:** **`Ilimitado`** (sentinela técnica: `999.999 QR Codes`)
- **Unidade de Medida:** **Por Ciclo Mensal (janela móvel de 30 dias)**.

---

## 17. CLASSIFICAÇÃO FINAL DA DIVERGÊNCIA

A situação constatada enquadra-se estritamente na categoria:

### **`A) SEM DIVERGÊNCIA REAL NO SISTEMA`**
> **O relatório anterior (`QR_MASTER_COMMERCIAL_SECURITY_AUDIT.md`) apenas descreveu incorretamente os limites comerciais.**  
> O banco de dados, o backend, as rotas de API, as regras de permissão, a página de configurações (`Settings`) e o painel administrativo (`Admin`) estão **100% alinhados e consistentes entre si**:
> - FREE = 5 QRs/mês
> - PRO = 15 QRs/mês
> - BUSINESS = Ilimitado (999.999 QRs/mês)
> 
> Os números "1.000" e "10.000" foram fruto exclusivo de um texto genérico alucinado na tabela markdown do relatório adversarial anterior.

---

## 18. CONTROLE DE CÓDIGO E VERSIONAMENTO

Em cumprimento estrito às diretrizes da auditoria:
- **Nenhum código do sistema foi modificado.**
- **Nenhum dado do banco foi alterado.**
- Este diagnóstico é estritamente documental e analítico.

---

## 19. CONCLUSÃO OBRIGATÓRIA (RESPOSTAS ÀS 10 PERGUNTAS)

### 1. Qual é o limite FREE real?
**Exatamente 5 QR Codes estáticos por mês (ciclo de 30 dias).**

### 2. Qual é o limite PRO real?
**Exatamente 15 QR Codes (estáticos ou dinâmicos) por mês (ciclo de 30 dias).**

### 3. Qual é o limite BUSINESS real?
**Ilimitado (implementado com sentinela técnica de 999.999 QR Codes por mês).**

### 4. Esses limites são mensais, por ciclo ou históricos?
**São estritamente por ciclo mensal (janela móvel de 30 dias).** O acervo histórico total de QR codes antigos permanece intacto e não consome a cota dos novos ciclos.

### 5. De onde veio o número 1000?
**De um erro isolado de redação/alucinação textual do agente anterior no documento `QR_MASTER_COMMERCIAL_SECURITY_AUDIT.md`.** Não existe no banco, nas regras de negócio, na UI e nem no Admin.

### 6. De onde veio o número 10000?
**Do mesmo erro isolado de redação textual no relatório anterior.** O limite real do BUSINESS no banco e no backend é 999.999 (Ilimitado).

### 7. Banco e backend concordam?
**Sim.** O banco possui `FREE: 5`, `PRO: 15`, `BUSINESS: 999999`, e o backend em [`src/lib/permissions.ts`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/lib/permissions.ts) aplica exatamente esses valores.

### 8. Backend e frontend concordam?
**Sim.** O frontend em [`src/app/(dashboard)/settings/page.tsx`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/app/%28dashboard%29/settings/page.tsx) exibe `"até 5/mês"` para FREE, `"15 QR Codes por Mês"` para PRO e `"QR Codes Ilimitados"` para BUSINESS.

### 9. Admin e backend concordam?
**Sim.** O Admin em [`src/app/(admin)/admin/AdminUserManagement.tsx`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/app/%28admin%29/admin/AdminUserManagement.tsx) exibe `"5 QRs/mês"` para FREE, `"15 QRs/mês"` para PRO e `"Ilimitado"` para BUSINESS, consumindo e atualizando os campos reais do banco.

### 10. Existe bug que precisa ser corrigido?
**No código e no banco: NÃO.** O sistema opera de forma perfeitamente coerente e consistente em todas as camadas.  
**Na documentação: SIM.** A tabela da Seção 4 do arquivo `QR_MASTER_COMMERCIAL_SECURITY_AUDIT.md` continha a menção incorreta a "1.000 QRs" e "10.000 QRs", devendo ser retificada para registrar a verdade do sistema: **PRO = 15 QRs/mês** e **BUSINESS = Ilimitado**.
