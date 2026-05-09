-- CreateTable
CREATE TABLE "AdPlaceholders" (
    "id" SERIAL NOT NULL,
    "tenantHostname" TEXT NOT NULL,
    "posicao" "AdPosicao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "imagemUrl" TEXT NOT NULL,
    "ctaUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPlaceholders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdPlaceholders_tenantHostname_posicao_idx" ON "AdPlaceholders"("tenantHostname", "posicao");

-- AddForeignKey
ALTER TABLE "AdPlaceholders" ADD CONSTRAINT "AdPlaceholders_tenantHostname_fkey" FOREIGN KEY ("tenantHostname") REFERENCES "Tenant"("hostname") ON DELETE CASCADE ON UPDATE CASCADE;
