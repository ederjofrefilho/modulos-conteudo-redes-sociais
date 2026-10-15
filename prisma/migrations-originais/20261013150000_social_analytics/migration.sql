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
