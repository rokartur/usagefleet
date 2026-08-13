import { describe, expect, it } from "vitest";
import { parseSha256Sums } from "./github-release";

describe("parseSha256Sums", () => {
  const sha = "a".repeat(64);

  it("reads sha256sum output, including the binary-mode star", () => {
    expect(
      parseSha256Sums(`${sha}  claude-track-macos-arm64\n${"b".repeat(64)} *claude-track.js\n`),
    ).toEqual({ "claude-track-macos-arm64": sha, "claude-track.js": "b".repeat(64) });
  });

  // The parsed hashes gate what a device is willing to execute, so anything
  // that isn't exactly a 64-hex digest plus a name must not become an entry.
  it("ignores lines that are not a hash and a name", () => {
    expect(
      parseSha256Sums(`\n# comment\ndeadbeef  short-hash\n${sha}  name with spaces\n${sha}\n`),
    ).toEqual({});
  });
});
