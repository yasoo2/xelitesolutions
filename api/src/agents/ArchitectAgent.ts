import { pollinationsProvider } from '../llm/providers/registry';

export class ArchitectAgent {

    constructor() {
        // No API key needed for Pollinations
    }

    async planProject(goal: string, context: string = ''): Promise<string> {
        const systemPrompt = `You are the Chier Architect AI, a world-class systems designer known for creating "Premium", "Scalable", and "Modern" web applications.
Your goal is to design a robust architecture for a user request that WOWS the user.

Output a Markdown document containing:
1.  **Project Structure**: A full file tree of the proposed solution.
2.  **Key Components**: Description of major modules.
3.  **Technology Stack**: Recommended libraries. Use modern, popular, and robust choices (e.g., React, Tailwind, Node.js, Lucide Icons).
4.  **Implementation Steps**: Step-by-step guide for the coding agent.

**CRITICAL GUIDELINES**:
- Focus on "Visual Excellence" and "User Experience".
- Suggest modern UI patterns (Glassmorphism, animations, clean layouts).
- Ensure the architecture is modular and maintainable.
- Do NOT write code. Write the ARCHITECTURE.

User Goal: ${goal}
Context: ${context}`;

        try {
            const response = await pollinationsProvider.chatComplete([
                { role: 'system', content: systemPrompt }
            ], 'openai'); // 'openai' model alias in Pollinations usually maps to GPT-4o or equivalent

            return response || 'Failed to generate plan.';
        } catch (e: any) {
            console.error('[Architect] Planning failed:', e.message);
            return 'Failed to generate plan due to AI provider error.';
        }
    }
}
