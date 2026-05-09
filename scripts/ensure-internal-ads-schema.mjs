/**
 * Reparo automático: quando _prisma_migrations marca a migration de Ads como aplicada,
 * mas a tabela Ads não existe, este script garante que ela seja criada.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[ensure-internal-ads] Iniciando verificação...');

  try {
    // Verificar se tabela Ads existe
    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'Ads'
      ) as exists
    `;
    
    const tableExists = tableCheck[0]?.exists || false;
    console.log('[ensure-internal-ads] Tabela Ads existe?', tableExists);

    if (tableExists) {
      console.log('[ensure-internal-ads] Tabela Ads já existe. Saindo.');
      return;
    }

    console.log('[ensure-internal-ads] Tabela Ads não encontrada. Criando...');

    // Criar enum AdPosicao
    try {
      await prisma.$executeRawUnsafe(
        `CREATE TYPE "AdPosicao" AS ENUM ('topo', 'corpo', 'lateral')`
      );
      console.log('[ensure-internal-ads] Enum AdPosicao criado.');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('[ensure-internal-ads] Enum AdPosicao já existe.');
      } else {
        throw e;
      }
    }

    // Criar tabela Ads
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
      )
    `);
    console.log('[ensure-internal-ads] Tabela Ads criada.');

    // Criar índices
    await prisma.$executeRawUnsafe(
      `CREATE INDEX "Ads_tenantHostname_posicao_idx" ON "Ads"("tenantHostname", "posicao")`
    );
    console.log('[ensure-internal-ads] Índice tenantHostname_posicao criado.');

    await prisma.$executeRawUnsafe(
      `CREATE INDEX "Ads_dataInicio_dataFim_idx" ON "Ads"("dataInicio", "dataFim")`
    );
    console.log('[ensure-internal-ads] Índice dataInicio_dataFim criado.');

    // Criar foreign key
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Ads" ADD CONSTRAINT "Ads_tenantHostname_fkey" FOREIGN KEY ("tenantHostname") REFERENCES "Tenant"("hostname") ON DELETE CASCADE ON UPDATE CASCADE`
    );
    console.log('[ensure-internal-ads] Foreign key criada.');

    console.log('[ensure-internal-ads] ✅ Tabela Ads criada com sucesso!');
  } catch (e) {
    console.error('[ensure-internal-ads] ❌ Erro:', e.message);
    console.error('[ensure-internal-ads] Stack:', e.stack);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
