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
