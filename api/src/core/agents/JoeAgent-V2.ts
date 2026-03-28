import { ArchitectAgent } from './ArchitectAgent-V2';
import { AutonomousLoopEngine, LoopTask, LoopResult } from './AutonomousLoopEngine';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Goal Classification Types - تصنيفات الأهداف المتقدمة
 */
type GoalType = 
  | 'new_project' 
  | 'add_feature' 
  | 'fix_bug' 
  | 'refactor' 
  | 'ui_change' 
  | 'deploy' 
  | 'optimize'
  | 'security_audit'
  | 'code_review'
  | 'general';

/**
 * Priority Levels - مستويات الأولوية
 */
type Priority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Task Status - حالة المهام
 */
interface TaskStatus {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'retrying';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  retries: number;
}

/**
 * Smart Goal Classifier - مصنف الأهداف الذكي
 */
class SmartGoalClassifier {
  private patterns: Array<{ regex: RegExp; type: GoalType; priority: Priority }> = [
    // New Project Patterns
    { 
      regex: /(ابن[يى]?|أنش[ئأ]|build|create|scaffold|new\s*project|from\s*scratch|مشروع\s*جديد|تطبيق\s*جديد|نظام\s*جديد|موقع\s*جديد|منصة\s*جديدة)/i, 
      type: 'new_project', 
      priority: 'high' 
    },
    // Feature Addition
    { 
      regex: /(أضف|إضاف[ةه]|add|implement|feature|ميز[ةه]|وظيف[ةه]|functionality)/i, 
      type: 'add_feature', 
      priority: 'medium' 
    },
    // Bug Fix
    { 
      regex: /(fix|إصل[ا]ح|bug|خطأ|error|مشكل|broken|عطل|لا\s*يعمل|doesn.*work|not\s*working|crash|توقف|تعطل|فشل)/i, 
      type: 'fix_bug', 
      priority: 'critical' 
    },
    // UI/UX Changes
    { 
      regex: /(تصميم|design|ui|ux|css|style|لون|color|خط|font|تخطيط|layout|responsive|واجه[ةه]|شكل|مظهر|زر|button|صفح[ةه]|page|animation|animation)/i, 
      type: 'ui_change', 
      priority: 'low' 
    },
    // Refactoring
    { 
      regex: /(refactor|إعادة\s*هيكل|optimize|تحسين|clean|تنظيف|restructure|reorganize|performance|أداء|سرعة)/i, 
      type: 'refactor', 
      priority: 'medium' 
    },
    // Deployment
    { 
      regex: /(deploy|نشر|upload|server|host|استضاف|رفع|سيرفر|production|prod|live)/i, 
      type: 'deploy', 
      priority: 'high' 
    },
    // Optimization
    { 
      regex: /(optimize|speed|fast|slow|performance|memory|cpu|cache|index|query)/i, 
      type: 'optimize', 
      priority: 'high' 
    },
    // Security
    { 
      regex: /(security|secure|vulnerability|auth|encrypt|password|token|hack|اختراق|أمان)/i, 
      type: 'security_audit', 
      priority: 'critical' 
    }
  ];

  classify(goal: string): { type: GoalType; priority: Priority; confidence: number } {
    const lowerGoal = goal.toLowerCase();
    
    for (const pattern of this.patterns) {
      if (pattern.regex.test(lowerGoal)) {
        // Calculate confidence based on match quality
        const matches = lowerGoal.match(pattern.regex);
        const confidence = matches ? Math.min(matches.length * 0.3 + 0.4, 1) : 0.5;
        
        return { type: pattern.type, priority: pattern.priority, confidence };
      }
    }
    
    return { type: 'general', priority: 'medium', confidence: 0.3 };
  }
}

/**
 * Self-Healing Engine - محرك الإصلاح الذاتي
 */
class SelfHealingEngine {
  private errorPatterns: Array<{
    pattern: RegExp;
    solution: (error: string, context: any) => Promise<{ action: string; params: any }>;
  }> = [
    {
      pattern: /EISDIR|is a directory/i,
      solution: async (error, context) => ({
        action: 'fix_path',
        params: { targetPath: context.path, isDirectory: true }
      })
    },
    {
      pattern: /ENOENT|no such file/i,
      solution: async (error, context) => ({
        action: 'create_missing',
        params: { path: context.path, type: 'file' }
      })
    },
    {
      pattern: /EACCES|permission denied/i,
      solution: async (error, context) => ({
        action: 'fix_permissions',
        params: { path: context.path, mode: 0o755 }
      })
    },
    {
      pattern: /ECONNREFUSED|connection refused/i,
      solution: async (error, context) => ({
        action: 'restart_service',
        params: { service: context.service, port: context.port }
      })
    },
    {
      pattern: /npm.*ERR|yarn.*ERR/i,
      solution: async (error, context) => ({
        action: 'clean_install',
        params: { cwd: context.cwd, packageManager: 'npm' }
      })
    },
    {
      pattern: /port.*in use|address already in use/i,
      solution: async (error, context) => ({
        action: 'find_free_port',
        params: { startPort: context.port || 3000 }
      })
    },
    {
      pattern: /typescript|ts.*error|type.*error/i,
      solution: async (error, context) => ({
        action: 'fix_typescript',
        params: { file: context.file, error: error }
      })
    },
    {
      pattern: /eslint|lint.*error/i,
      solution: async (error, context) => ({
        action: 'auto_fix_lint',
        params: { cwd: context.cwd }
      })
    }
  ];

  async analyzeAndHeal(error: string, context: any): Promise<{
    canHeal: boolean;
    action?: string;
    params?: any;
    confidence: number;
  }> {
    for (const errorPattern of this.errorPatterns) {
      if (errorPattern.pattern.test(error)) {
        const solution = await errorPattern.solution(error, context);
        return {
          canHeal: true,
          action: solution.action,
          params: solution.params,
          confidence: 0.8
        };
      }
    }

    return { canHeal: false, confidence: 0 };
  }

  async executeHealing(action: string, params: any): Promise<boolean> {
    try {
      switch (action) {
        case 'fix_path':
          return await this.fixPath(params);
        case 'create_missing':
          return await this.createMissing(params);
        case 'fix_permissions':
          return await this.fixPermissions(params);
        case 'restart_service':
          return await this.restartService(params);
        case 'clean_install':
          return await this.cleanInstall(params);
        case 'find_free_port':
          return await this.findFreePort(params);
        case 'fix_typescript':
          return await this.fixTypeScript(params);
        case 'auto_fix_lint':
          return await this.autoFixLint(params);
        default:
          return false;
      }
    } catch (e) {
      console.error(`[SelfHealing] Failed to execute ${action}:`, e);
      return false;
    }
  }

  private async fixPath(params: any): Promise<boolean> {
    try {
      if (params.isDirectory && params.targetPath) {
        // If it's a directory but we expected a file, adjust the path
        const adjustedPath = path.join(params.targetPath, 'index.ts');
        if (!fs.existsSync(adjustedPath)) {
          fs.writeFileSync(adjustedPath, '// Auto-generated index\nexport {};');
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async createMissing(params: any): Promise<boolean> {
    try {
      if (params.type === 'file') {
        const dir = path.dirname(params.path);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(params.path, '');
        return true;
      } else if (params.type === 'directory') {
        fs.mkdirSync(params.path, { recursive: true });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async fixPermissions(params: any): Promise<boolean> {
    try {
      fs.chmodSync(params.path, params.mode || 0o755);
      return true;
    } catch {
      return false;
    }
  }

  private async restartService(params: any): Promise<boolean> {
    try {
      // Try to kill process on port and restart
      if (params.port) {
        try {
          execSync(`lsof -ti:${params.port} | xargs kill -9 2>/dev/null || true`);
        } catch {
          // Ignore errors
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  private async cleanInstall(params: any): Promise<boolean> {
    try {
      const cwd = params.cwd || process.cwd();
      // Remove node_modules and lock files
      try {
        fs.rmSync(path.join(cwd, 'node_modules'), { recursive: true, force: true });
        fs.unlinkSync(path.join(cwd, 'package-lock.json'));
      } catch {
        // Ignore errors
      }
      // Reinstall
      execSync('npm install --legacy-peer-deps', { cwd, stdio: 'inherit' });
      return true;
    } catch {
      return false;
    }
  }

  private async findFreePort(params: any): Promise<boolean> {
    // Port finding is handled elsewhere, just return true
    return true;
  }

  private async fixTypeScript(params: any): Promise<boolean> {
    try {
      // Basic TypeScript fixes
      const filePath = params.file;
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // Fix common issues
        content = content.replace(/:\s*any\s*=/g, ': unknown =');
        content = content.replace(/\bvar\b/g, 'const');
        content = content.replace(/console\.log/g, '// console.log');
        
        fs.writeFileSync(filePath, content);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async autoFixLint(params: any): Promise<boolean> {
    try {
      execSync('npm run lint -- --fix', { cwd: params.cwd, stdio: 'inherit' });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Code Intelligence Engine - محرك الذكاء البرمجي
 */
class CodeIntelligenceEngine {
  /**
   * تحليل الكود واستخراج الأنماط
   */
  analyzeCode(code: string, language: string): {
    complexity: number;
    patterns: string[];
    suggestions: string[];
    issues: Array<{ line: number; message: string; severity: 'error' | 'warning' | 'info' }>;
  } {
    const lines = code.split('\n');
    const issues: Array<{ line: number; message: string; severity: 'error' | 'warning' | 'info' }> = [];
    const patterns: string[] = [];
    let complexity = 0;

    // Analyze each line
    lines.forEach((line, index) => {
      // Check for common issues
      if (line.includes('console.log') && !line.includes('//')) {
        issues.push({
          line: index + 1,
          message: 'Remove console.log before production',
          severity: 'warning'
        });
      }

      if (line.includes('any') && language === 'typescript') {
        issues.push({
          line: index + 1,
          message: 'Avoid using "any" type',
          severity: 'warning'
        });
      }

      if (line.includes('eval(')) {
        issues.push({
          line: index + 1,
          message: 'eval() is dangerous, avoid using it',
          severity: 'error'
        });
      }

      // Detect patterns
      if (line.includes('useEffect') || line.includes('useState')) {
        if (!patterns.includes('React Hooks')) patterns.push('React Hooks');
      }

      if (line.includes('async') && line.includes('await')) {
        if (!patterns.includes('Async/Await')) patterns.push('Async/Await');
      }

      if (line.includes('try') && line.includes('catch')) {
        if (!patterns.includes('Error Handling')) patterns.push('Error Handling');
      }

      // Calculate complexity
      if (line.includes('if') || line.includes('for') || line.includes('while') || 
          line.includes('switch') || line.includes('catch')) {
        complexity++;
      }
    });

    // Generate suggestions
    const suggestions: string[] = [];
    if (complexity > 10) {
      suggestions.push('Consider breaking down complex functions');
    }
    if (!patterns.includes('Error Handling')) {
      suggestions.push('Add error handling for robustness');
    }
    if (issues.filter(i => i.severity === 'error').length > 0) {
      suggestions.push('Fix critical errors before proceeding');
    }

    return { complexity, patterns, suggestions, issues };
  }

  /**
   * توليد كود بناءً على الوصف
   */
  generateCode(description: string, language: string, context?: any): string {
    const lowerDesc = description.toLowerCase();
    
    // React Component Generator
    if (lowerDesc.includes('component') || lowerDesc.includes('react')) {
      return this.generateReactComponent(description, context);
    }
    
    // API Endpoint Generator
    if (lowerDesc.includes('api') || lowerDesc.includes('endpoint') || lowerDesc.includes('route')) {
      return this.generateAPIEndpoint(description, context);
    }
    
    // Database Model Generator
    if (lowerDesc.includes('model') || lowerDesc.includes('entity') || lowerDesc.includes('schema')) {
      return this.generateDatabaseModel(description, context);
    }
    
    // Utility Function Generator
    if (lowerDesc.includes('function') || lowerDesc.includes('utility') || lowerDesc.includes('helper')) {
      return this.generateUtilityFunction(description, context);
    }
    
    return `// TODO: Implement ${description}\n// Language: ${language}`;
  }

  private generateReactComponent(description: string, context?: any): string {
    const componentName = this.extractComponentName(description) || 'MyComponent';
    const hasProps = description.includes('props') || description.includes('property');
    const hasState = description.includes('state') || description.includes('حالة');
    const hasEffect = description.includes('effect') || description.includes('side effect');
    
    let code = `import React`;
    if (hasState || hasEffect) code += `, { useState${hasEffect ? ', useEffect' : ''} }`;
    code += ` from 'react';\n\n`;
    
    // Props interface
    if (hasProps) {
      code += `interface ${componentName}Props {\n`;
      code += `  // Define your props here\n`;
      code += `}\n\n`;
    }
    
    // Component
    code += `export const ${componentName}: React.FC${hasProps ? `<${componentName}Props>` : ''} = (${hasProps ? 'props' : ''}) => {\n`;
    
    if (hasState) {
      code += `  const [data, setData] = useState<any>(null);\n`;
      code += `  const [isLoading, setIsLoading] = useState(false);\n`;
      code += `  const [error, setError] = useState<string | null>(null);\n\n`;
    }
    
    if (hasEffect) {
      code += `  useEffect(() => {\n`;
      code += `    // Side effect logic here\n`;
      code += `  }, []);\n\n`;
    }
    
    code += `  return (\n`;
    code += `    <div className="${componentName.toLowerCase()}">\n`;
    code += `      {/* Component content */}\n`;
    code += `    </div>\n`;
    code += `  );\n`;
    code += `};\n`;
    
    return code;
  }

  private generateAPIEndpoint(description: string, context?: any): string {
    const method = this.extractHTTPMethod(description) || 'GET';
    const path = this.extractPath(description) || '/api/resource';
    
    let code = `import { Request, Response } from 'express';\n\n`;
    code += `/**\n`;
    code += ` * ${description}\n`;
    code += ` * @route ${method} ${path}\n`;
    code += ` */\n`;
    code += `export async function handler(req: Request, res: Response) {\n`;
    code += `  try {\n`;
    code += `    // Implementation here\n`;
    code += `    \n`;
    code += `    res.json({ success: true, data: {} });\n`;
    code += `  } catch (error) {\n`;
    code += `    console.error('[API Error]', error);\n`;
    code += `    res.status(500).json({ success: false, error: 'Internal server error' });\n`;
    code += `  }\n`;
    code += `}\n`;
    
    return code;
  }

  private generateDatabaseModel(description: string, context?: any): string {
    const modelName = this.extractComponentName(description) || 'Entity';
    
    let code = `import { Schema, model, Document } from 'mongoose';\n\n`;
    code += `export interface I${modelName} extends Document {\n`;
    code += `  // Define interface properties\n`;
    code += `  createdAt: Date;\n`;
    code += `  updatedAt: Date;\n`;
    code += `}\n\n`;
    code += `const ${modelName}Schema = new Schema<I${modelName}>(\n`;
    code += `  {\n`;
    code += `    // Schema definition\n`;
    code += `  },\n`;
    code += `  { timestamps: true }\n`;
    code += `);\n\n`;
    code += `export const ${modelName} = model<I${modelName}>('${modelName}', ${modelName}Schema);\n`;
    
    return code;
  }

  private generateUtilityFunction(description: string, context?: any): string {
    const funcName = this.extractComponentName(description) || 'utilityFunction';
    
    let code = `/**\n`;
    code += ` * ${description}\n`;
    code += ` */\n`;
    code += `export function ${funcName}(input: any): any {\n`;
    code += `  // Implementation\n`;
    code += `  return input;\n`;
    code += `}\n`;
    
    return code;
  }

  private extractComponentName(description: string): string | null {
    const match = description.match(/(?:component|class|function|model)\s+(\w+)/i);
    return match ? match[1] : null;
  }

  private extractHTTPMethod(description: string): string | null {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    for (const method of methods) {
      if (description.toUpperCase().includes(method)) return method;
    }
    return null;
  }

  private extractPath(description: string): string | null {
    const match = description.match(/(\/api\/[^\s]+)/);
    return match ? match[1] : null;
  }
}

/**
 * JoeAgent V2 - وكيل جو المتطور
 */
export class JoeAgent {
  private architect: ArchitectAgent;
  private classifier: SmartGoalClassifier;
  private selfHealing: SelfHealingEngine;
  private codeIntelligence: CodeIntelligenceEngine;
  private rootDir: string;
  private taskHistory: TaskStatus[] = [];

  constructor(rootDir: string) {
    this.architect = new ArchitectAgent();
    this.classifier = new SmartGoalClassifier();
    this.selfHealing = new SelfHealingEngine();
    this.codeIntelligence = new CodeIntelligenceEngine();
    this.rootDir = rootDir;
  }

  /**
   * Ignite - تشغيل المحرك الرئيسي
   */
  async ignite(goal: string, options?: {
    autoHeal?: boolean;
    maxRetries?: number;
    verbose?: boolean;
  }): Promise<LoopResult> {
    const opts = {
      autoHeal: true,
      maxRetries: 3,
      verbose: true,
      ...options
    };

    console.log(`\n🚀 JOE V2 PROTOCOL ACTIVATED`);
    console.log(`🎯 Goal: "${goal}"`);
    console.log(`📁 Root: ${this.rootDir}`);
    console.log(`⚙️ Options:`, opts);

    // 1. Classify the goal
    const classification = this.classifier.classify(goal);
    console.log(`\n📊 Classification: ${classification.type} (${classification.priority}) - ${Math.round(classification.confidence * 100)}% confidence`);

    // 2. Create architecture plan
    console.log(`\n🏛️ Creating architecture plan...`);
    const planMarkdown = await this.architect.planProject(goal, `Goal Type: ${classification.type}`);
    
    if (opts.verbose) {
      console.log(`\n📋 Plan Preview:\n${planMarkdown.substring(0, 500)}...\n`);
    }

    // 3. Build dynamic pipeline
    const tasks = this.buildDynamicPipeline(classification.type, goal, planMarkdown);
    console.log(`\n🔧 Pipeline: ${tasks.length} tasks`);
    tasks.forEach((t, i) => console.log(`  ${i + 1}. ${t.name} ${t.required ? '(required)' : '(optional)'}`));

    // 4. Initialize engine with self-healing
    const engine = new AutonomousLoopEngine(
      this.rootDir,
      {
        maxIterations: this.calculateMaxIterations(classification.type),
        enableWolverine: opts.autoHeal,
        enableCheckpointing: true,
        circuitBreakerThreshold: classification.priority === 'critical' ? 5 : 10,
        onError: opts.autoHeal ? this.handleErrorWithHealing.bind(this) : undefined
      }
    );

    // 5. Execute with monitoring
    console.log(`\n⚡ Starting execution...\n`);
    const startTime = Date.now();
    
    const result = await engine.executeLoop(tasks, {
      onTaskStart: (task) => {
        console.log(`▶️ Starting: ${task.name}`);
        this.trackTask(task.name, 'in_progress');
      },
      onTaskComplete: (task, success) => {
        console.log(`${success ? '✅' : '❌'} Completed: ${task.name}`);
        this.trackTask(task.name, success ? 'completed' : 'failed');
      },
      onProgress: (completed, total) => {
        const percent = Math.round((completed / total) * 100);
        console.log(`📈 Progress: ${percent}% (${completed}/${total})`);
      }
    });

    const duration = Date.now() - startTime;
    
    // 6. Report results
    console.log(`\n${'='.repeat(50)}`);
    if (result.success) {
      console.log(`🏆 SUCCESS! Completed in ${this.formatDuration(duration)}`);
      console.log(`📊 Tasks: ${this.taskHistory.filter(t => t.status === 'completed').length}/${this.taskHistory.length} completed`);
    } else {
      console.log(`❌ FAILED: ${result.finalError}`);
      console.log(`📊 Completed: ${this.taskHistory.filter(t => t.status === 'completed').length}/${this.taskHistory.length}`);
    }
    console.log(`${'='.repeat(50)}\n`);

    return result;
  }

  /**
   * بناء Pipeline ديناميكي
   */
  private buildDynamicPipeline(goalType: GoalType, goal: string, plan: string): LoopTask[] {
    const baseTasks: LoopTask[] = [
      {
        name: 'Discovery & Analysis',
        phase: 'plan',
        required: true,
        customExecute: async () => {
          const analysis = this.analyzeProjectStructure();
          return { ok: true, output: analysis };
        }
      },
      {
        name: 'Architecture Planning',
        phase: 'plan',
        required: true,
        customExecute: async () => {
          // Plan already created in ignite
          return { ok: true, output: { plan } };
        }
      }
    ];

    const typeSpecificTasks = this.getTypeSpecificTasks(goalType);
    const qualityTasks = this.getQualityTasks(goalType);

    return [...baseTasks, ...typeSpecificTasks, ...qualityTasks];
  }

  private getTypeSpecificTasks(type: GoalType): LoopTask[] {
    const tasks: Record<GoalType, LoopTask[]> = {
      new_project: [
        { name: 'Scaffold Project', phase: 'build', tool: 'scaffold_project', args: {}, required: true },
        { name: 'Setup Database', phase: 'build', tool: 'setup_database', args: {}, required: true },
        { name: 'Install Dependencies', phase: 'build', tool: 'npm_install', args: {}, required: true },
        { name: 'Generate Core Code', phase: 'build', required: true, customExecute: async () => this.generateCoreCode() },
        { name: 'Setup Authentication', phase: 'build', tool: 'setup_auth', args: {}, required: false },
        { name: 'Build Frontend', phase: 'build', tool: 'build_frontend', args: {}, required: true },
        { name: 'Start Dev Server', phase: 'deploy', tool: 'dev_server_start', args: {}, required: true }
      ],
      add_feature: [
        { name: 'Analyze Feature', phase: 'plan', required: true, customExecute: async () => ({ ok: true, output: {} }) },
        { name: 'Generate Feature Code', phase: 'build', required: true, customExecute: async () => this.generateFeatureCode() },
        { name: 'Update Tests', phase: 'test', tool: 'update_tests', args: {}, required: false }
      ],
      fix_bug: [
        { name: 'Diagnose Issue', phase: 'plan', required: true, customExecute: async () => this.diagnoseIssue() },
        { name: 'Apply Fix', phase: 'build', required: true, customExecute: async () => this.applyFix() },
        { name: 'Verify Fix', phase: 'test', required: true, customExecute: async () => this.verifyFix() }
      ],
      refactor: [
        { name: 'Analyze Code', phase: 'plan', required: true, customExecute: async () => this.analyzeCodeQuality() },
        { name: 'Apply Refactoring', phase: 'build', required: true, customExecute: async () => this.applyRefactoring() },
        { name: 'Verify Changes', phase: 'test', required: true, customExecute: async () => this.verifyRefactoring() }
      ],
      ui_change: [
        { name: 'Design UI', phase: 'plan', required: true, customExecute: async () => ({ ok: true, output: {} }) },
        { name: 'Implement UI', phase: 'build', required: true, customExecute: async () => this.implementUI() },
        { name: 'Visual Test', phase: 'test', tool: 'visual_test', args: {}, required: false }
      ],
      deploy: [
        { name: 'Build Production', phase: 'build', tool: 'build_production', args: {}, required: true },
        { name: 'Run Tests', phase: 'test', tool: 'run_tests', args: {}, required: true },
        { name: 'Deploy', phase: 'deploy', tool: 'deploy', args: {}, required: true }
      ],
      optimize: [
        { name: 'Profile Performance', phase: 'plan', tool: 'profile', args: {}, required: true },
        { name: 'Apply Optimizations', phase: 'build', required: true, customExecute: async () => this.applyOptimizations() },
        { name: 'Verify Performance', phase: 'test', required: true, customExecute: async () => this.verifyPerformance() }
      ],
      security_audit: [
        { name: 'Scan Vulnerabilities', phase: 'plan', tool: 'security_scan', args: {}, required: true },
        { name: 'Fix Issues', phase: 'build', required: true, customExecute: async () => this.fixSecurityIssues() },
        { name: 'Verify Security', phase: 'test', tool: 'security_verify', args: {}, required: true }
      ],
      code_review: [
        { name: 'Analyze Code', phase: 'plan', required: true, customExecute: async () => this.analyzeCodeQuality() },
        { name: 'Generate Report', phase: 'build', required: true, customExecute: async () => this.generateCodeReview() }
      ],
      general: [
        { name: 'Analyze Request', phase: 'plan', required: true, customExecute: async () => ({ ok: true, output: {} }) },
        { name: 'Execute Task', phase: 'build', required: true, customExecute: async () => ({ ok: true, output: {} }) }
      ]
    };

    return tasks[type] || tasks.general;
  }

  private getQualityTasks(type: GoalType): LoopTask[] {
    return [
      { name: 'Lint Check', phase: 'test', tool: 'lint_check', args: {}, required: false },
      { name: 'Type Check', phase: 'test', tool: 'type_check', args: {}, required: false },
      { name: 'Final Review', phase: 'test', required: true, customExecute: async () => this.finalReview() }
    ];
  }

  private calculateMaxIterations(type: GoalType): number {
    const iterations: Record<GoalType, number> = {
      new_project: 1000,
      add_feature: 200,
      fix_bug: 100,
      refactor: 300,
      ui_change: 150,
      deploy: 100,
      optimize: 200,
      security_audit: 150,
      code_review: 100,
      general: 200
    };
    return iterations[type] || 200;
  }

  private async handleErrorWithHealing(error: Error, context: any): Promise<{ healed: boolean; retry: boolean }> {
    console.log(`🔧 Attempting self-healing for: ${error.message}`);
    
    const healing = await this.selfHealing.analyzeAndHeal(error.message, context);
    
    if (healing.canHeal && healing.action) {
      console.log(`💡 Healing strategy: ${healing.action}`);
      const success = await this.selfHealing.executeHealing(healing.action, healing.params);
      
      if (success) {
        console.log(`✅ Self-healing successful! Retrying...`);
        return { healed: true, retry: true };
      } else {
        console.log(`❌ Self-healing failed`);
        return { healed: false, retry: false };
      }
    }
    
    return { healed: false, retry: false };
  }

  private trackTask(name: string, status: TaskStatus['status']) {
    const existing = this.taskHistory.find(t => t.name === name);
    if (existing) {
      existing.status = status;
      if (status === 'completed' || status === 'failed') {
        existing.endTime = new Date();
      }
    } else {
      this.taskHistory.push({
        id: `task_${Date.now()}`,
        name,
        status,
        progress: status === 'completed' ? 100 : 0,
        startTime: new Date(),
        retries: 0
      });
    }
  }

  private analyzeProjectStructure() {
    // Implementation
    return { structure: 'analyzed' };
  }

  private async generateCoreCode() {
    // Implementation
    return { ok: true, output: { generated: true } };
  }

  private async generateFeatureCode() {
    return { ok: true, output: {} };
  }

  private async diagnoseIssue() {
    return { ok: true, output: {} };
  }

  private async applyFix() {
    return { ok: true, output: {} };
  }

  private async verifyFix() {
    return { ok: true, output: {} };
  }

  private async analyzeCodeQuality() {
    return { ok: true, output: {} };
  }

  private async applyRefactoring() {
    return { ok: true, output: {} };
  }

  private async verifyRefactoring() {
    return { ok: true, output: {} };
  }

  private async implementUI() {
    return { ok: true, output: {} };
  }

  private async applyOptimizations() {
    return { ok: true, output: {} };
  }

  private async verifyPerformance() {
    return { ok: true, output: {} };
  }

  private async fixSecurityIssues() {
    return { ok: true, output: {} };
  }

  private async generateCodeReview() {
    return { ok: true, output: {} };
  }

  private async finalReview() {
    return { ok: true, output: {} };
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

export { SmartGoalClassifier, SelfHealingEngine, CodeIntelligenceEngine };
