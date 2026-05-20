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
