# Roadmap — IAE Blog Factory (strong-sphere)

Itens priorizados e ideias já discutidas. Atualizar conforme forem entregues.

## Em curso / próximo

- [ ] **Links internos na geração por IA** — ao gerar artigo a partir da pauta, enviar ao modelo uma lista de posts já publicados do tenant (título + slug), com paths canônicos `/t/{hostname}/post/{slug}`, e instruir 2–4 links Markdown relevantes (sem keyword stuffing).

- [ ] **Afiliados Shopee (API)** — após aprovação no programa: integrar API oficial, deep links / tracking, regras de cache e limites de taxa; alinhar com o fluxo de monetização já existente (anúncios internos, placeholders, etc.).

## Ideias (backlog)

- [ ] **Sanitização do HTML no corpo do post** — se no futuro houver conteúdo de origem menos confiável, avaliar DOMPurify (ou equivalente) no servidor para `iframe`/HTML cru; hoje o Markdown aceita HTML e é adequado só para editores confiáveis.

- [ ] **Atalhos no CMS para mídia inline** — dica de URL direta (Imgur `i.imgur.com`), upload ou galeria, sem mudar o renderizador.

- [ ] **Alertas do job de publicação** — notificação (e-mail/Slack) se o cron externo falhar várias vezes ou se `published` ficar anormalmente alto/baixo (opcional).

- [ ] **Guia editorial SEO no admin** — lembrete curto sobre links internos, âncoras naturais e 1–2 links externos de autoridade quando fizer sentido.

## Já entregue / esclarecido (referência)

- **Dica curta ao regenerar capa** — campo opcional no admin do post; entra no prompt da API de imagem só nessa regeneração.
- Agendamento de posts + **cron HTTP** (`/api/cron/publish`) com auth (`CRON_SECRET` / header `X-Cron-Secret`).
- **RSS** na URL do tenant para pauta + opção **ocultar bloco “Feed RSS”** na home (`showRssHomePromo`).
- **Comentários** multi-tenant (`COMMENTS_ENABLED_HOSTS` runtime + variantes `www`/apex).
- **Monetização interna** (ads, placeholders, proxy/mídia conforme evolução do projeto).
- Markdown com **imagens** (incl. Imgur link direto) e **capa** substituível por URL manual.
- **Programação semanal** no tenant: distribui `scheduledPublishAt` ao gerar a partir de pitches aprovados; publicação efetiva continua dependendo do mesmo cron.
