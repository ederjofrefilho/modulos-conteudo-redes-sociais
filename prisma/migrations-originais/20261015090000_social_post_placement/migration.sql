-- Formato da publicação no Instagram: feed, reel ou story. Posts existentes
-- ficam "feed" (o vídeo deles já saía como Reels, que o formato "reel" nomeia).
ALTER TABLE "SocialPost" ADD COLUMN "placement" TEXT NOT NULL DEFAULT 'feed';
UPDATE "SocialPost" SET "placement" = 'reel'
WHERE "socialAccountId" IN (SELECT "id" FROM "SocialAccount" WHERE "provider" = 'INSTAGRAM')
  AND cardinality("mediaAssetIds") = 1
  AND "mediaAssetIds"[1] IN (SELECT "id" FROM "ContentAsset" WHERE "mimeType" LIKE 'video/%');
