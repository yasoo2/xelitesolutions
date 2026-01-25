
import { PollinationsProvider } from './pollinations';
import { OpenRouterProvider } from './openrouter';
import { HuggingFaceProvider } from './huggingface';
import { GroqProvider } from './groq';

// Singleton instances
export const pollinationsProvider = new PollinationsProvider();
export const openRouterProvider = new OpenRouterProvider();
export const huggingfaceProvider = new HuggingFaceProvider();
export const groqProvider = new GroqProvider();

export default {
    pollinations: pollinationsProvider,
    openrouter: openRouterProvider,
    huggingface: huggingfaceProvider,
    groq: groqProvider
};
