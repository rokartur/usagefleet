import { describe, expect, it } from "vitest";
import { resolvePiDirs } from "./config.js";

describe("resolvePiDirs", () => {
  it("disables on off/0", () => {
    expect(resolvePiDirs("off", "/x")).toEqual([]);
    expect(resolvePiDirs("0", "/x")).toEqual([]);
  });

  it("splits a comma-separated env list and trims", () => {
    expect(resolvePiDirs("/a, /b ,/a", undefined)).toEqual(["/a", "/b"]);
  });

  it("takes the config file's string or array when env is unset", () => {
    expect(resolvePiDirs(undefined, "/a")).toEqual(["/a"]);
    expect(resolvePiDirs(undefined, ["/a", "/b"])).toEqual(["/a", "/b"]);
  });

  it("falls back to the auto-detected defaults", () => {
    expect(resolvePiDirs(undefined, undefined).length).toBeGreaterThan(0);
  });
});
