import { MemoryItem } from '../models/memoryItem';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy',
  baseURL: process.env.OPENAI_BASE_URL,
});

export class MemoryService {
  /**
   * Search for relevant memories based on text similarity (simple keyword matching for now, 
   * ideally vector search but avoiding vector DB complexity for this MVP).
   */
  static async searchMemories(userId: string, text: string, limit = 5): Promise<string[]> {
    if (!userId) return [];
    
    // Simple heuristic: match keywords from text
    // In a real system, we'd use embeddings.
    const keywords = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (keywords.length === 0) return [];

    const regex = new RegExp(keywords.join('|'), 'i');
    
    const items = await MemoryItem.find({
      userId,
      scope: 'user',
      $or: [
        { key: { $regex: regex } },
        { value: { $regex: regex } } // Assuming value is stored as string for simple facts
      ]
    })
    .sort({ updatedAt: -1 })
    .limit(limit);

    return items.map(item => `${item.key}: ${item.value}`);
  }

  static async extractAndSaveMemories(userId: string, userText: string, options?: any) {
    if (!userId || !userText) return;

    try {
      let client = openai;
      if (options?.apiKey) {
        client = new OpenAI({
          apiKey: options.apiKey,
          baseURL: options.baseUrl || process.env.OPENAI_BASE_URL,
        });
      }

      const completion = await client.chat.completions.create({
        model: options?.model || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a Memory Extractor. Your job is to extract permanent user facts from the conversation.
            
Rules:
- Extract ONLY facts that are useful to remember for future conversations (e.g., name, preferences, tech stack, job, specific instructions).
- Ignore transient info (e.g., "write a function", "fix this bug").
- Output a JSON object with a "facts" array. Each fact has "key" (short category) and "value" (the fact).
- If no relevant facts, return empty array.

Example:
User: "I am a React developer and I hate TypeScript."
Output: { "facts": [{ "key": "role", "value": "React Developer" }, { "key": "preference", "value": "Dislikes TypeScript" }] }
`
          },
          { role: 'user', content: userText }
        ],
        response_format: { type: 'json_object' }
      });

      const content = completion.choices[0].message.content;
      if (!content) return;

      const result = JSON.parse(content);
      if (result.facts && Array.isArray(result.facts)) {
        for (const fact of result.facts) {
          // Check if fact already exists to avoid dupes (naive check)
          const exists = await MemoryItem.findOne({
            userId,
            scope: 'user',
            key: fact.key,
            value: fact.value
          });

          if (!exists) {
            await MemoryItem.create({
              scope: 'user',
              userId,
              key: fact.key,
              value: fact.value,
              sessionId: options?.sessionId // Optional link to origin session
            });
            console.log(`[Memory] Saved fact: ${fact.key} = ${fact.value}`);
          }
        }
      }

    } catch (err) {
      console.error('[Memory] Extraction failed:', err);
    }
  }
}
