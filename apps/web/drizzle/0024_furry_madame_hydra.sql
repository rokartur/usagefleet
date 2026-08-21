-- better-auth 1.7 matches an account by (issuer, accountId) instead of
-- providerId alone, so rows written before it have no issuer and are invisible
-- to sign-in: the password check never runs and every login reads as "invalid
-- email or password".
--
-- The column is required, so it lands nullable, gets the value better-auth
-- would have written (`local:credential`, `local:oauth:<provider>` — social
-- providers here declare no issuer of their own), and only then goes NOT NULL.
ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text;--> statement-breakpoint
UPDATE "account"
SET "issuer" = CASE WHEN "provider_id" = 'credential' THEN 'local:credential' ELSE 'local:oauth:' || "provider_id" END
WHERE "issuer" IS NULL;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_idx" ON "account" USING btree ("issuer","account_id");
