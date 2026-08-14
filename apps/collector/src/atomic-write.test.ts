import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeFileAtomic } from "./atomic-write.js";

// Two of the files this rewrites belong to the user, not to us
// (~/.claude/settings.json and Claude's credentials), so the rewrite must not
// quietly change what the path *is* or who can read it.

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "uf-atomic-"));
}

describe("writeFileAtomic", () => {
  it("writes through a symlink instead of replacing it", () => {
    const dir = scratch();
    const real = join(dir, "real.json");
    const link = join(dir, "settings.json");
    writeFileSync(real, "old");
    symlinkSync(real, link);

    writeFileAtomic(link, "new");

    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(real, "utf8")).toBe("new");
  });

  it("keeps the existing permissions when no mode is forced", () => {
    const dir = scratch();
    const path = join(dir, "creds.json");
    writeFileSync(path, "old", { mode: 0o600 });

    writeFileAtomic(path, "new");

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("lets an explicit mode win over the existing one", () => {
    const dir = scratch();
    const path = join(dir, "creds.json");
    writeFileSync(path, "old", { mode: 0o644 });

    writeFileAtomic(path, "new", 0o600);

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
