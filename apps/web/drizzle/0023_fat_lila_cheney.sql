ALTER TABLE "claude_account" ADD COLUMN "calibration" jsonb;
--> statement-breakpoint
-- Collapse the limit samples that the jittering reset instant fragmented.
--
-- window_start is part of the primary key and was derived straight from the
-- reset instant Anthropic reports, which drifts by a second or so between
-- reads. Every reading therefore inserted its own row instead of raising the
-- peak on the existing one, leaving one real window stored as ~100 rows that
-- each remember a single instant. recordLimitSample now snaps window_start to
-- a five-minute grid; this brings the rows already written onto the same grid.
--
-- Keeping the largest peak per slot reproduces exactly what the `greatest()`
-- upsert would have accumulated had the key matched, so nothing is lost that
-- the reader (windowSpans, which already clusters near-duplicate starts and
-- takes their max) was showing.
DELETE FROM "limit_sample" a
USING "limit_sample" b
WHERE a."claude_account_id" = b."claude_account_id"
  AND a."window" = b."window"
  AND round(extract(epoch FROM a."window_start") / 300) = round(extract(epoch FROM b."window_start") / 300)
  AND (b."peak_pct", b."window_start") > (a."peak_pct", a."window_start");
--> statement-breakpoint
UPDATE "limit_sample"
SET "window_start" = to_timestamp(round(extract(epoch FROM "window_start") / 300) * 300)
WHERE "window_start" <> to_timestamp(round(extract(epoch FROM "window_start") / 300) * 300);
