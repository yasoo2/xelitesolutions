import { PollinationsProvider } from './pollinations';
import { OpenRouterProvider } from './openrouter';
import { HuggingFaceProvider } from './huggingface';
import { GroqProvider } from './groq';
import { LocalProvider } from './local';
import { GeminiProvider, geminiProvider } from './gemini';
import { DeepSeekProvider, deepSeekProvider } from './deepseek';
import { OpenAIProvider, openAIProvider } from './openai';
import { CerebrasProvider, cerebrasProvider } from './cerebras';
import { MistralProvider, mistralProvider } from './mistral';
import { LLM7Provider, llm7Provider } from './llm7';
import { DuckAIProvider, duckAIProvider } from './duckai';

// Singleton instances
export const pollinationsProvider = new PollinationsProvider();
export const openRouterProvider = new OpenRouterProvider();
export const huggingfaceProvider = new HuggingFaceProvider();
export const groqProvider = new GroqProvider();
export const localProvider = new LocalProvider();
export { geminiProvider, GeminiProvider, deepSeekProvider, openAIProvider, OpenAIProvider };
export { cerebrasProvider, CerebrasProvider, mistralProvider, MistralProvider };
export { llm7Provider, LLM7Provider };
export { duckAIProvider, DuckAIProvider };

export default {
    pollinations: pollinationsProvider,
    openrouter: openRouterProvider,
    huggingface: huggingfaceProvider,
    groq: groqProvider,
    local: localProvider,
    gemini: geminiProvider,
    deepseek: deepSeekProvider,
    openai: openAIProvider,
    cerebras: cerebrasProvider,
    mistral: mistralProvider,
    llm7: llm7Provider,
    duckai: duckAIProvider
};
