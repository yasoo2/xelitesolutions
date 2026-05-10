import OpenAI from "openai";
import intelligentRouter from "./llm/intelligent-router";
import { getSystemPrompt } from "./llm/system-prompt";
import { setDynamicOpenAIKey, getDynamicOpenAIKey, getApiKeyForUser } from "./llm/utils";

export { 
    setDynamicOpenAIKey, 
    getDynamicOpenAIKey,
    getSystemPrompt
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
 * NOTE: planNextStep() has been decommissioned.
 * All autonomous orchestration is now handled by AgentOrchestrator.ts
 */
