import OpenAI from "openai";
import { tools } from "../modules/tools/registry";
import {
  freeIntelligenceOptimizer,
  generateSmartResponse,
} from "./llm/free-intelligence-optimizer";
import { GroqProvider } from "./llm/providers/groq";
import { selectToolDefsForProvider, MAX_PROVIDER_TOOLS } from "./llm/tool-picker";
import { getSystemPrompt } from "./llm/system-prompt";
export { getSystemPrompt };
import { extractToolCallFromText, getApiKeyForUser, setDynamicOpenAIKey, getDynamicOpenAIKey } from "./llm/utils";
export { setDynamicOpenAIKey, getDynamicOpenAIKey };

const activeProviders = new Map<string, string>();
export function setActiveProvider(userId: string, provider: string) {
  if (userId) activeProviders.set(userId, provider);
}
export function getActiveProvider(userId: string) {
  return activeProviders.get(userId) || "joe";
}

import intelligentRouter from "./llm/intelligent-router";

const {
  advancedAnalyzeTask,
  routeToModel,
  selectBestModel,
  generateActionPlan,
} = intelligentRouter;

/**
 * High-level LLM call wrapper for specialized tools
 */
export async function callLLM(prompt: string, context: any[] = []): Promise<string> {
    return routeToModel([...context, { role: "user", content: prompt }]);
}

/**
 * Generate a descriptive title for a session based on user input
 */
export async function generateSessionTitle(text: string): Promise<string> {
    const prompt = `Generate a short (3-5 words), descriptive title for a chat session starting with: "${text}". Return ONLY the title text, no quotes, no markdown.`;
    const title = await routeToModel([{ role: "user", content: prompt }]);
    return title.replace(/["']/g, "").trim() || "New Session";
}

const {
  buildConversationContext,
  analyzeContextualIntent,
  matchPatternWithContext,
} = require("./llm/context-engine");
const { longTermMemory } = require("./memory/long-term-memory");

const groq = new GroqProvider();
const GROQ_AVAILABLE = !!process.env.GROQ_API_KEY;

export interface PlanOptions {
  provider?: string;
  apiKey?: string;
  model?: string;
  userId?: string;
  sessionId?: string;
  userText?: string;
  onThought?: (chunk: string) => void;
  onProgress?: (msg: string) => void;
}

export async function planNextStep(
  messages: any[],
  options?: PlanOptions,
): Promise<{ name: string; input: any; reasoning?: string } | null> {
  const onProgress = options?.onProgress;
  const onThought = options?.onThought;
  const providerKey = options?.provider || "auto";

  // Use clean user text if available, or extract from last message
  const userMsg = [...messages].reverse().find((m) => m.role === "user");
  const userText = options?.userText || (typeof userMsg?.content === "string" ? userMsg.content : "");

  // 1. Enterprise Context & Memory
  const userId = options?.userId || "anonymous";
  const sessionId = options?.sessionId || "session_" + Date.now();
  const context = buildConversationContext(userId, sessionId, messages);
  
  // 3. Smart Pattern Matching (No API Call)
  const smartResponse = generateSmartResponse(userText, context);
  if (smartResponse) return { name: "echo", input: { text: smartResponse } };

  const contextMatch = matchPatternWithContext(userText, context);
  if (contextMatch.matched && contextMatch.confidence > 0.8) {
      return { name: contextMatch.action!, input: contextMatch.params };
  }

  // 4. Optimization & Task Analysis
  const optimization = await freeIntelligenceOptimizer.optimizeRequest(userText, context);
  const analysis = optimization.analysis || await advancedAnalyzeTask(userText, messages);

  // 5. Model Selection
  const selectedModel = selectBestModel(analysis);
  console.info(`[LLM] Task: ${analysis.type} | Complexity: ${analysis.complexity} | Model: ${selectedModel.name}`);

  // 6. Execution Loop (Simplified delegation to providers)
  if (providerKey === "gemini" || providerKey === "auto") {
    try {
      const { geminiProvider } = require("./llm/providers/gemini");
      const systemPrompt = getSystemPrompt({ name: userId || "User" });
      const toolDefs = selectToolDefsForProvider(tools, MAX_PROVIDER_TOOLS, messages);
      
      const completion = await geminiProvider.chatWithTools([
        { role: "system", content: systemPrompt },
        ...messages
      ], toolDefs);

      const message = completion.choices[0]?.message;
      if (message?.tool_calls?.length > 0) {
        const tc = message.tool_calls[0];
        return { name: tc.function.name, input: JSON.parse(tc.function.arguments) };
      }
      
      if (message?.content) {
        return extractToolCallFromText(message.content) || { name: "echo", input: { text: message.content } };
      }
    } catch (e) {
      console.error("[LLM] Provider Error:", e);
    }
  }

  // Fallback to echo if everything fails
  return { name: "echo", input: { text: "I encountered an issue processing that. Can you rephrase?" } };
}
