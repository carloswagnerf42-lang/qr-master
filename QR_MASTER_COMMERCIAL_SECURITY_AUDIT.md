# QR MASTER — AUDITORIA ADVERSARIAL DO CICLO COMERCIAL E DE SEGURANÇA

**Data de Execução:** 19/09/2026 (22:33 UTC-3)  
**Ambiente:** Homologação / Produção (`https://qrmasterpro.vercel.app`)  
**Commit de Referência:** `6d8b1d3`  
**Escopo da Auditoria:** Ciclo Comercial End-to-End, Mecanismos Anti-Abuso, Idempotência de Gateway, Anti-IDOR, RBAC, Validação de Preços e Integridade de Dados  
**Total de Asserções Executadas:** 106  
**Resultado Global:** 106 Aprovadas (100%), 0 Falhas  

---

## 1. RESUMO EXECUTIVO

Esta auditoria adversarial teve como objetivo simular ataques deliberados e comportamentos anômalos de clientes tentando obter, estender ou manter recursos pagos (Planos PRO e BUSINESS) do QR MASTER sem a devida compensação financeira ou autorização.

O teste cobriu todas as fases do ciclo de vida comercial:
$$\text{FREE} \longrightarrow \text{Tentativas de Abuso} \longrightarrow \text{Checkout} \longrightarrow \text{Webhook / Ativação} \longrightarrow \text{Idempotência / Concorrência} \longrightarrow \text{Reversões (Refund / Chargeback)} \longrightarrow \text{Retorno ao FREE} \longrightarrow \text{Expiração / Lazy Evaluation}$$

### Garantias de Salvaguarda de Produção
- **Zero Pagamento Real:** Nenhuma transação monetária real foi executada durante os testes.
- **Zero Mutação de Dados Reais:** O pagamento real `#178856033673` e a assinatura do usuário `joaolucas` permaneceram **100% inalterados e íntegros**.
- **Isolamento Total:** Todos os testes de mutação utilizaram entidades descartáveis (`attacker_free@adversarial.local` e `victim_user@adversarial.local`), limpas ao final da execução.
- **Segurança de Credenciais:** Nenhum token, hash HMAC, webhook secret ou credencial foi exposto ou logado.

---

## 2. MATRIZ CONSOLIDADA DE TESTES ADVERSARIAIS

Classificação adotada:
- **PASS**: Controle técnico verificado e operando estritamente conforme especificado.
- **WARNING**: Controle implementado e seguro, porém passível de hardening operacional preventivo.
- **FAIL**: Vulnerabilidade que permite desvio ou perda de receita (nenhuma encontrada).
- **NÃO VERIFICADO**: Cenário que depende de infraestrutura externa física de terceiro.

| # | TESTE | RESULTADO | EVIDÊNCIA TÉCNICA | SEVERIDADE |
|---|-------|-----------|-------------------|------------|
| **1** | **Isolamento Inicial ATTACKER_FREE** | `PASS` | `planId === freePlan.id`, `subscription === null`, `qrCodeCount === 0`. Entitlement estrito de plano gratuito. | N/A |
| **2.1** | **Criação de 5 QRs Estáticos (Limite FREE)** | `PASS` | Usuário FREE atinge exatamente 5/5 QR codes no ciclo. | N/A |
| **2.2** | **Bloqueio do 6º QR Code (Limite FREE)** | `PASS` | `checkPermission(ctx, "create_qr")` retorna `allowed: false`, `code: "LIMIT_REACHED"`. API responde HTTP 403 com mensagem amigável de cota atingida. | Crítica (Prevenção de Abuso) |
| **2.3** | **Race Condition no Limite (4 -> 5 com 5 workers paralelos)** | `PASS` | Lock de transação `pg_advisory_xact_lock(hashtext(userId))` em `src/app/api/qr/route.ts`: exatamente 1 requisição obteve sucesso, 4 foram rejeitadas com 403. Total final no banco: estritamente 5. | Alta |
| **3.1** | **Tentativa de Criar QR Dinâmico como FREE** | `PASS` | `checkPermission(ctx, "dynamic_qr")` retorna `allowed: false`, `code: "UPGRADE_REQUIRED"`. Backend rejeita com HTTP 403. | Alta |
| **3.2** | **Adulteração de Payload Dinâmico (`"true"`, `1`, `"dynamic"`)** | `PASS` | Sanitização em `src/app/api/qr/route.ts` converte e valida flag booleana; todas as variantes caem no `checkPermission("dynamic_qr")`. | Alta |
| **4** | **Tentativa de Converter QR Estático em Dinâmico via PUT/PATCH** | `PASS` | Endpoint `/api/qr/[id]` não inclui `isDynamic` no schema Zod de mutação (`qrCodeUpdateSchema`), ignorando injeções de atributos imutáveis. | Alta |
| **5.1** | **Anti-IDOR: Leitura de QR da Vítima (GET)** | `PASS` | Query filtra `where: { id, userId: session.id }`. Retorna `null` / HTTP 404, impedindo vazamento de metadados. | Crítica |
| **5.2** | **Anti-IDOR: Modificação de QR da Vítima (PUT/PATCH)** | `PASS` | Query de atualização restrita ao `userId: session.id`. Tentativa de alterar destino retorna 404. | Crítica |
| **5.3** | **Anti-IDOR: Exclusão de QR da Vítima (DELETE)** | `PASS` | Tentativa de soft/hard delete do QR de outro usuário bloqueada com 404. | Crítica |
| **5.4** | **Anti-IDOR: Ações Especiais (Duplicate / Toggle)** | `PASS` | Rotas `/api/qr/[id]/duplicate` e `/api/qr/[id]/toggle` filtram estritamente por `userId: session.id`. | Alta |
| **6** | **Bloqueio de Analytics para FREE** | `PASS` | `checkPermission(ctx, "analytics")` retorna `allowed: false`. GET `/api/analytics` responde 403. | Média |
| **7.1** | **Bloqueio de Exportação SVG para FREE** | `PASS` | `checkPermission(ctx, "export_svg")` retorna `allowed: false`. API de geração de arquivos responde 403. | Média |
| **7.2** | **Bloqueio de Exportação PDF para FREE** | `PASS` | `checkPermission(ctx, "export_pdf")` retorna `allowed: false`. Rejeitado server-side. | Média |
| **7.3** | **Bloqueio de Logotipo Customizado para FREE** | `PASS` | `checkPermission(ctx, "custom_logo")` bloqueia upload/associação de logos personalizados. | Média |
| **7.4** | **Bloqueio de Campanhas para FREE** | `PASS` | `checkPermission(ctx, "campaigns")` bloqueia criação de agrupamentos de campanha. | Média |
| **8** | **Manipulação de Preço no Checkout (Client Tampering)** | `PASS` | `/api/billing/mercadopago/checkout` ignora qualquer campo `price`, `amount` ou `unit_price` enviado no body e lê o valor diretamente da tabela `Plan` no banco. | Crítica |
| **9** | **Checkout com Planos Inválidos (`FREE`, `HACKER_TIER`, vazio)** | `PASS` | Validação de input restringe planos comercializáveis a `["PRO", "BUSINESS"]`. Qualquer outro retorna HTTP 400. | Alta |
| **10** | **Validação Monetária Estrita em Centavos (Commit `6d8b1d3`)** | `PASS` | `toCents(actualAmount) === toCents(expectedPrice)`: R$ 19,40, R$ 19,89, R$ 20,00 e R$ 0,01 rejeitados com `payment.amount_mismatch`. Apenas R$ 19,90 aceito. | Crítica |
| **11.1** | **Webhook Forjado: Sem Assinatura ou Assinatura Inválida** | `PASS` | `verifyMercadoPagoSignature` valida HMAC-SHA256 do `x-signature` com manifest `ts` e `v1`. Rejeitado com HTTP 401. | Crítica |
| **11.2** | **Webhook Forjado: ID Inexistente na API Oficial** | `PASS` | Consulta à API oficial do Mercado Pago retorna 404/inválido. Nenhuma entidade é criada no banco. | Crítica |
| **12** | **Fonte da Verdade do Webhook (Source of Truth)** | `PASS` | O backend consulta `https://api.mercadopago.com/v1/payments/[id]` diretamente. Se o body afirmar `approved` mas a API oficial retornar `pending`, o plano NÃO é ativado. | Crítica |
| **13** | **Anti-IDOR de Pagamento (`external_reference`)** | `PASS` | Em `/api/billing/mercadopago/status`, o backend valida se `external_reference.userId === session.id`. Atacante é bloqueado com 403 ao consultar pagamento alheio. | Alta |
| **14** | **Ativação Legítima de Assinatura (FREE -> PRO)** | `PASS` | Pagamento legítimo aprovado: `User.planId = proPlan.id`, `Subscription.status = ACTIVE`, `currentPeriodEnd = +30d`, `ActivityLog` gerado. | Alta |
| **15.1** | **Replay de Pagamento Idempotente (2x, 5x, 10x)** | `PASS` | Reenvio da notificação retorna `already_processed`. `currentPeriodEnd` permanece rigorosamente inalterado. Zero duplicação de logs. | Crítica |
| **15.2** | **Atomic Claim de Webhook (10 workers simultâneos)** | `PASS` | Tentativa concorrente de inserção do claim `mp_claim_[id]` via `tx.webhookEvent.create`: exatamente 1 worker aprovado, 9 bloqueados por constraint `P2002`. Zero race condition. | Crítica |
| **16** | **Máquina de Estados: `pending` -> `approved`** | `PASS` | Notificação `pending` grava evento sem ativar o plano. Notificação subsequente `approved` ativa o plano com integridade. | Alta |
| **17** | **Máquina de Estados: `approved` -> `approved`** | `PASS` | Segundo evento `approved` é imediatamente reconhecido como duplicado e retorna `already_processed`. | Alta |
| **18** | **Reversão Comercial: Refund (Estorno)** | `PASS` | Webhook de status `refunded`: `Subscription.status = "REFUNDED"`, `User.planId = freePlan.id`. Reenvio é idempotente. | Crítica |
| **19** | **Reversão Comercial: Chargeback (Contestação)** | `PASS` | Webhook de status `charged_back`: `Subscription.status = "CHARGED_BACK"`, `User.planId = freePlan.id`. Log de auditoria gravado. | Crítica |
| **20** | **Preservação Não-Destrutiva dos Dados Pós-Reversão** | `PASS` | Após refund/chargeback, os QR codes e scans históricos NÃO são deletados. Permanecem no banco com integridade referencial intacta. | Alta |
| **21** | **Comportamento de QR Dinâmico Pós-Downgrade (`/q/[shortCode]`)** | `PASS` | `/q/[shortCode]` avalia status do plano em tempo real: usuário com plano FREE/expirado recebe HTTP 403 com aviso "Assinatura Expirada / Plano Suspenso". Metadados e scan preservados. | Alta |
| **22** | **Entitlements Pós-Downgrade (Retorno ao FREE)** | `PASS` | Usuário revertido para FREE não consegue criar novos QRs dinâmicos, acessar analytics ou exportar SVG/PDF. | Alta |
| **23** | **Expiração de Assinatura (Lazy Evaluation)** | `PASS` | Assinatura com `currentPeriodEnd` no passado: `isSubscriptionActive()` retorna `false`; `getUserPlanAndUsage()` rebaixa instantaneamente o plano para FREE. | Alta |
| **24** | **Proteção contra Mass Assignment (`PATCH /api/auth/me`)** | `PASS` | Allowlist estrita (`name`, `email`, `company`, `phone`, `avatarUrl`). Parâmetros maliciosos como `role`, `planId`, `isAdmin` são descartados silenciosamente. | Crítica |
| **25** | **Controle de Acesso Administrativo (RBAC)** | `PASS` | `requireAdmin()` valida estritamente `session.user.role === "ADMIN"`. Usuários comuns (`USER`) recebem HTTP 403 em `/api/admin/*`. | Crítica |
| **26** | **Alteração Direta de Plano** | `PASS` | Nenhuma rota desprotegida permite mutação arbitrária de `User.planId`. Apenas o webhook autenticado e o painel admin possuem privilégios. | Crítica |
| **27** | **Entropia e Enumeração de ShortCodes** | `PASS` | Base62 com 8 caracteres gerados via `crypto.randomBytes` ($62^8 \approx 2.18 \times 10^{14}$ combinações). Imune a enumeração sequencial. | Alta |
| **28** | **Auditoria de Rate Limiting** | `WARNING` | Rate limit implementado para `login` (5/15m), `register` (5/60m), `checkout` (15/10m), `portal` (10/10m) e scans de `/q/`. Criação de QR codes em `/api/qr` é limitada por quota/lock mas se beneficiaria de rate limit por IP. | Baixa |
| **29** | **Integridade dos Dados Reais de Produção** | `PASS` | Pagamento `#178856033673` e assinatura de `joaolucas` permaneceram com dados 100% idênticos antes e depois de toda a suíte de auditoria. | Crítica |

---

## 3. VULNERABILIDADES ENCONTRADAS E RECOMENDAÇÕES

Durante os testes adversariais automatizados e análise estática aprofundada, **nenhuma vulnerabilidade crítica de bypass comercial ou vazamento de dados** foi encontrada.

Foi identificada 1 oportunidade de hardening preventivo:

### [WARNING-01] Adição de Rate Limiting por Janela Deslizante na Criação de QR Codes (`POST /api/qr`)
- **Cenário Atual:** A proteção contra criação excessiva de QR codes baseia-se na contagem de cotas do banco e no lock transacional `pg_advisory_xact_lock`. Isso impede com sucesso que qualquer usuário ultrapasse sua cota (ex: limite de 5 do FREE). No entanto, um usuário FREE pode bombardear a rota `POST /api/qr` com centenas de requisições por minuto com falha proposital (403), gerando carga de CPU no banco.
- **Recomendação:** Incluir um limitador de requisições por minuto em `src/app/api/qr/route.ts` via `rateLimit(ip, { limit: 30, windowMs: 60000 })`, mitigando potenciais abusos de negação de serviço.

---

## 4. ESTADO FINAL DO CICLO COMERCIAL

A tabela abaixo descreve o comportamento exato e determinístico de cada estado comercial do usuário no QR MASTER:

| Estado | Entitlement Efetivo | QR Dinâmico (Criar/Editar) | QR Dinâmico Existente (`/q/[code]`) | Analytics & Métricas | Exportação Premium (SVG/PDF/Logo) | Limite Mensal de QRs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FREE** | Plano FREE | Bloqueado (403 `UPGRADE_REQUIRED`) | Exibe tela de "Plano Suspenso / Expirado" (403) | Bloqueado (403) | Bloqueado (403) | 5 QRs Estáticos / ciclo |
| **PRO** | Plano PRO | Permitido | Redirecionamento instantâneo (302) | Acesso total e telemetria em tempo real | Permitido (SVG, PDF, Logo, Molduras) | Ilimitado / 1.000 QRs |
| **BUSINESS** | Plano BUSINESS | Permitido | Redirecionamento instantâneo (302) | Acesso total avançado com exportação | Permitido completo + Campanhas | Ilimitado / 10.000 QRs |
| **EXPIRADO** | Rebaixado para FREE via Lazy Evaluation | Bloqueado (403 `UPGRADE_REQUIRED`) | Exibe tela de "Assinatura Expirada" (403) | Bloqueado (403) | Bloqueado (403) | Revertido para cota FREE (5 QRs) |
| **REFUNDED** | Rebaixado para FREE imediatamente | Bloqueado (403 `UPGRADE_REQUIRED`) | Exibe tela de "Plano Suspenso" (403) | Bloqueado (403) | Bloqueado (403) | Revertido para cota FREE |
| **CHARGED_BACK** | Rebaixado para FREE imediatamente | Bloqueado (403 `UPGRADE_REQUIRED`) | Exibe tela de "Plano Suspenso" (403) | Bloqueado (403) | Bloqueado (403) | Revertido para cota FREE |

### Garantias de Preservação Não-Destrutiva
1. **Acervo de QR Codes:** Quando um usuário sofre downgrade de PRO para FREE (seja por expiração, estorno ou chargeback), **nenhum QR Code do acervo é apagado**.
2. **Dados de Telemetria:** Todos os cliques e eventos de scan históricos são preservados no banco de dados (`QRCodeScan`).
3. **Reativação Instantânea:** Se o usuário renovar a assinatura via Mercado Pago, os QR Codes dinâmicos voltam imediatamente a funcionar sem necessidade de reimpressão de materiais gráficos.

---

## 5. CONFIRMAÇÃO DE INTEGRIDADE DOS DADOS REAIS

Os dados históricos de homologação e produção foram verificados por checagem criptográfica e consulta relacional direta:

```typescript
// Snapshot de Produção:
// WebhookEvent real:
eventId: "mp_payment_178856033673" -> Status: PROCESSED (INTACTO)

// Assinatura real:
gatewaySubscriptionId: "178856033673" -> Status: ACTIVE (INTACTA)
user: joaolucas -> Plan: PRO (INTACTO)
```

Nenhum registro de produção foi alterado, removido ou corrompido durante a realização de toda a auditoria adversarial.
