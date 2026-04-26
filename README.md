# IAE Blog Factory (Strong Sphere)

Plataforma multi-tenant em Astro + Prisma para operar blogs por nicho com:
- home pública por tenant em `/t/{hostname}/`
- página de post pública em `/t/{hostname}/post/{slug}`
- painel admin para tenants, posts, afiliados e monetização

## Requisitos

- Node `>= 22.12.0`
- banco PostgreSQL acessível via `DATABASE_URL`

## Variáveis de ambiente mínimas

Use `.env.example` como base:

- `DATABASE_URL`
- `ADMIN_USER`
- `ADMIN_PASSWORD`

## Fluxo local

```bash
npm install
npm run build
npm start
```

`npm start` aplica `prisma db push` antes de subir o servidor, garantindo que o schema atual esteja refletido no banco.

## Fase 1 (dados + deploy)

Checklist curto para manter ambiente previsível:

1. Confirmar `DATABASE_URL` (Postgres) no ambiente.
2. Garantir build verde (`npm run build`).
3. Subir app (`npm start`) e validar login admin.
4. Smoke test de tenant: criar/editar tenant, criar post publicado, abrir `/t/{hostname}/`.
5. Em caso de erro, coletar logs de build/start sem expor segredos.

## Comandos úteis

- `npm run dev`: desenvolvimento local
- `npm run build`: build de produção
- `npm start`: aplica schema no banco e sobe servidor
- `npm run db:generate`: regenera Prisma Client
- `npm run db:migrate`: migrações para desenvolvimento

## Agendamento e publicação automática

- O endpoint de publicação programada é `GET /api/cron/publish?key=CRON_SECRET`.
- Configure um job recorrente (ex.: a cada 1 minuto) no provedor de deploy para chamar esse endpoint.
- Sem esse job, posts agendados ficam em `APPROVED` e não viram `PUBLISHED` automaticamente.

## Comentários (etapa 1: backend + moderação automática)

Esta etapa adiciona backend de comentários e painel admin de moderação, mantendo o front público desacoplado.

### Setup após pull/deploy

```bash
npx prisma db push
npx prisma generate
npm run build
```

### O que foi adicionado

- Modelo `Comment` no Prisma (`tenantId`, `postId`, `authorName`, `authorEmail`, `content`, `status`, `consentGiven`, `ipHash`, `userAgent`, flags).
- API pública: `POST /api/comments/create`.
- Admin: `/admin/comments` com filtros e ações (`Publicar`, `Ocultar`, `Excluir`).
- Link de comentários no menu do admin.

### Regras de moderação automática (MVP)

- `PUBLISHED` quando limpo.
- `AUTO_HIDDEN` quando suspeito (honeypot preenchido, blacklist, muitos links, rate limit por hash de IP).

### Exemplo de payload da API

```json
{
  "hostname": "historei.00",
  "slug": "babado-chocante-o-segredo-de-cleopatra-revelado",
  "authorName": "Leitor Exemplo",
  "authorEmail": "leitor@email.com",
  "content": "Comentário de teste com consentimento.",
  "consentGiven": true,
  "website": ""
}
```

### Teste rápido

1. Enviar comentário pela API.
2. Abrir `/admin/comments`.
3. Filtrar por tenant/status e validar fluxo de ação rápida.
