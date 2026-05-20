import { BaseTool } from './base';
import { ToolPermission } from './types';

/**
 * Tool Metadata - بيانات الأداة
 */
interface ToolMetadata {
  name: string;
  description: string;
  version: string;
  tags: string[];
  permissions: ToolPermission[];
  rateLimitPerMinute?: number;
  requiresApproval?: boolean;
  category: 'build' | 'test' | 'deploy' | 'analyze' | 'refactor' | 'generate' | 'utility';
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedDuration: number; // in seconds
}

/**
 * Tool Execution Context - سياق تنفيذ الأداة
 */
interface ToolExecutionContext {
  sessionId?: string;
  workspaceId?: string;
  userId?: string;
  requestId: string;
  startTime: Date;
  timeout: number;
  retries: number;
}

/**
 * Tool Execution Result - نتيجة تنفيذ الأداة
 */
interface ToolExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  executionTime: number;
  toolName: string;
  context: ToolExecutionContext;
}

/**
 * Tool Registry V2 - سجل الأدوات المتقدم
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();
  private metadata: Map<string, ToolMetadata> = new Map();
  private executionHistory: ToolExecutionResult[] = [];
  private rateLimits: Map<string, Array<Date>> = new Map();
  private toolChains: Map<string, string[]> = new Map();

  constructor() {
    this.initializeDefaultChains();
  }

  /**
   * تسجيل أداة جديدة
   */
  register(tool: BaseTool, metadata?: Partial<ToolMetadata>): void {
    const toolName = tool.name.toLowerCase();
    
    if (this.tools.has(toolName)) {
      console.warn(`[ToolRegistry] Tool '${toolName}' is being overwritten`);
    }

    this.tools.set(toolName, tool);
    
    // استخراج البيانات الوصفية من الأداة
    this.metadata.set(toolName, {
      name: tool.name,
      description: tool.description,
      version: tool.version || '1.0.0',
      tags: tool.tags || [],
      permissions: tool.permissions || [],
      rateLimitPerMinute: tool.rateLimitPerMinute || 60,
      requiresApproval: tool.requiresApproval || false,
      category: metadata?.category || 'utility',
      complexity: metadata?.complexity || 'simple',
      estimatedDuration: metadata?.estimatedDuration || 30,
      ...metadata
    });

    console.log(`[ToolRegistry] Registered: ${toolName} v${tool.version}`);
  }

  /**
   * الحصول على أداة
   */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name.toLowerCase());
  }

  /**
   * الحصول على بيانات وصفية
   */
  getMetadata(name: string): ToolMetadata | undefined {
    return this.metadata.get(name.toLowerCase());
  }

  /**
   * قائمة جميع الأدوات
   */
  list(): ToolMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * البحث عن أدوات
   */
  search(query: string): ToolMetadata[] {
    const lowerQuery = query.toLowerCase();
    
    return this.list().filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery) ||
      tool.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * البحث بالفئة
   */
  getByCategory(category: ToolMetadata['category']): ToolMetadata[] {
    return this.list().filter(tool => tool.category === category);
  }

  /**
   * البحث بالتعقيد
   */
  getByComplexity(complexity: ToolMetadata['complexity']): ToolMetadata[] {
    return this.list().filter(tool => tool.complexity === complexity);
  }

  /**
   * تنفيذ أداة مع إدارة كاملة
   */
  async execute(
    name: string, 
    input: any, 
    context?: Partial<ToolExecutionContext>
  ): Promise<ToolExecutionResult> {
    const toolName = name.toLowerCase();
    const tool = this.tools.get(toolName);
    const metadata = this.metadata.get(toolName);

    if (!tool || !metadata) {
      return {
        success: false,
        error: `Tool '${name}' not found`,
        executionTime: 0,
        toolName: name,
        context: this.createContext(context)
      };
    }

    // التحقق من حدود المعدل
    if (!this.checkRateLimit(toolName, metadata.rateLimitPerMinute || 60)) {
      return {
        success: false,
        error: `Rate limit exceeded for '${name}'. Try again later.`,
        executionTime: 0,
        toolName: name,
        context: this.createContext(context)
      };
    }

    // التحقق من الصلاحيات
    if (!this.checkPermissions(metadata.permissions, context)) {
      return {
        success: false,
        error: `Insufficient permissions to execute '${name}'`,
        executionTime: 0,
        toolName: name,
        context: this.createContext(context)
      };
    }

    const execContext = this.createContext(context);
    const startTime = Date.now();

    try {
      // تنفيذ الأداة مع مهلة زمنية
      const result = await this.executeWithTimeout(tool, input, execContext.timeout);
      
      const executionTime = Date.now() - startTime;
      
      const execResult: ToolExecutionResult = {
        success: result.ok,
        output: result.output,
        error: result.error,
        executionTime,
        toolName: name,
        context: execContext
      };

      this.executionHistory.push(execResult);
      this.recordRateLimit(toolName);

      return execResult;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      
      const execResult: ToolExecutionResult = {
        success: false,
        error: error.message || 'Unknown error',
        executionTime,
        toolName: name,
        context: execContext
      };

      this.executionHistory.push(execResult);
      return execResult;
    }
  }

  /**
   * تنفيذ سلسلة من الأدوات
   */
  async executeChain(
    chainName: string, 
    initialInput: any,
    context?: Partial<ToolExecutionContext>
  ): Promise<ToolExecutionResult[]> {
    const chain = this.toolChains.get(chainName);
    
    if (!chain) {
      throw new Error(`Tool chain '${chainName}' not found`);
    }

    const results: ToolExecutionResult[] = [];
    let currentInput = initialInput;

    for (const toolName of chain) {
      console.log(`[ToolChain] Executing: ${toolName}`);
      
      const result = await this.execute(toolName, currentInput, context);
      results.push(result);

      if (!result.success) {
        console.error(`[ToolChain] Failed at: ${toolName}`);
        break;
      }

      // Pass output as next input
      currentInput = {
        ...currentInput,
        previousOutput: result.output,
        chainProgress: {
          completed: results.length,
          total: chain.length,
          current: toolName
        }
      };
    }

    return results;
  }

  /**
   * إنشاء سلسلة أدوات مخصصة
   */
  createChain(name: string, toolNames: string[]): void {
    // Validate all tools exist
    for (const toolName of toolNames) {
      if (!this.tools.has(toolName.toLowerCase())) {
        throw new Error(`Tool '${toolName}' not found in registry`);
      }
    }

    this.toolChains.set(name, toolNames.map(n => n.toLowerCase()));
    console.log(`[ToolRegistry] Created chain: ${name} [${toolNames.join(' → ')}]`);
  }

  /**
   * الحصول على سجل التنفيذ
   */
  getExecutionHistory(filters?: {
    toolName?: string;
    success?: boolean;
    startTime?: Date;
    endTime?: Date;
  }): ToolExecutionResult[] {
    let history = this.executionHistory;

    if (filters?.toolName) {
      history = history.filter(h => h.toolName === filters.toolName);
    }

    if (filters?.success !== undefined) {
      history = history.filter(h => h.success === filters.success);
    }

    if (filters?.startTime) {
      history = history.filter(h => h.context.startTime >= filters.startTime!);
    }

    if (filters?.endTime) {
      history = history.filter(h => h.context.startTime <= filters.endTime!);
    }

    return history;
  }

  /**
   * إحصائيات الأدوات
   */
  getStatistics(): {
    totalTools: number;
    totalExecutions: number;
    successRate: number;
    averageExecutionTime: number;
    mostUsedTools: Array<{ name: string; count: number }>;
    categoryDistribution: Record<string, number>;
  } {
    const totalExecutions = this.executionHistory.length;
    const successfulExecutions = this.executionHistory.filter(h => h.success).length;
    
    const toolUsage = new Map<string, number>();
    this.executionHistory.forEach(h => {
      toolUsage.set(h.toolName, (toolUsage.get(h.toolName) || 0) + 1);
    });

    const categoryDistribution: Record<string, number> = {};
    this.metadata.forEach((meta, name) => {
      const count = toolUsage.get(name) || 0;
      categoryDistribution[meta.category] = (categoryDistribution[meta.category] || 0) + count;
    });

    return {
      totalTools: this.tools.size,
      totalExecutions,
      successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
      averageExecutionTime: totalExecutions > 0 
        ? this.executionHistory.reduce((sum, h) => sum + h.executionTime, 0) / totalExecutions 
        : 0,
      mostUsedTools: Array.from(toolUsage.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
      categoryDistribution
    };
  }

  /**
   * الحصول على توصيات الأدوات
   */
  getRecommendations(task: string): ToolMetadata[] {
    const taskLower = task.toLowerCase();
    
    // Score each tool based on relevance
    const scored = this.list().map(tool => {
      let score = 0;
      
      // Name match
      if (tool.name.toLowerCase().includes(taskLower)) score += 10;
      
      // Description match
      if (tool.description.toLowerCase().includes(taskLower)) score += 5;
      
      // Tag match
      tool.tags.forEach(tag => {
        if (taskLower.includes(tag.toLowerCase())) score += 3;
      });
      
      // Category match
      if (taskLower.includes(tool.category)) score += 2;
      
      return { tool, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.tool);
  }

  // Private methods
  private createContext(partial?: Partial<ToolExecutionContext>): ToolExecutionContext {
    return {
      sessionId: partial?.sessionId,
      workspaceId: partial?.workspaceId,
      userId: partial?.userId,
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: new Date(),
      timeout: partial?.timeout || 60000,
      retries: partial?.retries || 0
    };
  }

  private async executeWithTimeout(
    tool: BaseTool, 
    input: any, 
    timeout: number
  ): Promise<{ ok: boolean; output?: any; error?: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ ok: false, error: `Execution timeout after ${timeout}ms` });
      }, timeout);

      tool.execute(input).then(result => {
        clearTimeout(timer);
        resolve(result);
      }).catch(error => {
        clearTimeout(timer);
        resolve({ ok: false, error: error.message });
      });
    });
  }

  private checkRateLimit(toolName: string, limit: number): boolean {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    
    const executions = this.rateLimits.get(toolName) || [];
    const recentExecutions = executions.filter(t => t > oneMinuteAgo);
    
    this.rateLimits.set(toolName, recentExecutions);
    
    return recentExecutions.length < limit;
  }

  private recordRateLimit(toolName: string): void {
    const executions = this.rateLimits.get(toolName) || [];
    executions.push(new Date());
    this.rateLimits.set(toolName, executions);
  }

  private checkPermissions(
    requiredPermissions: ToolPermission[], 
    context?: Partial<ToolExecutionContext>
  ): boolean {
    // In a real implementation, check user's permissions against required
    // For now, assume all permissions are granted
    return true;
  }

  private initializeDefaultChains(): void {
    // Build chain
    this.toolChains.set('full_build', [
      'scaffold_full_stack',
      'setup_database',
      'npm_install',
      'build_frontend',
      'run_tests',
      'dev_server_start'
    ]);

    // Quality chain
    this.toolChains.set('quality_check', [
      'pattern_recognize',
      'performance_profile',
      'test_generator',
      'doc_generator'
    ]);

    // Refactor chain
    this.toolChains.set('smart_refactor', [
      'pattern_recognize',
      'auto_refactor',
      'test_generator',
      'performance_profile'
    ]);
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
