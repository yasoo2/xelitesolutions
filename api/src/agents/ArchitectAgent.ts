import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class ArchitectAgent {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    }

    async planProject(goal: string, context: string = ''): Promise<string> {
        const systemPrompt = `You are the Chief Architect AI, a world-class systems designer known for creating "Premium", "Scalable", and "Modern" web applications.
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

        const completion = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: 'system', content: systemPrompt }],
            temperature: 0.7,
        });

        return completion.choices[0].message.content || 'Failed to generate plan.';
    }
}
