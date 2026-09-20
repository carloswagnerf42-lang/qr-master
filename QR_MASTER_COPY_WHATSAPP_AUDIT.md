# QR MASTER — RELATÓRIO DE AUDITORIA: COPY E SUPORTE VIA WHATSAPP

## 1. RESUMO EXECUTIVO

Esta micro-sprint de refinamento foi executada para alinhar a comunicação comercial da plataforma QR MASTER aos fatos operacionais reais comprovados e disponibilizar um canal oficial de suporte via WhatsApp (+55 31 98502-9353), com estrita preservação da integridade financeira, do banco de dados e do controle de acesso.

---

## 2. MATRIZ DE TEXTOS: ANTES vs DEPOIS

| Localização | Texto Antigo | Texto Novo | Justificativa Técnica |
| :--- | :--- | :--- | :--- |
| **Settings (Card PRO)** | `Mais Popular` | `Plano PRO` | Remoção de alegação não comprovada por dados consolidados de adesão. |
| **Landing Page (Card PRO)** | `Mais Completo` | `Plano PRO` | Alinhamento com identificação puramente factual do plano. |
| **UpgradeModal (Resumo)** | `Plano PRO Oficial` | `Plano PRO` | Padronização concisa da nomenclatura comercial. |
| **Settings (Checkout Header)** | `Cobrança Mensal Recorrente` | `Plano mensal — 30 dias de acesso` | Modelo real do SaaS é pré-pago por período (sem recorrência automática ativa). |
| **Settings (Checkout Header)** | `Cobrança Anual com Desconto` | `Plano anual — 365 dias de acesso` | Comunicação transparente do período de 365 dias contratado. |
| **Settings (Pix Checkout)** | `QR Code e Copia-e-Cola direto na tela. Liberação imediata em segundos assim que pago no banco.` | `QR Code e Copia-e-Cola direto na tela. Ativação após a confirmação do pagamento pelo Mercado Pago.` | Eliminação de promessa de segundos específicos; foco no webhook de confirmação real. |
| **UpgradeModal (Dynamic QR)** | `Redirecionamento em tempo real com alta disponibilidade` | `Altere o destino do QR sempre que precisar` | Remoção de alegação de SLA e alta disponibilidade não garantidas formalmente. |
| **UpgradeModal (Analytics)** | `Métricas & Analytics LGPD em Tempo Real` | `Métricas e Estatísticas de Escaneamentos` | Descrição factual sem falsa promessa de streaming/websocket instantâneo. |
| **UpgradeModal (Limit)** | `Desbloqueie QR Codes dinâmicos com edição de link em tempo real` | `Desbloqueie QR Codes dinâmicos com edição de link quando precisar` | Clareza sobre a flexibilidade de edição do destino do link. |
| **Settings (Aba Planos)** | `QR Codes dinâmicos com alteração de destino em tempo real e analytics completo.` | `QR Codes dinâmicos com alteração de destino quando precisar e analytics completo.` | Substituição de alegação inadequada de tempo real. |
| **Dashboard (Badge)** | `Painel em Tempo Real` | `Painel de Controle` | Nomenclatura objetiva e factual. |
| **Dashboard (Analytics)** | `Métricas & Analytics LGPD em Tempo Real` | `Métricas e Estatísticas de Escaneamentos` | Nomenclatura factual de relatórios agregados. |
| **Dashboard (Gráfico)** | `Acompanhe o engajamento e a curva de acessos em tempo real.` | `Acompanhe o engajamento e a curva de acessos dos seus QR Codes.` | Remoção de alegação de tempo real contínuo. |
| **Create QR (Preview)** | `Preview em Tempo Real` | `Preview Interativo` | Descrição técnica precisa da reatividade do canvas. |
| **Landing Page (Hero)** | `...e acompanhe relatórios detalhados de escaneamentos em tempo real.` | `...e acompanhe relatórios detalhados de escaneamentos.` | Comunicação factual de relatórios. |
| **Landing Page (Preview)** | `Preview em Tempo Real de Alta Resolução` | `Preview Instantâneo de Alta Resolução` | Comunicação objetiva do preview no canvas. |
| **Login (Hero)** | `Gere, personalize e rastreie QR Codes profissionais em tempo real.` | `Gere, personalize e rastreie QR Codes profissionais.` | Copy limpa e factual. |
| **Landing Page (Desconto Anual)** | `Economize até 58%` *(Hardcoded)* | `Economize até {maxDiscount}%` *(Dinâmico)* | Cálculo dinâmico derivado de `calculateAnnualDiscountPercent`. |

---

## 3. ARQUIVOS ALTERADOS E CRIADOS

### Arquivos de Apresentação e Componentes:
- `src/components/UpgradeModal.tsx`: Adequação dos highlights de REASON_CONFIG e título do Plano PRO.
- `src/app/(dashboard)/settings/page.tsx`: Ajustes no checkout, remoção de selo "Mais Popular", inclusão do suporte e contato WhatsApp.
- `src/components/landing/PricingAndFaq.tsx`: Cálculo dinâmico de desconto anual, remoção de selo e ponto discreto de contato WhatsApp.
- `src/app/page.tsx`: Ajustes de copy no hero, preview e rodapé com link discreto do WhatsApp.
- `src/components/layout/Sidebar.tsx`: Item discreto "Suporte WhatsApp" para assinantes PRO e BUSINESS.
- `src/app/(dashboard)/dashboard/page.tsx`: Ajuste de copy no cabeçalho e card de estatísticas.
- `src/app/(dashboard)/create/page.tsx`: Ajuste de copy no cabeçalho do preview interativo.
- `src/app/(auth)/login/page.tsx`: Ajuste de copy no hero.

### Testes & Configuração:
- `package.json`: Registro do script `"test:copy"`.
- `tests/test-copy-and-whatsapp.ts`: Suíte automatizada com 95 asserções aprovadas.

---

## 4. CANAL OFICIAL DO WHATSAPP: MAPEAMENTO E VISIBILIDADE

### Informações Técnicas do Canal:
- **Número Oficial Exibido**: `+55 31 98502-9353`
- **Identificador Técnico Internacional**: `5531985029353`
- **URL Base Oficial**: `https://wa.me/5531985029353`

### Onde o WhatsApp Aparece e Quem Pode Visualizar:

1. **Assinantes PRO e BUSINESS — Configurações (`/settings?tab=plan`)**:
   - **Visibilidade**: Exclusivo para usuários com plano PRO ou BUSINESS ativo.
   - **Título**: "Suporte via WhatsApp"
   - **Texto**: "Precisa de ajuda com sua conta ou seus QR Codes? Fale diretamente com o suporte."
   - **Botão**: "Chamar no WhatsApp"
   - **URL**: `https://wa.me/5531985029353?text=Ol%C3%A1!%20Sou%20cliente%20do%20QR%20MASTER%20e%20preciso%20de%20ajuda.`
   - **Segurança**: `target="_blank"`, `rel="noopener noreferrer"`, `aria-label="Falar com o suporte do QR MASTER pelo WhatsApp"`.

2. **Assinantes PRO e BUSINESS — Barra Lateral (`Sidebar.tsx`)**:
   - **Visibilidade**: Exclusivo para usuários PRO ou BUSINESS.
   - **Posicionamento**: No rodapé da barra lateral, próximo a Ajuda e Perfil, sem competir com CTAs centrais.
   - **Texto**: "Suporte WhatsApp"
   - **URL**: `https://wa.me/5531985029353?text=Ol%C3%A1!%20Sou%20cliente%20do%20QR%20MASTER%20e%20preciso%20de%20ajuda.`

3. **Usuários FREE — Configurações (`/settings?tab=plan`)**:
   - **Visibilidade**: Usuários no plano gratuito.
   - **Título**: "Contato" (distinção clara: **não** promete suporte prioritário de assinante).
   - **Texto**: "Dúvidas ou informações sobre os planos e recursos do QR MASTER?"
   - **Botão**: "Falar pelo WhatsApp"
   - **URL**: `https://wa.me/5531985029353?text=Ol%C3%A1!%20Gostaria%20de%20tirar%20uma%20d%C3%BAvida%20sobre%20o%20QR%20MASTER.`

4. **Usuários FREE — Barra Lateral (`Sidebar.tsx`)**:
   - **Visibilidade**: O item "Suporte WhatsApp" **NÃO** é renderizado. Mantido apenas o botão de upgrade `[Conhecer PRO]` sem agressividade.

5. **Público Geral — Landing Page (`/` - Seção de FAQ & Rodapé)**:
   - **Visibilidade**: Qualquer visitante.
   - **Posicionamento**: Bloco discreto no final do FAQ e link no rodapé.
   - **Título**: "Precisa falar com a gente?"
   - **Texto**: "Fale com o QR MASTER pelo WhatsApp."
   - **Botão**: "Falar pelo WhatsApp"
   - **URL**: `https://wa.me/5531985029353?text=Ol%C3%A1!%20Gostaria%20de%20tirar%20uma%20d%C3%BAvida%20sobre%20o%20QR%20MASTER.`
   - **Sem Pop-ups**: Nenhum balão ou modal automático foi implementado.

### Política de Privacidade na URL:
Nenhum dado pessoal sensível (e-mail, nome, CPF, tokens, telefone, IDs de pagamento ou plano) é interpolado na URL de WhatsApp.

---

## 5. RESULTADOS DAS SUÍTES DE TESTES E REGRESSÃO

Todas as suítes foram executadas com 100% de sucesso no ambiente local:

| Suíte / Comando | Asserções | Status | Cobertura |
| :--- | :---: | :---: | :--- |
| `npm run test:copy` | **95/95** | **PASS (100%)** | Ausência de cópias proibidas, textos substitutos factuais, URL e encoding de WhatsApp, a11y, rel, ausência de dados pessoais e distinção assinante vs free. |
| `npm run test:funnel` | **47/47** | **PASS (100%)** | Gating do 6º QR, dinâmica, logo, exportação SVG/PDF, paywall de analytics e campanhas, isolamento de segurança 403. |
| `npm run test:limits` | **58/58** | **PASS (100%)** | Cotas FREE (5), PRO (15), BUSINESS (ilimitado), advisory lock PostgreSQL, anti-IDOR e RBAC admin. |
| `npm run test:rate-limit` | **76/76** | **PASS (100%)** | Rate limiting técnico (30 reqs/60s), cabeçalhos RFC e HTTP 429. |
| `test-mercadopago-idempotency` | **37/37** | **PASS (100%)** | Idempotência de notificações de pagamento, tolerância a falhas, concorrência P2002 e rollback. |
| `test-mp-webhook-signature` | **15/15** | **PASS (100%)** | Validação HMAC SHA-256 de webhooks e sanitização. |
| `test-adversarial-cycle` | **106/106** | **PASS (100%)** | Ciclo de vida adversarial, downgrade pós-reembolso, lazy evaluation de expiração e tolerância a concorrência. |
| `test-amount-validation` | **59/59** | **PASS (100%)** | Validação exata de preços em centavos (toCents), rejeição de tampering e divergências. |
| `npx prisma validate` | — | **PASS** | Schema Prisma íntegro e validado. |
| `npx tsc --noEmit` | — | **PASS** | 0 erros de tipagem TypeScript. |
| `npm run build` | — | **PASS** | Compilação Next.js 14.2.35 concluída para as 37 rotas. |

---

## 6. PRESERVAÇÃO INTEGRAL DO BACKEND E FINANCEIRO

- Nenhuma rota em `src/app/api/billing/` foi alterada.
- O arquivo `src/lib/mercadopago.ts` permaneceu 100% inalterado.
- Os modelos e migrations no Prisma permaneceram 100% inalterados.
- Os preços de R$ 19,90 (mês) e R$ 99,00 (ano) para PRO, e R$ 29,90 (mês) e R$ 199,00 (ano) para BUSINESS permaneceram rigorosamente os mesmos.
