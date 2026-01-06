/**
 * Reasoning Trace System
 * =======================
 * 
 * نظام متقدم لتتبع وعرض عملية تفكير JOE بشكل فوري وسلس
 * يعرض الحوار الداخلي والأدوات والقرارات بشكل بصري احترافي
 */

import { EventEmitter } from 'events';

/**
 * أنواع الأحداث في سلسلة التفكير
 */
export enum ThinkingEventType {
  // مراحل التفكير
  THINKING_START = 'thinking_start',
  THINKING_STEP = 'thinking_step',
  THINKING_END = 'thinking_end',
  
  // تحليل المهمة
  TASK_ANALYSIS = 'task_analysis',
  GOAL_BREAKDOWN = 'goal_breakdown',
  
  // اختيار الأدوات
  TOOL_SELECTION = 'tool_selection',
  TOOL_EVALUATION = 'tool_evaluation',
  TOOL_CHOSEN = 'tool_chosen',
  
  // التنفيذ
  EXECUTION_START = 'execution_start',
  EXECUTION_PROGRESS = 'execution_progress',
  EXECUTION_COMPLETE = 'execution_complete',
  
  // الأخطاء والحلول
  ERROR_DETECTED = 'error_detected',
  RECOVERY_ATTEMPT = 'recovery_attempt',
  RECOVERY_SUCCESS = 'recovery_success',
  
  // القرارات
  DECISION_MADE = 'decision_made',
  STRATEGY_CHANGE = 'strategy_change',
  
  // النتائج
  RESULT_ANALYSIS = 'result_analysis',
  CONCLUSION = 'conclusion'
}

/**
 * بنية حدث التفكير
 */
export interface ThinkingEvent {
  type: ThinkingEventType;
  timestamp: number;
  duration?: number;
  content: string;
  metadata?: {
    toolName?: string;
    toolScore?: number;
    reasoning?: string;
    alternatives?: string[];
    confidence?: number;
    [key: string]: any;
  };
  status: 'pending' | 'active' | 'completed' | 'error';
  depth: number; // عمق التفكير (0 = رئيسي، 1+ = تفاصيل)
}

/**
 * سلسلة الأفكار الكاملة
 */
export interface ReasoningTrace {
  id: string;
  taskDescription: string;
  startTime: number;
  endTime?: number;
  events: ThinkingEvent[];
  finalDecision?: string;
  executedTools: Array<{
    name: string;
    input: any;
    output: any;
    duration: number;
  }>;
  errors: Array<{
    message: string;
    recovery: string;
    timestamp: number;
  }>;
  summary: {
    totalSteps: number;
    totalDuration: number;
    toolsUsed: number;
    successRate: number;
  };
}

/**
 * نظام تتبع الأفكار الرئيسي
 */
export class ReasoningTracer extends EventEmitter {
  private traces: Map<string, ReasoningTrace> = new Map();
  private currentTrace: ReasoningTrace | null = null;
  private eventStack: ThinkingEvent[] = [];
  private listeners: Map<string, Function[]> = new Map();

  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * بدء تتبع جديد
   */
  public startTrace(taskDescription: string): string {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentTrace = {
      id: traceId,
      taskDescription,
      startTime: Date.now(),
      events: [],
      executedTools: [],
      errors: [],
      summary: {
        totalSteps: 0,
        totalDuration: 0,
        toolsUsed: 0,
        successRate: 0
      }
    };

    this.traces.set(traceId, this.currentTrace);
    this.emitEvent({
      type: ThinkingEventType.THINKING_START,
      timestamp: Date.now(),
      content: `بدء معالجة المهمة: "${taskDescription}"`,
      status: 'active',
      depth: 0
    });

    return traceId;
  }

  /**
   * إضافة حدث تفكير
   */
  public addThinkingEvent(
    type: ThinkingEventType,
    content: string,
    metadata?: any,
    depth: number = 0
  ): void {
    if (!this.currentTrace) {
      console.warn('No active trace. Start a trace first.');
      return;
    }

    const event: ThinkingEvent = {
      type,
      timestamp: Date.now(),
      content,
      metadata,
      status: 'active',
      depth
    };

    this.currentTrace.events.push(event);
    this.eventStack.push(event);
    this.emitEvent(event);
  }

  /**
   * تسجيل تحليل المهمة
   */
  public analyzeTask(analysis: {
    goal: string;
    constraints: string[];
    requiredTools: string[];
    estimatedSteps: number;
  }): void {
    this.addThinkingEvent(
      ThinkingEventType.TASK_ANALYSIS,
      `تحليل المهمة: ${analysis.goal}`,
      {
        goal: analysis.goal,
        constraints: analysis.constraints,
        requiredTools: analysis.requiredTools,
        estimatedSteps: analysis.estimatedSteps
      },
      0
    );
  }

  /**
   * تسجيل تقسيم الهدف
   */
  public breakdownGoal(steps: Array<{ step: number; description: string; tools: string[] }>): void {
    this.addThinkingEvent(
      ThinkingEventType.GOAL_BREAKDOWN,
      `تقسيم الهدف إلى ${steps.length} خطوات`,
      { steps },
      0
    );
  }

  /**
   * تسجيل تقييم الأدوات
   */
  public evaluateTools(tools: Array<{
    name: string;
    score: number;
    reasoning: string;
    pros: string[];
    cons: string[];
  }>): void {
    const bestTool = tools.reduce((prev, current) =>
      current.score > prev.score ? current : prev
    );

    this.addThinkingEvent(
      ThinkingEventType.TOOL_EVALUATION,
      `تقييم ${tools.length} أدوات - الأفضل: ${bestTool.name}`,
      { tools, bestTool },
      1
    );
  }

  /**
   * تسجيل اختيار الأداة
   */
  public selectTool(toolName: string, reasoning: string, confidence: number = 0.9): void {
    this.addThinkingEvent(
      ThinkingEventType.TOOL_CHOSEN,
      `اختيار الأداة: ${toolName}`,
      {
        toolName,
        reasoning,
        confidence
      },
      1
    );
  }

  /**
   * تسجيل بدء التنفيذ
   */
  public startExecution(toolName: string, input: any): void {
    this.addThinkingEvent(
      ThinkingEventType.EXECUTION_START,
      `بدء تنفيذ: ${toolName}`,
      { toolName, input },
      1
    );
  }

  /**
   * تسجيل تقدم التنفيذ
   */
  public updateExecutionProgress(progress: number, message: string): void {
    this.addThinkingEvent(
      ThinkingEventType.EXECUTION_PROGRESS,
      message,
      { progress },
      2
    );
  }

  /**
   * تسجيل إكمال التنفيذ
   */
  public completeExecution(
    toolName: string,
    input: any,
    output: any,
    duration: number
  ): void {
    if (!this.currentTrace) return;

    this.currentTrace.executedTools.push({
      name: toolName,
      input,
      output,
      duration
    });

    this.addThinkingEvent(
      ThinkingEventType.EXECUTION_COMPLETE,
      `اكتمل تنفيذ ${toolName} في ${duration}ms`,
      { toolName, duration },
      1
    );
  }

  /**
   * تسجيل اكتشاف خطأ
   */
  public detectError(error: string, context?: any): void {
    this.addThinkingEvent(
      ThinkingEventType.ERROR_DETECTED,
      `⚠️ تم اكتشاف خطأ: ${error}`,
      { error, context },
      1
    );
  }

  /**
   * تسجيل محاولة الاسترجاع
   */
  public attemptRecovery(strategy: string, reasoning: string): void {
    this.addThinkingEvent(
      ThinkingEventType.RECOVERY_ATTEMPT,
      `محاولة الاسترجاع: ${strategy}`,
      { strategy, reasoning },
      2
    );
  }

  /**
   * تسجيل نجاح الاسترجاع
   */
  public recoverySuccess(result: string): void {
    this.addThinkingEvent(
      ThinkingEventType.RECOVERY_SUCCESS,
      `✅ نجح الاسترجاع: ${result}`,
      { result },
      2
    );
  }

  /**
   * تسجيل قرار
   */
  public makeDecision(decision: string, reasoning: string, alternatives: string[] = []): void {
    this.addThinkingEvent(
      ThinkingEventType.DECISION_MADE,
      `قرار: ${decision}`,
      { decision, reasoning, alternatives },
      0
    );
  }

  /**
   * تسجيل تغيير الاستراتيجية
   */
  public changeStrategy(oldStrategy: string, newStrategy: string, reason: string): void {
    this.addThinkingEvent(
      ThinkingEventType.STRATEGY_CHANGE,
      `تغيير الاستراتيجية: ${oldStrategy} → ${newStrategy}`,
      { oldStrategy, newStrategy, reason },
      0
    );
  }

  /**
   * تسجيل تحليل النتيجة
   */
  public analyzeResult(result: any, insights: string[]): void {
    this.addThinkingEvent(
      ThinkingEventType.RESULT_ANALYSIS,
      `تحليل النتيجة: ${insights.length} رؤى`,
      { result, insights },
      0
    );
  }

  /**
   * تسجيل الخلاصة
   */
  public conclude(summary: string, success: boolean = true): void {
    if (!this.currentTrace) return;

    this.currentTrace.finalDecision = summary;
    this.currentTrace.endTime = Date.now();

    this.addThinkingEvent(
      ThinkingEventType.CONCLUSION,
      `الخلاصة: ${summary}`,
      { success },
      0
    );

    // حساب الإحصائيات
    this.updateSummary();
  }

  /**
   * تحديث ملخص السلسلة
   */
  private updateSummary(): void {
    if (!this.currentTrace) return;

    const trace = this.currentTrace;
    trace.summary = {
      totalSteps: trace.events.length,
      totalDuration: (trace.endTime || Date.now()) - trace.startTime,
      toolsUsed: trace.executedTools.length,
      successRate: trace.executedTools.length > 0
        ? (trace.executedTools.length - trace.errors.length) / trace.executedTools.length
        : 0
    };
  }

  /**
   * الحصول على السلسلة الحالية
   */
  public getCurrentTrace(): ReasoningTrace | null {
    return this.currentTrace;
  }

  /**
   * الحصول على سلسلة محددة
   */
  public getTrace(traceId: string): ReasoningTrace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * الحصول على جميع السلاسل
   */
  public getAllTraces(): ReasoningTrace[] {
    return Array.from(this.traces.values());
  }

  /**
   * إصدار حدث للمستمعين
   */
  private emitEvent(event: ThinkingEvent): void {
    this.emit('thinking', event);
    
    // إصدار حدث محدد حسب النوع
    this.emit(event.type, event);
  }

  /**
   * إضافة مستمع مخصص
   */
  public onThinking(callback: (event: ThinkingEvent) => void): void {
    this.on('thinking', callback);
  }

  /**
   * إضافة مستمع لنوع حدث معين
   */
  public onEvent(eventType: ThinkingEventType, callback: (event: ThinkingEvent) => void): void {
    this.on(eventType, callback);
  }

  /**
   * تنظيف السلسلة الحالية
   */
  public clearCurrentTrace(): void {
    this.currentTrace = null;
    this.eventStack = [];
  }

  /**
   * تصدير السلسلة كـ JSON
   */
  public exportTrace(traceId?: string): string {
    const trace = traceId ? this.traces.get(traceId) : this.currentTrace;
    if (!trace) return '{}';
    return JSON.stringify(trace, null, 2);
  }

  /**
   * تصدير السلسلة كـ Markdown
   */
  public exportAsMarkdown(traceId?: string): string {
    const trace = traceId ? this.traces.get(traceId) : this.currentTrace;
    if (!trace) return '';

    let markdown = `# سلسلة التفكير\n\n`;
    markdown += `**المهمة:** ${trace.taskDescription}\n`;
    markdown += `**المدة:** ${trace.summary.totalDuration}ms\n`;
    markdown += `**الأدوات المستخدمة:** ${trace.summary.toolsUsed}\n`;
    markdown += `**معدل النجاح:** ${(trace.summary.successRate * 100).toFixed(2)}%\n\n`;

    markdown += `## خطوات التفكير\n\n`;
    for (const event of trace.events) {
      const indent = '  '.repeat(event.depth);
      markdown += `${indent}- **${event.type}**: ${event.content}\n`;
    }

    return markdown;
  }

  /**
   * الحصول على إحصائيات الأداء
   */
  public getPerformanceStats(): any {
    const traces = Array.from(this.traces.values());
    
    if (traces.length === 0) return null;

    const avgDuration = traces.reduce((sum, t) => sum + t.summary.totalDuration, 0) / traces.length;
    const avgTools = traces.reduce((sum, t) => sum + t.summary.toolsUsed, 0) / traces.length;
    const avgSuccess = traces.reduce((sum, t) => sum + t.summary.successRate, 0) / traces.length;

    return {
      totalTraces: traces.length,
      averageDuration: avgDuration,
      averageToolsUsed: avgTools,
      averageSuccessRate: avgSuccess,
      totalErrors: traces.reduce((sum, t) => sum + t.errors.length, 0),
      totalExecutions: traces.reduce((sum, t) => sum + t.executedTools.length, 0)
    };
  }

  /**
   * إعادة تعيين جميع السلاسل
   */
  public reset(): void {
    this.traces.clear();
    this.currentTrace = null;
    this.eventStack = [];
  }

  /**
   * إعداد مستمعي الأحداث
   */
  private setupEventListeners(): void {
    // يمكن إضافة مستمعي افتراضيين هنا
  }
}

/**
 * نسخة مفردة من نظام التتبع
 */
export const reasoningTracer = new ReasoningTracer();
