-- Excerto da migration 20261014150000_ads_optimization_conversions do sistema original.
-- No original, esta migration também mexe em tabelas de anúncios (Ads*), que
-- NÃO fazem parte destes módulos. Aqui ficam só as linhas de redes sociais.

-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "importError" TEXT,
ADD COLUMN     "importPosts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "importedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'crm';
