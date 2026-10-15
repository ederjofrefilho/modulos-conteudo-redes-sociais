-- Desfaz 20261013150000_social_analytics (correr à mão, só depois do rollback do deployment).
DROP TABLE IF EXISTS "SocialPostMetric";
DROP TABLE IF EXISTS "SocialAccountMetric";
DROP INDEX IF EXISTS "SocialPost_status_publishedAt_idx";
ALTER TABLE "SocialPost" DROP COLUMN IF EXISTS "isIdea", DROP COLUMN IF EXISTS "metrics", DROP COLUMN IF EXISTS "metricsAt",
  DROP COLUMN IF EXISTS "metricsError", DROP COLUMN IF EXISTS "topic", DROP COLUMN IF EXISTS "utmAuto";
ALTER TABLE "SocialAccount" DROP COLUMN IF EXISTS "metricsAt", DROP COLUMN IF EXISTS "metricsError";
