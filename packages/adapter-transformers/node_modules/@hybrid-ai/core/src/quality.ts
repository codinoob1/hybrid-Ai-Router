
export interface QualityContext{
    latency: number;
}

export interface QualityResult{
    quality: number;
    context: QualityContext;
    reason?: string;
    pass: boolean;
}

const MAX_LATENCY_MS = 1000; // 1 second
const MIN_LENGTH = 10;
const REFUSAL_PATTERNS = [/^i (can'?t|cannot)\b/i, /^sorry,? i/i];


export function scoreResponse(text: string, context: QualityContext): QualityResult{
    const trimmed = text.trim();

    if(trimmed.length < MIN_LENGTH){
        return{
            reason: "Response too short",
            quality: 0,
            context,
            pass: false
        };
    };
    if(context.latency > MAX_LATENCY_MS){
        return {
            reason: "Response too slow",
            quality: 0,
            context,
            pass: false
        };
    }
    if (REFUSAL_PATTERNS.some((p) => p.test(trimmed))) {
            
        return { pass: false, reason: 'refusal pattern matched' , quality: 0, context};
    } 
    if(hasRepeatedLoop(trimmed)){
        return {
            reason: "Repeated loop detected",  
            quality: 0,
            context,
            pass: false
        }
    }

    return {
        quality: 1,
        context,
        pass: true
    };
}
function hasRepeatedLoop(text: string): boolean {
  const words = text.split(/\s+/);
  if (words.length < 12) return false;
  const lastSix = words.slice(-6).join(' ');
  const prevSix = words.slice(-12, -6).join(' ');
  return lastSix === prevSix;
}