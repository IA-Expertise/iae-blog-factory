-- Modo do tenant: internal (IAE) | client (editor isolado).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "tenantMode" TEXT NOT NULL DEFAULT 'internal';

-- Usuários editor por tenant (clientes Campo).
CREATE TABLE IF NOT EXISTS "TenantEditor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantEditor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantEditor_username_key" ON "TenantEditor"("username");
CREATE INDEX IF NOT EXISTS "TenantEditor_tenantId_idx" ON "TenantEditor"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TenantEditor_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantEditor"
      ADD CONSTRAINT "TenantEditor_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
