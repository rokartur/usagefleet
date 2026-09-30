-- 0028 stamped older rows with the account their device was on at deploy time. A
-- device that had just been signed into a second Claude account under its old
-- fleet's token took its whole history onto that account. A row cannot belong
-- to an account this fleet first saw after the row, so hand those back to the
-- device's current account when that one already existed at the row's time.
UPDATE "usage_event" AS e
SET "claude_account_id" = d."claude_account_id"
FROM "devices" AS d, "claude_account" AS stamped, "claude_account" AS home
WHERE d."id" = e."device_id"
	AND stamped."id" = e."claude_account_id"
	AND home."id" = d."claude_account_id"
	AND home."id" <> stamped."id"
	AND e."ts" < stamped."created_at" AT TIME ZONE 'UTC'
	AND e."ts" >= home."created_at" AT TIME ZONE 'UTC';
