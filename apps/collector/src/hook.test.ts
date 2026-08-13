import { describe, expect, it } from "vitest";
import { guardCommand, withGuardHook, withoutGuardHook } from "./hook.js";

const CMD = '"/Users/x/Library/Application Support/usagefleet/usagefleet" guard';

describe("guardCommand", () => {
  it("quotes only the arguments that need it", () => {
    expect(
      guardCommand(["/Users/x/Library/Application Support/usagefleet/usagefleet", "guard"]),
    ).toBe('"/Users/x/Library/Application Support/usagefleet/usagefleet" guard');
    expect(guardCommand(["/usr/bin/node", "/opt/usagefleet/index.js", "guard"])).toBe(
      "/usr/bin/node /opt/usagefleet/index.js guard",
    );
  });
});

describe("withGuardHook", () => {
  it("is idempotent — re-installing does not stack a second hook", () => {
    const once = withGuardHook({}, CMD);
    expect(withGuardHook(once, CMD)).toEqual(once);
    expect(once.hooks?.UserPromptSubmit).toHaveLength(1);
  });

  it("replaces a guard hook left by an older install at a different path", () => {
    const stale = withGuardHook({}, "/old/path/usagefleet guard");
    const fresh = withGuardHook(stale, CMD);
    expect(fresh.hooks?.UserPromptSubmit).toHaveLength(1);
    expect(fresh.hooks?.UserPromptSubmit[0].hooks?.[0].command).toBe(CMD);
  });

  // The whole file belongs to the user; we only ever add one entry to it.
  it("preserves unrelated settings and unrelated hooks", () => {
    const before = {
      model: "opus",
      permissions: { allow: ["Bash(ls:*)"] },
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "audit.sh" }] }],
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "spellcheck.sh" }] }],
      },
    };
    const after = withGuardHook(before, CMD);
    expect(after.model).toBe("opus");
    expect(after.permissions).toEqual(before.permissions);
    expect(after.hooks?.PreToolUse).toEqual(before.hooks.PreToolUse);
    expect(after.hooks?.UserPromptSubmit.map((g) => g.hooks?.[0].command)).toEqual([
      "spellcheck.sh",
      CMD,
    ]);
  });
});

describe("withoutGuardHook", () => {
  it("removes ours and nothing else", () => {
    const before = {
      hooks: {
        PreToolUse: [{ hooks: [{ type: "command", command: "audit.sh" }] }],
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "spellcheck.sh" }] }],
      },
    };
    expect(withoutGuardHook(withGuardHook(before, CMD))).toEqual(before);
  });

  it("drops the hooks key entirely when the guard was all there was", () => {
    expect(JSON.stringify(withoutGuardHook(withGuardHook({ model: "opus" }, CMD)))).toBe(
      '{"model":"opus"}',
    );
  });

  it("is a no-op on settings that never had the hook", () => {
    const before = { model: "opus" };
    expect(withoutGuardHook(before)).toEqual(before);
  });
});
