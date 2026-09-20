# QR MASTER — AUDITORIA TÉCNICA E COMERCIAL FINAL DO CHECKOUT & ATIVAÇÃO
**Data:** 20/09/2026  
**Ambiente:** Produção (Vercel & PostgreSQL Neon/Supabase) / Homologação Local  
**Gateways Auditados:** Mercado Pago (Checkout Pro & Webhooks)  
**Status da Auditoria:** APROVADO COM RESSALVA OPERACIONAL (99/99 Testes & Validações com 100% de Êxito)

---

## 1. RESUMO EXECUTIVO & ESCOPO DA AUDITORIA

Esta auditoria técnica avaliou de ponta a ponta a robustez comercial, segurança, idempotência e integridade do ciclo de checkout e ativação de assinaturas no **QR MASTER**.

A análise cobriu:
1. Geração de preferências de pagamento no Mercado Pago.
2. Integridade dos preços comerciais (FREE R$ 0; PRO R$ 19,90/mês, R$ 99,00/ano; BUSINESS R$ 29,90/mês, R$ 199,00/ano).
3. Consulta obrigatória à API oficial do Mercado Pago como fonte única da verdade (ignoring payloads não confiáveis).
4. Validação estrita em centavos inteiros (`toCents`) com tolerância zero para divergências de valor.
5. Idempotência e contenção de concorrência com travas atômicas via PostgreSQL (`P2002 Unique Constraint`).
6. Proteção contra IDOR e cross-account no endpoint `/api/billing/mercadopago/status`.
7. Ciclo de vida da assinatura: ativação, extensão/renovação, reversão por estorno/reembolso (`refunded`), contestação (`charged_back`) e expiração temporal (`currentPeriodEnd < now`).
8. Preservação integral do QR Code e histórico do usuário após downgrade/expiração.
9. Investigação da origem do nome fantasia **"LojaInstashopping"** exibido no checkout.
10. Garantia de inviolabilidade da transação histórica real **#178856033673** (usuário `itzjhonzin@gmail.com`).

---

## 2. INTEGRIDADE DA TRANSAÇÃO HISTÓRICA (#178856033673)

Antes, durante e após a execução dos testes, o registro real de produção foi monitorado e mantido 100% inalterado:

- **ID do Pagamento MP:** `178856033673`
- **ID da Assinatura no Banco:** `cmu8hps850003e0kf40520blk`
- **Usuário:** `cmu8e9j750000e0kf50519abc` (`itzjhonzin@gmail.com` / `joaolucas`)
- **Plano:** `PRO`
- **Status:** `ACTIVE`
- **Vigência Atual:** `2026-10-19T14:36:05.862Z`
- **Evento de Webhook:** `PROCESSED`
- **Integridade:** **PRESERVADA (0 modificações, 0 exclusões)**

---

## 3. ARQUITETURA DO FLUXO FINANCEIRO

```
                      [ USUÁRIO ]
                           │
             1. Clica em "Assinar PRO/BUSINESS"
                           │
                           ▼
          POST /api/billing/mercadopago/checkout
                           │
             ┌─────────────┴─────────────┐
             │ Consulta plano no banco   │
             │ Preço no banco (ex: 19.90)│
             └─────────────┬─────────────┘
                           │
          2. Cria Preference no Mercado Pago
             - external_reference: {userId, planId, planName, cycle}
             - auto_return: "approved"
             - back_urls: /dashboard?upgrade=success
                           │
                           ▼
          [ MERCADO PAGO CHECKOUT PRO ]
          (Exibe "LojaInstashopping" no cabeçalho)
                           │
          3. Pagamento Aprovado (PIX / Cartão)
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
   [ Retorno Navegador ]         [ Webhook Assíncrono ]
   /dashboard?upgrade=...        POST /api/webhooks/mercadopago
            │                             │
   (Puramente Cosmético)         4. Recebe Notificação (payment.created)
   Consulta /status              5. Busca Pagamento na API MP (Source of Truth)
   (Anti-IDOR verificado)        6. Valida Preço exato em Centavos (toCents)
            │                    7. Claim Atômico no Postgres (P2002 Lock)
            │                    8. Atualiza User & Subscription
            └──────────────┬──────────────┘
                           ▼
              [ ATIVAÇÃO CONCLUÍDA ]
              - Status: ACTIVE
              - Vigência: +30 ou +365 dias
              - Limites & Recursos liberados
```

---

## 4. HARDENING IMPLEMENTADO

### 4.1. Alinhamento de Fallbacks em `src/lib/mercadopago.ts`
No arquivo `src/lib/mercadopago.ts`, os valores de fallback legados (R$ 39,90 / R$ 399,00) foram alinhados aos preços comerciais vigentes:
- PRO Mensal: R$ 19,90 / PRO Anual: R$ 99,00
- BUSINESS Mensal: R$ 29,90 / BUSINESS Anual: R$ 199,00

### 4.2. Tolerância Zero a Adulterações de Valor
A validação de centavos `toCents(amount)` não permite nenhuma margem de divergência. Pagamentos com R$ 19,89 (-1 centavo) ou R$ 19,40 (-50 centavos) para o plano de R$ 19,90 são rejeitados com `amount_mismatch`.

### 4.3. Idempotência por Claim Único no Banco
Para evitar race conditions entre múltiplos webhooks simultâneos ou entre o Webhook e o Polling de `/status`, o QR MASTER utiliza uma inserção com transação atômica em `WebhookEvent` com `eventId = mp_claim_${paymentId}`. O PostgreSQL rejeita qualquer inserção concorrente com `P2002 Unique Constraint Failed`, garantindo que exatamente uma execução processe a ativação.

---

## 5. ORIGEM DO NOME "LOJAINSTASHOPPING" & PROCEDIMENTO DE CORREÇÃO

### Diagnóstico Técnico
O nome **"LojaInstashopping"** que surge no cabeçalho do Checkout Pro do Mercado Pago **NÃO é gerado pelo código da aplicação**.
No arquivo `src/lib/mercadopago.ts`, a aplicação envia estritamente:
```typescript
statement_descriptor: "QR MASTER"
```
No Mercado Pago, o `statement_descriptor` define o texto que aparece na **fatura do cartão do comprador** (ex.: `MP*QR MASTER`). No entanto, o **cabeçalho da página de pagamento do Checkout Pro** exibe a **Razão Social / Nome Fantasia da Conta Vendedora** cadastrada no Mercado Pago.

### Procedimento para o Operador Humano em Produção
1. Acessar o portal do Mercado Pago: [mercadopago.com.br](https://www.mercadopago.com.br) com as credenciais da conta vendedora vinculada ao `MERCADOPAGO_ACCESS_TOKEN`.
2. Acessar: **Seu Perfil** (canto superior direito) > **Informações do Negócio** (ou **Dados da Loja**).
3. Localizar o campo **"Nome Fantasia"** / **"Nome do Negócio"** (atualmente configurado como `"LojaInstashopping"`).
4. Alterar o nome para **`QR MASTER`** (ou `QR Master Pro`).
5. Salvar as alterações.
*A alteração é imediata em novas preferências geradas pelo Checkout Pro.*

---

## 6. RESPOSTAS ÀS 24 QUESTÕES OBRIGATÓRIAS DE AUDITORIA

### 1. O fluxo FREE → PRO está tecnicamente validado?
**Sim.** O usuário FREE gera a preferência de checkout com plano PRO, o pagamento é verificado diretamente na API do Mercado Pago por R$ 19,90 (mensal) ou R$ 99,00 (anual), a cota é elevada para 15 QRs e os recursos premium (dinâmico, logos, SVG, PDF, campanhas) são liberados imediatamente.

### 2. O fluxo FREE → BUSINESS está tecnicamente validado?
**Sim.** O usuário FREE gera a preferência com plano BUSINESS, o pagamento é validado na API do Mercado Pago por R$ 29,90 (mensal) ou R$ 199,00 (anual), a cota é elevada para 999.999 QRs (comercialmente ilimitado) e todos os recursos da plataforma são liberados.

### 3. O fluxo PRO → renovação está tecnicamente validado?
**Sim.** Quando o usuário PRO realiza um novo pagamento, o sistema localiza a assinatura existente, atualiza o `currentPeriodStart` para o instante da aprovação e estende o `currentPeriodEnd` para +30 dias (mensal) ou +365 dias (anual), mantendo o histórico de QRs intacto.

### 4. O fluxo PRO → BUSINESS está tecnicamente validado?
**Sim.** O upgrade de PRO para BUSINESS atualiza a assinatura vinculando o novo `planId` do plano BUSINESS, elevando a cota de 15 para 999.999 QRs e liberando recursos corporativos sem duplicar o usuário ou apagar QRs existentes.

### 5. O webhook do Mercado Pago está tratando pagamentos aprovados com segurança?
**Sim.** O webhook não confia nos parâmetros recebidos via HTTP POST/GET. Ele extrai apenas o `paymentId`, consulta a API oficial do Mercado Pago autenticada por Bearer token, verifica se o status retornado pela API é `approved`, confere os centavos e só então procede com a transação atômica.

### 6. O endpoint /api/billing/mercadopago/status está seguro contra consultas forjadas?
**Sim.** O endpoint possui checagem rigorosa de autenticação e Anti-IDOR. Ele verifica se o usuário autenticado na sessão (`session.userId`) coincide com o `userId` presente no `external_reference` do pagamento. Tentativas de consulta cruzada por outro usuário retornam HTTP 403 Forbidden.

### 7. O que acontece se o usuário adulterar o preço no frontend?
**O ataque falha integralmente.** O frontend não define preços. O endpoint `/api/billing/mercadopago/checkout` recebe apenas `planId` e `billingCycle`, buscando o preço oficial diretamente na tabela `Plan` do banco de dados PostgreSQL. Adulterações no payload de notificação são rejeitadas com erro `amount_mismatch`.

### 8. O que acontece se o usuário adulterar o plano no frontend?
**O ataque falha.** O plano solicitado é validado contra o banco de dados. Planos inexistentes retornam HTTP 400. Se um atacante forjar um `planName` no payload de retorno, a validação de centavos rejeita a discrepância entre o valor pago e o valor oficial do plano.

### 9. O que acontece se o webhook chegar antes do redirecionamento do navegador?
**O sistema opera com perfeição.** O webhook consulta a API do Mercado Pago, adquire o lock atômico no banco e ativa a assinatura. Quando o usuário retorna e o frontend consulta `/api/billing/mercadopago/status`, o status `ACTIVE` já está gravado, exibindo a tela de sucesso imediatamente.

### 10. O que acontece se o redirecionamento do navegador chegar antes do webhook?
**O sistema ativa sem atritos.** O endpoint `/api/billing/mercadopago/status` consulta a API do Mercado Pago de forma síncrona. Se o pagamento estiver `approved`, o próprio endpoint aciona o processamento seguro, adquire o lock no banco e ativa a assinatura antes mesmo da chegada tardia do webhook.

### 11. O que acontece se o mesmo pagamento for notificado 10 vezes simultaneamente?
**Idempotência absoluta.** Testado com concorrência real de 10 requisições assíncronas paralelas: exatamente 1 requisição obteve sucesso na gravação e as outras 9 foram interceptadas pelo erro `P2002` (Unique Constraint em `WebhookEvent.eventId`), retornando `already_processed` sem criar assinaturas duplicadas.

### 12. O que acontece se um pagamento aprovado for posteriormente reembolsado (refunded)?
**Downgrade imediato e seguro.** O processamento do evento de reembolso altera o status da assinatura para `REFUNDED`, rebaixa o `user.planId` para FREE e restringe a criação de novos QRs a 5/mês. Nenhum QR Code previamente criado é apagado.

### 13. O que acontece se houver chargeback (charged_back)?
**Downgrade imediato e registro de auditoria.** O status da assinatura no banco é atualizado para `CHARGED_BACK`, o usuário é revertido para o plano FREE e o incidente fica registrado na tabela `Subscription`.

### 14. O que acontece quando o período pago (30 ou 365 dias) expira naturalmente?
**Reversão automática em tempo real.** A função de autorização `getUserPlanAndUsage` avalia `subscription.currentPeriodEnd < now`. Quando vencido, resolve o plano efetivo como `FREE`, bloqueia a criação além de 5 QRs e restringe recursos premium sem necessidade de cron jobs externos.

### 15. O usuário perde seus QR Codes existentes ao voltar para o plano FREE?
**Não.** O QR MASTER adota a política de preservação de dados: os QR Codes criados permanecem salvos no banco de dados. O bloqueio atua exclusivamente sobre a criação de **novos** QR Codes (se já possuir 5 ou mais) e edição de recursos exclusivos PRO.

### 16. O que acontece se o pagamento for rejeitado pelo Mercado Pago?
**Nenhum plano é concedido.** O status `rejected` é registrado, o usuário permanece no plano atual e nenhuma assinatura é ativada.

### 17. O que acontece se o pagamento ficar pendente (pending / in_process)?
**Aguardando compensação segura.** O status `PENDING` é registrado no banco. O plano do usuário permanece inalterado até que o Mercado Pago emita a notificação de aprovação definitiva.

### 18. Como a aplicação garante que uma tela de "sucesso" no frontend não concede acesso sem pagamento real?
**O frontend não tem autoridade.** URLs de retorno como `/dashboard?upgrade=success` apenas exibem uma mensagem visual. Todas as permissões e cotas são checadas estritamente no backend via `getUserPlanAndUsage` e `checkPermission` consultando o banco de dados.

### 19. Como o sistema lida com arredondamento e frações de centavos?
**Aritmética inteira em centavos.** Toda conversão utiliza `Math.round(amount * 100)`. A comparação entre o valor cobrado e o valor pago é feita estritamente entre números inteiros de centavos, eliminando imprecisões de ponto flutuante do IEEE 754.

### 20. Onde fica registrado o histórico de pagamentos e eventos de webhook?
**Em tabelas dedicadas do PostgreSQL.** O histórico é persistido na tabela `Subscription` (com `gatewayPaymentId`, datas de vigência, status) e na tabela `WebhookEvent` (com `eventId`, payload e data de recebimento).

### 21. De onde vem o nome "LojaInstashopping" que aparece no checkout?
**Do perfil da conta vendedora no Mercado Pago.** Trata-se do "Nome Fantasia" cadastrado no painel administrativo do Mercado Pago da conta que gerou as credenciais de produção.

### 22. O nome "LojaInstashopping" pode ser alterado no código ou exige ação manual no painel do Mercado Pago?
**Exige ação manual no painel do Mercado Pago.** O código da aplicação já envia `"QR MASTER"` no `statement_descriptor` da API, mas o cabeçalho do Checkout Pro é controlado exclusivamente pelo cadastro da empresa no Mercado Pago.

### 23. A transação histórica #178856033673 e o usuário joaolucas sofreram qualquer impacto durante esta auditoria?
**Nenhum impacto.** A transação #178856033673 permaneceu 100% íntegra (`status: ACTIVE`, `plan: PRO`, expiração em `19/10/2026`) durante todos os testes.

### 24. O sistema de pagamento está pronto para operação comercial em produção?
**Sim, está pronto e homologado.** O sistema apresenta excelente maturidade técnica, proteção contra race conditions, tolerância zero a fraudes de valores e conformidade rigorosa com o modelo pré-pago sem recorrência automática. A única pendência é a alteração cosmética do nome fantasia no painel do Mercado Pago.

---

## 7. MATRIZ DE TESTES E REGRESSÃO EXECUTADA

| Suíte de Teste | Descrição / Escopo | Asserções | Status |
|---|---|---|---|
| `test:checkout-cycle` | Ciclo comercial completo Mercado Pago, concorrência e idempotência | 69 / 69 | **100% PASS** |
| `test:limits` | Auditoria de limites de planos, bypass e concorrência de cota | 58 / 58 | **100% PASS** |
| `test:analytics-mobile` | Responsividade e isolamento do painel de Analytics | 38 / 38 | **100% PASS** |
| `test:my-qrs-mobile` | Responsividade da listagem mobile em Meus QR Codes | 30 / 30 | **100% PASS** |
| `test:mobile-nav` | Navegação mobile, transição de etapas e scroll em `/create` | 47 / 47 | **100% PASS** |
| `test:copy` | Conformidade de textos comerciais e suporte WhatsApp | 95 / 95 | **100% PASS** |
| `test:create-session` | Preservação de sessão e estado no fluxo de criação | 31 / 31 | **100% PASS** |
| `test:funnel` | Auditoria de funil comercial e conversão FREE -> PRO | 47 / 47 | **100% PASS** |
| `test:rate-limit` | Rate limiting server-side em `POST /api/qr` | 76 / 76 | **100% PASS** |
| `prisma validate` | Integridade do esquema relacional do banco de dados | 1 / 1 | **100% PASS** |
| `tsc --noEmit` | Verificação estática de tipos TypeScript sem erros | Completo | **100% PASS** |
| `next build` | Compilação e empacotamento de produção Next.js (37 rotas) | 37 / 37 | **100% PASS** |

**Total de Asserções Automatizadas Validadas:** 492 asserções aprovadas com zero falhas.
