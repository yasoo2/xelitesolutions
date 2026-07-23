import { BaseAgent } from './BaseAgent';
import { JoeAgent } from '../../core/agents/JoeAgent-V2';

export class DevAgent extends BaseAgent {
  public readonly name = "DevAgent-V2";
  public readonly type = "Dev";
  private joe: JoeAgent;

  constructor(rootDir: string = process.cwd()) {
    super();
    this.joe = new JoeAgent(rootDir);
  }

  public async execute(task: string, input: any, context?: any): Promise<{ ok: boolean; output: any; error?: string }> {
    console.log(`[DevAgent] Executing: ${task}`);
    
    // Direct-answer: greetings / conversational tasks answered directly via central_answer,
    // NOT through the tool-picker (which would misroute to browser_run and spiral into recovery).
    if (/^(answering|respond to)\s*:/i.test(task) || (context?.tool === 'central_answer')) {
      const { executeTool } = await import('../../modules/services/ToolService');
      const question = input?.question || task.replace(/^(answering|respond to)\s*:\s*/i, '').trim() || task;
      const answer = await executeTool('central_answer', { question }, context);
      return { ok: answer.ok, output: answer.output, error: answer.error };
    }

    // Delegate to the browser ONLY for real web navigation (URL / "open the website").
    const tLower = task.toLowerCase();
    const isBrowserTask = /https?:\/\//.test(tLower)
      || /\bwww\.[a-z0-9-]+\.[a-z]{2,}/.test(tLower)
      || /(navigate to|browse to|open (the )?(web ?site|url|page|link)|go to (the )?(web ?site|url|https?))/.test(tLower)
      || /(افتح|اذهب)\s*(الموقع|الرابط|صفحة|https?)/.test(task);
    if (isBrowserTask) {
        console.log(`[DevAgent] Redirecting browser task to browser_run tool...`);
        const { executeTool } = await import('../../modules/services/ToolService');
        const result = await executeTool('browser_run', { 
            sessionId: input?.sessionId || context?.sessionId || 'default-session',
            instructionText: task
        }, context);
        return {
            ok: result.ok,
            output: result.output,
            error: result.error
        };
    }

    // Pass traceId down if present in context
    const result = await this.joe.execute(task, input, context);
    
    return {
      ok: result.ok,
      output: result.output,
      error: result.error
    };
  }

  public canHandle(task: string): number {
    const t = task.toLowerCase();
    let score = 0.5; // Base score
    if (t.includes('code') || t.includes('fix') || t.includes('refactor') || t.includes('build')) score += 0.4;
    if (t.includes('feature') || t.includes('implement')) score += 0.3;
    return Math.min(score, 1);
  }
}
