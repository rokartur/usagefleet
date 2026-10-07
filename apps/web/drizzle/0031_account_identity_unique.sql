-- The 0024/0025 issuer round trip let one Google sign-in write a second row for
-- an identity it could no longer see. Both rows belong to the same user, so the
-- stale one carries nothing the newer one lacks. A duplicate spanning two users
-- is left alone and fails the index below: that is an ownership question, not a
-- cleanup.
DELETE FROM "account" a
USING "account" b
WHERE a."provider_id" = b."provider_id"
  AND a."account_id" = b."account_id"
  AND a."user_id" = b."user_id"
  AND (a."updated_at", a."id") < (b."updated_at", b."id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_idx" ON "account" USING btree ("provider_id","account_id");
