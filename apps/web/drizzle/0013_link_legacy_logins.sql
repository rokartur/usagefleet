-- Let legacy password users back in through OAuth.
--
-- Until this release the only way to sign up was email + password, with no
-- verification step, so every existing user carries email_verified = false.
-- Sign-in is now GitHub/Google only, and better-auth refuses to link a social
-- login onto a local user whose email is unverified (requireLocalEmailVerified
-- defaults to true, and it is a separate condition from trustedProviders, so no
-- config flag skips it). Without this backfill every existing account is locked
-- out the moment the password path disappears.
--
-- This is narrower than it looks: linking still requires the provider to report
-- the SAME address as verified, so a row can only be claimed by someone who
-- demonstrably controls that mailbox at GitHub or Google.
--
-- Scoped to password accounts on purpose. Rows created by OAuth already get
-- their flag from the provider, and leaving the strict default in place keeps
-- protecting everything created from here on.
--
-- No faithful rollback: the original per-user flag is not recoverable
-- afterwards. To undo, restore from a backup taken before this ran.
UPDATE "user"
SET "email_verified" = true
WHERE "email_verified" = false
  AND "id" IN (SELECT "user_id" FROM "account" WHERE "provider_id" = 'credential');
--> statement-breakpoint
-- Drop the password accounts themselves. They are unusable — no sign-in path
-- reads them any more — and leaving them behind is not merely untidy, it can
-- lock someone out: better-auth's "you may not unlink your last account" guard
-- counts every row, so a user holding credential + GitHub is allowed to unlink
-- GitHub, and lands on a password account with no password screen to use.
--
-- Runs after the backfill above, which reads this same set to decide whom to
-- verify. Reordering these two statements would silently make the backfill a
-- no-op and lock out every legacy user.
--
-- Irreversible: this discards the stored password hashes.
DELETE FROM "account" WHERE "provider_id" = 'credential';
