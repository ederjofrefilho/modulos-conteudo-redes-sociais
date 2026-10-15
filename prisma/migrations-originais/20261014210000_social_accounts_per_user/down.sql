-- Reverte 20261014210000_social_accounts_per_user (aplicar à mão e apagar a linha
-- correspondente de "_prisma_migrations"). Não toca em posts nem horários.
ALTER TABLE "SocialPost" DROP CONSTRAINT IF EXISTS "SocialPost_submittedById_fkey",
  DROP CONSTRAINT IF EXISTS "SocialPost_reviewedById_fkey",
  DROP CONSTRAINT IF EXISTS "SocialPost_scheduledById_fkey",
  DROP CONSTRAINT IF EXISTS "SocialPost_publishedById_fkey";
ALTER TABLE "SocialPost" DROP COLUMN IF EXISTS "publishedById", DROP COLUMN IF EXISTS "remote",
  DROP COLUMN IF EXISTS "reviewComment", DROP COLUMN IF EXISTS "reviewState", DROP COLUMN IF EXISTS "reviewedAt",
  DROP COLUMN IF EXISTS "reviewedById", DROP COLUMN IF EXISTS "scheduledById", DROP COLUMN IF EXISTS "submittedAt",
  DROP COLUMN IF EXISTS "submittedById";
DROP TABLE IF EXISTS "SocialAccountAccess";
ALTER TABLE "SocialAccount" DROP CONSTRAINT IF EXISTS "SocialAccount_ownerId_fkey";
DROP INDEX IF EXISTS "SocialAccount_ownerId_idx";
ALTER TABLE "SocialAccount" DROP COLUMN IF EXISTS "expiryNotifiedAt", DROP COLUMN IF EXISTS "ownerId", DROP COLUMN IF EXISTS "shared";
DROP TYPE IF EXISTS "SocialAccessLevel";
