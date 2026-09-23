import { RouterConfig } from '@hybrid-ai/core';

interface UseHybridAIOptions extends RouterConfig {
}
interface UseHybridAIResult {
    response: string;
    isLoading: boolean;
    source: "local" | "cloud" | null;
    error: Error | null;
}
declare function useHybridAI(prompt: string | null, config: UseHybridAIOptions): UseHybridAIResult;

export { type UseHybridAIOptions, type UseHybridAIResult, useHybridAI };
