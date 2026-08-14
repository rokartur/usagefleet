import { describe, expect, it } from "vitest";
import { parseLine } from "./parser.js";

const assistantLine = JSON.stringify({
  type: "assistant",
  uuid: "5e0afa98-7e74-4019-95da-cd8f3dd2709b",
  requestId: "req_abc",
  sessionId: "a21df212-b688-44e5-acb5-a91e1291dcb7",
  timestamp: "2026-06-12T01:15:29.820Z",
  cwd: "/Users/artur/Developer/x",
  gitBranch: "main",
  version: "2.1.170",
  message: {
    id: "msg_01PZCT45Lm8WPvW1yJnNxf5S",
    role: "assistant",
    model: "claude-opus-4-7",
    usage: {
      input_tokens: 6671,
      output_tokens: 117,
      cache_creation_input_tokens: 9252,
      cache_read_input_tokens: 16713,
      service_tier: "standard",
    },
  },
});

describe("parseLine", () => {
  it("extracts a usage record from an assistant line", () => {
    const r = parseLine(assistantLine)!;
    expect(r.uuid).toBe("5e0afa98-7e74-4019-95da-cd8f3dd2709b");
    expect(r.messageId).toBe("msg_01PZCT45Lm8WPvW1yJnNxf5S");
    expect(r.requestId).toBe("req_abc");
    expect(r.model).toBe("claude-opus-4-7");
    expect(r.inputTokens).toBe(6671);
    expect(r.outputTokens).toBe(117);
    expect(r.cacheCreationTokens).toBe(9252);
    expect(r.cacheReadTokens).toBe(16713);
    expect(r.source).toBe("cli");
  });

  it("tags the record with the given source (default cli)", () => {
    expect(parseLine(assistantLine, "desktop")!.source).toBe("desktop");
    expect(parseLine(assistantLine)!.source).toBe("cli");
  });

  it("falls back to nested cache_creation when the flat field is absent", () => {
    const line = JSON.stringify({
      type: "assistant",
      uuid: "u2",
      message: {
        id: "m2",
        model: "claude-sonnet-4-6",
        usage: {
          output_tokens: 10,
          cache_creation: {
            ephemeral_5m_input_tokens: 100,
            ephemeral_1h_input_tokens: 200,
          },
        },
      },
    });
    expect(parseLine(line)!.cacheCreationTokens).toBe(300);
  });

  it("parses pi agent lines, keeping only anthropic-provider usage", () => {
    const piLine = (provider: string) =>
      JSON.stringify({
        type: "message",
        id: "0f442440",
        timestamp: "2026-07-19T14:03:18.826Z",
        message: {
          role: "assistant",
          api: "anthropic-messages",
          provider,
          model: "claude-opus-5",
          responseId: "msg_pi_abc123",
          usage: { input: 2332, output: 781, cacheRead: 12800, cacheWrite: 50 },
        },
      });
    const r = parseLine(piLine("anthropic"), "pi")!;
    expect(r.uuid).toBe("pi:msg_pi_abc123");
    expect(r.messageId).toBe("msg_pi_abc123");
    expect(r.model).toBe("claude-opus-5");
    expect(r.inputTokens).toBe(2332);
    expect(r.outputTokens).toBe(781);
    expect(r.cacheCreationTokens).toBe(50);
    expect(r.cacheReadTokens).toBe(12800);
    expect(r.source).toBe("pi");
    // other providers don't touch the Claude account
    expect(parseLine(piLine("openai-codex"), "pi")).toBeNull();
    // a Claude Code line read with source "pi" must not parse (wrong schema)
    expect(parseLine(assistantLine, "pi")).toBeNull();
  });

  it("falls back to id+timestamp for the pi uuid when responseId is missing", () => {
    const line = JSON.stringify({
      type: "message",
      id: "abcd1234",
      timestamp: "2026-07-19T14:03:18.826Z",
      message: { role: "assistant", provider: "anthropic", usage: { input: 1 } },
    });
    expect(parseLine(line, "pi")!.uuid).toBe("pi:abcd1234:2026-07-19T14:03:18.826Z");
  });

  it("ignores non-assistant and usage-less lines", () => {
    expect(parseLine(JSON.stringify({ type: "user", uuid: "x" }))).toBeNull();
    expect(
      parseLine(JSON.stringify({ type: "assistant", uuid: "y", message: { id: "m" } })),
    ).toBeNull();
    expect(parseLine("not json")).toBeNull();
    expect(parseLine("")).toBeNull();
  });

  // All VALID JSON, so the try/catch around JSON.parse does not stop them. Only
  // "null" ever threw — property access on null is a TypeError, while `(123).type`
  // and `[].type` are merely undefined — and that throw escapes tailFile, leaving
  // the file's offset unadvanced so the collector re-reads and re-throws on that
  // file every cycle, silently losing every later record in it. The rest are here
  // to pin the guard's shape, not because they crashed.
  it("returns null for JSON that parses to a non-object", () => {
    for (const line of ["null", "123", '"a string"', "true", "[]", "[1,2]"]) {
      expect(() => parseLine(line)).not.toThrow();
      expect(parseLine(line)).toBeNull();
      expect(() => parseLine(line, "pi")).not.toThrow();
      expect(parseLine(line, "pi")).toBeNull();
    }
  });
});
