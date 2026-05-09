/**
 * Reparo automático: quando `_prisma_migrations` marca a migration de Ads como aplicada,
 * mas a tabela `Ads` não existe (ex.: baseline incorreto), o `migrate deploy` não recria nada.
 * Este script idempotente garante enum + tabela + índices + FK alinhados ao schema Prisma.
 *
 * Se `Ads` já existir, sai imediatamente (custo mínimo em todo deploy).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function hasAdsTable() {
  const rows = await prisma.$queryRaw`
    SELECT 1 AS x
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Ads'
    LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}

async function hasAdPosicaoEnum() {
  const rows = await prisma.$queryRaw`
    SELECT 1 AS x
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'AdPosicao'
    LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  if (await hasAdsTable()) {
    console.log('[ensure-internal-ads] Tabela Ads já existe.');
    return;
  }

  console.log('[ensure-internal-ads] Criando Ads + AdPosicao (reparo automático)...');

  if (!(await hasAdPosicaoEnum())) {
    await prisma.$executeRawUnsafe(
      `CREATE TYPE "AdPosicao" AS ENUM ('topo', 'corpo', 'lateral')`,
    );
  }

  await prisma.$executeRawUnsafe(`
CREATE TABLE "Ads" (
    "id" SERIAL NOT NULL,
    "tenantHostname" TEXT NOT NULL,
    "posicao" "AdPosicao" NOT NULL,
    "imagemUrl" TEXT NOT NULL,
    "ctaUrl" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "cliques" INTEGER NOT NULL DEFAULT 0,
    "impressoes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Ads_pkey" PRIMARY KEY ("id")
)`);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX "Ads_tenantHostname_posicao_idx" ON "Ads"("tenantHostname", "posicao")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX "Ads_dataInicio_dataFim_idx" ON "Ads"("dataInicio", "dataFim")`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Ads" ADD CONSTRAINT "Ads_tenantHostname_fkey" FOREIGN KEY ("tenantHostname") REFERENCES "Tenant"("hostname") ON DELETE CASCADE ON UPDATE CASCADE`,
  );

  console.log('[ensure-internal-ads] Concluído.');
}

try {
  await main();
} catch (e) {
  console.error('[ensure-internal-ads] Erro:', e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
