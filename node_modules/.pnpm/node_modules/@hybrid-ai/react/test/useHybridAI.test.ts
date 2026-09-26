import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@hybrid-ai/core", () => ({
  createRouter: vi.fn(),
}));

import { createRouter } from "@hybrid-ai/core";
import { useHybridAI } from "../src/useHybridAI.js";

const mockCreateRouter = vi.mocked(createRouter);
const config = { adapters: {}, cloud: { generate: async () => "" } } as never;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function installRouter() {
  const generate = vi.fn();
  mockCreateRouter.mockImplementation(() => {
    return { init: vi.fn().mockResolvedValue(undefined), generate };
  });
  return generate;
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => vi.clearAllMocks());

describe("useHybridAI", () => {
  it("idles until a prompt is provided", () => {
    installRouter();
    const { result } = renderHook(({ p }) => useHybridAI(p, config), { initialProps: { p: null } });

    expect(result.current).toEqual({
      response: "",
      isLoading: false,
      source: null,
      error: null,
    });
  });

  it("returns a generated response with its source", async () => {
    const generate = installRouter();
    generate.mockResolvedValue({ text: "local!", source: "local", modelId: "qwen" });

    const { result } = renderHook(({ p }) => useHybridAI(p, config), { initialProps: { p: "hello" } });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.response).toBe("local!"));
    expect(result.current.source).toBe("local");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("surfaces generate errors", async () => {
    const generate = installRouter();
    generate.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(({ p }) => useHybridAI(p, config), { initialProps: { p: "hello" } });

    await waitFor(() => expect(result.current.error?.message).toBe("boom"));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.response).toBe("");
  });

  it("ignores a stale in-flight response when the prompt changes", async () => {
    const generate = installRouter();
    const first = deferred<{ text: string; source: "local" | "cloud" }>();
    const second = deferred<{ text: string; source: "local" | "cloud" }>();
    generate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ p }) => useHybridAI(p, config), { initialProps: { p: "first" } });

    expect(generate).toHaveBeenCalledWith("first");

    await act(async () => {
      rerender({ p: "second" });
    });
    expect(generate).toHaveBeenLastCalledWith("second");

    await act(async () => {
      second.resolve({ text: "fresh answer", source: "cloud" });
    });
    expect(result.current.response).toBe("fresh answer");
    expect(result.current.source).toBe("cloud");

    await act(async () => {
      first.resolve({ text: "stale answer", source: "local" });
    });
    expect(result.current.response).toBe("fresh answer");
    expect(result.current.source).toBe("cloud");
  });
});