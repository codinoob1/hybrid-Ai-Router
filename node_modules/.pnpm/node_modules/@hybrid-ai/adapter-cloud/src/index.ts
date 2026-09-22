// packages/adapter-cloud/src/index.ts
import type { CloudRuntime } from '@hybrid-ai/core';
import type { CloudProviderConfig } from './types';
import { openaiGenerate } from './providers/openai';
import { anthropicGenerate } from './providers/anthropic';
import { geminiGenerate } from './providers/gemini';

export function createCloudAdapter(config: CloudProviderConfig): CloudRuntime {
  return {
    async generate(prompt: string): Promise<string> {
      switch (config.provider) {
        case 'openai':
          return openaiGenerate(prompt, config);
        case 'anthropic':
          return anthropicGenerate(prompt, config);
        case 'gemini':
          return geminiGenerate(prompt, config);
        case 'custom':
          return openaiGenerate(prompt, config); // assume OpenAI-compatible shape
        default: {
          const _exhaustive: never = config;
          throw new Error('Unknown cloud provider');
        }
      }
    },
  };
}