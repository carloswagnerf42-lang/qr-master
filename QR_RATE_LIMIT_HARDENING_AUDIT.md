# QR MASTER — RELATÓRIO DE AUDITORIA E HARDENING
## RATE LIMIT SERVER-SIDE PARA CRIAÇÃO DE QR CODE (`POST /api/qr`)

---

## 1. IMPLEMENTAÇÃO
- **Arquivo**: `src/lib/rate-limit.ts` e `src/app/api/qr/route.ts`
- **Função Central**: `checkRateLimit(identifier: string, action: "qr", nowMs?: number)` e `createRateLimitResponse(action: "qr", retryAfter: number, resetAt?: number)`
- **Storage**: In-memory `Map<string, CacheEntry>` no processo Node.js (`rateLimitStore`) com retenção automática e expiração baseada em timestamp Unix (`resetAt`).
- **Identificador**: `session.id` (`userId` autenticado e validado criptograficamente via JWT).
  - *Justificativa*: Como `POST /api/qr` exige autenticação prévia, o `userId` garante isolamento estrito entre contas legítimas e impede negação de serviço colateral em IPs compartilhados (NAT corporativo, VPNs, redes universitárias, CGNAT móvel).
- **Limite Técnico**: 30 requisições por usuário.
- **Janela**: 60 segundos (rolling window per-user).
- **Comportamento de Falha**: **Fail-Open**.
  - *Justificativa*: Em caso de exceção de infraestrutura no rate limiter em memória, a execução prossegue para as camadas subsequentes (validação de schema, autorização RBAC, verificação de entitlements e advisory lock do PostgreSQL). Como as regras comerciais e locks de banco continuam estritamente ativas, o fail-open previne incidentes de falso-positivo para clientes pagantes sem comprometer a integridade de dados ou cotas comerciais.

---

## 2. AMBIENTE VERCEL E ARQUITETURA SERVERLESS
- **Compatível com serverless?**: Parcialmente.
  - O rate limiter atual opera na memória interna da instância Node.js/Lambda ativa na Vercel.
  - Fornece proteção instantânea contra floods em rajada e ataques de script/bot direcionados à mesma réplica aquecida.
- **Estado compartilhado?**: Não. O projeto não possui Redis, Upstash ou Vercel KV configurados em suas dependências ou variáveis de ambiente.
- **Limitações Técnicas Identificadas**:
  - Em cenários de escalonamento horizontal com múltiplas instâncias concorrentes criadas pela Vercel em diferentes regiões/pods, cada instância manterá seu próprio `Map` de memória isolado.
  - Consequentemente, um flood massivo distribuído entre diferentes instâncias serverless poderá registrar contadores independentes em cada réplica.
- **Classificação e Recomendação Arquitetural**:
  - `WARNING`: Para ambientes serverless de grande porte sob ataque distribuído, recomenda-se a adoção de storage distribuído centralizado (ex.: Upstash Redis via `@upstash/ratelimit` com sliding window).
  - Em estrita conformidade com a especificação (Seções 2 e 27), nenhuma dependência externa ou serviço pago foi introduzido compulsoriamente nesta etapa.

---

## 3. RESPOSTAS HTTP E FORMATO
- **Criação Normal (dentro da cota e do rate limit)**:
  - Status: `HTTP 200 OK`
  - Body: `{ success: true, qrCode: { id: "...", name: "...", destination: "...", ... } }`
- **Cota Comercial Esgotada (FREE 5 / PRO 15)**:
  - Status: `HTTP 403 Forbidden`
  - Body:
    ```json
    {
      "error": "Você atingiu o limite mensal de 5 QR Codes do plano FREE...",
      "code": "LIMIT_REACHED",
      "limit": 5,
      "current": 5,
      "requiredPlan": "PRO"
    }
    ```
- **Rate Limit Técnico Excedido (31ª requisição em 60s)**:
  - Status: `HTTP 429 Too Many Requests`
  - Headers:
    - `Retry-After: 35`
    - `X-RateLimit-Limit: 30`
    - `X-RateLimit-Remaining: 0`
    - `X-RateLimit-Reset: 1789905904`
  - Body:
    ```json
    {
      "error": "Muitas tentativas de criação de QR Code em curto intervalo. Por favor, aguarde alguns instantes.",
      "code": "RATE_LIMITED",
      "retryAfter": 35
    }
    ```

---

## 4. DIAGNÓSTICO DA FALHA ORIGINAL DA REQUEST #6
- **Causa Confirmada**:
  - Na execução preliminar, a fixture de teste utilizou um usuário criado via `prisma.user.create` associado ao `planId` do plano `BUSINESS`, porém **sem a existência de um registro correspondente na tabela `Subscription`**.
  - Pelo modelo de entitlements do QR MASTER (`src/lib/permissions.ts:274-289`), usuários não-administradores sem uma assinatura com status ativo (`ACTIVE` ou `PAST_DUE` dentro do Grace Period de 5 dias) são rebaixados automaticamente (lazy evaluation) para o plano padrão `FREE`.
  - Portanto, a criação de QR #6 colidiu com a cota comercial do plano `FREE` (limite: 5), retornando:
    - **HTTP Status**: `403 Forbidden`
    - **Code**: `LIMIT_REACHED`
    - **Error**: *"Você atingiu o limite mensal de 5 QR Codes do plano FREE. Sua cota renova em 20/10/2026. Faça upgrade para o plano PRO ou BUSINESS para criar mais QR Codes."*
    - **Limit**: `5`
    - **Current**: `5`
- **A falha estava no código de produção ou no desenho da suíte?**:
  - Estava no **desenho da suíte de teste**. O código de produção operou com perfeição garantindo que nenhum usuário sem assinatura ativa consiga ultrapassar 5 QR codes comerciais.
  - A suíte foi corrigida para prover uma `Subscription` ativa nas fixtures que testam o limite técnico de 30 requisições do plano `BUSINESS`, separando rigorosamente o teste comercial do teste de rate limiting.
- **Nenhuma regra comercial foi alterada?**:
  - **Sim, confirmadíssimo**. Nenhuma cota de planos, preços, permissões ou locks foi alterada no código de produção.

---

## 5. MATRIZ DE TESTES E EVIDÊNCIAS

| Teste | Resultado | Evidência |
|---|---|---|
| Diagnóstico da Request #6 (Sem Subscription) | `PASS` | Retorna exatamente HTTP 403 `LIMIT_REACHED`, comprovando quota FREE |
| Requisições 1 a 29 abaixo do limite técnico | `PASS` | Todas retornam HTTP 200 OK |
| 30ª requisição (limite exato) | `PASS` | Retorna HTTP 200 OK |
| 31ª requisição (acima do limite) | `PASS` | Retorna HTTP 429 Too Many Requests com `code: "RATE_LIMITED"` |
| Headers de Rate Limit | `PASS` | `Retry-After`, `X-RateLimit-Limit: 30`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset` validados |
| Anti-amplificação de escrita | `PASS` | A tentativa 429 não cria registro no banco nem insere em `ActivityLog` |
| Isolamento entre Usuários | `PASS` | `USER_A` bloqueado com 429 não impede `USER_B` de criar com 200 OK |
| Reset da Janela Temporal | `PASS` | Após 60s, o contador zera e requisição volta a ser permitida |
| Não-interferência em `GET /api/qr` | `PASS` | Usuário com rate limit esgotado em `POST` continua consultando `GET /api/qr` com 200 OK |
| Payloads Inválidos (Anti-fuzzing) | `PASS` | Tentativas autenticadas com body inválido consomem o contador antes do erro 400 |
| Cota Comercial FREE Isolada | `PASS` | QRs 1..5 aprovados (200), QR 6 rejeitado com 403 `LIMIT_REACHED` |
| Cota Comercial PRO Isolada | `PASS` | QRs 1..15 aprovados (200), QR 16 rejeitado com 403 `LIMIT_REACHED` |
| Plano BUSINESS Isolado | `PASS` | QRs dinâmicos liberados sem teto comercial, mas bloqueado com 429 na 31ª requisição |
| Concorrência simultânea | `PASS` | 6 requisições paralelas com 2 slots restantes resultam em exatamente 2 aprovadas (200) e 4 bloqueadas (429) |

---

## 6. AUDITORIA DE REGRESSÕES
- **Plano FREE**: Preservado em 5 QRs/mês (retorna 403 `LIMIT_REACHED` no 6º QR).
- **Plano PRO**: Preservado em 15 QRs/ano (retorna 403 `LIMIT_REACHED` no 16º QR). Preço mensal: R$ 19,90, anual: R$ 99,00.
- **Plano BUSINESS**: Preservado como ilimitado comercialmente (`currentMonthLimit = 999999`), mas agora protegido contra flood técnico (30 req/60s). Preço mensal: R$ 29,90, anual: R$ 199,00.
- **Mercado Pago & Faturamento**:
  - Arquivo `src/lib/mercadopago.ts` mantido rigorosamente inalterado.
  - Idempotência, webhook HMAC SHA-256 e validação monetária estrita (`toCents`) com 100% de aprovação.
  - Pagamento real de produção `178856033673` e assinaturas ativas de clientes reais permaneceram 100% intocados.
- **Advisory Lock de Quota**:
  - `SELECT pg_advisory_xact_lock(hashtext(${session.id}))` preservado integralmente dentro da transação atômica do PostgreSQL.

---

## 7. RESPOSTAS ÀS 14 PERGUNTAS OBRIGATÓRIAS (SEÇÃO 29)

1. **Qual mecanismo de rate limit já existia?**
   Existia um mecanismo em memória centralizado em `src/lib/rate-limit.ts` utilizando `Map<string, CacheEntry>` para `login` (5/15m), `register` (5/60m), `checkout` (15/10m) e `portal` (10/10m).
2. **Ele é adequado para Vercel/serverless?**
   Parcialmente. Protege contra rajadas e scripts na mesma instância quente, mas não compartilha contadores globais entre réplicas distribuídas da Vercel. Documentado como WARNING para futura extensão com Redis.
3. **Qual identificador protege POST /api/qr?**
   O identificador autenticado `session.id` (`userId`), obtido a partir da sessão criptográfica JWT.
4. **Qual limite/janela foi implementado?**
   30 requisições a cada 60 segundos por usuário (`maxAttempts: 30`, `windowSeconds: 60`).
5. **A 31ª tentativa retorna 429?**
   Sim, retorna rigorosamente `HTTP 429 Too Many Requests` com `{ "error": "...", "code": "RATE_LIMITED", "retryAfter": ... }`.
6. **Retry-After funciona?**
   Sim, retornado tanto no header `Retry-After` quanto no corpo JSON `{ retryAfter: ... }`, além dos cabeçalhos informativos `X-RateLimit-*`.
7. **USER_A bloqueado afeta USER_B?**
   Não. Cada usuário possui sua própria chave de particionamento (`qr:${userId}`).
8. **Concorrência pode ultrapassar o limite?**
   Em uma mesma instância, requisições concorrentes via `Promise.all` não ultrapassam o teto (testado com 6 requisições paralelas: exatamente 2 aceitas e 4 bloqueadas). Em múltiplas instâncias serverless simultâneas, réplicas distintas possuem memória local.
9. **O pg_advisory_xact_lock foi preservado?**
   Sim, 100% preservado em `src/app/api/qr/route.ts:219`. O rate limit opera como um filtro técnico pré-banco; o advisory lock opera como garantia de consistência da cota na transação.
10. **FREE continua limitado a 5?**
    Sim. Exatamente 5 QRs permitidos, 6º bloqueado com `403 LIMIT_REACHED`.
11. **PRO continua limitado a 15?**
    Sim. Exatamente 15 QRs permitidos, 16º bloqueado com `403 LIMIT_REACHED`.
12. **BUSINESS continua comercialmente ilimitado?**
    Sim. Cota comercial sentinela `999999`, porém protegido tecnicamente contra flood na taxa de 30 requisições por 60 segundos.
13. **Foi necessária infraestrutura externa?**
    Não. A solução foi implementada utilizando estritamente a infraestrutura existente de código, sem novas dependências externas ou serviços pagos.
14. **Existe alguma limitação restante?**
    A natureza in-memory do processo Node.js na Vercel significa que o contador não é globalmente sincronizado entre diferentes instâncias serverless em picos de tráfego com escalonamento horizontal extremo. Para proteção distribuída absoluta, recomenda-se Upstash Redis futuro.
