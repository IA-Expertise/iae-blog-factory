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
