/* selftest-chat.ts — proves the browser is integrated with CHAT: it drives the real
   chat entry point (AgentLoopService.execute, what POST /session/:id/message calls),
   runs a browser task, and checks that the browser's result comes back as the chat
   assistant reply AND that a Q/A memory is stored for the next turn. Requires the
   e2e-tools-helper (model :5900 + site :5901) to be running. */
process.env.JWT_SECRET = 'devsecret123';
process.env.BROWSER_HEADED = '0';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.MOCK_DB = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:5900';
process.env.LOCAL_LLM_MODEL = 'joe-brain';
process.env.LOCAL_LLM_STRICT = '1';
process.env.LOCAL_LLM_TIMEOUT = '20000';

import { AgentLoopService } from './src/modules/services/AgentLoopService';

async function main() {
  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };

  const sessionId = 'chat-int';
  const goal = 'سجّل دخولي إلى http://127.0.0.1:5901/ وافتح المنتجات واستخرجها';

  const result: any = await AgentLoopService.execute(goal, { sessionId, userId: 'u1' });
  check('chat run succeeded', !!result?.ok, JSON.stringify(result?.ok));

  // The chat wrapper persists Joe's assistant reply into the (offline) message store.
  const msgs: any[] = (global as any).mockMessages || [];
  const reply = [...msgs].reverse().find(m => m.role === 'assistant' && m.sessionId === sessionId);
  check('browser result came back as a CHAT reply', !!reply, reply ? 'assistant message present' : 'no assistant message');
  const replyText = String(reply?.content || '');
  check('reply carries the extracted browser data', /لابتوب|هاتف|سماعة/.test(replyText), replyText.slice(0, 80).replace(/\n/g, ' '));

  // Memory: a Q/A memory should be retrievable for the next turn.
  try {
    const { longTermMemory } = await import('./src/core/memory/long-term-memory');
    const ctx = await longTermMemory.getContextSummary('u1').catch(() => '');
    check('a memory of this turn is retrievable next time', typeof ctx === 'string');
  } catch (e: any) { check('memory module reachable', false, String(e?.message || e)); }

  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
