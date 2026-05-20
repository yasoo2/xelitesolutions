import OpenAI from "openai";
import intelligentRouter from "./llm/intelligent-router";
import { getSystemPrompt } from "./llm/system-prompt";
import { setDynamicOpenAIKey, getDynamicOpenAIKey, getApiKeyForUser, setActiveProvider, getActiveProvider } from "./llm/utils";

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
export async function callLLM(prompt: string, context: any[] = []): Promise<string> {
    return routeToModel([...context, { role: "user", content: prompt }]);
}

/**
 * Generate a descriptive title for a session
 */
export async function generateSessionTitle(text: string): Promise<string> {
    const prompt = `Generate a short (3-5 words), descriptive title for: "${text}". Return ONLY the title text.`;
    const title = await routeToModel([{ role: "user", content: prompt }]);
    return title.replace(/["']/g, "").trim() || "New Session";
}

/**
 * planNextStep() has been decommissioned.
 * Stub added for legacy compatibility.
 */
export async function planNextStep(task: string, context: any[] = []): Promise<any> {
    console.warn('[LLM] planNextStep() is deprecated. Use AgentOrchestrator instead.');
    return { 
        thought: "Orchestration has moved to the Agent Platform.",
        tool: "none",
        input: {}
    };
}
