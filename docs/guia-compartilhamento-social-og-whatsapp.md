# Guia de Configuracao - Compartilhamento Social (OG) com foco em WhatsApp

## Objetivo

Padronizar uma configuracao confiavel de preview social para posts, com prioridade em estabilidade no WhatsApp (mobile e web), sem quebrar Facebook, LinkedIn e X.

Este guia documenta a estrategia que funcionou no projeto `strong-sphere`.

## Resultado validado

- Preview com imagem funcionando no WhatsApp mobile e WhatsApp Web.
- URL de compartilhamento mantendo card com titulo, descricao e imagem.
- Reducao de intermitencia de scrape via endpoint interno de imagem OG.

## Arquitetura adotada

## 1) `og:image` apontando para endpoint interno

Em vez de usar diretamente URL externa (R2, CDN, picsum etc.), o `og:image` do post aponta para:

- `/api/media/post-cover/{hostname}/{slug}`

Vantagens:

- mesmo dominio do post (melhor para scrapers);
- controle total de timeout, fallback e cache;
- possibilidade de normalizar imagem para formato social.

Arquivo:

- `src/pages/t/[hostname]/post/[slug].astro`

## 2) Endpoint OG resiliente

No endpoint de capa social:

- tenta buscar imagem principal do post;
- se falhar, usa fallback da imagem hero do tenant;
- define timeout e headers amigaveis para crawler social.

Arquivo:

- `src/pages/api/media/post-cover/[hostname]/[slug].ts`

## 3) Normalizacao da imagem para padrao social

No endpoint de `post-cover`, a imagem e processada com `sharp`:

- dimensao alvo: `1200x630` (1.91:1);
- compressao progressiva em JPEG;
- alvo de tamanho: ate ~`300KB` (faixa estavel para WhatsApp).

Dependencia:

- `sharp` em `package.json`.

## 4) Metatags OG no layout

No layout principal, manter:

- `og:image`
- `og:image:secure_url`
- `og:image:type` (`image/jpeg`)
- `og:image:width` (`1200`)
- `og:image:height` (`630`)
- `og:title`, `og:description`, `og:url`

Arquivo:

- `src/layouts/Layout.astro`

## 5) URL limpa no botao WhatsApp

Compartilhar somente a URL canonica no parametro `text`, sem concatenar titulo.

Exemplo:

- `https://api.whatsapp.com/send?text=<url-encode-da-url>`

Arquivo:

- `src/pages/t/[hostname]/post/[slug].astro`

## Checklist rapido para novos projetos

1. `og:image` aponta para endpoint interno no mesmo dominio.
2. Endpoint OG tem timeout, fallback e cache curto.
3. Imagem OG sai em `1200x630` e peso preferencial <= `300KB`.
4. `og:image:type`, `width` e `height` presentes no `<head>`.
5. `og:url` absoluto e coerente com o link compartilhado.
6. Botao de WhatsApp envia apenas URL.
7. Testar em:
   - WhatsApp mobile
   - WhatsApp Web
   - Meta Sharing Debugger (quando aplicavel)
   - LinkedIn Post Inspector (quando aplicavel)

## Observacoes operacionais

- Cache de scrapers pode atrasar refletir mudancas.
- Para reteste rapido, usar parametro de versao na URL (ex.: `?v=2`).
- Se houver regressao, conferir primeiro:
  - status HTTP da URL compartilhada;
  - status HTTP da URL de `og:image`;
  - `Content-Type` de imagem;
  - tamanho final em bytes.

## Referencia de implementacao neste projeto

- `src/pages/t/[hostname]/post/[slug].astro`
- `src/pages/api/media/post-cover/[hostname]/[slug].ts`
- `src/layouts/Layout.astro`
- `package.json` (dependencia `sharp`)

