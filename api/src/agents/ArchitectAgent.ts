import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class ArchitectAgent {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    }

    async planProject(goal: string, context: string = ''): Promise<string> {
        const systemPrompt = `You are the Chief Architect AI.
Your goal is to design a robust, scalable architecture for a user request.
Output a Markdown document containing:
1.  **Project Structure**: A full file tree of the proposed solution.
2.  **Key Components**: Description of major modules.
3.  **Technology Stack**: Recommended libraries.
4.  **Implementation Steps**: Step-by-step guide for the coding agent.

Do NOT write code. Write the ARCHITECTURE.
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
