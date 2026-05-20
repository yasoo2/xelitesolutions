import { PollinationsProvider } from './pollinations';
import { OpenRouterProvider } from './openrouter';
import { HuggingFaceProvider } from './huggingface';
import { GroqProvider } from './groq';
import { LocalProvider } from './local';
import { GeminiProvider, geminiProvider } from './gemini';
import { DeepSeekProvider, deepSeekProvider } from './deepseek';
import { OpenAIProvider, openAIProvider } from './openai';

// Singleton instances
export const pollinationsProvider = new PollinationsProvider();
export const openRouterProvider = new OpenRouterProvider();
export const huggingfaceProvider = new HuggingFaceProvider();
export const groqProvider = new GroqProvider();
export const localProvider = new LocalProvider();
export { geminiProvider, GeminiProvider, deepSeekProvider, openAIProvider, OpenAIProvider };

export default {
    pollinations: pollinationsProvider,
    openrouter: openRouterProvider,
    huggingface: huggingfaceProvider,
    groq: groqProvider,
    local: localProvider,
    gemini: geminiProvider,
    deepseek: deepSeekProvider,
    openai: openAIProvider
};
