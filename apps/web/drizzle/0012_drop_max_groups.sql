-- Group budgets now divide by the live group count, so the per-user override
-- is gone. Dropping the column is irreversible: rolling the image back to a
-- pre-0012 build needs this run first, or every write to user_settings fails.
--   ALTER TABLE "user_settings" ADD COLUMN "max_groups" integer DEFAULT 2 NOT NULL;
-- The old per-user values are not recoverable; restore from backup if they matter.
ALTER TABLE "user_settings" DROP COLUMN "max_groups";
