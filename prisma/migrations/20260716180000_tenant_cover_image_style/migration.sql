-- Estilo padrão de capa gerada por IA (photo | watercolor | flat).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "coverImageStyle" TEXT NOT NULL DEFAULT 'photo';
