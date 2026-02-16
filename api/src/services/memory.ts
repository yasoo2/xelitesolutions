import { MemoryItem } from '../models/memoryItem';
import { ConversationSummary } from '../models/conversationSummary';
import { routeToModel } from '../llm/intelligent-router';

// In-memory message buffer per user (for summarization)
const userMessageBuffers: Map<string, { messages: string[], sessionId?: string }> = new Map();
const SUMMARY_THRESHOLD = 10; // Summarize every 10 messages

export class MemoryService {
  /**
   * Track a message for later summarization
   * Each user has their own isolated buffer
   */
  static async trackMessage(userId: string, message: string, role: 'user' | 'assistant', sessionId?: string, options?: any) {
    if (!userId || !message) return;

    // Initialize buffer for this user if not exists
    if (!userMessageBuffers.has(userId)) {
      userMessageBuffers.set(userId, { messages: [], sessionId });
    }

    const buffer = userMessageBuffers.get(userId)!;
    buffer.messages.push(`${role === 'user' ? '👤' : '🤖'}: ${message.substring(0, 500)}`);
    buffer.sessionId = sessionId;

    // Check if we should summarize
    if (buffer.messages.length >= SUMMARY_THRESHOLD) {
      await this.summarizeAndSave(userId, buffer.messages, sessionId, options);
      buffer.messages = []; // Clear buffer after summarization
    }
  }

  /**
   * Summarize messages and save to database
   * Completely isolated per userId
   */
  static async summarizeAndSave(userId: string, messages: string[], sessionId?: string, options?: any) {
    if (!userId || messages.length === 0) return;

    try {
      const conversationText = messages.join('\n');

      const content = await routeToModel([
        {
          role: 'system',
          content: 'أجب فقط بصيغة JSON: {"summary":"...","topics":["..."]} بدون أي نص إضافي.'
        },
        {
          role: 'user',
          content: `لخّص المحادثة التالية في 2-3 جمل قصيرة، واستخرج 3-5 مواضيع رئيسية:\n\n${conversationText}`
        }
      ], undefined, { groq: options?.apiKey, anthropic: options?.apiKey, openai: options?.apiKey }); // Basic mapping of keys
      if (!content) return;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : content);

      // Save summary - completely isolated by userId
      await ConversationSummary.create({
        userId,
        sessionId,
        summary: result.summary || 'ملخص غير متوفر',
        messageCount: messages.length,
        topics: result.topics || []
      });

      console.log(`[Memory] 📝 Saved summary for user ${userId}: ${messages.length} messages`);

    } catch (err) {
      console.error('[Memory] Summarization failed:', err);
    }
  }

  /**
   * Get persistent context for a user
   * Returns last 3 summaries - completely isolated per user
   */
  static async getPersistentContext(userId: string, limit = 3): Promise<string> {
    if (!userId) return '';

    try {
      const summaries = await ConversationSummary.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      if (summaries.length === 0) return '';

      const contextParts = summaries.reverse().map((s, i) =>
        `[جلسة سابقة ${i + 1}]: ${s.summary}`
      );

      return '\n\n📚 **ذاكرة المحادثات السابقة:**\n' + contextParts.join('\n');
    } catch (err) {
      console.error('[Memory] Context retrieval failed:', err);
      return '';
    }
  }

  /**
   * Force flush any pending messages for a user
   * Useful when session ends
   */
  static async flushUserBuffer(userId: string, options?: any) {
    const buffer = userMessageBuffers.get(userId);
    if (buffer && buffer.messages.length > 0) {
      await this.summarizeAndSave(userId, buffer.messages, buffer.sessionId, options);
      userMessageBuffers.delete(userId);
    }
  }

  static async searchMemories(userId: string, text: string, limit = 5): Promise<string[]> {
    if (!userId) return [];

    const normalized = String(text || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ');

    const keywords = normalized
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length >= 2)
      .slice(0, 12);

    if (keywords.length === 0) {
      const items = await MemoryItem.find({ userId, scope: 'user' })
        .sort({ updatedAt: -1 })
        .limit(limit);
      return items.map(item => `${item.key}: ${typeof item.value === 'string' ? item.value : JSON.stringify(item.value)}`);
    }

    const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(escaped.join('|'), 'i');

    const items = await MemoryItem.find({
      userId,
      scope: 'user',
      $or: [
        { key: { $regex: regex } },
        { value: { $regex: regex } }
      ]
    })
      .sort({ updatedAt: -1 })
      .limit(limit);

    if (items.length === 0) {
      const fallback = await MemoryItem.find({ userId, scope: 'user' })
        .sort({ updatedAt: -1 })
        .limit(limit);
      return fallback.map(item => `${item.key}: ${typeof item.value === 'string' ? item.value : JSON.stringify(item.value)}`);
    }

    return items.map(item => `${item.key}: ${typeof item.value === 'string' ? item.value : JSON.stringify(item.value)}`);
  }

  static async extractAndSaveMemories(userId: string, userText: string, options?: any) {
    if (!userId || !userText) return;

    // Also track for summarization
    await this.trackMessage(userId, userText, 'user', options?.sessionId, options);

    try {
      const content = await routeToModel([
        {
          role: 'system',
          content: 'Return ONLY valid JSON: {"facts":[{"key":"string","value":"string"}]}'
        },
        {
          role: 'user',
          content: `Extract ONLY permanent user facts/preferences/instructions worth remembering. Ignore transient tasks. If none, return {"facts":[]}.\n\nText:\n${userText}`
        }
      ], undefined, { groq: options?.apiKey, anthropic: options?.apiKey, openai: options?.apiKey });
      if (!content) return;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : content);
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
            // console.info(`[Memory] Saved fact: ${fact.key} = ${fact.value}`);
          }
        }
      }

    } catch (err) {
      console.error('[Memory] Extraction failed:', err);
    }
  }

  /**
   * Track assistant response for summarization
   */
  static async trackAssistantResponse(userId: string, response: string, sessionId?: string, options?: any) {
    if (!userId || !response) return;
    await this.trackMessage(userId, response, 'assistant', sessionId, options);
  }
}
