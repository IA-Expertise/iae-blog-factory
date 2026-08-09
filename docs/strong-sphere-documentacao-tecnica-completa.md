# Strong Sphere — Documentação Técnica Completa

**Produto:** IAE Blog Factory  
**Código / pacote:** `strong-sphere` (`package.json` name)  
**Versão documental:** snapshot da base atual em `master`  
**Commit de referência:** `13721d8` — *feat(tenants): estilo de capa IA (foto, aquarela ou flat)*  
**Data do documento:** 19 de julho de 2026  

Este arquivo descreve o estado **real** do repositório para consulta futura (arquitetura, dados, rotas, operações e decisões recentes). Documentos anteriores em `docs/` podem estar parcialmente desatualizados em relação a monetização interna e estilo de capa.

---

## 1. Visão geral

O Strong Sphere é uma plataforma **SaaS multi-tenant** para operar blogs por nicho (marca, tema, conteúdo, monetização e automação editorial) a partir de um único deploy.

Cada tenant é um blog identificado por `hostname` único (ex.: `circuitodasfrutas.com`, `historei.00`, `vinil.local`).

Capacidades principais:

- Site público por tenant (home, post, sobre, arquivo, contato)
- Painel admin centralizado (tenants, posts, gerador IA, monetização, comentários)
- Geração de pautas e artigos com OpenAI + capas ilustradas
- Estilo de capa por tenant (`photo` | `watercolor` / aquarela | `flat`)
- Agendamento e publicação automática via cron HTTP
- Monetização interna (anúncios próprios + placeholders) e afiliados Amazon
- Comentários com moderação automática e allowlist opcional por hostname
- Mídia em Object Storage S3-compatível (ex.: Cloudflare R2) com fallback local

---

## 2. Stack tecnológica

| Camada | Tecnologia | Notas |
|--------|------------|--------|
| Runtime | Node.js `>= 22.12.0` | Exigido em `engines` |
| Framework | Astro `^6` | `output: "server"` |
| Adapter | `@astrojs/node` standalone | Entrada: `dist/server/entry.mjs` |
| CSS | Tailwind CSS v4 + `@tailwindcss/typography` | Via plugin Vite |
| ORM / DB | Prisma 6 + PostgreSQL | `DATABASE_URL` |
| Markdown | `marked` | Corpo dos posts |
| Imagens | `sharp` | Redimensionamento de banners |
| Object storage | `@aws-sdk/client-s3` | R2/S3 |
| IA | OpenAI API | Texto + `/v1/images/generations` |

Config Astro relevante (`astro.config.mjs`):

- SSR com adapter Node standalone
- `security.checkOrigin: false` (necessário para forms/admin em alguns proxies)
- Tailwind via Vite plugin

---

## 3. Arquitetura lógica

```
┌─────────────────────────────────────────────────────────────┐
│  HTTP (Astro pages + API routes)                            │
│  /t/{hostname}/…   /admin/…   /api/…   / (host-based)       │
├─────────────────────────────────────────────────────────────┤
│  Middleware                                                 │
│  - HTTPS + www→apex em hosts públicos                       │
│  - Resolve tenant por Host fora de /admin, /t/, /api/       │
├─────────────────────────────────────────────────────────────┤
│  src/lib (domínio)                                          │
│  cms · contentGenerator · comments · objectStorage · ads…   │
├─────────────────────────────────────────────────────────────┤
│  Prisma Client → PostgreSQL                                 │
│  Object Storage (R2/S3) / disco local (fallback capas)      │
│  OpenAI (texto + imagem)                                    │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Pastas principais

| Caminho | Papel |
|---------|--------|
| `src/pages/` | Rotas HTTP (público, admin, APIs) |
| `src/lib/` | Regras de negócio e integrações |
| `src/components/` | UI reutilizável (ads, header, afiliados) |
| `src/layouts/` | Layouts público e admin |
| `prisma/` | Schema + migrations |
| `scripts/` | Baseline DB, checks, ensure schema ads |
| `docs/` | Documentação de produto/técnica |
| `public/` | Estáticos (`robots.txt`, `ads.txt`, favicon) |

### 3.2 Resolução de tenant

Há **dois modos** de servir o blog:

1. **Path multi-tenant (principal no admin/preview):**  
   `/t/{hostname}/`, `/t/{hostname}/post/{slug}`, etc.
2. **Host-based (domínio apontando para o app):**  
   Middleware carrega `siteData` pelo `Host` da request (após normalizar `www` → apex). Rotas `/admin`, `/t/` e `/api/` **não** usam Host como chave de tenant.

Hostnames reservados (não podem ser tenant): `www`, `admin`, `api`, `app`, `static`, `cdn`, `localhost`.

Criação de tenant em produção: TLDs aceitos **`.com`** e **`.com.br`**. Em desenvolvimento: nomes genéricos / `*.local`.

---

## 4. Modelo de dados (Prisma)

Datasource: PostgreSQL via `DATABASE_URL`.

### 4.1 Entidades

#### `Tenant`
Configuração completa do blog:

- Identidade: `hostname` (unique), `brandName`, `niche`
- Hero: título, subtítulo, CTA, imagem
- Tema: cores + fontes; `themePreset` (`classic`, `urban`, `regional`, `premium`, `education`, …)
- **`coverImageStyle`**: `photo` (default) | `watercolor` | `flat`
- Logo / arte da testeira (`logoUrl`, `headerArtUrl`)
- RSS: `rssFeedUrl`, `showRssHomePromo`
- Editorial: `projectDescription`, `editorialStyleNotes`, `targetAudience`, `defaultArticleTone`
- Autopublicação: `autoPublishWeekdays`, `autoPublishHourUtc`
- Social / contato
- Monetização legado AdSense (campos `ad*`) + Amazon (`amazonEnabled`, `affiliate*`)
- Topo interno: `topoAdMode` (`rotate_all` | `exclusive`), `topoExclusiveAdId`

Relações: `posts`, `comments`, `affiliateProducts`, `generationJobs`, `articlePitches`, `ads`, `adPlaceholders`.

#### `Post`
- `title`, `slug`, `category`, `image`, `excerpt`, `content`
- `status`: fluxo editorial (`DRAFT` → `IN_REVIEW` → `APPROVED` → `PUBLISHED`)
- `scheduledPublishAt`, `publishedAt`

#### `ArticlePitch`
Pautas mensais por tenant (`monthKey`), status `SUGGESTED` | `APPROVED` | `REJECTED` | `WRITTEN`, vínculo opcional `postId`.

#### `Comment`
Comentários multi-tenant com status, consentimento, `ipHash`, flags de moderação.

#### `AffiliateProduct`
Produtos de afiliação por tenant.

#### `GenerationJob`
Histórico simples de gerações (keyword, tone, status, resultados).

#### `Ad` (tabela mapeada `Ads`)
Anúncios internos pagos: `tenantHostname`, `posicao` (`topo` | `corpo` | `lateral`), imagem, CTA, vigência, `cliques`, `impressoes`.

#### `AdPlaceholder` (tabela `AdPlaceholders`)
Fallbacks quando não há anúncio pago no slot (título, imagem, CTA opcional, `sortOrder`).

### 4.2 Migrations relevantes (ordem cronológica)

| Migration | Tema |
|-----------|------|
| `20260421182808_init` | Base |
| `20260205193000_post_editorial_workflow` | Workflow de posts |
| `20260205203000_generator_pitches` | Pitches / gerador |
| `20260206110000_tenant_simplified_config` | Config tenant |
| `20260509120000_add_internal_ads` | Ads internos |
| `20260510140000_ad_placeholders` | Placeholders |
| `20260511120000_tenant_show_rss_home_promo` | Toggle promo RSS na home |
| `20260716150000_tenant_topo_ad_mode` | Modo topo rotativo/exclusivo |
| `20260716180000_tenant_cover_image_style` | Estilo de capa IA |

Produção: preferir `prisma migrate deploy` (via `npm run start:prod` ou `db:migrate:deploy`). Script auxiliar `scripts/ensure-internal-ads-schema.mjs` reforça schema de ads no boot.

---

## 5. Rotas públicas

| Rota | Descrição |
|------|-----------|
| `/t/[hostname]/` | Home do tenant |
| `/t/[hostname]/post/[slug]` | Post publicado |
| `/t/[hostname]/sobre` | Sobre |
| `/t/[hostname]/arquivo` | Arquivo |
| `/t/[hostname]/contato` | Contato |
| `/post/[slug]` | Post via host do domínio (middleware) |
| `/` | Home host-based |
| `/sitemap.xml` | Sitemap |

Comportamentos:

- Canonicalização de hostname/slug com redirect quando necessário
- Tema e identidade por tenant
- Home: grid de posts + slots de anúncio (topo / corpos / laterais)
- Post: Markdown → HTML; inserção de banner no meio do conteúdo (`splitHtmlForMidAd`)
- OG / compartilhamento: ver também `docs/guia-compartilhamento-social-og-whatsapp.md`
- Meta opcionais: `PUBLIC_GA4_ID`, `PUBLIC_FACEBOOK_APP_ID`, `PUBLIC_SITE_AUTHOR`, `PUBLIC_SITE_ORIGIN`

---

## 6. Painel administrativo

Autenticação: cookie de sessão (`src/lib/adminAuth.ts`) com `ADMIN_USER` / `ADMIN_PASSWORD`.

| Rota | Função |
|------|--------|
| `/admin/login` | Login |
| `/admin/logout` | Logout |
| `/admin` | Visão geral |
| `/admin/tenants` | CRUD / settings de tenants (tema, capa IA, RSS, editorial, etc.) |
| `/admin/posts` | Lista e ações de posts |
| `/admin/post/[id]` | Edição, status, agendamento, regenerar capa (+ dica opcional) |
| `/admin/preview/[id]` | Preview |
| `/admin/generator` | Pautas mensais + escrita a partir de pitches aprovados |
| `/admin/monetization` | Ads internos, placeholders, modo do topo, Amazon |
| `/admin/affiliates` | Produtos afiliados |
| `/admin/comments` | Moderação |

Nav do admin: Visão geral · Tenants · Posts · Comentários · Gerador IA · Monetização.

---

## 7. Conteúdo e IA

Núcleo: `src/lib/contentGenerator.ts` + orquestração em `src/lib/cms.ts`.

### 7.1 Fluxos

1. **Pautas mensais** (`generateMonthlyPitches`) — a partir do briefing do tenant.
2. **Pautas a partir de RSS** (`generateMonthlyPitchesFromRss`) — JSON Feed / XML / Atom / CSV (feeds sem corpo usam `summary`).
3. **Artigo a partir de pitch** (`generateArticleFromPitch`) — texto SEO em PT-BR + capa.
4. **Artigo por keyword** (`generateArticleAndImage`) — fluxo legado/direto.
5. **Regenerar capa** (`regenerateCoverImage`) — usa estilo do tenant + dica opcional do editor.

### 7.2 Estilo de capa (`coverImageStyle`)

Campo no `Tenant` (default `photo`). Normalização aceita aliases:

| Valor canônico | Aliases aceitos | Efeito no prompt |
|----------------|-----------------|------------------|
| `photo` | (default) | Semi/fotorrealismo editorial |
| `watercolor` | `aquarela` | Aquarela digital, textura de papel, sem foto |
| `flat` | `vector`, `ilustracao` | Flat/vetorial, cores chapadas |

UI admin: **Estilo das capas (IA)** no formulário do tenant.  
Exemplo de uso: tenant **Circuito das Frutas** (`circuitodasfrutas.com`) → selecionar **Aquarela**.

No prompt de imagem também entram: marca, nicho, título (só inspiração visual), tom, `themePreset`, notas editoriais e `imageDirection` (regeneração pontual).

Modelo de imagem: `OPENAI_IMAGE_MODEL` (default `gpt-image-1`).

### 7.3 Persistência de capas

1. Se Object Storage configurado → upload S3/R2 e URL pública.
2. Senão → disco local + exposição via `/api/media/generated/[name]`.
3. Proxy de mídia: `/api/media/proxy` (útil para Content-Type inconsistente no R2).
4. Capa por post: `/api/media/post-cover/[hostname]/[slug]`.

---

## 8. Workflow editorial e publicação

### 8.1 Status de post

`DRAFT` → `IN_REVIEW` → `APPROVED` → `PUBLISHED`

- `APPROVED` + `scheduledPublishAt` no passado → elegível ao cron
- Publicação imediata: `publishPostNow`

### 8.2 Programação semanal

Tenant: `autoPublishWeekdays` + `autoPublishHourUtc`.  
Ao gerar posts a partir de pitches aprovados, `publishSlots` distribui `scheduledPublishAt` nos próximos slots UTC.

### 8.3 Cron de publicação

- **Endpoint:** `GET /api/cron/publish`
- **Auth:** `CRON_SECRET` via:
  - header `X-Cron-Secret` (preferido), ou
  - `Authorization: Bearer …`, ou
  - query `?key=…` (decode cuidadoso; `+` não vira espaço)
- Comparação timing-safe
- Resposta: `{ ok: true, published: N }`
- Segredo lido em **runtime** (`process.env`) para Railway

Sem job externo recorrente, posts agendados **não** publicam sozinhos.

---

## 9. Monetização

### 9.1 Inventário interno (produção atual do site público)

- Modelos `Ad` e `AdPlaceholder`
- Posições: `topo`, `corpo`, `lateral`
- Home: múltiplos corpos e laterais; evita repetir o mesmo anúncio pago no mesmo pageview; rotação por visita
- Topo: `rotate_all` (sorteia entre ads topo ativos) ou `exclusive` (um `topoExclusiveAdId`)
- Clique: `GET /api/ads/click` (incrementa cliques e redireciona)
- Impressões registradas ao sortear ad pago
- Placeholders preenchem slots sem anúncio ativo

Helpers de layout: `src/lib/adLayout.ts` (`HOME_GRID_POST_LIMIT = 9`, `splitHtmlForMidAd`).

### 9.2 Amazon / afiliados

- Flag `amazonEnabled` + `affiliateTrackingId`
- Produtos em `AffiliateProduct`
- Componentes: `AffiliateWidget.astro`, `AmazonAffiliate.astro`

### 9.3 AdSense (legado / opcional)

Campos ainda no tenant e em `.env` (`PUBLIC_ADSENSE_CLIENT`). O desenho do site público prioriza monetização interna + placeholders; AdSense permanece como capacidade/config legado.

---

## 10. Comentários

- API: `POST /api/comments/create`
- Admin: `/admin/comments` (filtrar, publicar, ocultar, excluir)
- Moderação automática: honeypot, blacklist, muitos links, rate limit por `ipHash` → `AUTO_HIDDEN` ou `PUBLISHED`
- Allowlist opcional: `COMMENTS_ENABLED_HOSTS` (CSV; lida em **runtime**; alinhar apex e `www`)

---

## 11. APIs internas (resumo)

| Método | Rota | Função |
|--------|------|--------|
| POST | `/api/comments/create` | Criar comentário público |
| GET | `/api/cron/publish` | Publicar posts agendados |
| GET | `/api/ads/click` | Tracking de clique + redirect |
| GET | `/api/media/proxy` | Proxy de imagem remota |
| GET | `/api/media/generated/[name]` | Servir capa local |
| GET | `/api/media/post-cover/[hostname]/[slug]` | Capa do post |

---

## 12. Variáveis de ambiente

Base: `.env.example`.

### Obrigatórias / críticas

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | PostgreSQL |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Login admin |
| `OPENAI_API_KEY` | Geração de texto/imagem |
| `CRON_SECRET` | Auth do cron (recomendado em produção) |

### Opcionais de produto

| Variável | Uso |
|----------|-----|
| `OPENAI_IMAGE_MODEL` | Default `gpt-image-1` |
| `COMMENTS_ENABLED_HOSTS` | Allowlist de comentários |
| `PUBLIC_SITE_ORIGIN` | Canonical/OG sem localhost |
| `PUBLIC_ADSENSE_CLIENT` | Fallback AdSense |
| `PUBLIC_GA4_ID` | Analytics |
| `PUBLIC_FACEBOOK_APP_ID` | OG Meta |
| `PUBLIC_SITE_AUTHOR` | Autor padrão SEO |

### Object storage (R2/S3)

| Variável | Uso |
|----------|-----|
| `S3_BUCKET` | Bucket |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credenciais |
| `S3_PUBLIC_BASE_URL` | URL pública das imagens |
| `S3_ENDPOINT` | Ex.: endpoint R2 |
| `S3_REGION` | Default `auto` |
| `S3_KEY_PREFIX` | Default `covers` |

Sem S3 configurado: capas em disco + API local.

---

## 13. Scripts e operação

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento |
| `npm run build` | Build Astro |
| `npm start` | Sobe `dist/server/entry.mjs` |
| `npm run start:prod` | `prisma generate` + `migrate deploy` + ensure ads + start |
| `npm run db:migrate` | Migrate em desenvolvimento |
| `npm run db:migrate:deploy` | Deploy de migrations |
| `npm run db:generate` | Gera Prisma Client |
| `npm run db:push` | Push de schema (cuidado em prod) |
| `npm run db:check` | Check auxiliar |
| `npm run db:baseline` | Baseline DB |

Deploy típico (ex. Railway): build + `start:prod`; configurar job HTTP para `/api/cron/publish` a cada ~1 min; aplicar migrations (incl. `coverImageStyle`).

---

## 14. Middleware e hosts públicos

Arquivo: `src/middleware.ts` + `src/lib/publicHostRedirects.ts`.

- Em domínio registrável: força HTTPS e remove `www` (301)
- Fora de `/admin`, `/t/`, `/api/`: injeta `locals.siteData` pelo hostname da request
- Evita exigir tenant por Host em APIs (compatível com Railway sem domínio custom no serviço)

---

## 15. Mapa de módulos `src/lib`

| Módulo | Responsabilidade |
|--------|------------------|
| `cms.ts` | CRUD tenants/posts, pitches, ads, publicação, agregações |
| `contentGenerator.ts` | OpenAI texto/imagem, RSS→pautas, estilos de capa |
| `comments.ts` | Criação, listagem, allowlist, moderação |
| `objectStorage.ts` | Upload/delete S3/R2 |
| `adminAuth.ts` | Sessão admin |
| `db.ts` | Prisma client |
| `publishSlots.ts` | Slots semanais UTC |
| `adLayout.ts` | Grid home + split HTML para mid-ad |
| `renderMarkdown.ts` | Markdown → HTML |
| `mediaUrl.ts` / `bannerImage.ts` / `bannerResize.ts` | URLs e processamento de banners |
| `tenantUrls.ts` | Paths canônicos `/t/...` |
| `publicOrigin.ts` | Origem pública para links absolutos |
| `publicHostRedirects.ts` | HTTPS / www |

---

## 16. Estado atual vs. backlog

### Entregue recentemente (referência de commits)

- Estilo de capa IA (foto / aquarela / flat) — `13721d8`
- Hostname `.com` além de `.com.br` — `8d807ac`
- Modo do topo exclusivo ou rotativo — `6882bab`
- Layout de ads na home (corpos/laterais, sem repetir pago) — `7f1de3f` / `c20837d`
- Redirect HTTP→HTTPS e www→apex — `e108905`
- RSS multi-formato + pautas mais ricas — `c90db8b`
- Dica opcional ao regenerar capa — `c937618`
- Cron com header e runtime secret — `8afd5db` / `5e9118d`
- Toggle promo RSS na home — `7e10f23`
- Comentários: allowlist runtime + www/apex — `4a48b38`

### Backlog conhecido (`ROADMAP.md`)

- Links internos automáticos na geração por IA (2–4 links para posts do tenant)
- Afiliados Shopee (API oficial)
- Sanitização HTML mais rígida se conteúdo menos confiável
- Atalhos de mídia inline no CMS
- Alertas se o cron falhar
- Guia editorial SEO no admin
- (docs antigos) newsletter / observabilidade / relatórios por tenant

---

## 17. Smoke tests recomendados

1. Login em `/admin/login`
2. Criar/editar tenant (hostname `.com` / `.com.br` ou `*.local`)
3. Definir **Estilo das capas (IA)** = Aquarela e salvar
4. Gerar pautas → aprovar → escrever artigos
5. Agendar post + chamar `/api/cron/publish` com secret
6. Abrir `/t/{hostname}/` e um post publicado
7. Validar slots de ads/placeholders e clique
8. Enviar comentário (se hostname na allowlist) e moderar
9. Regenerar capa com dica opcional e conferir URL (R2 ou API local)

---

## 18. Documentos relacionados neste repo

| Arquivo | Conteúdo |
|---------|----------|
| `README.md` | Setup rápido e comentários |
| `ROADMAP.md` | Próximos itens e entregues |
| `docs/saas-documentacao-tecnica-etapa-atual.md` | Doc técnica anterior (parcialmente desatualizada) |
| `docs/saas-documentacao-executiva-etapa-atual.md` | Visão executiva |
| `docs/guia-compartilhamento-social-og-whatsapp.md` | OG / WhatsApp |
| `docs/blog-factory-lite-mvp-orientacao.md` | Orientação para eventual fork Lite |
| **`docs/strong-sphere-documentacao-tecnica-completa.md`** | **Este documento (fonte atual recomendada)** |

---

## 19. Notas finais para quem retomar

- A versão ativa do app é o repositório **strong-sphere** (IAE Blog Factory).
- Para o Circuito das Frutas: após deploy + migration `coverImageStyle`, no admin do tenant escolher **Aquarela**.
- Publicação automática depende do **cron externo**; não confundir com “Cron Schedule” do provedor que reinicia o serviço.
- Digitar URLs no briefing da IA **não** faz o sistema crawlear sites — só o campo **RSS** puxa conteúdo externo para pautas.

---

*Documento gerado para consulta futura. Atualizar este arquivo quando houver mudanças estruturais (schema, rotas, monetização ou pipeline de IA).*
