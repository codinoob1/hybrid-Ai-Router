// src/useHybridAI.ts
import { useState, useEffect, useRef } from "react";
import { createRouter } from "@hybrid-ai/core";
function useHybridAI(prompt, config) {
  const routerRef = useRef(null);
  const [state, setState] = useState({
    response: "",
    isLoading: false,
    source: null,
    error: null
  });
  useEffect(() => {
    routerRef.current = createRouter(config);
    routerRef.current.init();
  }, []);
  useEffect(() => {
    if (!prompt || !routerRef.current) return;
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    routerRef.current.generate(prompt).then((result) => {
      if (cancelled) return;
      setState({ response: result.text, isLoading: false, source: result.source, error: null });
    }).catch((err) => {
      if (cancelled) return;
      setState((s) => ({ ...s, isLoading: false, error: err }));
    });
    return () => {
      cancelled = true;
    };
  }, [prompt]);
  return state;
}
export {
  useHybridAI
};
