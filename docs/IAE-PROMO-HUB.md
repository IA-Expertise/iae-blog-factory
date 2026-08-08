# IAE Promo Hub — Documento técnico orientativo (novo app)

> **Escopo:** produto **desacoplado** do Blog Factory (`strong-sphere`), em **outra pasta/repositório**.  
> **Objetivo:** motor de **promoções / sorteios / vouchers** alimentado por tráfego do portal (ex.: Louveira News), com **agente WhatsApp** e captura de leads (Nome, E-mail, WhatsApp).  
> **Princípio:** o Blog Factory continua sendo CMS + Campo + site; o Promo Hub é o **cérebro comercial** da promoção. Os dois **conversam por API**.

**Nome sugerido do repo/serviço:** `iae-promo-hub` (ou `louveira-promo-hub` se for só Louveira no MVP).

**Relacionados:**
- Blog Factory: `strong-sphere` / `iae-blog-factory`
- Roteamento WhatsApp: `docs/IAE-WHATSAPP-HUB.md` (hub stateless Meta → apps)

---

## 0. Decisão de arquitetura (já validada)

| Peça | Onde mora |
|------|-----------|
| Matéria / publieditorial | **Blog Factory** |
| Formulário comentário + LGPD | **Blog Factory** (gancho) |
| Deeplink `wa.me` após comentário | **Blog Factory** (UI) |
| Campanhas, bilhetes, vouchers, sorteio | **Promo Hub** (este app) |
| Agente WhatsApp (parse, validar, responder) | **Promo Hub** |
| Webhook Meta (URL única) | **IAE WhatsApp Hub** → encaminha para Promo Hub |

**Não** embutir o motor de sorteio/WhatsApp dentro do Astro do Blog Factory.

---

## 1. Objetivo do sistema

Gerar:

1. **Tráfego recorrente** para o portal (QR no balcão + redes → matéria)
2. **Engajamento** (comentário no publieditorial)
3. **Leads validados** (nome, e-mail, WhatsApp)
4. **Bilhete da sorte** + **voucher imediato** via chat
5. **Sorteio** na data da campanha + notificação ao ganhador e ao anunciante

Um único número WhatsApp atende **N anunciantes/campanhas** (roteamento por parâmetro da campanha no texto do deeplink).

---

## 2. Jornada end-to-end

```
[ QR no balcão ]  OU  [ Bio / rede social ]
            │
            ▼
[ 1. Matéria no Blog Factory (hostname do tenant, ex. louveiranews.com.br) ]
     ├── Leitor lê o publieditorial
     └── Form: Nome + E-mail + Comentário + Aceite LGPD
            │
            ▼  POST comentário OK
[ 2. Blog Factory ]
     ├── (opcional) notifica Promo Hub: lead criado
     └── Exibe CTA "Resgatar bilhete" → wa.me com texto parametrizado
            │
            ▼
[ 3. WhatsApp do usuário → número IAE da promoção ]
            │
            ▼
[ 4. Meta Cloud API → IAE WhatsApp Hub ]
     └── Roteia por phone_number_id → Promo Hub /webhooks/whatsapp
            │
            ▼
[ 5. Promo Hub ]
     ├── Extrai campanha + e-mail da mensagem
     ├── Valida lead (API Blog Factory ou cópia local do webhook)
     ├── Gera ticket (1 por phone+campaign) + voucher
     └── Responde no Zap: bilhete + cupom
            │
            ▼
[ 6. Cron de sorteio ]
     ├── Sorteia ticket válido
     └── Notifica ganhador + anunciante (template Meta)
```

### Exemplo de deeplink

```
https://wa.me/55XXXXXXXXXXX?text=Quero%20meu%20bilhete%20CAMP%3Akaka-maio%20EMAIL%3Ajoao%40email.com
```

Convenção sugerida (parse estável):

```
Quero meu bilhete CAMP:{campaignSlug} EMAIL:{email}
```

Evitar espaços ambíguos; o agente também aceita variações com regex.

---

## 3. Diagrama de sistemas

```
                    ┌─────────────────────┐
                    │   Meta (WABA IAE)   │
                    └──────────┬──────────┘
                               │ webhook único
                               ▼
                    ┌─────────────────────┐
                    │  IAE WhatsApp Hub   │  (stateless)
                    │  phone_number_id →  │
                    │  URL do Promo Hub   │
                    └──────────┬──────────┘
                               │ POST + x-webhook-forward-secret
                               ▼
┌──────────────────┐    API    ┌─────────────────────┐
│  Blog Factory    │◄─────────►│    IAE Promo Hub    │
│  (Astro/Prisma)  │  server   │  (Node ou FastAPI)  │
│                  │  to server│                     │
│  - posts         │           │  - campaigns        │
│  - comments      │           │  - participants     │
│  - tenants       │           │  - tickets          │
│  - form + CTA    │           │  - draws / vouchers │
└────────┬─────────┘           │  - WhatsApp agent   │
         │                     └─────────────────────┘
         ▼
   Leitor / QR / Bio
```

---

## 4. O que o Promo Hub precisa do Blog Factory

### 4.1 Dados que o Promo Hub consome

| Dado | Uso |
|------|-----|
| `hostname` do tenant | Escopo multi-blog (MVP: Louveira; depois outros) |
| `postId` / `slug` | Vincular campanha à matéria |
| Comentário: `id`, `authorName`, `authorEmail`, `postId`, `consentGiven`, `createdAt` | Provar que o lead “passou pelo site” |
| URL pública do post | Montar QR / links de campanha |

### 4.2 API a expor no Blog Factory (fase 1)

Auth: header `Authorization: Bearer {BLOG_FACTORY_API_TOKEN}` (env só server-side).  
Escopo inicial: **somente leitura + evento de lead** (sem escrita de post).

#### `GET /api/promo/posts/{postId}`

Retorno resumido para o painel do Promo Hub:

```json
{
  "ok": true,
  "post": {
    "id": "clx...",
    "slug": "vereador-visita-altos-da-colina",
    "title": "...",
    "hostname": "louveiranews.com.br",
    "status": "PUBLISHED",
    "publicUrl": "https://louveiranews.com.br/t/louveiranews.com.br/post/..."
  }
}
```

#### `GET /api/promo/comments/lookup?postId=&email=`

Valida participação “site → Zap”:

```json
{
  "ok": true,
  "found": true,
  "comment": {
    "id": "clx...",
    "authorName": "João",
    "authorEmail": "joao@email.com",
    "consentGiven": true,
    "createdAt": "2026-08-08T12:00:00.000Z",
    "status": "PUBLISHED"
  }
}
```

Regras:
- E-mail normalizado (trim + lower)
- Só comentários com `consentGiven: true`
- Opcional: janela de tempo (ex.: comentário nas últimas 48h da campanha)

#### `POST /api/promo/leads` (webhook opcional, chamado pelo Factory após comentário)

Disparado pelo front/API de comentários **quando** o post estiver ligado a uma campanha ativa (flag ou lista no Promo Hub).

```json
{
  "hostname": "louveiranews.com.br",
  "postId": "clx...",
  "commentId": "clx...",
  "authorName": "João",
  "authorEmail": "joao@email.com",
  "consentGiven": true
}
```

O Promo Hub guarda o lead como `PENDING_WHATSAPP` até o usuário mandar mensagem no Zap.

### 4.3 Mudanças mínimas no Blog Factory (gancho)

1. Após `POST /api/comments/create` com sucesso **e** post em campanha:
   - Chamar webhook do Promo Hub (fire-and-forget)
   - Na UI do post: mostrar botão **Resgatar bilhete** com `wa.me` montado pelo Promo Hub (URL retornada no webhook response ou config da campanha)
2. Endpoints `/api/promo/*` protegidos por token (não públicos)
3. **Não** colocar tabelas de ticket/sorteio no Prisma do Factory

Config sugerida no Factory:

| Env | Uso |
|-----|-----|
| `PROMO_HUB_WEBHOOK_URL` | `https://promo-hub.../api/leads/ingest` |
| `PROMO_HUB_WEBHOOK_SECRET` | HMAC ou bearer compartilhado |
| `BLOG_FACTORY_API_TOKEN` | Token que o Promo Hub usa para lookup |

---

## 5. Modelo de dados (Promo Hub)

PostgreSQL próprio (Railway). Prisma ou SQLAlchemy — à escolha.

```
TenantRef          # espelho leve: hostname (louveiranews.com.br)
Campaign
  id, tenantHostname, slug (unique), title
  postId (Blog Factory), postSlug
  announcerName, announcerWhatsApp
  startAt, endAt, drawAt
  voucherText, whatsappNumberDisplay
  status: DRAFT | ACTIVE | CLOSED | DRAWN
  maxTicketsPerPhone: 1 (default)

Participant
  id, campaignId
  name, email (unique per campaign), phoneE164 (nullable até o Zap)
  commentId (Factory), source: QR | SOCIAL | DIRECT
  consentAt, createdAt
  status: LEAD | TICKETED | BLOCKED

Ticket
  id, campaignId, participantId
  ticketNumber (ex.: LN-2026-00482)
  voucherCode
  createdAt
  @@unique([campaignId, participantId])

Draw
  id, campaignId, winnerTicketId, drawnAt, notifiedAt
```

### Regras de negócio (MVP)

- Mesmo `phone` pode entrar em **várias** campanhas
- Na **mesma** campanha: no máximo **1** ticket por `phone` (e preferencialmente 1 por `email`)
- Ticket só após: lead com e-mail validado **e** mensagem WhatsApp com e-mail batendo
- Campanha fora de `ACTIVE` / fora da janela → mensagem educada, sem ticket

---

## 6. API do Promo Hub (superfície)

### Público / WhatsApp

| Método | Path | Função |
|--------|------|--------|
| `GET/POST` | `/webhooks/whatsapp` | Recebe forward do Hub (mesmo contrato Meta) |
| `GET` | `/health` | Railway |

### Interno (admin IAE + Factory)

| Método | Path | Função |
|--------|------|--------|
| `POST` | `/api/leads/ingest` | Webhook do Blog Factory |
| `POST` | `/api/tickets/generate` | Uso interno do agente (após validar) |
| `GET` | `/api/campaigns/:slug` | Config + texto do deeplink |
| `POST` | `/api/campaigns` | CRUD admin (MVP: seed/SQL se precisar) |
| `POST` | `/api/draws/:campaignId/run` | Sorteio (cron ou botão admin) |

### Contrato com o WhatsApp Hub

Igual aos outros apps (PostMais / Zazmax):

1. Hub responde `200` à Meta imediatamente
2. Forward async:

```http
POST https://{promo-hub}/webhooks/whatsapp
Content-Type: application/json
x-webhook-forward-secret: {WHATSAPP_FORWARD_SECRET}

{ body original Meta }
```

3. No Hub, nova rota env:

```text
WHATSAPP_ROUTES={"PHONE_NUMBER_ID_PROMO":"https://promo-hub.../webhooks/whatsapp"}
```

4. Promo Hub valida `x-webhook-forward-secret` (obrigatório em prod)

Documentação completa do hub: `docs/IAE-WHATSAPP-HUB.md` no repo Blog Factory / hub.

---

## 7. Agente WhatsApp (lógica)

### 7.1 Entrada

Mensagem de texto do usuário. Extrair:

- `campaignSlug` (token `CAMP:...`)
- `email` (token `EMAIL:...` ou regex de e-mail)

Se faltar dado → pedir em 1 pergunta objetiva (sem conversa longa no MVP).

### 7.2 Processamento

```
1. Normalizar phone E.164 do remetente
2. Parse CAMP + EMAIL
3. Buscar campaign ACTIVE
4. Lookup comentário no Blog Factory (GET comments/lookup)
   OU lead já ingerido via webhook com mesmo email+postId
5. Se inválido → "Não encontramos seu comentário com este e-mail neste post. Comente na matéria e tente de novo."
6. Se já tem ticket nesta campanha → reenviar bilhete + voucher (idempotente)
7. Senão → criar Participant (ligar phone) + Ticket + Voucher
8. Responder template/texto:
   - Número da sorte
   - Texto do voucher
   - Lembrete de data do sorteio
```

### 7.3 Saída

MVP: mensagem de texto livre via Cloud API (`messages` endpoint).  
Fase 2: templates aprovados Meta para notificação de ganhador.

### 7.4 Multi-anunciante

O **mesmo** `phone_number_id` / número de exibição.  
A campanha vem do parâmetro `CAMP:{slug}` — não do número.

---

## 8. Sorteio

- Job agendado (Railway cron → `POST /api/draws/:id/run` com secret) **ou** botão admin
- Critério MVP: sorteio uniforme entre tickets da campanha
- Persistir `Draw` (auditoria)
- Notificar:
  - Ganhador (WhatsApp)
  - Anunciante (`announcerWhatsApp`)
- Fechar campanha (`DRAWN`)

---

## 9. Stack sugerida (novo repo)

| Camada | Sugestão |
|--------|----------|
| Runtime | Node 22 + Fastify/Hono **ou** Python FastAPI |
| DB | PostgreSQL (Railway) + Prisma/SQLAlchemy |
| Host | Railway (serviço separado do Blog Factory) |
| WhatsApp | Meta Cloud API (token do número da promoção) |
| Admin MVP | Rotas HTTP + script CLI; UI simples depois |

Manter **stateless** no processo HTTP; estado só no Postgres.

---

## 10. Variáveis de ambiente (Promo Hub)

```bash
DATABASE_URL=
PORT=3000

# Meta / número da promoção
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_DISPLAY_NUMBER=55...

# Forward do Hub
WHATSAPP_FORWARD_SECRET=

# Blog Factory
BLOG_FACTORY_BASE_URL=https://louveiranews.com.br   # ou URL interna do app
BLOG_FACTORY_API_TOKEN=

# Segurança admin/cron
PROMO_ADMIN_TOKEN=
CRON_SECRET=

# Opcional
DEFAULT_TENANT_HOSTNAME=louveiranews.com.br
```

---

## 11. Segurança e LGPD

- Consentimento no **comentário do Factory** é a base legal da captura no site
- No Zap: informar uso do número para a promoção / contato do sorteio
- Token em todas as APIs server-to-server
- Não logar corpo completo de mensagens com PII em texto claro (mascarar e-mail/telefone)
- Rate limit no webhook WhatsApp e em `/api/leads/ingest`
- Idempotência: `(campaignId, phone)` e `(campaignId, email)`

---

## 12. Fases de implementação

### Fase 0 — Contrato (1–2 dias)

- [ ] Criar repo `iae-promo-hub`
- [ ] Definir slug de campanha + formato do deeplink
- [ ] Registrar `phone_number_id` da promoção no WhatsApp Hub
- [ ] Spec OpenAPI dos 3 endpoints Factory (`lookup`, `post`, `leads` webhook)

### Fase 1 — MVP Louveira (1 campanha piloto)

- [ ] Schema + API tickets
- [ ] Webhook WhatsApp + parse CAMP/EMAIL
- [ ] Lookup no Blog Factory
- [ ] Resposta bilhete + voucher
- [ ] Gancho no post: botão após comentário
- [ ] Cron/sorteio manual

### Fase 2 — Operação

- [ ] Admin de campanhas (CRUD)
- [ ] Várias campanhas ativas
- [ ] Templates Meta de notificação
- [ ] Painel do anunciante (opcional: só ver leads/tickets da campanha dele)

### Fase 3 — Multi-tenant Blog Factory

- [ ] Campanhas por `hostname` (outros blogs internos/clientes)
- [ ] Cotas / cobrança manual (fora do app, como o modo cliente)

---

## 13. Checklist de integração WhatsApp Hub

1. Criar/associar número WABA da promoção no app Meta **IAE Produtos**
2. Obter `PHONE_NUMBER_ID`
3. No Hub: adicionar rota `PHONE_NUMBER_ID → https://promo-hub.../webhooks/whatsapp`
4. Mesmo `WHATSAPP_FORWARD_SECRET` nos dois lados
5. Promo Hub: `GET` challenge **não** é obrigatório se o Hub já valida com a Meta — o Hub é a URL registrada; o Promo Hub só recebe **POST forward** (padrão PostMais)
6. Testar com mensagem real contendo `CAMP:` + `EMAIL:`

> Se o Hub só faz POST forward, o Promo Hub **não** precisa do GET verify da Meta. Confirmar no deploy do Hub.

---

## 14. O que NÃO fazer no MVP

- Embutir agente WhatsApp no `strong-sphere`
- Scraping genérico de comentários sem API
- Um número WhatsApp por anunciante
- App nativo / PWA extra (o site + Zap bastam)
- Gateway de pagamento (cobrança manual, como no modo cliente Campo)

---

## 15. Critério de sucesso do piloto

1. QR no balcão → matéria → comentário → Zap → bilhete + voucher em &lt; 2 minutos  
2. Segunda tentativa no mesmo Zap/campanha → reenvio, sem segundo ticket  
3. Outra campanha → novo ticket permitido  
4. Sorteio gera 1 vencedor e notifica  
5. Blog Factory sem aumento relevante de CPU/network (lógica pesada no Promo Hub)

---

## 16. Próximo passo prático

1. Copiar este arquivo para a **nova pasta** do app  
2. Implementar skeleton Railway + `/health` + `/webhooks/whatsapp` (echo/log)  
3. No Blog Factory: endpoints `/api/promo/comments/lookup` + token (PR pequeno)  
4. Ligar rota no WhatsApp Hub  
5. Campanha piloto (1 anunciante + 1 post)

---

*Documento gerado para orientação de implementação. Versão 1.0 — alinhado à decisão: Promo Hub desacoplado + Blog Factory como fonte de conteúdo/leads + WhatsApp Hub como roteador Meta.*
