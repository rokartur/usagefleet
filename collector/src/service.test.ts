import { describe, expect, it } from "vitest";
import { looksLikeCompiledBinary } from "./service.js";

describe("looksLikeCompiledBinary", () => {
  it("treats `node dist/index.js` as NOT a compiled binary", () => {
    expect(
      looksLikeCompiledBinary("/opt/app/collector/dist/index.js", "/usr/bin/node"),
    ).toBe(false);
  });

  it("detects a bun --compile binary by its /$bunfs/ virtual entry", () => {
    // Regression: this argv[1] used to be mistaken for a real script, baking a
    // bogus path into the service command so the launched process just printed
    // help and exited.
    expect(
      looksLikeCompiledBinary(
        "/$bunfs/root/claude-track-macos-arm64",
        "/Users/me/.local/bin/claude-track",
      ),
    ).toBe(true);
  });

  it("detects a bun --compile binary on Windows (~BUN path)", () => {
    expect(
      looksLikeCompiledBinary(
        "B:\\~BUN\\root\\claude-track-windows-x64.exe",
        "C:\\Users\\me\\claude-track.exe",
      ),
    ).toBe(true);
  });

  it("treats a missing argv[1] as a compiled binary", () => {
    expect(looksLikeCompiledBinary(undefined, "/x/claude-track")).toBe(true);
  });

  it("treats argv[1] === execPath as a compiled binary", () => {
    expect(looksLikeCompiledBinary("/x/claude-track", "/x/claude-track")).toBe(true);
  });
});
