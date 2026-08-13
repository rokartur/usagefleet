import { readFileSync } from "node:fs";
import { getDashboard } from "../src/lib/data";

async function main() {
  const userId = JSON.parse(readFileSync("/tmp/usagefleet-seed.json", "utf8")).userId;
  const d = await getDashboard(userId, new Date());
  console.log(
    JSON.stringify(
      {
        groups: d.groups.length,
        overallWeekly: d.overall.weekly.totalTokens,
        overallSession: d.overall.session.totalTokens,
        weekStart: d.weekStart.toISOString(),
        sessionStart: d.sessionStart?.toISOString() ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
