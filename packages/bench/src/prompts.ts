import { readFile } from "fs/promises";
import promptsJson from "./defaults/prompts.json";

const DEFAULT_PROMPTS: readonly string[] = promptsJson.prompts;

/**
 * Load prompts from CLI options. Priority:
 * 1. --prompt-file (JSON array of strings)
 * 2. --prompts (comma-separated string)
 * 3. Built-in default suite
 */
export async function loadPrompts(options: {
  prompts?: string;
  promptFile?: string;
}): Promise<string[]> {
  if (options.promptFile) {
    const content = await readFile(options.promptFile, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || !parsed.every((p) => typeof p === "string")) {
      throw new Error(`Invalid prompt file: "${options.promptFile}" must contain a JSON array of strings.`);
    }
    if (parsed.length === 0) {
      throw new Error(`Prompt file "${options.promptFile}" is empty.`);
    }
    return parsed;
  }

  if (options.prompts) {
    const prompts = options.prompts.split(",").map((p) => p.trim()).filter(Boolean);
    if (prompts.length === 0) {
      throw new Error("No prompts provided after parsing --prompts.");
    }
    return prompts;
  }

  return [...DEFAULT_PROMPTS];
}

export { DEFAULT_PROMPTS };
