export abstract class BaseAgent {
  public abstract readonly name: string;
  public abstract readonly type: string;

  /**
   * Executes a task assigned by the orchestrator
   */
  public abstract execute(task: string, input: any, context?: any): Promise<{ ok: boolean; output: any; error?: string }>;

  /**
   * Reports status or capability score for a specific task
   */
  public abstract canHandle(task: string): number;
}
