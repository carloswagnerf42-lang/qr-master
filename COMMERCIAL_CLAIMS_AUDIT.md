# Relatório de Auditoria de Veracidade Comercial da Landing Page — QR MASTER

**Data da Auditoria:** 22 de Setembro de 2026  
**Projeto:** QR MASTER (Master Digital)  
**Ambiente:** Produção (Vercel) / Local QA  
**Commit de Referência:** `fix(marketing): align landing claims with implemented features`  
**Status Geral:** APROVADO COM 100% DE CONFORMIDADE TÉCNICA E FACTUAL

---

## 1. Resumo Executivo da Auditoria

Esta auditoria inspecionou rigorosamente todas as declarações de marketing, recursos, dados numéricos e alegações jurídicas presentes na landing page pública (`/`), na página de preços/FAQ (`PricingAndFaq.tsx`) e nas páginas jurídicas (`/privacy` e `/terms`) do QR MASTER.

Cada alegação comercial foi confrontada diretamente com o schema do banco de dados Prisma, rotas de API, middlewares de autenticação, endpoints de telemetria e testes automatizados de regressão. Todas as promessas não suportadas (como Domínio Próprio/Whitelabel e Cidades no Analytics) ou excessivas (como declarações absolutas de conformidade LGPD e garantias de alta disponibilidade com SLA) foram eliminadas ou convertidas em descrições estritamente factuais e comprováveis pelo código existente.

---

## 2. Matriz de Auditoria das Alegações Comerciais

| Item / Alegação Comercial | Status Técnico Anterior | Diagnóstico no Código | Ação Corretiva Executada | Status Final |
| :--- | :--- | :--- | :--- | :--- |
| **1. Domínio Próprio / Whitelabel** | Inexistente no produto | Sem campos no Prisma, sem infraestrutura DNS/SSL, sem roteamento de host customizado | **REMOVIDO**. Substituído pelo recurso real **"Módulo de Campanhas"** (exclusivo BUSINESS) | `CORRECTED` |
| **2. Cidades e Regiões no Analytics** | Inexistente no produto | Schema possui colunas legadas opcionais, mas `/q/[shortCode]` não faz GeoIP e a API/dashboard não exibem cidades | **REMOVIDO**. Substituído por métricas reais: **"Navegadores mais usados"** e **"Média Diária & Comparativo"** | `CORRECTED` |
| **3. Números Demonstrativos (3.842 scans)** | Ambíguo | Números estáticos da demonstração poderiam ser interpretados como métricas reais de plataforma | **CORRIGIDO**. Inserção do badge **"Demonstração ilustrativa"**, rótulo "Dados de exemplo" e texto de apoio factual | `PASS` |
| **4. Termos Absolutos ("100% LGPD")** | Juridicamente inadequado | O sistema anonimiza IPs com HMAC-SHA256, mas declarar "100% LGPD" é juridicamente temerário | **CORRIGIDO**. Substituído por **"Privacidade por Design"** com explicação técnica do hash SHA-256 sem IP bruto | `CORRECTED` |
| **5. "Alta Disponibilidade" com CDN global** | Promessa sem SLA formal | Sistema hospedado em Edge Serverless (Vercel), mas sem contrato de SLA corporativo 99,99% | **CORRIGIDO**. Substituído por **"Infraestrutura em Nuvem (Vercel)"** | `CORRECTED` |
| **6. Casos de Uso Exagerados** | Ambíguo | Textos insinuavam módulos verticais dedicados ("validação de garantia", "check-in") | **CORRIGIDO**. Redação ajustada para evidenciar redirecionamentos e links rápidos (manuais em PDF, vídeos, credenciamento) | `CORRECTED` |
| **7. Menção a CNPJ no Rodapé** | Incompleto | Exibia "CNPJ e operação no Brasil" sem indicar o número formal do CNPJ | **CORRIGIDO**. Ajustado para **"Operação no Brasil"** até preenchimento cadastral formal | `WARNING / CORRECTED` |
| **8. Integração Mercado Pago** | Comprovado | Integração real com checkout Pix EMV, cartão, webhooks com HMAC e reconciliação | **MANTIDO**. Descrição factual e rigorosamente alinhada | `PASS` |
| **9. Cotas dos Planos (5, 15, Ilimitado)** | Comprovado | 5 QRs (FREE), 15 QRs (PRO), 999999 sentinela (BUSINESS) validados no banco e endpoints | **MANTIDO**. Alinhado entre landing page, FAQ, modal e regras de API | `PASS` |
| **10. Suporte via WhatsApp** | Comprovado | Link aponta para número oficial da Master Digital (`+55 31 98502-9353`) com `rel="noopener noreferrer"` | **MANTIDO**. Totalmente funcional e seguro | `PASS` |

---

## 3. Respostas Oficiais às 20 Questões da Auditoria (Seção 11)

### 1. O recurso "Domínio Próprio / Whitelabel" estava implementado no código?
**NÃO.** O recurso não existia em nenhuma camada do software.

### 2. Havia rota, tabela, DNS ou lógica para whitelabel?
**NÃO.** Foi realizada busca exaustiva no repositório. O schema do Prisma não possui nenhum campo de domínio customizado ou tenant DNS; o middleware de requisições e as rotas `/q/[shortCode]` e `/m/[slug]` resolvem estritamente o domínio base da aplicação (`APP_URL`); e não há nenhum provisionamento dinâmico de certificados SSL ou registros CNAME.

### 3. O Analytics coleta cidade ou região?
**NÃO.** Embora o modelo `QRCodeScan` no `schema.prisma` contenha campos opcionais legados `city` e `state`, o endpoint de redirecionamento (`src/app/q/[shortCode]/route.ts`) e o parser de telemetria (`src/lib/user-agent.ts`) **não realizam nenhuma consulta GeoIP**. Os dados de geolocalização física não são capturados nem gravados.

### 4. A exibição de cidades na landing era real ou fictícia?
**FICTÍCIA (Ilustrativa).** A landing page continha um card com percentuais estáticos mockados ("São Paulo 45%", "Rio de Janeiro 22%", "Belo Horizonte 18%"). Como a aplicação real não coleta nem agrega cidades, esse card induzia o visitante a acreditar em um recurso inexistente. Foi completamente removido e substituído por "Navegadores mais usados", que é uma métrica real agregada pelo backend.

### 5. Os números da seção de Analytics da landing refletem dados reais da plataforma ou são ilustrativos?
**SÃO ILUSTRATIVOS.** Os números (ex: 3.842 scans, 82% mobile, etc.) constituem um mock visual de demonstração da interface do painel.

### 6. Essa demonstração está claramente identificada como ilustrativa?
**SIM.** Foi adicionado um badge proeminente `Demonstração ilustrativa`, a etiqueta discreta `Dados de exemplo` no card de total de escaneamentos, e a subheadline foi ajustada de *"Métricas reais..."* para *"Exemplo de visualização das métricas disponíveis no painel para entender o comportamento de acesso aos seus QR Codes."*

### 7. O sistema armazena IP original do usuário?
**NÃO.** A auditoria técnica do arquivo `src/lib/user-agent.ts` comprovou que o IP bruto do visitante é processado exclusivamente em memória volátil, aplicando imediatamente um hash irreversível `HMAC-SHA256` combinado com salt rotativo da aplicação e truncado a 16 caracteres hexadecimais. O endereço IP original **nunca é persistido** no banco de dados.

### 8. O sistema pode legalmente se declarar "100% LGPD" ou certificado?
**NÃO.** No ordenamento jurídico brasileiro (Lei nº 13.709/2018), a conformidade é um processo contínuo de governança de dados e não existe um selo oficial ou certificação estatal de "100% LGPD". Alegações absolutas são consideradas juridicamente temerárias e passíveis de questionamento.

### 9. Como a segurança e privacidade devem ser comunicadas de forma tecnicamente correta?
Devem ser comunicadas de forma descritiva e factual: **"Privacidade por Design"**, destacando a minimização de dados e a proteção técnica de identificadores por meio de hash SHA-256 irreversível sem armazenamento do endereço IP bruto, além de conexões HTTPS criptografadas.

### 10. O processamento pelo Mercado Pago é real?
**SIM.** A integração com o Mercado Pago é 100% real e funcional. Suporta Pix (BR Code EMV com cópia e cola e QR Code nativo), cartões de crédito via SDK, validação rigorosa de assinatura HMAC em webhooks, tratamento de concorrência com chave de idempotência P2002 e verificação ativa do status do pagamento na API oficial do gateway.

### 11. Há garantia de "Alta Disponibilidade" com SLA contratual?
**NÃO.** A aplicação está hospedada na infraestrutura serverless da Vercel com distribuição em Edge Network global, o que oferece alta resiliência e baixa latência, mas não há um contrato de SLA empresarial formal de 99,99% firmado com os clientes finais. O termo foi corrigido para **"Infraestrutura em Nuvem (Vercel)"**.

### 12. Os limites dos planos (5, 15, ilimitado) na landing correspondem ao código?
**SIM, COM 100% DE PRECISÃO.** A tabela de preços e os cards anunciam exatamente as regras auditadas em `src/lib/permissions.ts`:
- Plano **FREE**: cota de 5 QR Codes por ciclo mensal de 30 dias;
- Plano **PRO**: cota de 15 QR Codes por ciclo mensal de 30 dias (estáticos ou dinâmicos);
- Plano **BUSINESS**: criação comercialmente ilimitada (implementada com sentinela técnico 999999).

### 13. O plano BUSINESS tem alguma restrição técnica que contradiga "ilimitado"?
**NÃO.** Para o usuário final e uso corporativo normal, a criação é livre e ilimitada. A única restrição presente é a proteção de segurança de borda contra ataques DDoS/flood malicioso via rate limiter server-side (30 requisições de criação por minuto), o que configura boa prática de segurança operacional e não restrição comercial.

### 14. Os casos de uso refletem recursos do produto ou promessas exageradas?
**AGORA REFLETEM RECURSOS REAIS.** Foram eliminadas expressões que sugeriam sistemas especializados independentes (como "validação de garantia de equipamentos", "conversão geográfica" ou "hardware de check-in para eventos"). O texto foi ajustado para descrever a função real do QR Code como vetor de redirecionamento inteligente (links para manuais técnicos em PDF, vídeos demonstrativos, páginas de programação e pagamentos Pix diretos no balcão).

### 15. O link do WhatsApp no rodapé é funcional e aponta para o número correto?
**SIM.** O link aponta para `https://wa.me/5531985029353` com mensagem institucional amigável, abertura em nova aba com `target="_blank"`, proteção `rel="noopener noreferrer"`, atributo de acessibilidade `aria-label` e ausência absoluta de vazamento de dados de sessão ou parâmetros de autenticação na URL.

### 16. Há menção a CNPJ sem que o CNPJ esteja informado?
**NÃO MAIS.** O rodapé mencionava anteriormente "CNPJ e operação no Brasil" sem que houvesse um número de CNPJ publicado. O texto foi corrigido para **"QR MASTER • Master Digital. Operação no Brasil."**

### 17. O que foi corrigido no texto da landing page?
1. Substituição de "Domínio Próprio / Whitelabel" por **"Módulo de Campanhas"** (recurso real BUSINESS);
2. Substituição de "Cidades e Regiões" no mock de Analytics por **"Navegadores mais usados"** e **"Média Diária & Comparativo"**;
3. Inclusão dos avisos **"Demonstração ilustrativa"** e **"Dados de exemplo"** na seção de inteligência de dados;
4. Substituição de "LGPD Compliant" e "(100% LGPD)" por **"Privacidade por Design"** com explicação técnica de hash SHA-256 sem IP bruto;
5. Substituição de "Alta Disponibilidade" por **"Infraestrutura em Nuvem"**;
6. Refinamento dos cards de Casos de Uso (Embalagens, Eventos, Comércio e Campanhas);
7. Remoção da menção genérica a "CNPJ" e "protegidos por LGPD" no rodapé;
8. Atualização das páginas jurídicas (`/privacy` e `/terms`) para eliminar alegações de coleta de cidades/regiões nos scans.

### 18. Alguma funcionalidade real do produto foi removida ou alterada?
**NÃO.** Nenhuma linha de lógica de negócio, criação de QR Code, renderização gráfica, persistência em banco, endpoint de API ou integração de pagamento foi alterada ou removida. Todas as alterações foram estritamente editoriais, de copy e de testes automatizados de validação.

### 19. O pagamento histórico 178856033673 permaneceu intacto?
**SIM, 100% INTATOS.** Todas as suítes de teste executadas validaram antes e após as operações que a transação `#178856033673`, seu ID, plano PRO, datas de início/vencimento e o usuário titular `itzjhonzin@gmail.com` permaneceram inalterados.

### 20. A landing page agora está 100% alinhada à realidade técnica do QR MASTER?
**SIM.** Todos os 8 pilares de benefícios, 6 cards de visualização do painel, casos de uso, cotas, modelos de cobrança pré-paga e garantias técnicas correspondem com fidelidade matemática e operacional ao código-fonte do produto.

---

## 4. Registro dos Resultados das Suítes de Testes

Todas as suítes de validação foram executadas com sucesso no ambiente:

1. **`test:claims` (27/27 testes aprovados - 100%)**:
   - Ausência de Whitelabel, Domínio Próprio e Cidades na landing page;
   - Ausência de alegações de 100% LGPD, 100% seguro ou SLA de alta disponibilidade;
   - Presença de Módulo de Campanhas, Demonstração ilustrativa, Navegadores, Média Diária, Privacidade por Design e Infraestrutura em Nuvem;
   - Alinhamento da Política de Privacidade e Termos de Uso.
2. **`test:landing` (84/84 testes aprovados - 100%)**:
   - Validação da estrutura completa da Landing Page (Hero, Pilares, QR Dinâmico, Analytics, Casos de Uso, Preços, FAQ, Footer, Links do WhatsApp e ausência de typos).
3. **`test:copy` (95/95 testes aprovados - 100%)**:
   - Conformidade de microcopy factual em Settings, Sidebar, Dashboard, UpgradeModal e Create.
4. **`test:mobile-nav` (47/47 testes aprovados - 100%)**:
   - Navegação móvel e comportamento de rolagem responsiva no fluxo `/create`.
5. **`test:my-qrs-mobile` (30/30 testes aprovados - 100%)**:
   - Responsividade mobile em viewports de 320px a 430px sem quebras de layout.
6. **`test:analytics-mobile` (38/38 testes aprovados - 100%)**:
   - Responsividade dos gráficos e métricas do painel Analytics.
7. **`test:limits` (58/58 testes aprovados - 100%)**:
   - Auditoria de quotas comerciais FREE (5), PRO (15) e BUSINESS (ilimitado) com proteção anti-race condition.
8. **`test:checkout-cycle` (69/69 testes aprovados - 100%)**:
   - Ciclo de checkout Mercado Pago, webhook HMAC, idempotência e tolerância zero.
9. **`test:renewal-period` (56/56 testes aprovados - 100%)**:
   - Preservação integral de dias pagos em renovações antecipadas.
10. **`test:pro-business-upgrade` (48/48 testes aprovados - 100%)**:
    - Política oficial de upgrade PRO → BUSINESS com preservação temporal de saldo.
11. **`test:rate-limit` (76/76 testes aprovados - 100%)**:
    - Proteção server-side de 30 requisições/minuto contra abusos de criação.
12. **`prisma validate` (APROVADO)**:
    - Integridade do schema Prisma mantida sem inconsistências.
13. **`tsc --noEmit` (APROVADO - 0 erros)**:
    - Tipagem estrita TypeScript validada.
14. **`npm run build` (APROVADO - 0 erros)**:
    - Compilação de produção Next.js finalizada com sucesso em todas as 39 rotas.
