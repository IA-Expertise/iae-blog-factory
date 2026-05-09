-- CreateEnum
CREATE TYPE "AdPosicao" AS ENUM ('topo', 'corpo', 'lateral');

-- CreateTable
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
);

-- CreateIndex
CREATE INDEX "Ads_tenantHostname_posicao_idx" ON "Ads"("tenantHostname", "posicao");

-- CreateIndex
CREATE INDEX "Ads_dataInicio_dataFim_idx" ON "Ads"("dataInicio", "dataFim");

-- AddForeignKey
ALTER TABLE "Ads" ADD CONSTRAINT "Ads_tenantHostname_fkey" FOREIGN KEY ("tenantHostname") REFERENCES "Tenant"("hostname") ON DELETE CASCADE ON UPDATE CASCADE;
