-- AlterTable Tenant (briefing + auto publicacao)
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "editorialBrief" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "editorialStyleNotes" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "defaultArticleTone" TEXT NOT NULL DEFAULT 'profissional';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "autoPublishWeekdays" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "autoPublishHourUtc" INTEGER;

-- CreateTable ArticlePitch
CREATE TABLE "ArticlePitch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticlePitch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArticlePitch_postId_key" ON "ArticlePitch"("postId");
CREATE INDEX "ArticlePitch_tenantId_monthKey_idx" ON "ArticlePitch"("tenantId", "monthKey");
CREATE INDEX "ArticlePitch_status_idx" ON "ArticlePitch"("status");

ALTER TABLE "ArticlePitch" ADD CONSTRAINT "ArticlePitch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
