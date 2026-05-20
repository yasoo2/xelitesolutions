// Support for dynamic API key from requests (Scoped by User ID)
const userApiKeys = new Map<string, string>();

// Helper to extract JSON tool call from messy LLM text
export function extractToolCallFromText(text: string): { name: string; input: any; reasoning?: string } | null {
  if (!text || text.length < 5) return null;

  // 1. Try to find JSON block in markdown
  const markdownJsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownJsonMatch) {
    try {
      const json = JSON.parse(markdownJsonMatch[1].trim());
      if (json.name && json.input) return json;
    } catch (e) { }
  }

  // 2. Try to find reasoning/thought block to preserve it
  let reasoning: string | undefined = undefined;
  const thoughtMatch = text.match(/<thought>([\s\S]*?)<\/thought>/i) ||
    text.match(/:::thought([\s\S]*?):::/i) ||
    text.match(/<think>([\s\S]*?)<\/think>/i);
  if (thoughtMatch) {
    reasoning = thoughtMatch[1].trim();
  }

  // 3. Try to find the largest valid JSON structure containing "name" and "input"
  try {
    const bracePairs: { start: number; end: number }[] = [];
    let stack = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (stack === 0) start = i;
        stack++;
      } else if (text[i] === '}') {
        stack--;
        if (stack === 0 && start !== -1) {
          bracePairs.push({ start, end: i });
        }
      }
    }

    const candidates = bracePairs
      .sort((a, b) => (b.end - b.start) - (a.end - a.start))
      .map(p => text.substring(p.start, p.end + 1));

    for (const cand of candidates) {
      try {
        const json = JSON.parse(cand);
        if (json.name && json.input) {
          if (reasoning && !json.reasoning) json.reasoning = reasoning;
          return json;
        }
      } catch { }
    }
  } catch (e) { }

  return null;
}

export function setDynamicOpenAIKey(userId: string, key: string) {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (userId) {
    if (!trimmed) userApiKeys.delete(userId);
    else userApiKeys.set(userId, trimmed);
  }
}

export function getApiKeyForUser(userId: string) {
  return userApiKeys.get(userId) || process.env.OPENAI_API_KEY || "";
}


export function getDynamicOpenAIKey(userId: string) {
  return userApiKeys.get(userId) || "";
}

// Support for dynamic provider selection
const userProviders = new Map<string, string>();

export function setActiveProvider(userId: string, provider: string) {
    if (userId) {
        userProviders.set(userId, provider);
    }
}

export function getActiveProvider(userId: string): string {
    return userProviders.get(userId) || 'joe';
}
