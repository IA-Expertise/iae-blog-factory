-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostname" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "heroTitle" TEXT NOT NULL,
    "heroSubtitle" TEXT NOT NULL,
    "heroCtaLabel" TEXT NOT NULL,
    "heroCtaHref" TEXT NOT NULL,
    "heroImage" TEXT NOT NULL,
    "themePrimary" TEXT NOT NULL,
    "themeSecondary" TEXT NOT NULL,
    "themeAccent" TEXT NOT NULL,
    "themeBackground" TEXT NOT NULL,
    "themeSurface" TEXT NOT NULL,
    "themeText" TEXT NOT NULL,
    "themeHeadingFont" TEXT NOT NULL,
    "themeBodyFont" TEXT NOT NULL,
    "adProvider" TEXT NOT NULL DEFAULT 'adsense',
    "adClient" TEXT NOT NULL,
    "adSlot" TEXT NOT NULL,
    "affiliateNetwork" TEXT NOT NULL,
    "affiliateTrackingId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Post_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AffiliateProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    CONSTRAINT "AffiliateProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultTitle" TEXT,
    "resultSlug" TEXT,
    "resultImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_hostname_key" ON "Tenant"("hostname");

-- CreateIndex
CREATE INDEX "Post_tenantId_idx" ON "Post"("tenantId");

-- CreateIndex
CREATE INDEX "AffiliateProduct_tenantId_idx" ON "AffiliateProduct"("tenantId");

-- CreateIndex
CREATE INDEX "GenerationJob_tenantId_idx" ON "GenerationJob"("tenantId");
