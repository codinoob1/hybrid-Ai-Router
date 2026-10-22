import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@hybrid-ai/core": path.resolve(__dirname, "../core/src/index.ts"),
      "@hybrid-ai/adapter-webllm": path.resolve(__dirname, "../adapter-webllm/src/index.ts"),
      "@hybrid-ai/adapter-transformers": path.resolve(__dirname, "../adapter-transformers/src/index.ts"),
      "@hybrid-ai/adapter-cloud": path.resolve(__dirname, "../adapter-Cloud/src/index.ts"),
    },
  },
});
