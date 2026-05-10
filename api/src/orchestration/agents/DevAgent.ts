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
    
    // Convert task and input into a goal for JoeAgent
    const goal = input.goal || task;
    const result = await this.joe.ignite(goal, { autoHeal: true });
    
    return {
      ok: result.success,
      output: result.output || result.completedTasks,
      error: result.finalError
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
