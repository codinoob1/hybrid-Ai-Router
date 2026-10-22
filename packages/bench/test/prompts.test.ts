import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadPrompts, DEFAULT_PROMPTS } from "../src/prompts.js";
import { readFile } from "fs/promises";
import { join } from "path";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));
import { readFile as mockedReadFile } from "fs/promises";

describe("loadPrompts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns default prompts when no options provided", async () => {
    const prompts = await loadPrompts({});
    expect(prompts).toEqual([...DEFAULT_PROMPTS]);
    expect(prompts.length).toBeGreaterThan(0);
  });

  it("parses comma-separated prompts from --prompts", async () => {
    const prompts = await loadPrompts({ prompts: "Hello world,How are you?" });
    expect(prompts).toEqual(["Hello world", "How are you?"]);
  });

  it("trims whitespace and filters empty prompts from --prompts", async () => {
    const prompts = await loadPrompts({ prompts: "  Hello  ,  ,  World  " });
    expect(prompts).toEqual(["Hello", "World"]);
  });

  it("throws when --prompts yields no valid prompts", async () => {
    await expect(loadPrompts({ prompts: "   ,  " })).rejects.toThrow();
  });

  it("loads prompts from a JSON file", async () => {
    (mockedReadFile as any).mockResolvedValue(JSON.stringify(["File prompt 1", "File prompt 2"]));
    const prompts = await loadPrompts({ promptFile: "./prompts.json" });
    expect(prompts).toEqual(["File prompt 1", "File prompt 2"]);
    expect(mockedReadFile).toHaveBeenCalledWith("./prompts.json", "utf-8");
  });

  it("throws when prompt file is not a JSON array of strings", async () => {
    (mockedReadFile as any).mockResolvedValue("not json");
    await expect(loadPrompts({ promptFile: "./bad.json" })).rejects.toThrow();
  });

  it("throws when prompt file is an array of non-strings", async () => {
    (mockedReadFile as any).mockResolvedValue(JSON.stringify([1, 2, 3]));
    await expect(loadPrompts({ promptFile: "./bad.json" })).rejects.toThrow();
  });

  it("throws when prompt file is empty", async () => {
    (mockedReadFile as any).mockResolvedValue(JSON.stringify([]));
    await expect(loadPrompts({ promptFile: "./empty.json" })).rejects.toThrow();
  });

  it("prioritizes promptFile over prompts", async () => {
    (mockedReadFile as any).mockResolvedValue(JSON.stringify(["From file"]));
    const prompts = await loadPrompts({ prompts: "From CLI", promptFile: "./prompts.json" });
    expect(prompts).toEqual(["From file"]);
  });
});

describe("DEFAULT_PROMPTS", () => {
  it("is a non-empty array of strings", () => {
    expect(Array.isArray(DEFAULT_PROMPTS)).toBe(true);
    expect(DEFAULT_PROMPTS.length).toBeGreaterThan(0);
    expect(DEFAULT_PROMPTS.every((p) => typeof p === "string")).toBe(true);
  });
});
