import type {LanguageModelMiddleware} from 'ai';

// Caller-supplied settings must not override the evaluation's intended cap.
// Keep the governing 1,200-token observed-output assertion unchanged.
export const artifactEvalOutputMiddleware:LanguageModelMiddleware = {
 transformParams:async({params})=>({...params,
  maxOutputTokens:Math.min(params.maxOutputTokens??1000,1000),
 }),
};
