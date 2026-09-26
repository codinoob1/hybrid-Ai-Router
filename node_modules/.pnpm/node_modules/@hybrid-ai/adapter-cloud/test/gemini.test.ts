import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geminiGenerate } from "../src/providers/gemini.js";

const fetchMock = vi.fn();

function mockOk(body: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  });
}

function mockError(status: number, message: string) {
  fetchMock.mockResolvedValue({
    ok: false,
    status,
    statusText: "Error",
    json: async () => ({ error: { message } }),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("geminiGenerate", () => {
  it("posts to generateContent with the model and key in the URL", async () => {
    mockOk({ candidates: [{ content: { parts: [{ text: "gem " }, { text: "answer" }] } }] });

    const text = await geminiGenerate("hi", { provider: "gemini", apiKey: "key-123", model: "gemini-2.0-flash" });

    expect(text).toBe("gem answer");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=key-123",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
    });
  });

  it("throws with the API error message on a non-OK response", async () => {
    mockError(400, "bad request");

    await expect(geminiGenerate("hi", { provider: "gemini", apiKey: "key-123", model: "gemini-2.0-flash" })).rejects.toThrow(
      "Gemini request failed (400): bad request",
    );
  });

  it("returns an empty string for an empty/malformed response", async () => {
    mockOk({ candidates: [] });

    await expect(geminiGenerate("hi", { provider: "gemini", apiKey: "key-123", model: "gemini-2.0-flash" })).resolves.toBe("");
  });
});