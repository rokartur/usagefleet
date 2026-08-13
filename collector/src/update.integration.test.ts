import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// The updater only runs on release builds, and hands over by spawning the new
// binary — both have to be faked to exercise the download path at all.
vi.mock("./release.js", () => ({ RELEASE_TAG: "v1.0.0.1" }));
const spawn = vi.fn(() => ({ unref: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));

const { assetName, checkForUpdate } = await import("./update.js");
const cfg = { endpoint: "https://srv.test", token: "ctk_x" };
const ASSET = assetName(process.platform, process.arch) as string;

/** Point the updater at a throwaway file instead of the running executable. */
function fakeBinary(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "ct-upd-")), "claude-track");
  writeFileSync(path, contents);
  Object.defineProperty(process, "execPath", { value: path, configurable: true });
  return path;
}

const realExecPath = process.execPath;
afterEach(() => {
  Object.defineProperty(process, "execPath", { value: realExecPath, configurable: true });
  vi.unstubAllGlobals();
  spawn.mockClear();
});

/** A server offering `payload` as the new binary, advertised with `advertised`. */
function stubServer(payload: string, advertised = sha256(payload)) {
  vi.stubGlobal("fetch", async (url: string) =>
    url.includes("/latest")
      ? Response.json({ tag: "v9.9.9.9", sha256: { [ASSET]: advertised } })
      : new Response(payload),
  );
}

function sha256(s: string): string {
  return createHash("sha256").update(Buffer.from(s)).digest("hex");
}

describe("checkForUpdate", () => {
  it("installs a release whose checksum matches", async () => {
    const bin = fakeBinary("old binary");
    stubServer("new binary");

    await expect(checkForUpdate(cfg, () => {})).resolves.toBe("v9.9.9.9");
    expect(readFileSync(bin, "utf8")).toBe("new binary");
    expect(spawn).toHaveBeenCalledWith(bin, ["install"], expect.anything());
  });

  // The download is code we are about to execute: a wrong hash must leave the
  // working install exactly as it was.
  it("refuses a download whose checksum does not match", async () => {
    const bin = fakeBinary("old binary");
    stubServer("tampered binary", sha256("what the server promised"));

    await expect(checkForUpdate(cfg, () => {})).resolves.toBeNull();
    expect(readFileSync(bin, "utf8")).toBe("old binary");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("stays put when the server reports the tag we already run", async () => {
    const bin = fakeBinary("old binary");
    vi.stubGlobal("fetch", async () => Response.json({ tag: "v1.0.0.1", sha256: {} }));

    await expect(checkForUpdate(cfg, () => {})).resolves.toBeNull();
    expect(readFileSync(bin, "utf8")).toBe("old binary");
  });
});
