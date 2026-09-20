# QR MASTER — IMPLEMENTAÇÃO DO FUNIL DE CONVERSÃO & UX (FRONTEND ONLY)

## 1. RESUMO EXECUTIVO

Esta sprint implementou a modernização e o endurecimento do funil comercial e de conversão do **QR MASTER**, sanando os gargalos diagnosticados na auditoria prévia (`QR_MASTER_CONVERSION_FUNNEL_AUDIT.md`), estritamente na camada de apresentação (frontend) e interface do usuário.

### Princípios Rigorosamente Respeitados:
- **Zero alterações no Backend de Pagamentos & Mercado Pago**: Nenhuma rota de webhook, HMAC, assinatura ou checkout foi modificada. O fluxo de upgrade encaminha o usuário diretamente para `/settings?tab=plan`.
- **Zero alterações no Banco de Dados / Prisma Schema**: Nenhum modelo ou migration foi alterado.
- **Zero alterações em Planos, Preços e Entitlements**: Os valores comerciais permanecem FREE (R$ 0, 5 QRs), PRO (R$ 19,90/mês ou R$ 99/ano, 15 QRs) e BUSINESS (R$ 29,90/mês ou R$ 199/ano, sentinela ilimitado 999.999).
- **Zero Métricas Fabrificadas**: O paywall educativo de Analytics e Campanhas não inventa gráficos falsos, scans fictícios nem contadores regressivos enganosos. Apresenta benefícios reais e recursos do plano PRO.
- **Isolamento de Segurança**: Erros HTTP 403 decorrentes de violações de segurança (anti-IDOR, acesso a rotas `/admin`) continuam sendo tratados como falhas de segurança e **NÃO** disparam o modal de upgrade comercial.

---

## 2. ARQUIVOS ALTERADOS E CRIADOS

### Componentes Criados:
- `src/components/UpgradeModal.tsx`: Modal modular, acessível e responsivo para upgrade comercial.
- `src/components/landing/PricingAndFaq.tsx`: Seção transparente de planos, tabela comparativa de recursos e FAQ comercial na landing page.

### Páginas e Layouts Atualizados:
- `src/app/page.tsx`: Inclusão da seção `#pricing` no menu e renderização do `<PricingAndFaq />`.
- `src/app/(dashboard)/create/page.tsx`: Gating visual de recursos premium (QR Dinâmico, Logo, Exportação SVG/PDF) e interceptação resiliente do erro HTTP 403 `LIMIT_REACHED`.
- `src/app/(dashboard)/my-qrs/page.tsx`: Proteção dos botões de exportação SVG e PDF para planos FREE abrindo o `UpgradeModal`.
- `src/app/(dashboard)/dashboard/page.tsx`: Barra de progresso e contador real de cota de QRs (`X / 5` ou `X / 15`), além de paywall educacional no bloco de Analytics quando o usuário for FREE ou a API retornar 403.
- `src/app/(dashboard)/campaigns/page.tsx`: Detecção de HTTP 403 na API de campanhas com exibição de banner educativo ("Conhecer Campanhas PRO") e bloqueio preventivo de criação indevida.
- `src/components/layout/Sidebar.tsx`: Widget compacto de cota no rodapé da barra lateral com sincronização via `/api/auth/me`.

### Testes & Configuração:
- `package.json`: Adição do script `"test:funnel": "tsx tests/test-conversion-funnel-ui.ts"`.
- `tests/test-conversion-funnel-ui.ts`: Suíte de 47 testes automatizados validando todos os cenários do funil e isolamento de segurança.

---

## 3. ESPECIFICAÇÃO TÉCNICA: `UpgradeModal.tsx`

O componente `UpgradeModal` foi concebido como a peça central reutilizável de conversão em todo o SaaS:

- **Gatilhos & Contextos Suportados (`UpgradeReason`)**:
  1. `DYNAMIC_QR`: Explica a capacidade de alterar o link de destino sem reimprimir materiais físicos (menus, cartões, embalagens).
  2. `LOGO`: Destaca o poder de branding de inserir o logotipo da empresa no centro do QR Code.
  3. `SVG_EXPORT`: Explica a importância de vetores infinitamente escaláveis para designers e gráficas.
  4. `PDF_EXPORT`: Destaca o formato pronto para impressão gráfica de alta densidade.
  5. `ANALYTICS`: Apresenta o rastreamento em tempo real de scans, cidades, sistemas operacionais e horários de pico.
  6. `CAMPAIGNS`: Explica o agrupamento de QR Codes por campanhas de marketing e monitoramento consolidado.
  7. `LIMIT_REACHED`: Explica de forma clara que a cota mensal (5 no FREE ou 15 no PRO) foi atingida e detalha as opções de upgrade imediato.
- **Acessibilidade (a11y)**:
  - Atributos ARIA: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` e `aria-describedby`.
  - Trap de foco automático com restauração de foco no elemento anterior ao fechar.
  - Fechamento com tecla `Escape` e clique no backdrop.
- **Responsividade**:
  - `p-4` a `p-6` com overflow vertical suave (`max-h-[90vh] overflow-y-auto`) para telas de smartphones (320px+).
  - Animações CSS limpas (fade-in, scale-in).
- **Ação de Destino**:
  - Redireciona o usuário para `/settings?tab=plan`, respeitando a arquitetura existente de checkout do Mercado Pago.

---

## 4. LANDING PAGE & PREÇOS

- **Seção de Preços Clara**:
  - Toggle Mensal / Anual no topo da grade.
  - Destaque matemático de economia real: **PRO Anual** custa R$ 99/ano (vs R$ 238,80 no mensal = **58% de economia real**); **BUSINESS Anual** custa R$ 199/ano (vs R$ 358,80 no mensal = **44% de economia real**).
- **Tabela Comparativa Detalhada**:
  - Compara FREE, PRO e BUSINESS lado a lado em 8 critérios (Cota de QRs, Dinâmicos, Estatísticas, Logo, SVG, PDF, Campanhas, Domínio Próprio).
- **FAQ Factual**:
  - 5 perguntas frequentes respondidas com transparência sobre renovação, formas de pagamento aceitas via Mercado Pago (PIX e Cartão), impressão e limites.

---

## 5. MATRIZ DE CENÁRIOS: ANTES vs DEPOIS

| Cenário | Comportamento Anterior (Antes) | Comportamento Atual (Depois) | Backend Preservado? |
| :--- | :--- | :--- | :---: |
| **FREE tenta ativar QR Dinâmico** | Toggle permitia ativação, falhava com erro opaco ao salvar | Toggle exibe badge PRO; ao clicar, abre `UpgradeModal(DYNAMIC_QR)` educativo | Sim |
| **FREE tenta enviar Logo** | Upload permitia seleção de imagem, falhava silenciosamente ou no save | Upload bloqueado com badge PRO; abre `UpgradeModal(LOGO)` imediatamente | Sim |
| **FREE tenta exportar SVG/PDF** | Botões clicáveis, sem feedback ou com erro genérico | Botões exibem ícone de cadeado; ao clicar, abre `UpgradeModal(SVG_EXPORT/PDF_EXPORT)` | Sim |
| **FREE atinge o 6º QR Code** | Toast de erro genérico vermelho sem explicação do limite | Frontend intercepta HTTP 403 `code: "LIMIT_REACHED"` e abre `UpgradeModal(LIMIT_REACHED)` | Sim |
| **FREE acessa Analytics** | Gráficos vazios ou quebrados sem explicação clara | Paywall educacional no Dashboard e Analytics ("Conhecer Analytics PRO") sem dados falsos | Sim |
| **FREE acessa Campanhas** | Formulário funcional na interface que quebrava na submissão | Banner educacional com preview de benefícios; botão de criação desativado preventivamente | Sim |
| **Visibilidade de Cota** | Nenhuma visualização de quantos QRs restavam | Widget compacto na Sidebar e card no Dashboard com barra de progresso e contagem exata | Sim |
| **Erro 403 de Segurança (IDOR/Admin)** | Tratado como erro | Continua estritamente como erro de segurança; interceptor **não** abre modal comercial | Sim |
| **Preços Anuais na Landing Page** | Não existiam de forma destacada | Seção dedicada com toggle Mensal/Anual e cálculo de desconto matematicamente real | Sim |

---

## 6. SEGURANÇA E ISOLAMENTO DE ERROS HTTP 403

Um dos pontos mais críticos da arquitetura foi manter a separação rigorosa entre:

1. **HTTP 403 Comercial (Entitlement Gate)**:
   - Disparado pelo backend com `code === "LIMIT_REACHED"` ou `code === "UPGRADE_REQUIRED"`.
   - Frontend intercepta exclusivamente estes códigos para abrir o `UpgradeModal`.
2. **HTTP 403 / 404 de Segurança (Anti-IDOR / Admin / Auth)**:
   - Disparado por tentativas de acessar QR codes de terceiros, endpoints administrativos ou tokens inválidos.
   - Retorna mensagens como `"Acesso restrito a administradores"` ou `"QR Code não encontrado"`, sem código comercial.
   - O interceptor do frontend **ignora** e exibe o toast de erro de permissão padrão, impedindo qualquer vazamento ou incentivo falso de upgrade em eventos adversariais.

---

## 7. VALIDAÇÃO E SUÍTES DE TESTES AUTOMATIZADOS

Todas as suítes foram executadas com 100% de aprovação no ambiente local:

### 1. Suíte de Funil e UX (`tests/test-conversion-funnel-ui.ts`):
- **47/47 asserções aprovadas (100%)**
- Cobertura:
  - FREE tentando criar QR dinâmico (intercepção frontend + 403 backend)
  - FREE tentando usar logo (intercepção frontend + 403 backend)
  - FREE tentando exportar SVG e PDF (intercepção frontend)
  - FREE no 6º QR Code (HTTP 403 `LIMIT_REACHED` + abertura de modal)
  - FREE em Analytics e Campanhas (paywall educacional)
  - Isolamento de 403 de Segurança (IDOR/Admin não aciona modal)
  - Usuários PRO e BUSINESS utilizando recursos liberados com sucesso

### 2. Regressão de Limites e Planos (`npm run test:limits`):
- **58/58 asserções aprovadas (100%)**
- Confirmação de que cotas FREE (5), PRO (15) e BUSINESS (ilimitado) permanecem intactas, sem brechas de concorrência ou bypass.

### 3. Regressão de Rate Limiter Server-Side (`npm run test:rate-limit`):
- **76/76 asserções aprovadas (100%)**
- Confirmação de que a janela de 30 reqs/60s, headers técnicos e retorno 429 continuam protegendo a API.

### 4. Checagem de Tipos e Esquema:
- `npx prisma validate`: Schema Prisma íntegro e válido.
- `npx tsc --noEmit`: Zero erros de tipagem TypeScript.

### 5. Build de Produção (`npm run build`):
- Compilação Next.js 14.2.35 concluída com sucesso para todas as 37 rotas estáticas e dinâmicas.
