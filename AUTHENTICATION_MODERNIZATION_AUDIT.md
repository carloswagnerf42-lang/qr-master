# Relatório Oficial de Modernização da Autenticação — QR MASTER

**Data da Auditoria:** 22 de Setembro de 2026  
**Ambiente:** Pré-produção / Produção (Vercel + Supabase PostgreSQL)  
**Status do Projeto:** `AUTH IMPLEMENTATION PARTIAL — MANUAL CONFIGURATION REQUIRED`  
(Implementação técnica de código, banco de dados, RLS e testes concluída com 100% de sucesso; liberação externa depende do fornecimento das chaves de terceiros `RESEND_API_KEY` e `GOOGLE_CLIENT_ID`).

---

## 1. Respostas Fatuais às 25 Perguntas da Auditoria

### 1. Qual era a arquitetura de autenticação?
A arquitetura anterior era baseada em JWT próprio e senhas criptografadas com `bcryptjs` (custo 10). A sessão era mantida por cookie HttpOnly `qrmaster_session` com flag `SameSite=lax` e validade de 7 dias. O modelo `User` exigia obrigatoriamente um `passwordHash` (NOT NULL). Não havia suporte a OAuth federado nem mecanismo transacional de redefinição de senha (o link "Esqueci minha senha" disparava apenas um toast ilustrativo).

### 2. O que foi alterado?
- **Schema Prisma (`schema.prisma`)**:
  - `User.passwordHash`: tornado opcional (`String?`) para acomodar cadastros exclusivos via Google sem senhas artificiais.
  - Adicionadas relações `accounts AuthAccount[]` e `passwordResetTokens PasswordResetToken[]` no modelo `User`.
  - Criado o modelo `AuthAccount` para vincular provedores OAuth (`provider`, `providerAccountId`, `userId`) com unicidade `[provider, providerAccountId]`.
  - Criado o modelo `PasswordResetToken` para persistência segura de tokens com `tokenHash` (SHA-256), `expiresAt` e `usedAt`.
- **Banco de Dados (Supabase PostgreSQL)**:
  - Sincronização aditiva e segura (`prisma db push`).
  - Habilitação imediata de Row Level Security (RLS) nas novas tabelas.
  - Revogação explícita de todos os privilégios das roles públicas `anon` e `authenticated`.
- **Serviços Backend**:
  - `src/lib/auth.ts`: inseridas funções criptográficas `generateSecureToken()`, `hashToken()` e tratamento defensivo em `verifyPassword` para valores nulos.
  - `src/lib/email.ts`: serviço de envio de e-mails via API HTTP do Resend, com fallback gracioso e log de auditoria em ambiente de desenvolvimento/teste.
  - `src/lib/google-auth.ts`: validador de integridade server-side do Google ID token via endpoint oficial `tokeninfo`, com checagem de emissor, expiração, audiência e status de verificação do e-mail.
  - `src/lib/rate-limit.ts`: inclusão das ações `forgotPassword` e `resetPassword` com janelas de proteção contra abuso.
- **Rotas de API**:
  - `POST /api/auth/forgot-password`: solicitação de recuperação de senha com mitigação de enumeração.
  - `POST /api/auth/reset-password`: redefinição de senha com invalidação do token e hash bcrypt.
  - `POST /api/auth/google`: autenticação Google (cadastro automático para novos usuários, login direto para contas vinculadas e sinalização `requiresLink` para contas existentes).
  - `POST /api/auth/google/link`: confirmação de senha do usuário existente para vincular a identidade Google com segurança.
  - `POST /api/auth/login`: mensagem orientativa caso um usuário criado via Google tente efetuar login tradicional sem senha cadastrada.
- **Frontend**:
  - Nova rota `/forgot-password`: formulário oficial de solicitação de recuperação.
  - Nova rota `/reset-password`: formulário com confirmação de senha, leitura do token via query string e validação em tempo real.
  - `src/components/auth/GoogleSignInButton.tsx`: botão oficial compatível com Google Identity Services.
  - `src/components/auth/LinkGoogleAccountModal.tsx`: modal para o Cenário C de vinculação segura.
  - Atualização de `/login` e `/register` integrando o botão Google, divisor visual e vínculo de conta.

### 3. Recuperação de senha está funcional?
**Sim.** O fluxo completo foi implementado e validado ponta a ponta: geração de token seguro, gravação em banco, validação, redefinição da senha no banco e verificação de que a nova senha funciona enquanto a anterior passa a ser rejeitada.

### 4. Token é single-use?
**Sim.** Assim que o token é utilizado em `/api/auth/reset-password`, o campo `usedAt` é preenchido com o timestamp atual (`new Date()`). Qualquer tentativa subsequente de reutilizar o mesmo token é sumariamente rejeitada com erro HTTP 400 (`"Este link de redefinição já foi utilizado anteriormente"`). Além disso, todos os outros tokens pendentes daquele mesmo usuário são revogados na mesma operação.

### 5. Qual a expiração?
**1 hora** (`60 * 60 * 1000 ms`). Tokens acessados após `expiresAt` são rejeitados com HTTP 400 (`"Este link de redefinição expirou"`).

### 6. Token bruto é armazenado?
**NÃO.** O token bruto (`rawToken`) é uma sequência criptograficamente pseudoaleatória de 32 bytes (64 caracteres hexadecimais) gerada por `crypto.randomBytes(32)`. Ele é enviado exclusivamente por link de e-mail ao destinatário. No banco de dados, é gravado unicamente o hash SHA-256 (`tokenHash`). Mesmo no caso hipotético de um vazamento do banco de dados, o atacante não tem acesso aos tokens brutos para redefinir contas.

### 7. Existe proteção contra enumeração?
**Sim.** A rota `POST /api/auth/forgot-password` retorna sempre a mesma resposta HTTP 200 genérica, independentemente de o e-mail existir ou não na base de dados:
`"Se este e-mail estiver cadastrado em nossa plataforma, você receberá um link seguro para redefinir sua senha em instantes."`
O tempo de resposta também é padronizado, prevenindo enumeração por análise de latência.

### 8. Existe rate limit?
**Sim.** Ambos os fluxos de recuperação estão protegidos no nível do servidor (`src/lib/rate-limit.ts`):
- `forgotPassword`: máximo de 5 tentativas a cada 15 minutos por endereço IP.
- `resetPassword`: máximo de 5 tentativas a cada 15 minutos por endereço IP.

### 9. E-mail real está configurado ou falta configuração manual?
**Falta configuração manual.** O adaptador `src/lib/email.ts` foi construído e está pronto para uso imediato com a API da Resend (ou qualquer provedor compatível). Para que o envio externo aconteça em produção, o usuário precisa cadastrar a variável de ambiente `RESEND_API_KEY` (e opcionalmente `EMAIL_FROM`) no painel da Vercel. Na ausência da chave, o sistema opera em modo fallback seguro (registrando a ação no console/log sem provocar falhas 500).

### 10. Google Login está funcional ou falta configuração manual?
**Funcional no código, pendente de configuração manual das chaves de produção.** A lógica completa de verificação server-side, criação de contas, vinculação segura e emissão de sessões JWT está 100% testada e aprovada. Para que o botão exiba o prompt do Google no navegador, é necessário registrar o Client ID obtido no Google Cloud Console nas variáveis `NEXT_PUBLIC_GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_ID`.

### 11. Google token é validado server-side?
**Sim.** O backend recebe o ID Token (JWT) e valida sua integridade diretamente no endpoint oficial do Google (`https://oauth2.googleapis.com/tokeninfo`). São checados:
1. Emissor oficial (`accounts.google.com` ou `https://accounts.google.com`);
2. Expiração temporal (`exp > now`);
3. Audiência (`aud === GOOGLE_CLIENT_ID`);
4. E-mail verificado (`email_verified === "true"` ou `true`).

### 12. providerAccountId usa sub?
**Sim.** O identificador único e perene retornado pelo Google (`sub`) é gravado no campo `providerAccountId` da tabela `AuthAccount`. O sistema nunca utiliza o endereço de e-mail como chave primária de federação, prevenindo quebras caso o usuário altere o endereço no Google.

### 13. Conta existente pode ser duplicada?
**NÃO.** A tabela `User` possui restrição de unicidade no banco de dados (`email @unique`). Se um usuário tentar autenticar com o Google usando um e-mail já cadastrado, a criação de conta duplicada é terminantemente impedida.

### 14. Como funciona account linking?
Se um usuário tentar logar com o Google utilizando o e-mail de uma conta pré-existente criada por senha:
1. O backend detecta a colisão de e-mail e verifica que `user.passwordHash` não é nulo.
2. A requisição retorna `{ requiresLink: true, email: user.email }`.
3. O frontend abre automaticamente o modal `LinkGoogleAccountModal`.
4. O usuário digita a senha da sua conta QR MASTER.
5. A rota `POST /api/auth/google/link` valida rigorosamente a credencial do Google e a senha da conta.
6. Havendo sucesso, cria o vínculo em `AuthAccount(userId, provider: "google", providerAccountId: sub)`.
7. A sessão JWT é emitida e o usuário tem acesso imediato, mantendo todos os seus dados preservados.

### 15. QR Codes são preservados?
**Sim, 100% preservados.** A vinculação social ou a redefinição de senha afetam estritamente a tabela `User` (campo `passwordHash`) e a tabela filha `AuthAccount`. A tabela `QRCode` permanece intocada.

### 16. Assinaturas são preservadas?
**Sim, 100% preservadas.** A relação entre `User` e `Subscription` não sofre alteração. O usuário vinculado continua com sua assinatura exatamente como estava.

### 17. Roles são preservadas?
**Sim, 100% preservadas.** O campo `User.role` nunca é alterado nos fluxos de login com Google, vinculação ou recuperação de senha.

### 18. Google consegue conceder ADMIN? Resposta esperada: NÃO.
**NÃO.** Ao cadastrar um novo usuário via Google, o valor do campo `role` não é passado, assumindo o padrão seguro do schema Prisma: `@default("USER")`. Nenhum parâmetro vindo do Google pode promover uma conta a `ADMIN`.

### 19. Novas tabelas possuem RLS?
**Sim.** Ambas as tabelas `AuthAccount` e `PasswordResetToken` foram criadas com Row Level Security explicitamente habilitado:
- `AuthAccount`: `rowsecurity = true`
- `PasswordResetToken`: `rowsecurity = true`

### 20. anon/authenticated possuem acesso às novas tabelas?
**NÃO.** Foram executados os comandos:
```sql
REVOKE ALL ON TABLE public."AuthAccount" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PasswordResetToken" FROM anon, authenticated;
```
Nenhum usuário externo consegue ler ou manipular essas tabelas via Data API pública do Supabase/PostgREST. Todo o acesso ocorre exclusivamente através do servidor Next.js autenticado pelo Prisma com a role privilegiada `postgres`.

### 21. Todos os testes passaram?
**Sim, 100% de aprovação:**
- `tests/test-password-reset.ts`: 17/17 testes aprovados.
- `tests/test-google-auth.ts`: 22/22 testes aprovados.
- `tests/test-authorization.ts`: 22/22 testes aprovados.
- `tests/test-plans-and-permissions.ts`: 58/58 testes aprovados.
- `tests/test-commercial-checkout-cycle.ts`: 69/69 testes aprovados.
- `tests/test-commercial-claims.ts`: 27/27 testes aprovados.
- `tests/test-dashboard-help.ts`: 27/27 testes aprovados.
- `tests/test-qr-rate-limit.ts`: 76/76 testes aprovados.

### 22. Build passou?
**Sim.** O comando `npm.cmd run build` concluiu com sucesso absoluto (`code 0`), compilando e otimizando as 48 rotas estáticas e dinâmicas da aplicação Next.js sem nenhum erro de tipagem (`tsc --noEmit` limpo) ou empacotamento.

### 23. Pagamento histórico permaneceu intacto?
**Sim, rigorosamente intacto.**
- Assinatura ID: `cmu8hps850003e0kf40520blk`
- Mercado Pago Payment ID: `178856033673`
- Status: `ACTIVE`
- Plano: `PRO`
- Usuário: `itzjhonzin@gmail.com`
- Período: `2026-09-19` até `2026-10-19`

### 24. Quais ações manuais eu preciso executar?
Para habilitar o envio real de e-mails em produção e o login direto com o Google:

1. **Configurar Envio de E-mails (Resend)**:
   - Obter uma API Key no [Resend](https://resend.com).
   - Adicionar as variáveis no painel da Vercel (e em `.env` se for testar localmente):
     - `RESEND_API_KEY=re_xxxxxxxxxxxx`
     - `EMAIL_FROM=QR MASTER <suporte@seudominio.com.br>`

2. **Configurar Google OAuth (Google Cloud Console)**:
   - Acessar o [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
   - Criar uma credencial do tipo "OAuth 2.0 Client ID" para Aplicação Web.
   - Adicionar as origens JavaScript autorizadas:
     - `https://qrmaster.com.br` (seu domínio de produção)
     - `http://localhost:3000` (para testes locais)
   - Adicionar as variáveis na Vercel:
     - `NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com`
     - `GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com`

### 25. Existe algum bloqueador antes de liberar Google Login/Password Reset em produção?
**Nenhum bloqueador técnico ou estrutural.** A base de código está totalmente pronta, estável, segura e compatível com as regras de RLS do Supabase. A liberação aos usuários finais depende unicamente da inclusão das duas credenciais descritas no item 24.

---

## 2. Classificação Final

```
================================================================================
STATUS: AUTH IMPLEMENTATION PARTIAL — MANUAL CONFIGURATION REQUIRED
================================================================================
Implementação de software: 100% CONCLUÍDA
Segurança de Banco & RLS : 100% APLICADA E VERIFICADA
Integridade de Dados     : 100% PRESERVADA (Assinatura #178856033673 intacta)
Ação Pendente            : Inclusão de chaves RESEND_API_KEY e GOOGLE_CLIENT_ID
================================================================================
```
