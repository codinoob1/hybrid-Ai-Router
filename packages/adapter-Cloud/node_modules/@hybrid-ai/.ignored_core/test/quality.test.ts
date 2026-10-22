import { describe, expect, it } from "vitest";
import { scoreResponse } from "../src/quality.js";

describe("scoreResponse", () => {
  it("fails a response that is too short", () => {
    const result = scoreResponse("ok", { latency: 5 });
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("Response too short");
    expect(result.quality).toBe(0);
  });

  it("fails a response that exceeds the latency threshold", () => {
    const result = scoreResponse("This is a perfectly fine and sufficiently long answer.", { latency: 2000 });
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("Response too slow");
  });

  it("fails a repeated-token loop", () => {
    const repeated = "one two three four five six seven eight nine ten eleven twelve hello world foo bar baz qux hello world foo bar baz qux";
    const result = scoreResponse(repeated, { latency: 10 });
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("Repeated loop detected");
  });

  it("fails on a refusal pattern", () => {
    const result = scoreResponse("I cannot answer that question for you right now, sorry.", { latency: 10 });
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("refusal pattern matched");
  });

  it("passes a normal response with no reason", () => {
    const result = scoreResponse("The capital of France is Paris and it is well known for the Eiffel Tower.", { latency: 80 });
    expect(result.pass).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.quality).toBe(1);
  });
});