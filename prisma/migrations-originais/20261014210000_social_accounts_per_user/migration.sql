-- Contas sociais por utilizador, permissões nas contas partilhadas, revisão de rascunhos
-- e a publicação como está na rede (remote). Reversão: down.sql nesta pasta.

-- CreateEnum
CREATE TYPE "SocialAccessLevel" AS ENUM ('VIEW', 'DRAFT', 'PUBLISH');

-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "expiryNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "publishedById" TEXT,
ADD COLUMN     "remote" JSONB,
ADD COLUMN     "reviewComment" TEXT,
ADD COLUMN     "reviewState" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "scheduledById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- CreateTable
CREATE TABLE "SocialAccountAccess" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "SocialAccessLevel" NOT NULL,
    "canViewMetrics" BOOLEAN NOT NULL DEFAULT false,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccountAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialAccountAccess_userId_idx" ON "SocialAccountAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccountAccess_socialAccountId_userId_key" ON "SocialAccountAccess"("socialAccountId", "userId");

-- CreateIndex
CREATE INDEX "SocialAccount_ownerId_idx" ON "SocialAccount"("ownerId");

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccountAccess" ADD CONSTRAINT "SocialAccountAccess_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccountAccess" ADD CONSTRAINT "SocialAccountAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccountAccess" ADD CONSTRAINT "SocialAccountAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS, mesma regra de 20260730051500_enable_rls (sem policies: só o Prisma, com BYPASSRLS).
ALTER TABLE "SocialAccountAccess" ENABLE ROW LEVEL SECURITY;

-- Dados: a página/Instagram (ORGANIZATION) viram contas partilhadas da empresa;
-- o perfil pessoal passa a pertencer a quem o ligou. Posts e horários não mudam.
UPDATE "SocialAccount" SET "shared" = true WHERE "kind" = 'ORGANIZATION';
UPDATE "SocialAccount" SET "ownerId" = "connectedById" WHERE "kind" = 'PERSON' AND "shared" = false;

-- Registo de quem publicou os posts que já saíram pelo CRM (o aprovador).
UPDATE "SocialPost" SET "publishedById" = "approvedById" WHERE "status" = 'PUBLISHED' AND "origin" = 'crm' AND "approvedById" IS NOT NULL;
