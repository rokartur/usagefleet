import { describe, expect, it } from "vitest";
import {
  looksLikeCompiledBinary,
  windowsLauncherVbs,
  windowsTaskXml,
} from "./service.js";

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

describe("windowsLauncherVbs", () => {
  const script = windowsLauncherVbs(
    ["C:\\Program Files\\ct\\claude-track.exe", "watch"],
    [
      ["CLAUDE_TRACK_TOKEN", 'ctk_a"b'],
      ["CLAUDE_TRACK_BROKEN", "line1\nline2"],
    ],
    "C:\\logs\\claude-track.log",
  );

  it("runs the collector hidden, logged, and waits for it", () => {
    // window style 0 = no console window; True = wait, so the Scheduled Task
    // instance lives as long as the collector (restart-on-failure works).
    // Unescaped, the VBS literal is the canonical cmd form:
    //   cmd /c ""C:\..\claude-track.exe" "watch" > "C:\logs\claude-track.log" 2>&1"
    expect(script).toContain(
      'sh.Run "cmd /c """"C:\\Program Files\\ct\\claude-track.exe"" ""watch"" > ""C:\\logs\\claude-track.log"" 2>&1""", 0, True',
    );
  });

  it("escapes quotes in env values and drops unrepresentable newlines", () => {
    expect(script).toContain('env("CLAUDE_TRACK_TOKEN") = "ctk_a""b"');
    expect(script).not.toContain("CLAUDE_TRACK_BROKEN");
  });
});

describe("windowsTaskXml", () => {
  it("escapes the user id and points the action at the launcher", () => {
    const xml = windowsTaskXml("C:\\ct\\watch.vbs", "AC&ME\\me");
    expect(xml).toContain("<UserId>AC&amp;ME\\me</UserId>");
    expect(xml).toContain('<Arguments>//B //Nologo "C:\\ct\\watch.vbs"</Arguments>');
    expect(xml).toContain("<LogonTrigger>");
  });
});
