/**
 * Advanced Tools Integration Module
 * ===================================
 * 
 * This module integrates advanced tools into the JOE system's registry
 * and provides orchestration capabilities for complex multi-tool workflows.
 */

import { advancedTools } from './advanced-tools';
import { ToolDefinition } from './types';

/**
 * Integration Manager for Advanced Tools
 * Handles registration, orchestration, and execution of advanced tools
 */
export class AdvancedToolsIntegration {
  private registeredTools: Map<string, ToolDefinition> = new Map();
  private toolDependencies: Map<string, string[]> = new Map();
  private executionHistory: any[] = [];

  /**
   * Initialize and register all advanced tools
   */
  public initialize(): void {
    console.log('Initializing Advanced Tools Integration...');
    
    for (const tool of advancedTools) {
      this.registerTool(tool);
    }
    
    this.setupDependencies();
    console.log(`✓ Registered ${this.registeredTools.size} advanced tools`);
  }

  /**
   * Register a single tool
   */
  private registerTool(tool: ToolDefinition): void {
    this.registeredTools.set(tool.name, tool);
  }

  /**
   * Setup tool dependencies for complex workflows
   */
  private setupDependencies(): void {
    // Video generation depends on image generation
    this.toolDependencies.set('video_generate', ['image_generate_advanced']);
    
    // Data visualization depends on data analysis
    this.toolDependencies.set('data_visualize', ['data_analyze']);
    
    // Security scan depends on code analysis
    this.toolDependencies.set('security_scan', ['analyze_codebase']);
    
    // Deployment depends on testing
    this.toolDependencies.set('app_deploy', ['test_performance', 'security_scan']);
  }

  /**
   * Get all registered advanced tools
   */
  public getTools(): ToolDefinition[] {
    return Array.from(this.registeredTools.values());
  }

  /**
   * Get a specific tool by name
   */
  public getTool(name: string): ToolDefinition | undefined {
    return this.registeredTools.get(name);
  }

  /**
   * Check if a tool exists
   */
  public hasTool(name: string): boolean {
    return this.registeredTools.has(name);
  }

  /**
   * Get tool dependencies
   */
  public getDependencies(toolName: string): string[] {
    return this.toolDependencies.get(toolName) || [];
  }

  /**
   * Execute a tool with dependency resolution
   */
  public async executeTool(
    toolName: string,
    input: any,
    context?: any
  ): Promise<any> {
    const tool = this.getTool(toolName);
    
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Check dependencies
    const dependencies = this.getDependencies(toolName);
    const dependencyResults: any = {};

    for (const depName of dependencies) {
      if (context?.results?.[depName]) {
        dependencyResults[depName] = context.results[depName];
      }
    }

    // Execute the tool
    const result = await tool.execute(input);

    // Record execution
    this.executionHistory.push({
      tool: toolName,
      input,
      output: result,
      timestamp: new Date().toISOString(),
      dependencies: dependencyResults
    });

    return result;
  }

  /**
   * Execute a workflow of multiple tools
   */
  public async executeWorkflow(
    workflow: Array<{ tool: string; input: any }>,
    options?: { parallel?: boolean; stopOnError?: boolean }
  ): Promise<any[]> {
    const results: any[] = [];
    const context = { results: {} };

    const stopOnError = options?.stopOnError ?? true;
    const parallel = options?.parallel ?? false;

    if (parallel) {
      // Execute tools in parallel
      const promises = workflow.map(step =>
        this.executeTool(step.tool, step.input, context)
          .catch(error => ({ error: error.message }))
      );

      const parallelResults = await Promise.all(promises);
      
      for (let i = 0; i < workflow.length; i++) {
        const result = parallelResults[i];
        context.results[workflow[i].tool] = result;
        results.push(result);

        if (result.error && stopOnError) {
          throw new Error(`Workflow failed at step ${i}: ${result.error}`);
        }
      }
    } else {
      // Execute tools sequentially
      for (let i = 0; i < workflow.length; i++) {
        const step = workflow[i];
        
        try {
          const result = await this.executeTool(step.tool, step.input, context);
          context.results[step.tool] = result;
          results.push(result);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          
          if (stopOnError) {
            throw new Error(`Workflow failed at step ${i} (${step.tool}): ${errorMsg}`);
          }
          
          results.push({ error: errorMsg });
        }
      }
    }

    return results;
  }

  /**
   * Get execution history
   */
  public getExecutionHistory(limit?: number): any[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return this.executionHistory;
  }

  /**
   * Clear execution history
   */
  public clearExecutionHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Get statistics about tool usage
   */
  public getStatistics(): any {
    const stats = {
      totalExecutions: this.executionHistory.length,
      toolsUsed: new Set<string>(),
      successCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      executionsByTool: {} as Record<string, number>
    };

    let totalTime = 0;

    for (const execution of this.executionHistory) {
      stats.toolsUsed.add(execution.tool);
      
      if (execution.output?.ok) {
        stats.successCount++;
      } else {
        stats.errorCount++;
      }

      if (!stats.executionsByTool[execution.tool]) {
        stats.executionsByTool[execution.tool] = 0;
      }
      stats.executionsByTool[execution.tool]++;
    }

    if (this.executionHistory.length > 0) {
      stats.averageExecutionTime = totalTime / this.executionHistory.length;
    }

    return {
      ...stats,
      toolsUsed: Array.from(stats.toolsUsed)
    };
  }
}

/**
 * Workflow Builder for Complex Tasks
 * Helps construct multi-step workflows
 */
export class WorkflowBuilder {
  private steps: Array<{ tool: string; input: any }> = [];
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Add a step to the workflow
   */
  public addStep(tool: string, input: any): this {
    this.steps.push({ tool, input });
    return this;
  }

  /**
   * Add multiple steps
   */
  public addSteps(steps: Array<{ tool: string; input: any }>): this {
    this.steps.push(...steps);
    return this;
  }

  /**
   * Get the workflow definition
   */
  public getWorkflow(): Array<{ tool: string; input: any }> {
    return this.steps;
  }

  /**
   * Get workflow name
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Clear all steps
   */
  public clear(): this {
    this.steps = [];
    return this;
  }

  /**
   * Validate workflow
   */
  public validate(integration: AdvancedToolsIntegration): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const step of this.steps) {
      if (!integration.hasTool(step.tool)) {
        errors.push(`Tool not found: ${step.tool}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Autonomous Agent for Self-Directed Task Execution
 * Enables JOE to plan and execute tasks independently
 */
export class AutonomousAgent {
  private integration: AdvancedToolsIntegration;
  private memory: Map<string, any> = new Map();
  private capabilities: Set<string> = new Set();

  constructor(integration: AdvancedToolsIntegration) {
    this.integration = integration;
    this.initializeCapabilities();
  }

  /**
   * Initialize agent capabilities
   */
  private initializeCapabilities(): void {
    for (const tool of this.integration.getTools()) {
      this.capabilities.add(tool.name);
    }
  }

  /**
   * Check if agent can perform a task
   */
  public canPerform(taskDescription: string): boolean {
    // Simple keyword matching - would be enhanced with NLP
    const keywords = taskDescription.toLowerCase().split(' ');
    
    for (const keyword of keywords) {
      for (const capability of this.capabilities) {
        if (capability.includes(keyword) || keyword.includes(capability.split('_')[0])) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Plan a task autonomously
   */
  public async planTask(taskDescription: string): Promise<Array<{ tool: string; input: any }>> {
    const plan: Array<{ tool: string; input: any }> = [];

    // Parse task description and generate steps
    // This is a simplified version - would use LLM in production
    
    if (taskDescription.includes('generate') && taskDescription.includes('image')) {
      plan.push({
        tool: 'image_generate_advanced',
        input: { prompt: taskDescription, style: 'realistic' }
      });
    }

    if (taskDescription.includes('analyze') && taskDescription.includes('data')) {
      plan.push({
        tool: 'data_analyze',
        input: { data: [] }
      });
    }

    if (taskDescription.includes('test') && taskDescription.includes('performance')) {
      plan.push({
        tool: 'test_performance',
        input: { url: 'http://localhost:3000' }
      });
    }

    if (taskDescription.includes('deploy')) {
      plan.push({
        tool: 'app_deploy',
        input: { appPath: '.', platform: 'vercel' }
      });
    }

    return plan;
  }

  /**
   * Execute a task autonomously
   */
  public async executeTask(taskDescription: string): Promise<any> {
    console.log(`🤖 Autonomous Agent: Executing task: "${taskDescription}"`);

    if (!this.canPerform(taskDescription)) {
      throw new Error(`Agent cannot perform task: ${taskDescription}`);
    }

    const plan = await this.planTask(taskDescription);
    
    if (plan.length === 0) {
      throw new Error(`Could not generate plan for task: ${taskDescription}`);
    }

    console.log(`📋 Generated plan with ${plan.length} steps`);

    const results = await this.integration.executeWorkflow(plan, {
      stopOnError: true,
      parallel: false
    });

    return {
      task: taskDescription,
      plan,
      results,
      success: results.every((r: any) => r.ok !== false)
    };
  }

  /**
   * Store information in memory
   */
  public remember(key: string, value: any): void {
    this.memory.set(key, value);
  }

  /**
   * Retrieve information from memory
   */
  public recall(key: string): any {
    return this.memory.get(key);
  }

  /**
   * Get all capabilities
   */
  public getCapabilities(): string[] {
    return Array.from(this.capabilities);
  }
}

/**
 * System Orchestrator
 * Coordinates all advanced tools and autonomous agents
 */
export class SystemOrchestrator {
  private integration: AdvancedToolsIntegration;
  private agents: Map<string, AutonomousAgent> = new Map();
  private workflows: Map<string, WorkflowBuilder> = new Map();

  constructor() {
    this.integration = new AdvancedToolsIntegration();
    this.integration.initialize();
  }

  /**
   * Create a new autonomous agent
   */
  public createAgent(name: string): AutonomousAgent {
    const agent = new AutonomousAgent(this.integration);
    this.agents.set(name, agent);
    return agent;
  }

  /**
   * Get an agent by name
   */
  public getAgent(name: string): AutonomousAgent | undefined {
    return this.agents.get(name);
  }

  /**
   * Create a new workflow
   */
  public createWorkflow(name: string): WorkflowBuilder {
    const workflow = new WorkflowBuilder(name);
    this.workflows.set(name, workflow);
    return workflow;
  }

  /**
   * Get a workflow by name
   */
  public getWorkflow(name: string): WorkflowBuilder | undefined {
    return this.workflows.get(name);
  }

  /**
   * Execute a workflow
   */
  public async executeWorkflow(
    name: string,
    options?: { parallel?: boolean; stopOnError?: boolean }
  ): Promise<any[]> {
    const workflow = this.getWorkflow(name);
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${name}`);
    }

    const validation = workflow.validate(this.integration);
    
    if (!validation.valid) {
      throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
    }

    return this.integration.executeWorkflow(workflow.getWorkflow(), options);
  }

  /**
   * Get system status
   */
  public getStatus(): any {
    return {
      tools: {
        total: this.integration.getTools().length,
        registered: this.integration.getTools().map(t => t.name)
      },
      agents: {
        total: this.agents.size,
        names: Array.from(this.agents.keys())
      },
      workflows: {
        total: this.workflows.size,
        names: Array.from(this.workflows.keys())
      },
      statistics: this.integration.getStatistics()
    };
  }
}

// Export singleton instance
export const orchestrator = new SystemOrchestrator();
