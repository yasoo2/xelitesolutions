/**
 * JOE Browser Integration System
 * ==============================
 * 
 * نظام التكامل الكامل بين محرك أتمتة المتصفح و نظام JOE
 * يوفر واجهة موحدة للتحكم بالمتصفح بشكل ذكي
 */

import { EventEmitter } from 'events';
import { BrowserAutomationEngine, DetectedElement, PageData } from './automation';
import { AdvancedInteractionSystem } from './interactions';
import { DataExtractionSystem, ExtractedData } from './data-extraction';

/**
 * بنية مهمة المتصفح
 */
export interface BrowserTask {
  id: string;
  type: 'navigation' | 'interaction' | 'extraction' | 'form_fill' | 'data_search' | 'custom';
  description: string;
  steps: BrowserStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * بنية خطوة المهمة
 */
export interface BrowserStep {
  id: string;
  action: string;
  target?: string;
  value?: string;
  options?: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

/**
 * نظام التكامل الكامل
 */
export class JOEBrowserIntegration extends EventEmitter {
  private automation: BrowserAutomationEngine;
  private interactions: AdvancedInteractionSystem;
  private dataExtraction: DataExtractionSystem;
  private currentTask: BrowserTask | null = null;
  private taskHistory: BrowserTask[] = [];
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.automation = new BrowserAutomationEngine();
    this.interactions = new AdvancedInteractionSystem();
    this.dataExtraction = new DataExtractionSystem();

    // ربط الأحداث
    this.automation.on('log', (msg) => this.emit('log', `[Automation] ${msg}`));
    this.interactions.on('log', (msg) => this.emit('log', `[Interactions] ${msg}`));
    this.dataExtraction.on('log', (msg) => this.emit('log', `[DataExtraction] ${msg}`));
  }

  /**
   * تهيئة النظام
   */
  async initialize(): Promise<void> {
    this.emit('log', '🚀 جاري تهيئة نظام JOE Browser Integration...');

    try {
      await this.automation.initialize();
      this.isInitialized = true;
      this.emit('log', '✅ تم تهيئة النظام بنجاح');
    } catch (error) {
      this.emit('error', `فشل في التهيئة: ${error}`);
      throw error;
    }
  }

  /**
   * تنفيذ مهمة متصفح
   */
  async executeTask(task: BrowserTask): Promise<BrowserTask> {
    if (!this.isInitialized) {
      throw new Error('النظام غير مهيأ');
    }

    this.emit('log', `📋 بدء تنفيذ المهمة: ${task.description}`);
    this.currentTask = task;
    task.status = 'running';
    task.startTime = Date.now();

    try {
      for (const step of task.steps) {
        step.status = 'running';
        this.emit('step-start', step);

        try {
          const result = await this.executeStep(step);
          step.result = result;
          step.status = 'completed';
          this.emit('step-complete', step);
        } catch (error) {
          step.status = 'failed';
          step.error = String(error);
          this.emit('step-failed', step);
          throw error;
        }

        await this.sleep(300); // تأخير بين الخطوات
      }

      task.status = 'completed';
      task.endTime = Date.now();
      this.taskHistory.push(task);

      this.emit('log', `✅ اكتملت المهمة بنجاح في ${task.endTime - (task.startTime || 0)}ms`);
      this.emit('task-complete', task);

      return task;
    } catch (error) {
      task.status = 'failed';
      task.error = String(error);
      task.endTime = Date.now();
      this.taskHistory.push(task);

      this.emit('log', `❌ فشلت المهمة: ${error}`);
      this.emit('task-failed', task);

      throw error;
    }
  }

  /**
   * تنفيذ خطوة واحدة
   */
  private async executeStep(step: BrowserStep): Promise<any> {
    const { action, target, value, options } = step;

    switch (action) {
      case 'navigate':
        return await this.automation.goto(target || '');

      case 'inspect':
        return await this.automation.inspectPage();

      case 'click':
        return await this.interactions.naturalClick(
          target || '',
          options?.x || 0,
          options?.y || 0,
          options
        );

      case 'type':
        return await this.interactions.naturalType(
          target || '',
          value || '',
          options
        );

      case 'scroll':
        return await this.interactions.naturalScroll(
          options?.direction || 'down',
          options?.amount || 300
        );

      case 'hover':
        return await this.interactions.hover(
          target || '',
          options?.x || 0,
          options?.y || 0
        );

      case 'fill_form':
        return await this.fillForm(value || '');

      case 'extract_data':
        return await this.extractPageData();

      case 'find_text':
        return await this.dataExtraction.findText(value || '');

      case 'analyze_keywords':
        return await this.dataExtraction.analyzeKeywords();

      case 'wait':
        return await this.sleep(options?.duration || 1000);

      case 'select':
        return await this.interactions.selectOption(
          target || '',
          value || '',
          options?.x || 0,
          options?.y || 0
        );

      case 'drag_drop':
        return await this.interactions.dragAndDrop(
          target || '',
          options?.targetSelector || '',
          options?.sourceX || 0,
          options?.sourceY || 0,
          options?.targetX || 0,
          options?.targetY || 0
        );

      default:
        throw new Error(`إجراء غير معروف: ${action}`);
    }
  }

  /**
   * ملء نموذج تلقائياً
   */
  async fillForm(formData: string): Promise<void> {
    try {
      const data = JSON.parse(formData);
      await this.interactions.naturalType('form', JSON.stringify(data));
    } catch (error) {
      throw new Error(`فشل في ملء النموذج: ${error}`);
    }
  }

  /**
   * استخراج بيانات الصفحة
   */
  async extractPageData(): Promise<ExtractedData> {
    const browserInfo = this.automation.getBrowserInfo();
    return await this.dataExtraction.comprehensiveScan(
      browserInfo.url,
      this.pageContent || ''
    );
  }

  /**
   * الانتقال إلى صفحة وفحصها
   */
  async navigateAndInspect(url: string): Promise<PageData> {
    this.emit('log', `🔗 الانتقال إلى ${url} والفحص الشامل...`);

    await this.automation.goto(url);
    await this.sleep(1000);

    const pageData = await this.automation.inspectPage();
    return pageData;
  }

  /**
   * ملء نموذج وإرساله
   */
  async fillAndSubmitForm(
    formData: Record<string, string>,
    submitButtonSelector?: string
  ): Promise<void> {
    this.emit('log', '📝 ملء النموذج والإرسال...');

    // ملء حقول النموذج
    for (const [selector, value] of Object.entries(formData)) {
      await this.interactions.naturalType(selector, value);
      await this.sleep(200);
    }

    // الضغط على زر الإرسال
    if (submitButtonSelector) {
      await this.interactions.naturalClick(submitButtonSelector, 0, 0);
      await this.sleep(1000);
    }

    this.emit('log', '✅ تم ملء وإرسال النموذج');
  }

  /**
   * البحث عن نص وتفاعل معه
   */
  async searchAndInteract(searchTerm: string, action: 'click' | 'hover' = 'click'): Promise<void> {
    this.emit('log', `🔎 البحث عن "${searchTerm}" والتفاعل معه...`);

    const results = await this.dataExtraction.findText(searchTerm);

    if (results.length === 0) {
      throw new Error(`لم يتم العثور على "${searchTerm}"`);
    }

    const firstResult = results[0];
    this.emit('log', `✅ تم العثور على النص في السياق: ${firstResult.context}`);

    // يمكن إضافة تفاعل إضافي هنا
  }

  /**
   * إنشاء مهمة مخصصة
   */
  createTask(
    description: string,
    steps: Array<{
      action: string;
      target?: string;
      value?: string;
      options?: Record<string, any>;
    }>
  ): BrowserTask {
    const task: BrowserTask = {
      id: `task_${Date.now()}`,
      type: 'custom',
      description,
      steps: steps.map((s, index) => ({
        id: `step_${index}`,
        action: s.action,
        target: s.target,
        value: s.value,
        options: s.options,
        status: 'pending'
      })),
      status: 'pending'
    };

    return task;
  }

  /**
   * الحصول على سجل المهام
   */
  getTaskHistory(): BrowserTask[] {
    return [...this.taskHistory];
  }

  /**
   * الحصول على المهمة الحالية
   */
  getCurrentTask(): BrowserTask | null {
    return this.currentTask;
  }

  /**
   * الحصول على معلومات النظام
   */
  getSystemInfo(): any {
    return {
      initialized: this.isInitialized,
      browser: this.automation.getBrowserInfo(),
      mouse: this.interactions.getMouseInfo(),
      currentTask: this.currentTask?.id,
      totalTasks: this.taskHistory.length,
      completedTasks: this.taskHistory.filter(t => t.status === 'completed').length,
      failedTasks: this.taskHistory.filter(t => t.status === 'failed').length
    };
  }

  /**
   * إغلاق النظام
   */
  async close(): Promise<void> {
    this.emit('log', '🔴 إغلاق نظام JOE Browser Integration...');

    await this.automation.close();
    this.isInitialized = false;

    this.emit('log', '✅ تم إغلاق النظام');
  }

  /**
   * الانتظار
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * محتوى الصفحة (للمرجع)
   */
  private pageContent: string = '';

  /**
   * تعيين محتوى الصفحة
   */
  setPageContent(content: string): void {
    this.pageContent = content;
  }
}

/**
 * نسخة مفردة من نظام التكامل
 */
export const joeBrowserIntegration = new JOEBrowserIntegration();
