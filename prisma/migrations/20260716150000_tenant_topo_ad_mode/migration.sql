-- Topo: modo rotativo (todos) vs exclusivo (um anunciante).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "topoAdMode" TEXT NOT NULL DEFAULT 'rotate_all';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "topoExclusiveAdId" INTEGER;
