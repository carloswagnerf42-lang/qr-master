# QR MASTER — Plataforma Profissional de QR Codes

**QR MASTER** é uma plataforma SaaS moderna, responsiva e completa para criação, personalização avançada, gerenciamento, rastreamento dinâmico e análise de métricas de QR Codes estáticos e dinâmicos.

---

## 🚀 Principais Funcionalidades

* **Gerador Completo Multi-Conteúdo**:
  * **URL**: Links web com validação e protocolo automático.
  * **WhatsApp**: Abertura direta via `wa.me` com mensagem inicial pré-formatada.
  * **Pix (EMV / BR Code)**: Implementação oficial das normas do Banco Central do Brasil com cálculo real de CRC16-CCITT polinomial.
  * **Wi-Fi**: Conexão instantânea sem digitação de senha (WPA, WPA2, WPA3, WEP, aberta ou oculta).
  * **Contato (vCard 3.0)**: Cartão de visitas digital completo com nome, cargo, empresa, telefones, email e endereço.
  * **Redes Sociais**: Atalhos rápidos para Instagram, YouTube, TikTok, Facebook, LinkedIn, X e Telegram.
  * **Multi-Link (Bio)**: Página intermediária para catálogo de links e redes sociais.
  * **Localização**: Coordenadas geográficas no Google Maps.
  * **Evento (iCalendar / vEvent)**: Adiciona compromisso diretamente no calendário do celular.
  * **Texto livre, E-mail, Telefone e SMS**.
* **QR Codes Dinâmicos & Redirecionamento `/q/:shortCode`**:
  * Altere a URL de destino a qualquer momento pelo painel sem precisar reimprimir o código.
  * Redirecionador 307 ultra-rápido com telemetria assíncrona.
* **Métricas & Analytics em Conformidade com a LGPD**:
  * Gráficos interativos com filtros por período (Hoje, 7 dias, 30 dias, 90 dias e 12 meses).
  * Distribuição por dispositivo (Mobile, Desktop, Tablet).
  * Distribuição por sistema operacional (iOS, Android, Windows, macOS, Linux).
  * Distribuição por navegador (Chrome, Safari, Edge, Firefox, etc.).
  * Mapa de calor e distribuição de horários de maior volume (00h às 23h).
  * Hashing irreversível de endereços IP com salt (SHA-256) garantindo privacidade total.
* **Personalização Profunda**:
  * Cores de módulos, olhos externos, pontos internos e fundo.
  * Suporte a fundo transparente.
  * Formato dos módulos (Quadrados, Arredondados, Pontos / Dots, Classy).
  * Formato dos cantos (Quadrados, Arredondados, Círculos).
  * Upload e centralização de logotipo com proporção protegida.
  * Molduras com chamada para ação ("APONTE A CÂMERA", "SCAN ME", "PAGAR COM PIX", etc.).
  * Níveis de correção de erro configuráveis (L, M, Q, H) com auto-recomendação do nível H ao inserir logo.
  * Validador automático de contraste com indicador visual de legibilidade.
* **Exportação Multi-Formato em Alta Resolução**:
  * **PNG**: 512px, 1024px, 2048px e 4096px (300 DPI nítido para impressão gráfica).
  * **SVG**: Vetorial puro infinitamente escalável.
  * **PDF**: Documento folha A4 diagramado profissionalmente com instruções de uso.
* **Gerenciamento SaaS**:
  * Tabela com busca em tempo real, filtros por status, categoria, tipo e período.
  * Módulo de Campanhas e Categorias.
  * Módulo de Favoritos e Lixeira com restauração ou exclusão definitiva.
  * Biblioteca de Modelos (Templates) com 1 clique.
  * Autenticação completa com sessões seguras e senhas criptografadas em bcrypt.
  * Alternador de temas (Light Mode, Dark Mode e System Mode).
  * Painel de Administração (`/admin`) protegido por role.

---

## 🛠 Stack Tecnológica

* **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons.
* **Gráficos**: Recharts.
* **Backend**: Next.js API Routes & Server Components.
* **Banco de Dados**: Prisma ORM com PostgreSQL nativo (compatível com Supabase / Connection Pooling e Session Direct).
* **Armazenamento de Arquivos**: Supabase Storage em nuvem com fallback seguro por usuário.
* **Autenticação**: Criptografia bcryptjs + sessões JWT com cookies HTTP-Only e isolamento multi-inquilino.
* **Geração de QR & Exportação**: `qrcode`, Canvas API e `jspdf`.

---

## 💻 Requisitos

* Node.js v18+ (compatível com Node v20 e v24).
* PostgreSQL 14+ (ou projeto Supabase).
* npm ou yarn.

---

## 📦 Instalação e Execução

1. Instale as dependências:
```bash
npm install
```
*(O script `postinstall` executará `prisma generate` automaticamente).*

2. Configure o arquivo `.env` com base no `.env.example`:
```bash
cp .env.example .env
```

3. Execute as migrações no banco de dados:
```bash
npm run db:migrate
```

4. (Opcional) Inicialize os planos e dados base:
```bash
npm run db:seed
```

5. Inicie a aplicação:
- **Desenvolvimento**: `npm run dev`
- **Produção**: `npm run build && npm start`

---

## 🧪 Execução de Testes Automatizados

A suíte completa conta com 357 asserções automatizadas cobrindo autenticação, planos, QR dinâmico, Pix EMV/CRC16, storage, segurança de admin e configurações:

```bash
npm run test
```

---

## 🌐 Deploy em Produção (Cloud)

1. Conecte o repositório à plataforma de deploy (Vercel, Render, Railway, AWS, Fly.io, etc.).
2. Configure as seguintes variáveis de ambiente obrigatórias:
   * `DATABASE_URL`: Connection string PostgreSQL com pooler (ex: Supavisor porta 6543).
   * `DIRECT_URL`: Conexão direta PostgreSQL (porta 5432) para migrações do Prisma.
   * `AUTH_SECRET`: Segredo criptográfico de 32+ caracteres (`openssl rand -hex 32`).
   * `NEXT_PUBLIC_APP_URL`: Domínio público de produção configurado na plataforma (ex: `https://seu-dominio.com`).
   * `SUPABASE_URL`: Endpoint da API do Supabase (`https://[REF].supabase.co`).
   * `SUPABASE_SERVICE_ROLE_KEY`: Chave de serviço secreta para upload e gestão do Storage.
   * `SUPABASE_STORAGE_BUCKET`: Nome do bucket de arquivos (ex: `qrmaster-files`).
3. Comandos de build e inicialização:
   * **Build command**: `npm run build`
   * **Start command**: `npm start`
   * **Migration command**: `npm run db:migrate`
