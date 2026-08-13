import { describe, expect, it } from "vitest";
import { blockMessage } from "./guard.js";

describe("blockMessage", () => {
  it("blocks only on an explicit blocked:true", () => {
    expect(blockMessage({ blocked: true, blockedWindow: "session", sessionPct: 118 })).toContain(
      "118% of its 5h budget",
    );
    expect(blockMessage({ blocked: true, blockedWindow: "weekly", weeklyPct: 104 })).toContain(
      "104% of its weekly budget",
    );
  });

  // Fail-open is the whole safety property: a tracker outage, an old server, or
  // a junk response must never stop someone from prompting.
  it("fails open on anything that is not an explicit block", () => {
    for (const view of [
      {},
      { blocked: false },
      { sessionPct: 250, weeklyPct: 250 },
      { blockedWindow: "session" as const },
      JSON.parse('{"blocked":"true"}'),
    ]) {
      expect(blockMessage(view)).toBeNull();
    }
  });

  it("names the group and the reset time when the server sent them", () => {
    const msg = blockMessage({
      blocked: true,
      blockedWindow: "session",
      sessionPct: 100,
      group: "Backend",
      blockedUntil: "2026-01-01T12:00:00.000Z",
    });
    expect(msg).toContain('"Backend"');
    expect(msg).toContain("Resets ");
  });

  it("omits the reset when it is missing or unparseable", () => {
    expect(blockMessage({ blocked: true, blockedUntil: "not-a-date" })).not.toContain("Resets");
    expect(blockMessage({ blocked: true, blockedUntil: null })).not.toContain("Resets");
  });
});
