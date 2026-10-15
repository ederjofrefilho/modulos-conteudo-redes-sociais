-- =============================================================================
-- Tabelas dos módulos @app/content e @app/social — SQL consolidado (PostgreSQL)
--
-- É a concatenação, por ordem cronológica, das migrations do sistema original que
-- criaram e alteraram estas tabelas (ver migrations-originais/). Aplicar num
-- banco que JÁ TENHA a tabela "User" (com "id" TEXT) — as FKs apontam para ela.
-- Os ALTER TABLE ... ENABLE ROW LEVEL SECURITY vêm do original (Supabase);
-- num Postgres sem API pública podem ser removidos sem efeito para o app.
--
-- Se o projeto destino usa Prisma, prefira gerar a migration a partir de
-- social-content.prisma + host-required.prisma (ver docs/04-MODELO-DE-DADOS.md).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 20260813210000_content_posts
-- -----------------------------------------------------------------------------
-- Conteúdo (blog e casos de sucesso) geridos no CRM — ver CLAUDE.md
-- princípio 6 e BACKLOG.md, seção "Conteúdo: blog e casos de sucesso geridos
-- aqui". Caso de sucesso é o mesmo ContentPost, só com kind = CASE — não há
-- accountId/dealId (decidido em 13/08/2026: é postagem, não registro
-- comercial).

-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('ARTICLE', 'CASE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "blocksVersion" INTEGER NOT NULL DEFAULT 1,
    "coverAssetId" TEXT,
    "ctaHeadline" TEXT,
    "ctaDescription" TEXT,
    "clienteExibicao" TEXT,
    "setor" TEXT,
    "clienteAutorizou" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "contentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAsset" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "alt" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentPost_slug_key" ON "ContentPost"("slug");

-- CreateIndex
CREATE INDEX "ContentPost_kind_status_idx" ON "ContentPost"("kind", "status");

-- CreateIndex
CREATE INDEX "ContentPost_status_publishedAt_idx" ON "ContentPost"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "ContentPost_authorId_idx" ON "ContentPost"("authorId");

-- CreateIndex
CREATE INDEX "ContentAsset_uploadedById_idx" ON "ContentAsset"("uploadedById");

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "ContentAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: mesma régua da migration 20260730051500_enable_rls para toda tabela
-- nova do schema public — o Supabase expõe REST público pela anon key, e sem
-- isto essa chave leria/escreveria ContentPost/ContentAsset livremente. O
-- Prisma continua imune (conecta como dono da tabela, com BYPASSRLS).
ALTER TABLE "ContentPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentAsset" ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 20260813221547_content_post_scheduled_at
-- -----------------------------------------------------------------------------
-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ContentPost_status_scheduledAt_idx" ON "ContentPost"("status", "scheduledAt");


-- -----------------------------------------------------------------------------
-- 20260813222500_content_post_published_content_updated_at
-- -----------------------------------------------------------------------------
-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN     "publishedContentUpdatedAt" TIMESTAMP(3);


-- -----------------------------------------------------------------------------
-- 20261010160000_social_posts
-- -----------------------------------------------------------------------------
-- Redes sociais (docs/PLANO-REDES-SOCIAIS.md, Etapa 2): contas conectadas e posts.

-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('LINKEDIN', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "SocialAccountKind" AS ENUM ('PERSON', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "kind" "SocialAccountKind" NOT NULL DEFAULT 'PERSON',
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "tokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "connectedById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "mediaAssetIds" TEXT[],
    "linkUrl" TEXT,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "externalId" TEXT,
    "externalUrl" TEXT,
    "providerState" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sourceContentPostId" TEXT,
    "campaignKey" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_provider_externalId_key" ON "SocialAccount"("provider", "externalId");

-- CreateIndex
CREATE INDEX "SocialPost_status_scheduledAt_idx" ON "SocialPost"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "SocialPost_socialAccountId_status_idx" ON "SocialPost"("socialAccountId", "status");

-- CreateIndex
CREATE INDEX "SocialPost_sourceContentPostId_idx" ON "SocialPost"("sourceContentPostId");

-- CreateIndex
CREATE INDEX "SocialPost_campaignKey_idx" ON "SocialPost"("campaignKey");

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_sourceContentPostId_fkey" FOREIGN KEY ("sourceContentPostId") REFERENCES "ContentPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS ligado sem policy, como todas as tabelas do public (ver migration 20260730051500_enable_rls).
ALTER TABLE "SocialAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialPost" ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 20261013150000_social_analytics
-- -----------------------------------------------------------------------------
-- Redes sociais: tema, ideia, UTM automático e histórico de métricas.
-- Só acrescenta; nenhuma coluna ou linha existente é alterada.

ALTER TABLE "SocialAccount" ADD COLUMN "metricsAt" TIMESTAMP(3),
ADD COLUMN "metricsError" TEXT;

ALTER TABLE "SocialPost" ADD COLUMN "isIdea" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "metrics" JSONB,
ADD COLUMN "metricsAt" TIMESTAMP(3),
ADD COLUMN "metricsError" TEXT,
ADD COLUMN "topic" TEXT,
ADD COLUMN "utmAuto" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SocialPostMetric" (
    "id" TEXT NOT NULL,
    "socialPostId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impressions" INTEGER,
    "reach" INTEGER,
    "reactions" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "clicks" INTEGER,
    "videoViews" INTEGER,
    "raw" JSONB,

    CONSTRAINT "SocialPostMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialAccountMetric" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followers" INTEGER,
    "raw" JSONB,

    CONSTRAINT "SocialAccountMetric_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialPostMetric_socialPostId_capturedAt_idx" ON "SocialPostMetric"("socialPostId", "capturedAt");
CREATE INDEX "SocialPostMetric_capturedAt_idx" ON "SocialPostMetric"("capturedAt");
CREATE INDEX "SocialAccountMetric_socialAccountId_capturedAt_idx" ON "SocialAccountMetric"("socialAccountId", "capturedAt");
CREATE INDEX "SocialPost_status_publishedAt_idx" ON "SocialPost"("status", "publishedAt");

ALTER TABLE "SocialPostMetric" ADD CONSTRAINT "SocialPostMetric_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialAccountMetric" ADD CONSTRAINT "SocialAccountMetric_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS ligado sem policy, como todas as tabelas do public (ver migration 20260730051500_enable_rls).
ALTER TABLE "SocialPostMetric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialAccountMetric" ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 20261014090000_content_asset_video
-- -----------------------------------------------------------------------------
-- Vídeo na biblioteca de conteúdo (brand book da marca, 14/10/2026).
ALTER TABLE "ContentAsset" ADD COLUMN "durationMs" INTEGER;


-- -----------------------------------------------------------------------------
-- 20261014150000_social_import_posts
-- -----------------------------------------------------------------------------
-- Excerto da migration 20261014150000_ads_optimization_conversions do sistema original.
-- No original, esta migration também mexe em tabelas de anúncios (Ads*), que
-- NÃO fazem parte destes módulos. Aqui ficam só as linhas de redes sociais.

-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "importError" TEXT,
ADD COLUMN     "importPosts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "importedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'crm';


-- -----------------------------------------------------------------------------
-- 20261014210000_social_accounts_per_user
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- 20261015090000_social_post_placement
-- -----------------------------------------------------------------------------
-- Formato da publicação no Instagram: feed, reel ou story. Posts existentes
-- ficam "feed" (o vídeo deles já saía como Reels, que o formato "reel" nomeia).
ALTER TABLE "SocialPost" ADD COLUMN "placement" TEXT NOT NULL DEFAULT 'feed';
UPDATE "SocialPost" SET "placement" = 'reel'
WHERE "socialAccountId" IN (SELECT "id" FROM "SocialAccount" WHERE "provider" = 'INSTAGRAM')
  AND cardinality("mediaAssetIds") = 1
  AND "mediaAssetIds"[1] IN (SELECT "id" FROM "ContentAsset" WHERE "mimeType" LIKE 'video/%');
