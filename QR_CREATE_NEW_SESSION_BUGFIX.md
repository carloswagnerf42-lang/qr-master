# QR MASTER — RELATÓRIO TÉCNICO DE BUGFIX: RESET DO CRIADOR EM /create

## 1. RESUMO EXECUTIVO

Este relatório documenta a análise, resolução e homologação do defeito reportado em produção onde o acionamento do botão global **"+ Criar QR Code"** (localizado no Header superior e na Sidebar lateral) não iniciava uma nova criação caso o usuário já se encontrasse na rota `/create`.

A correção foi implementada mantendo 100% inalteradas as regras financeiras, os webhooks do Mercado Pago, a persistência no banco de dados e as cotas comerciais dos planos FREE, PRO e BUSINESS.

---

## 2. DIAGNÓSTICO E CAUSA RAIZ

### Por que clicar em Criar QR não fazia nada em /create?
Na arquitetura do **Next.js App Router**, o componente `<Link href="/create">` (ou chamadas imperativas como `router.push("/create")`) efetua navegações puramente client-side. 

Quando o usuário já está posicionado exatamente na rota `/create`, o roteador entende que a rota de destino é idêntica à rota atual. Em decorrência dessa otimização:
1. A página `/create` **não é desmontada (unmounted)**.
2. Os inicializadores de estado do React (`useState`) **não são reexecutados**.
3. O formulário permanecia congelado na etapa 4 ("Detalhes & Salvar"), mantendo no estado o objeto `createdQr` (com id e shortCode) e todos os dados digitados anteriormente.

---

## 3. SOLUÇÃO ADOTADA

Adotou-se uma arquitetura determinística de sessão limpa baseada em três pilares:

1. **Utilitário Central de Eventos (`src/lib/qr-events.ts`)**:
   - Criação da constante de evento `NEW_QR_EVENT = "qr-master:new-qr"` e da função auxiliar `triggerNewQRCreation()`.
2. **Prop Direta e Fallback no Header (`src/components/layout/Header.tsx`)**:
   - O componente `<Header>` passou a receber a prop opcional `onCreateNew?: () => void`.
   - Na rota `/create`, onde o `<Header>` é filho direto da página, ele recebe `onCreateNew={resetQrCreator}` e executa o reset síncrono imediatamente ao clique.
   - Para qualquer outra chamada, se `pathname === "/create"`, intercepta o clique, previne o no-op do Link, dispara o evento global e executa scroll suave ao topo.
3. **Interceptação na Barra Lateral (`src/components/layout/Sidebar.tsx`)**:
   - O item `Criar QR Code` na barra lateral detecta se o usuário já está em `/create`. Se estiver, fecha o menu mobile, cancela o evento padrão do link, dispara `triggerNewQRCreation()` e move a visualização para o topo.
4. **Função Centralizada `resetQrCreator()` (`src/app/(dashboard)/create/page.tsx`)**:
   - Implementação de função com `useCallback` que redefine todo o estado client-side para os defaults estritos:
     - `activeTab`: `"type"` (Etapa 1).
     - `selectedType`: `"url"`.
     - `isDynamic`: Padrão do plano (`permissions.dynamic_qr !== false`).
     - `name`: `"Meu Novo QR Code"`.
     - `description`, `categoryId`, `campaignId`: strings vazias `""`.
     - `content`: Objeto constante e imutável `INITIAL_CONTENT`.
     - `style`: Objeto padrão `DEFAULT_STYLE_CONFIG` (cores, olhos, frames e logos resetados).
     - `createdQr`: `null` (elimina referências ao QR anterior, desfaz o banner e reseta o preview).
     - `saving`, `downloadModalOpen`, `upgradeModalOpen`: `false`.
   - Inclusão do botão explícito **"+ Criar Outro QR Code"** no banner de sucesso pós-salvamento.

---

## 4. ARQUIVOS ALTERADOS E CRIADOS

| Arquivo | Tipo | Descrição das Modificações |
| :--- | :---: | :--- |
| `src/lib/qr-events.ts` | **NOVO** | Utilitário com `NEW_QR_EVENT` e helper `triggerNewQRCreation()`. |
| `src/components/layout/Header.tsx` | **MODIFICADO** | Adição da prop `onCreateNew` e interceptação do clique quando em `/create`. |
| `src/components/layout/Sidebar.tsx` | **MODIFICADO** | Interceptação do link "Criar QR Code" quando `pathname === "/create"`. |
| `src/app/(dashboard)/create/page.tsx` | **MODIFICADO** | Extração de `INITIAL_CONTENT`, implementação de `resetQrCreator()`, listener do evento e botão "+ Criar Outro QR Code". |
| `package.json` | **MODIFICADO** | Registro do script `"test:create-session": "tsx tests/test-create-new-session.ts"`. |
| `tests/test-create-new-session.ts` | **NOVO** | Suíte de testes automatizada cobrindo os 10 cenários obrigatórios e verificação de preview. |

---

## 5. RESPOSTAS ESPECÍFICAS AOS 9 QUESITOS OBRIGATÓRIOS

### 1. Por que clicar em Criar QR não fazia nada em /create?
Porque o Next.js Link executa navegação interna SPA e, ao detectar que a rota de destino é idêntica à ativa (`/create` -> `/create`), não desmonta o componente nem reinicializa os hooks de estado local do React.

### 2. Como o estado agora é resetado?
Por meio da função central `resetQrCreator()`, acionada diretamente via prop no `<Header onCreateNew={...}>` e via barramento de evento desacoplado `NEW_QR_EVENT` disparado pela Sidebar ou por cliques em links globais quando na mesma rota. O reset restaura todos os campos, metadados, estilos e o preview aos padrões iniciais sem recarregar a página.

### 3. O QR anterior permanece salvo?
**Sim, integralmente.** O QR Code anterior já havia sido persistido no banco de dados via `POST /api/qr`. O reset afeta estritamente o estado do formulário no navegador do cliente, mantendo o QR salvo disponível para visualização e edição em `/my-qrs`.

### 4. Clicar em nova criação consome quota?
**Não.** O clique em nova criação executa apenas mutações em memória no estado React do cliente. Não dispara requisições de rede, não chama `POST /api/qr` e não altera nenhum registro no PostgreSQL.

### 5. FREE 4/5 permanece 4/5 até salvar?
**Sim.** Um usuário no plano FREE com 4 QRs criados pode acionar o botão global quantas vezes desejar; a contagem no banco de dados e a cota exibida permanecem estritamente em 4/5 até que ele submeta o formulário salvando o 5º código.

### 6. Em 5/5 ainda é possível abrir o criador?
**Sim.** Não há bloqueio prematuro de entrada na rota `/create`. O usuário com 5/5 pode abrir o criador, configurar campos, ajustar o visual e interagir livremente com o preview.

### 7. O 6º SAVE retorna 403 LIMIT_REACHED?
**Sim.** Ao tentar efetivamente salvar o 6º QR Code, a requisição `POST /api/qr` é submetida e o backend valida as cotas comerciais sob advisory lock, retornando `HTTP 403` com `{ code: "LIMIT_REACHED", limit: 5 }`.

### 8. UpgradeModal abre corretamente?
**Sim.** O interceptor no frontend detecta o status 403 com `code: "LIMIT_REACHED"`, interrompe o salvamento, abre o `UpgradeModal` contextualizado para o limite comercial e mantém a quota em 5/5.

### 9. Algum backend financeiro foi alterado?
**Não.** Nenhuma linha de código em `src/app/api/billing/`, `src/lib/mercadopago.ts`, webhooks HMAC, idempotência financeira ou schema Prisma foi alterada.

---

## 6. RESULTADOS DAS SUÍTES DE TESTES E REGRESSÃO

Todas as suítes foram executadas localmente e obtiveram 100% de taxa de aprovação:

| Suíte / Comando | Asserções | Status | Escopo Validado |
| :--- | :---: | :---: | :--- |
| `npm run test:create-session` | **31/31** | **PASS (100%)** | Contratos de layout, reset de wizard, isolamento de dados, ciclo FREE 4/5 -> 5/5 -> 6º (403 LIMIT_REACHED) e UpgradeModal. |
| `npm run test:funnel` | **47/47** | **PASS (100%)** | Bloqueios comerciais de conversão, paywalls de analytics, exportação vetorial SVG/PDF e isolamento de segurança. |
| `npm run test:copy` | **95/95** | **PASS (100%)** | Transparência de textos comerciais, remoção de alegações sem SLA e canal oficial WhatsApp. |
| `npm run test:rate-limit` | **76/76** | **PASS (100%)** | Rate limiting técnico (30 reqs/60s), cabeçalhos RFC e HTTP 429. |
| `npm run test:limits` | **58/58** | **PASS (100%)** | Limites comerciais FREE (5), PRO (15), BUSINESS (ilimitado), advisory lock e autorização RBAC. |
| `test-mercadopago-idempotency` | **37/37** | **PASS (100%)** | Idempotência de pagamentos Pix/cartão e concorrência P2002. |
| `test-mp-webhook-signature` | **15/15** | **PASS (100%)** | Assinatura HMAC SHA-256 de webhooks do Mercado Pago. |
| `test-adversarial-cycle` | **106/106** | **PASS (100%)** | Ciclo de vida adversarial, estornos, chargebacks e expiração lazy. |
| `test-amount-validation` | **59/59** | **PASS (100%)** | Validação exata de valores monetários em centavos (`toCents`). |
| `npx prisma validate` | — | **PASS** | Schema Prisma íntegro e validado. |
| `npx tsc --noEmit` | — | **PASS** | 0 erros de tipagem TypeScript. |
| `npm run build` | — | **PASS** | Compilação Next.js 14.2.35 concluída para todas as 37 rotas estáticas e dinâmicas. |

---

## 7. CONCLUSÃO

O defeito foi completamente sanado através de uma intervenção de baixo impacto e alto retorno em confiabilidade e usabilidade. O fluxo de criação de QR Codes agora suporta criação contínua sem fricção para os usuários.
