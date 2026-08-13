import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetName, swapIn } from "./update.js";

describe("assetName", () => {
  // Must stay in lockstep with the asset names release.yml publishes and
  // install.sh downloads — a typo here means a silently un-updatable platform.
  it("matches the published release assets", () => {
    expect(assetName("darwin", "arm64")).toBe("claude-track-macos-arm64");
    expect(assetName("darwin", "x64")).toBe("claude-track-macos-x64");
    expect(assetName("linux", "x64")).toBe("claude-track-linux-x64");
    expect(assetName("linux", "arm64")).toBe("claude-track-linux-arm64");
    expect(assetName("win32", "x64")).toBe("claude-track-windows-x64.exe");
  });

  it("returns null where no binary is published", () => {
    expect(assetName("win32", "arm64")).toBeNull();
    expect(assetName("freebsd", "x64")).toBeNull();
    expect(assetName("linux", "ia32")).toBeNull();
  });
});

describe("swapIn", () => {
  it("replaces the target and leaves no leftovers", () => {
    const dir = mkdtempSync(join(tmpdir(), "ct-swap-"));
    const target = join(dir, "claude-track");
    const downloaded = join(dir, ".claude-track.download");
    writeFileSync(target, "old");
    writeFileSync(downloaded, "new");

    swapIn(downloaded, target);

    expect(readFileSync(target, "utf8")).toBe("new");
    expect(existsSync(downloaded)).toBe(false);
    expect(existsSync(`${target}.old`)).toBe(false);
  });
});
