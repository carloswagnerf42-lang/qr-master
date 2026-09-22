# RELATÓRIO DE AUDITORIA DE SEGURANÇA SUPABASE / POSTGRESQL / RLS

**Data da Auditoria:** 22 de Setembro de 2026  
**Projeto:** QR MASTER (Master Digital)  
**Banco de Dados:** Supabase PostgreSQL 17.6 (AWS Oregon / `aws-0-us-west-2.pooler.supabase.com`)  
**Alerta Analisado:** `rls_desativado_em_público` / `rls_disabled_in_public`  
**Classificação de Risco:** **CRÍTICO EM NÍVEL DE BANCO / BAIXO RISCO IMEDIATO NO FRONTEND ATUAL**  
**Ação Imediata Executada:** **AUDITORIA TÉCNICA 100% SOMENTE-LEITURA (Nenhuma alteração executada)**  

---

## 1. CAUSA EXATA DO ALERTA

O Supabase inclui um analisador contínuo de postura de segurança (*Database Linter*).  
O alerta **`rls_desativado_em_público`** foi disparado porque o Supabase, por padrão de plataforma:

1. Expõe automaticamente todo o schema `public` do PostgreSQL através da sua API Data / PostgREST no endpoint público `https://[PROJECT-REF].supabase.co/rest/v1/`.
2. Concede permissões padrão automáticas (`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`) para as roles de banco `anon` (usuários não autenticados na API do Supabase) e `authenticated` (usuários com token JWT do Supabase Auth).
3. Todas as 15 tabelas criadas pelo Prisma no schema `public` foram criadas com **Row Level Security (RLS) DESATIVADO** (`relrowsecurity = false`).

Como o RLS está desativado em todas as tabelas, **qualquer pessoa ou script que possua a URL do projeto Supabase e a chave pública `anon`** (caso venha a ser descoberta ou exposta) consegue enviar requisições HTTP REST diretamente para a PostgREST do Supabase e ler, alterar ou excluir registros diretamente do banco de dados, sem passar pelas regras de negócio da aplicação Next.js.

---

## 2. INVENTÁRIO COMPLETO DAS TABELAS AFETADAS (SCHEMA PUBLIC)

A auditoria via catálogo do PostgreSQL (`pg_class`, `pg_namespace`, `information_schema.role_table_grants`) identificou **15 tabelas** no schema `public`.  
**TODAS AS 15 TABELAS ESTÃO COM RLS DESATIVADO:**

| Tabela | RLS Ativo? | Force RLS? | Table Owner | Privilégios `anon` | Privilégios `authenticated` | Exposta na PostgREST? | Usada pelo Prisma? |
|---|:---:|:---:|:---:|---|---|:---:|:---:|
| **`User`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`Subscription`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`Plan`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`QRCode`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`QRCodeScan`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`ActivityLog`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`Campaign`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`Category`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`GeneratedFile`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`MultiLinkPage`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`SystemSetting`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`Template`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`UserSettings`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`WebhookEvent`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |
| **`_prisma_migrations`** | ❌ NÃO | NÃO | `postgres` | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) | ALL | SIM | SIM |

---

## 3. ARQUITETURA ATUAL DO QR MASTER

### 3.1. Como o Frontend e o Backend se comunicam
A aplicação QR MASTER segue estritamente a arquitetura de **SaaS Server-Side Tradicional**:
```
[Navegador do Usuário]
       │
       ▼ (HTTPS / Cookies HttpOnly)
[Next.js API Routes / Servidor Node.js]
       │
       ▼ (Prisma Client via TCP / Porta 6543)
[Supabase Supavisor Connection Pooler]
       │
       ▼ (Conexão interna direta com bypass RLS)
[PostgreSQL Database — Role: postgres]
```

### 3.2. O Frontend usa Supabase?
- **Não.** Não existe `@supabase/supabase-js` instalado no `package.json`.
- O código do frontend **não** possui `createClient`, **não** possui `NEXT_PUBLIC_SUPABASE_ANON_KEY`, e **não** se comunica com a API REST ou GraphQL do Supabase.
- A única utilização do Supabase na aplicação é no backend server-side (`src/lib/storage.ts`), onde o servidor Next.js envia arquivos binários para o Supabase Storage via `SUPABASE_SERVICE_ROLE_KEY`.

### 3.3. Papel e Conexão do Prisma no PostgreSQL
- **String de conexão:** `DATABASE_URL` aponta para `aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true`.
- **Role utilizada pelo Prisma:** `postgres`.
- **Atributos da role `postgres` (auditados diretamente via catálogo `pg_roles`):**
  - `rolname`: `postgres`
  - `rolsuper`: `false` (padrão de nuvem Supabase)
  - `rolcanlogin`: `true`
  - **`rolbypassrls`: `true` (CRUCIAL)**
  - `table_owner`: `postgres` em todas as tabelas.

---

## 4. ANÁLISE DE RISCO REAL

1. **Risco Imediato com a API Pública do Supabase:**
   - A URL PostgREST `https://[PROJECT-REF].supabase.co/rest/v1/` exige autenticação via cabeçalho `apikey`.
   - Como o frontend do QR MASTER **não** expõe a chave `anon` no bundle HTML/JS, um atacante externo comum não consegue enviar requisições sem descobrir previamente o `anon key`.
   - **Porém**, caso qualquer colaborador, log, repositório ou configuração venha a expor a chave `anon` daquele projeto Supabase, **qualquer pessoa poderá ler e manipular 100% dos dados** de `User`, `Subscription`, `QRCode`, etc., porque o PostgreSQL não possui RLS ativado.
2. **Conclusão de Risco:** Trata-se de uma **vulnerabilidade latente de alta severidade no banco de dados**, que deve ser neutralizada antes da escala comercial.

---

## 5. IMPACTO DE ATIVAR O RLS SOBRE O PRISMA E A APLICAÇÃO

### Ativar o RLS vai quebrar o Prisma?
**NÃO. O Prisma NÃO será afetado.**  
Evidência técnica irrefutável do PostgreSQL:
1. O Prisma conecta como o usuário de banco de dados **`postgres`**.
2. A role **`postgres`** no Supabase possui explicitamente a flag **`rolbypassrls = true`** no catálogo `pg_roles`.
3. Além disso, a role `postgres` é a **proprietária (`table_owner`)** de todas as tabelas no schema `public`.
4. De acordo com a especificação do PostgreSQL, roles com o atributo `BYPASSRLS` ignoram integralmente qualquer trava de Row Level Security, a menos que seja forçado via `FORCE ROW LEVEL SECURITY` (o que NÃO faremos).

### Matriz de Impacto por Módulo do Sistema:

| Módulo | Usa Prisma / Role `postgres`? | Impactado por RLS habilitado? | Comportamento após ativação |
|---|:---:|:---:|---|
| **Login / Autenticação** | SIM | ❌ **NENHUM IMPACTO** | Continua consultando e autenticando normalmente via `prisma.user.findUnique`. |
| **QR Dinâmico (Redirecionamento `/q/[shortCode]`)** | SIM | ❌ **NENHUM IMPACTO** | Continua lendo destino e gravando scans via `prisma.qRCode` e `prisma.qRCodeScan`. |
| **Analytics do Dashboard** | SIM | ❌ **NENHUM IMPACTO** | Continua lendo agregações e séries temporais via Prisma. |
| **Checkout Mercado Pago (Preference e Pix)** | SIM | ❌ **NENHUM IMPACTO** | Continua gerando preferências e lendo planos via Prisma. |
| **Webhook Mercado Pago (`/api/webhooks/mercadopago`)** | SIM | ❌ **NENHUM IMPACTO** | Continua gravando transações e ativando planos via `prisma.$transaction`. |
| **Painel Administrativo (`/admin`)** | SIM | ❌ **NENHUM IMPACTO** | Continua gerenciando usuários e planos via Prisma. |
| **PostgREST (Supabase Data API pública)** | NÃO (Usa `anon`/`authenticated`) | 🛡️ **ACESSO BLOQUEADO (DEFAULT DENY)** | PostgREST não consegue ler nem escrever nenhuma linha sem política permissiva. |

---

## 6. SQL EXATO RECOMENDADO (CORREÇÃO DEFENSIVA)

A correção recomendada consiste em:
1. **Habilitar RLS em todas as 15 tabelas do schema public** (eliminando o alerta do Supabase).
2. **NÃO criar policies para `anon` e `authenticated`** (garantindo Default Deny total na PostgREST).
3. **Revogar explicitamente privilégios diretos de `anon` e `authenticated`** nas tabelas do schema public por defesa em profundidade (*Defense in Depth*).

```sql
-- ============================================================================
-- SCRIPT DE SEGURANÇA: ATIVAÇÃO DE RLS E BLOQUEIO DE ACESSO PÚBLICO
-- QR MASTER / SUPABASE POSTGRESQL
-- ============================================================================

-- 1. Habilitar Row Level Security em todas as tabelas da aplicação
ALTER TABLE public."ActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GeneratedFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MultiLinkPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."QRCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."QRCodeScan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SystemSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- 2. Defesa em Profundidade: Revogar privilégios diretos concedidos às roles públicas da PostgREST
REVOKE ALL ON TABLE public."ActivityLog" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Campaign" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Category" FROM anon, authenticated;
REVOKE ALL ON TABLE public."GeneratedFile" FROM anon, authenticated;
REVOKE ALL ON TABLE public."MultiLinkPage" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Plan" FROM anon, authenticated;
REVOKE ALL ON TABLE public."QRCode" FROM anon, authenticated;
REVOKE ALL ON TABLE public."QRCodeScan" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Subscription" FROM anon, authenticated;
REVOKE ALL ON TABLE public."SystemSetting" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Template" FROM anon, authenticated;
REVOKE ALL ON TABLE public."User" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserSettings" FROM anon, authenticated;
REVOKE ALL ON TABLE public."WebhookEvent" FROM anon, authenticated;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM anon, authenticated;

-- 3. Prevenir que novas tabelas criadas no futuro herdem privilégios públicos automáticos
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
```

---

## 7. SQL DE ROLLBACK (CASO NECESSÁRIO)

Se por qualquer motivo hipotético for necessário reverter o estado exatamente ao que está hoje:

```sql
-- ============================================================================
-- SCRIPT DE ROLLBACK: DESATIVAÇÃO DE RLS E RESTAURAÇÃO DE PRIVILÉGIOS
-- ============================================================================

ALTER TABLE public."ActivityLog" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Campaign" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Category" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."GeneratedFile" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."MultiLinkPage" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Plan" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."QRCode" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."QRCodeScan" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Subscription" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."SystemSetting" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Template" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserSettings" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."WebhookEvent" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public."ActivityLog" TO anon, authenticated;
GRANT ALL ON TABLE public."Campaign" TO anon, authenticated;
GRANT ALL ON TABLE public."Category" TO anon, authenticated;
GRANT ALL ON TABLE public."GeneratedFile" TO anon, authenticated;
GRANT ALL ON TABLE public."MultiLinkPage" TO anon, authenticated;
GRANT ALL ON TABLE public."Plan" TO anon, authenticated;
GRANT ALL ON TABLE public."QRCode" TO anon, authenticated;
GRANT ALL ON TABLE public."QRCodeScan" TO anon, authenticated;
GRANT ALL ON TABLE public."Subscription" TO anon, authenticated;
GRANT ALL ON TABLE public."SystemSetting" TO anon, authenticated;
GRANT ALL ON TABLE public."Template" TO anon, authenticated;
GRANT ALL ON TABLE public."User" TO anon, authenticated;
GRANT ALL ON TABLE public."UserSettings" TO anon, authenticated;
GRANT ALL ON TABLE public."WebhookEvent" TO anon, authenticated;
GRANT ALL ON TABLE public."_prisma_migrations" TO anon, authenticated;
```

---

## 8. PROVA DE INVIOLABILIDADE DO PAGAMENTO HISTÓRICO #178856033673

O pagamento histórico foi consultado via Prisma antes e depois da execução desta auditoria técnica e permaneceu **100% inalterado**:

- **ID da Assinatura:** `cmu8hps850003e0kf40520blk`
- **Gateway ID:** `178856033673`
- **Status:** `ACTIVE`
- **Plano:** `PRO`
- **Usuário:** `itzjhonzin@gmail.com`
- **Período Vigente:** `2026-09-19T14:36:05.862Z` até `2026-10-19T14:36:05.862Z`
- **Alterações no Banco:** Zero.
