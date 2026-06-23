import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "./rate-limit";

function req(headers: Record<string, string>): Request {
  return new Request("http://x.test", { headers });
}

const orig = process.env.TRUST_PROXY;
afterEach(() => {
  if (orig === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = orig;
});

describe("clientIp", () => {
  it("ignores forgeable X-Forwarded-For when no proxy is trusted (default)", () => {
    delete process.env.TRUST_PROXY;
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("anon");
  });

  it("ignores X-Forwarded-For when TRUST_PROXY=false", () => {
    process.env.TRUST_PROXY = "false";
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("anon");
  });

  it("reads the rightmost (proxy-appended) entry with TRUST_PROXY=true", () => {
    process.env.TRUST_PROXY = "true";
    // attacker forged 9.9.9.9; our single proxy appended the real client IP
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 5.6.7.8" }))).toBe("5.6.7.8");
  });

  it("skips N proxy hops from the right with TRUST_PROXY=2", () => {
    process.env.TRUST_PROXY = "2";
    // forged, real-client, proxy1  → 2 trusted hops → real client at index len-2
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });
});
