import OpenAI from "openai";
import intelligentRouter from "./llm/intelligent-router";
import { getSystemPrompt } from "./llm/system-prompt";
import { setDynamicOpenAIKey, getDynamicOpenAIKey, getApiKeyForUser, setActiveProvider, getActiveProvider } from "./llm/utils";
import { readModelJson, readModelJsonObject } from "../shared/utils/json";

export { 
    setDynamicOpenAIKey, 
    getDynamicOpenAIKey,
    getSystemPrompt,
    setActiveProvider,
    getActiveProvider
};

const {
  advancedAnalyzeTask,
  routeToModel,
  selectBestModel,
} = intelligentRouter;

/**
 * Unified LLM Entry Point for Agents
 */
export async function callLLM(prompt: string, context: any[] = [], routingContext?: any): Promise<string> {
    return routeToModel(
        [...context, { role: "user", content: prompt }],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        routingContext
    );
}

/**
 * Generate a descriptive title for a session
 */
export async function generateSessionTitle(text: string): Promise<string> {
    const prompt = `Generate a short (3-5 words), descriptive title for: "${text}". Return ONLY the title text.`;
    const title = await routeToModel([{ role: "user", content: prompt }]);
    return title.replace(/["']/g, "").trim() || "New Session";
}

export async function planNextStep(messagesOrTask: string | any[], opts?: any): Promise<any> {
    const messages = Array.isArray(messagesOrTask) 
      ? messagesOrTask 
      : [{ role: 'user', content: String(messagesOrTask || '') }];
    const response = await routeToModel(
      messages,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      typeof opts === 'object' ? opts : undefined
    );
    // Read through the shared reader (shared/utils/json), as every model-JSON
    // reader does: the greedy `/\{[\s\S]*\}/` this was glued an answer to any
    // brace in a sentence after it, and every browser-runner step that came
    // back that way was thrown away as «no actions» (round 22, W7). The step
    // asked for carries `actions`; an object without them is still read.
    if (typeof response !== 'string') return response;
    const step = readModelJson(response, parsed => (parsed && typeof parsed === 'object' && Array.isArray(parsed.actions) ? parsed : undefined))
      ?? readModelJsonObject(response);
    return step ?? {
        thought: String(response || ''),
        actions: []
      };
}
