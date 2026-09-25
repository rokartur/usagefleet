-- better-auth 1.7.3 went back to matching accounts on (providerId, accountId) and stopped writing issuer, so 0024's NOT NULL column fails every insert.
DROP INDEX IF EXISTS "account_issuer_accountId_idx";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer";
