export class GroqProvider {
    private apiKey: string;
    private baseUrl = 'https://api.groq.com/openai/v1/chat/completions';

    constructor() {
        this.apiKey = process.env.GROQ_API_KEY || ''; // Will rely on user providing it or system default if available
    }

    async chatComplete(messages: any[], model: string = 'llama-3.1-70b-versatile'): Promise<string> {
        if (!this.apiKey) {
            throw new Error('GROQ_API_KEY not found');
        }

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 4096 // Generous limit for free model
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Groq API Error (${response.status}): ${errText}`);
            }

            const data: any = await response.json();
            return data.choices?.[0]?.message?.content || '';

        } catch (error: any) {
            console.error('[Groq] Chat failed:', error.message);
            throw error;
        }
    }
}
