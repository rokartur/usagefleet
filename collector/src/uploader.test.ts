import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadBatch } from "./uploader.js";
import type { BatchPayload, Config } from "./types.js";

const cfg: Config = {
  endpoint: "https://x.test",
  token: "ctk_test",
  statePath: "",
  projectsDir: "",
  batchSize: 100,
};
const payload: BatchPayload = {
  os: "mac",
  hostname: "h",
  collectorVersion: "1.0.0",
  sentAt: "2026-01-01T00:00:00Z",
  records: [],
};

function mockFetch(status: number, body = "{}") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("uploadBatch failure classification", () => {
  it("2xx → ok with counts", async () => {
    mockFetch(200, JSON.stringify({ accepted: 3, duplicates: 1 }));
    expect(await uploadBatch(payload, cfg)).toEqual({ ok: true, accepted: 3, duplicates: 1 });
  });

  it("401 → auth (revoked/expired token; keep offset, surface loudly)", async () => {
    mockFetch(401);
    expect(await uploadBatch(payload, cfg)).toEqual({ ok: false, fatal: "auth" });
  });

  it("403 → auth", async () => {
    mockFetch(403);
    expect(await uploadBatch(payload, cfg)).toEqual({ ok: false, fatal: "auth" });
  });

  it("400 → invalid (malformed; skip past to avoid a stall)", async () => {
    mockFetch(400);
    expect(await uploadBatch(payload, cfg)).toEqual({ ok: false, fatal: "invalid" });
  });

  it("422 → invalid", async () => {
    mockFetch(422);
    expect(await uploadBatch(payload, cfg)).toEqual({ ok: false, fatal: "invalid" });
  });
});
