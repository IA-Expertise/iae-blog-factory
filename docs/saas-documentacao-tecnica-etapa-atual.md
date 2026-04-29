# Blog Factory SaaS - Documentacao Tecnica (Etapa Atual)

## 1) Visao geral

O `strong-sphere` e uma plataforma SaaS multi-tenant para operacao de blogs por nicho, com:

- front publico por tenant;
- painel administrativo centralizado;
- geracao e orquestracao de conteudo;
- monetizacao hibrida (AdSense + afiliacao Amazon);
- pipeline de midia com Object Storage (Cloudflare R2/S3 compativel).

Stack principal:

- `Astro` (SSR com `@astrojs/node`);
- `Prisma` + `PostgreSQL`;
- `TailwindCSS`;
- `AWS SDK S3` para upload de assets em bucket compativel;
- integracao OpenAI para geracao de artigos e capas.

## 2) Arquitetura logica

### 2.1 Camadas

- `src/pages`: camada de entrega HTTP (paginas publicas, admin e APIs).
- `src/lib`: regras de negocio, servicos, normalizacao, auth admin e persistencia.
- `prisma/schema.prisma`: modelo de dados multi-tenant e relacoes.
- `src/components`: blocos reutilizaveis (ads, afiliados, header, etc.).

### 2.2 Modelo multi-tenant

O tenant e identificado por `hostname` unico em `Tenant`, e toda operacao de post/comentario/afiliado e escopada por tenant.

Padrao de URL publica:

- Home: `/t/{hostname}/`
- Post: `/t/{hostname}/post/{slug}`
- Sobre/Arquivo/Contato por tenant.

## 3) Recursos implementados

## 3.1 Painel admin

Paginas existentes:

- `/admin/login`
- `/admin` (visao geral)
- `/admin/tenants`
- `/admin/posts`
- `/admin/post/[id]`
- `/admin/preview/[id]`
- `/admin/generator`
- `/admin/monetization`
- `/admin/affiliates`
- `/admin/comments`

Capacidades:

- autenticacao administrativa;
- cadastro e edicao de tenants;
- criacao/edicao/publicacao/agendamento de posts;
- configuracao editorial (tom, publico, briefing, janelas de autopublicacao);
- configuracao de monetizacao por tenant;
- moderacao de comentarios.

## 3.2 Front publico do tenant

Paginas publicas:

- `/t/[hostname]/index`
- `/t/[hostname]/post/[slug]`
- `/t/[hostname]/sobre`
- `/t/[hostname]/arquivo`
- `/t/[hostname]/contato`

Comportamentos relevantes:

- canonicalizacao de hostname/slug com redirect quando necessario;
- renderizacao de temas/identidade por tenant;
- blocos de monetizacao em topo, sidebar, in-content e rodape;
- widget de afiliados quando habilitado.

## 3.3 Monetizacao

Estado atual:

- AdSense por tenant com campos separados para `top`, `sidebar`, `in-content` e `footer`;
- validacao de formato do publisher ID (`ca-pub-...`) e slots numericos;
- fallback de `adClient` para variavel publica quando o valor persistido e invalido;
- afiliacao Amazon com `trackingId` e lista de produtos por tenant;
- renderizacao condicional por flags de habilitacao.

Observacao:

- o desenho atual ja permite evolucao para inventario direto (banner proprio/terceiros) sem ruptura arquitetural, usando a mesma area de configuracao de monetizacao.

## 3.4 Conteudo e automacao editorial

Recursos existentes:

- geracao de pautas mensais (pitches) por tenant;
- workflow de pitch (`SUGGESTED`, `APPROVED`, `REJECTED`, `WRITTEN`);
- geracao de artigo completo e capa;
- criacao de posts a partir de pautas aprovadas;
- agendamento de publicacao por slots/semana/hora UTC;
- endpoint de cron para publicar automaticamente posts `APPROVED`.

Endpoint operacional:

- `GET /api/cron/publish?key=CRON_SECRET`

## 3.5 Comentarios (backend + moderacao)

Recursos:

- API publica para criacao de comentario;
- regras de moderacao automatica (spam/rate-limit/honeypot);
- statuses de moderacao com visibilidade no admin;
- acoes administrativas de publicar/ocultar/excluir.

Endpoint:

- `POST /api/comments/create`

## 3.6 Midia e armazenamento de imagens

Modelo atual:

- imagens de capa geradas e assets publicos sao enviados para Object Storage S3-compativel;
- o projeto esta preparado para Cloudflare R2 via endpoint/credenciais S3;
- banco PostgreSQL guarda metadados e URLs, nao binarios.

Variaveis de ambiente relevantes:

- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BASE_URL`
- opcionais: `S3_ENDPOINT`, `S3_REGION`, `S3_KEY_PREFIX`

Fallback:

- se upload remoto falhar/nao estiver configurado, ha fallback para armazenamento local e exposicao via API de midia.

## 4) Modelo de dados (Prisma)

Entidades principais:

- `Tenant`: configuracao completa do blog e monetizacao.
- `Post`: conteudo, status editorial e agendamento.
- `ArticlePitch`: planejamento de pautas e vinculo opcional com post.
- `AffiliateProduct`: produtos de afiliacao por tenant.
- `Comment`: comentarios e metadados de moderacao.
- `GenerationJob`: historico de geracao de conteudo.

Caracteristicas de consistencia:

- relacoes com `onDelete: Cascade`;
- indices para consultas por tenant/status/data;
- unicidade de `hostname` e de `postId` em `ArticlePitch` (quando vinculado).

## 5) APIs e integracoes

APIs internas:

- `/api/comments/create`
- `/api/cron/publish`
- `/api/media/proxy`
- `/api/media/generated/[name]`
- `/api/media/post-cover/[hostname]/[slug]`

Integracoes externas:

- OpenAI (texto + imagem);
- Google AdSense;
- Cloudflare R2 (via compatibilidade S3);
- links de afiliacao Amazon.

## 6) Seguranca e operacao

Praticas aplicadas:

- autenticacao de admin no painel;
- segregacao por tenant em consultas e escrita;
- validacao de hostnames/slugs para reduzir inconsistencias de rota;
- validacoes basicas de monetizacao (publisher/slot) antes de renderizacao real;
- moderacao automatica para reduzir spam em comentarios.

Pontos operacionais criticos:

- manter `DATABASE_URL` estavel e monitorar schema com Prisma;
- garantir execucao recorrente do cron de publicacao;
- acompanhar politicas AdSense em ambientes publicos;
- manter segredo das chaves S3/OpenAI apenas em ambiente servidor.

## 7) Estado de maturidade da etapa

Entrega atual: base SaaS funcional fim-a-fim para operacao multi-tenant com conteudo, monetizacao, midia e moderacao.

Pronto para:

- onboarding de novos tenants;
- operacao editorial com apoio de IA;
- publicacao automatica por agenda;
- monetizacao AdSense + afiliacao;
- evolucao incremental para inventario direto de anuncios.

## 8) Backlog recomendado (proxima etapa)

1. Inventario de anuncios diretos por posicao (inicialmente sidebar), com upload em R2 e fallback para AdSense.
2. Regras de prioridade/rotacao de anuncios para controle de receita.
3. Observabilidade de jobs (cron, geracao, upload).
4. Hardening de validacoes de URL e politica de links patrocinados.
5. Relatorios simples por tenant (publicacao, comentarios, monetizacao configurada).

---

Documento criado para arquivamento da etapa atual do Blog Factory SaaS.
