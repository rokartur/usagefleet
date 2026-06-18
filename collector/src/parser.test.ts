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

  it("ignores non-assistant and usage-less lines", () => {
    expect(parseLine(JSON.stringify({ type: "user", uuid: "x" }))).toBeNull();
    expect(parseLine(JSON.stringify({ type: "assistant", uuid: "y", message: { id: "m" } }))).toBeNull();
    expect(parseLine("not json")).toBeNull();
    expect(parseLine("")).toBeNull();
  });
});
