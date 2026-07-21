import { BaseAgent } from './BaseAgent';
import { executeTool } from '../../modules/services/ToolService';

export class SecurityAgent extends BaseAgent {
  public readonly name = "Sentinel-Security";
  public readonly type = "Security";

  public async execute(task: string, input: any, context?: any): Promise<{ ok: boolean; output: any; error?: string }> {
    console.log(`[SecurityAgent] Auditing: ${task}`);
    
    // Leverage specialized security tools
    const result = await executeTool('security_scan', { target: input.path || '.', depth: 'deep' }, {
      sessionId: context?.sessionId,
      workspaceId: context?.workspaceId,
      userId: context?.userId,
      traceId: context?.traceId,
    });
    
    return {
      ok: result.ok,
      output: result.output,
      error: result.error
    };
  }

  public canHandle(task: string): number {
    const t = task.toLowerCase();
    if (t.includes('security') || t.includes('audit') || t.includes('vulnerability') || t.includes('auth')) return 0.9;
    return 0.2;
  }
}
