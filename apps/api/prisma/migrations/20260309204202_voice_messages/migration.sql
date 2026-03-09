-- Add media fields to Message (voice + photo metadata)

ALTER TABLE "Message"
  ADD COLUMN     "mediaKind"       TEXT,
  ADD COLUMN     "mediaMime"       TEXT,
  ADD COLUMN     "mediaSize"       INTEGER,
  ADD COLUMN     "mediaDurationMs" INTEGER;

-- Backfill existing mediaPath rows as photo
UPDATE "Message"
SET "mediaKind" = 'photo'
WHERE "mediaPath" IS NOT NULL AND "mediaKind" IS NULL;
