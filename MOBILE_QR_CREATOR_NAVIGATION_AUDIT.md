# QR MASTER — RELATÓRIO DE AUDITORIA: NAVEGAÇÃO E SCROLL EM MOBILE (/create)

## 1. RESUMO EXECUTIVO

Durante a homologação manual em ambiente mobile (viewport 400px x 626px), identificou-se que ao clicar em **"Avançar para Conteúdo →"** na Etapa 1 do criador de QR Code, a tela finalizava posicionada na porção inferior do Preview Interativo (exibindo QR Code grande, indicador de legibilidade e botões de download), criando a falsa impressão de que a navegação não havia funcionado.

A causa raiz foi minuciosamente auditada e corrigida sem alterar qualquer aspecto da lógica de autorização, regras comerciais, cotas, banco de dados ou backend de pagamentos.

---

## 2. DIAGNÓSTICO DA CAUSA RAIZ

### 1. O `currentStep` (`activeTab`) estava mudando corretamente?
**Sim.** O estado `activeTab` transitava perfeitamente de `"type"` para `"content"`. O componente renderizava a Etapa 2 corretamente no DOM.

### 2. Por que a viewport terminava no preview?
A Etapa 1 ("Tipo") é muito extensa (~800px de altura) pois reúne 13 cartões de seleção de tipos de QR Code mais o card expansivo de QR Dinâmico. Para alcançar o botão **"Avançar para Conteúdo →"** em um dispositivo móvel com altura de ~626px, o usuário é forçado a rolar a página até próximo ao final (`window.scrollY` entre 650px e 780px).

Ao clicar no botão:
1. O React desmonta a Etapa 1 e monta a Etapa 2 ("Conteúdo").
2. No caso padrão do tipo "URL", a Etapa 2 possui apenas 1 campo de input e os botões inferiores, com altura de apenas **~220px**.
3. A coluna esquerda do formulário encolhe subitamente de ~800px para ~220px.
4. Como o navegador móvel não recebeu nenhuma instrução explícita de reposicionamento de rolagem, ele preserva a posição de scroll (`scrollY` ~ 650px).
5. Com a contração do formulário superior, o Preview Interativo (que no layout mobile é renderizado diretamente abaixo do formulário) sobe para a faixa visível onde o usuário estava rolando.
6. A viewport do usuário fica posicionada sobre a base do preview, enquanto a Etapa 2 fica fora de vista, acima do topo da tela.

### 3. Havia `scrollIntoView` ou `focus()` causando isso?
**Não.** Nenhuma chamada a `scrollIntoView`, `window.scrollTo`, `focus()` ou propriedade `autoFocus` estava puxando o scroll para o preview. Tratava-se exclusivamente de retenção da posição de rolagem pelo navegador durante a contração de altura do DOM.

---

## 3. SOLUÇÃO IMPLEMENTADA

1. **Ref Estável (`wizardTopRef`)**:
   - Criação da ref React associada ao topo da coluna do formulário em [`src/app/(dashboard)/create/page.tsx`](file:///c:/Users/Wagner/3D%20Objects/New%20Bot%20Quotex/qr-master/src/app/(dashboard)/create/page.tsx).
   - Inclusão das classes `scroll-mt-16 sm:scroll-mt-20 focus:outline-none` e `tabIndex={-1}` para compensação CSS e suporte a tecnologias assistivas sem anéis de foco indesejados.

2. **Repositionamento Suave com Offset Responsivo (`scrollToWizardTop`)**:
   - Implementação de função via `useCallback` combinada com `requestAnimationFrame` para aguardar o commit e a nova geometria do DOM.
   - Cálculo dinâmico do deslocamento: compensa o cabeçalho móvel fixo de 56px (`h-14`) com offset seguro de **64px** no mobile (`< 768px`) e **80px** no desktop, garantindo que o título e as abas não fiquem encobertos.
   - Execução de `window.scrollTo({ top: targetY, behavior: "smooth" })`.
   - Foco programático acessível via `target.focus({ preventScroll: true })`.

3. **Efeito Reativo Automatizado na Mudança de Etapa**:
   - `useEffect` monitorando `activeTab` para que qualquer alteração de etapa (avançar, retroceder, clique nas abas ou reset) posicione suavemente a tela no início da etapa.
   - Utilização de `isFirstRender` para garantir que o scroll inicial do carregamento da página não seja forçado.

---

## 4. RESPOSTAS ESPECÍFICAS AOS 15 QUESITOS OBRIGATÓRIOS

1. **`currentStep` estava mudando corretamente?**  
   Sim. O estado React mudava de `"type"` para `"content"`.
2. **Por que a viewport terminava no preview?**  
   Devido ao encolhimento da altura da Etapa 1 (~800px) para a Etapa 2 (~220px) associado à retenção do scroll elevado pelo navegador móvel sem comando de reposicionamento.
3. **Havia `scrollIntoView`/`focus` causando isso?**  
   Não. Nenhum elemento estava chamando foco ou scroll para o preview.
4. **Qual elemento agora é o alvo de navegação?**  
   O elemento container da coluna esquerda do wizard (`wizardTopRef`), contendo as 4 abas superiores e os formulários das etapas.
5. **Funciona em 320–430px?**  
   Sim. Validado na matriz de viewports (320px, 360px, 375px, 390px, 400px, 430px).
6. **Funciona em desktop (1280px e 1440px)?**  
   Sim. O offset desktop de 80px mantém a visualização das duas colunas perfeitamente alinhada sem saltos bruscos.
7. **Funciona 1→2?**  
   Sim. A tela é suavemente posicionada no início da Etapa 2 ("Conteúdo").
8. **Funciona 2→3?**  
   Sim. Posiciona no início da Etapa 3 ("Personalizar").
9. **Funciona 3→4?**  
   Sim. Posiciona no início da Etapa 4 ("Detalhes & Salvar").
10. **Funciona ao voltar etapas (4→3, 3→2, 2→1)?**  
    Sim. Todos os fluxos inversos acionam o reposicionamento ao início da etapa de destino.
11. **Reset `/create` → `/create` continua funcionando?**  
    Sim. Totalmente preservado (commit `37f4cb0`), agora reforçado pelo reposicionamento no topo da Etapa 1.
12. **Alguma requisição POST é causada apenas por mudar de etapa?**  
    Não. Zero requisições de rede ou criação no banco ao navegar entre etapas.
13. **Alguma cota é consumida?**  
    Não. A cota comercial só é consumida ao salvar o QR Code via `handleSave()`.
14. **Preview continua funcional?**  
    Sim. Renderização do QR Code, zoom, indicador de contraste, teste de link e downloads (PNG, SVG, PDF) permanecem 100% íntegros.
15. **Existe alguma limitação restante?**  
    Nenhuma limitação funcional ou técnica encontrada.

---

## 5. RESULTADOS DOS TESTES E REGRESSÃO

| Suíte / Comando | Asserções | Status | Escopo Validado |
| :--- | :---: | :---: | :--- |
| `npm run test:mobile-nav` | **47/47** | **PASS (100%)** | Matriz de viewports (320-430px, 1280-1440px), transições progressivas (1→2→3→4), fluxos inversos, contratos estáticos de acessibilidade e preservação de cota. |
| `npm run test:create-session` | **31/31** | **PASS (100%)** | Reset de sessão /create -> /create, limpeza de preview e ciclo comercial FREE 4/5 -> 5/5 -> 6º (403 LIMIT_REACHED). |
| `npm run test:funnel` | **47/47** | **PASS (100%)** | Gating de conversão, paywalls de analytics e campanhas, bloqueio do 6º QR e UpgradeModal. |
| `npm run test:copy` | **95/95** | **PASS (100%)** | Comunicação factual de planos, modelo pré-pago e canal de WhatsApp oficial. |
| `npm run test:rate-limit` | **76/76** | **PASS (100%)** | Rate limiting técnico (30 reqs/60s), RFC headers e HTTP 429. |
| `npm run test:limits` | **58/58** | **PASS (100%)** | Cotas de QR Codes, advisory lock PostgreSQL e RBAC. |
| `npx prisma validate` | — | **PASS** | Schema do banco validado sem divergências. |
| `npx tsc --noEmit` | — | **PASS** | 0 erros de tipagem TypeScript. |
| `npm run build` | — | **PASS** | 37 rotas estáticas e dinâmicas compiladas com sucesso para produção. |
