import { useState, useEffect, useRef } from "react";
import { createRouter, type RouterConfig, type GenerateResult } from "@hybrid-ai/core";

export interface UseHybridAIOptions extends RouterConfig {}

export interface UseHybridAIResult {
  response: string;
  isLoading: boolean;
  source: "local" | "cloud" | null;
  error: Error | null;
}

export function useHybridAI(prompt: string | null, config: UseHybridAIOptions): UseHybridAIResult {
  const routerRef = useRef<ReturnType<typeof createRouter> | null>(null);
  const [state, setState] = useState<UseHybridAIResult>({
    response: "",
    isLoading: false,
    source: null,
    error: null,
  });

  // create + init the router once
  useEffect(() => {
    routerRef.current = createRouter(config);
    routerRef.current.init();
    // config is intentionally not in deps — router should be created once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  
  useEffect(() => {
    if (!prompt || !routerRef.current) return;

    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    routerRef.current
      .generate(prompt)
      .then((result: GenerateResult) => {
        if (cancelled) return;
        setState({ response: result.text, isLoading: false, source: result.source, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState((s) => ({ ...s, isLoading: false, error: err }));
      });

    return () => {
      cancelled = true;
    };
  }, [prompt]);

  return state;
}