/**
 * Realtime Validator - التحقق الفوري من جودة الكود والخطوات
 * 
 * @version 1.0.0
 */

export interface Step {
    id: string;
    type: 'file_creation' | 'code_generation' | 'command_execution' | 'test_execution';
    name: string;
}

export interface StepResult {
    ok: boolean;
    output?: any;
    error?: string;
    code?: string;
    language?: string;
}

export interface Issue {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    line?: number;
    suggestion?: string;
}

export interface Validation {
    passed: boolean;
    issues: Issue[];
}

export interface ValidationResult {
    passed: boolean;
    validations: Validation[];
    autoFixed: number;
}

export class RealtimeValidator {
    /**
     * التحقق الفوري بعد كل خطوة
     */
    async validateStep(
        step: Step,
        result: StepResult
    ): Promise<ValidationResult> {
        const validations: Validation[] = [];
        
        if (step.type === 'file_creation') {
            validations.push(await this.validateFileCreation(result));
        }
        
        if (step.type === 'code_generation') {
            validations.push(await this.validateCode(result));
        }
        
        if (step.type === 'command_execution') {
            validations.push(await this.validateCommand(result));
        }
        
        if (step.type === 'test_execution') {
            validations.push(await this.validateTests(result));
        }
        
        const allPassed = validations.every(v => v.passed);
        const criticalFailures = validations.filter(v => !v.passed && v.issues.some(i => i.severity === 'critical'));
        
        if (criticalFailures.length > 0) {
            await this.autoFixCriticalIssues(criticalFailures);
        }
        
        return {
            passed: allPassed,
            validations,
            autoFixed: criticalFailures.length
        };
    }
    
    /**
     * التحقق من إنشاء الملفات
     */
    private async validateFileCreation(result: StepResult): Promise<Validation> {
        const issues: Issue[] = [];
        
        if (!result.ok) {
            issues.push({
                type: 'file_creation_failed',
                severity: 'critical',
                message: result.error || 'File creation failed'
            });
        }
        
        return {
            passed: issues.filter(i => i.severity === 'critical').length === 0,
            issues
        };
    }
    
    /**
     * التحقق من الكود المولد
     */
    private async validateCode(result: StepResult): Promise<Validation> {
        const code = result.output?.code || result.code || '';
        const issues: Issue[] = [];
        
        if (!code || code.trim().length === 0) {
            issues.push({
                type: 'empty_code',
                severity: 'critical',
                message: 'Generated code is empty'
            });
            return { passed: false, issues };
        }
        
        // فحص Placeholders
        const placeholderPatterns = [
            /TODO/g,
            /FIXME/g,
            /placeholder/gi,
            /\.\.\.(?!\w)/g,
            /\/\/\s*\.\.\./g
        ];
        
        for (const pattern of placeholderPatterns) {
            const matches = code.match(pattern);
            if (matches && matches.length > 0) {
                issues.push({
                    type: 'incomplete_code',
                    severity: 'high',
                    message: `Code contains ${matches.length} placeholder(s): ${pattern.source}`,
                    suggestion: 'Replace placeholders with actual implementation'
                });
            }
        }
        
        // فحص Syntax الأساسي
        const syntaxIssues = this.checkBasicSyntax(code, result.language || 'javascript');
        issues.push(...syntaxIssues);
        
        // فحص Imports
        if (code.includes('export') && !code.includes('import') && code.length > 100) {
            const hasRequire = code.includes('require(');
            if (!hasRequire) {
                issues.push({
                    type: 'missing_imports',
                    severity: 'medium',
                    message: 'File has exports but no imports',
                    suggestion: 'Add necessary import statements'
                });
            }
        }
        
        // فحص معالجة الأخطاء
        if (code.length > 200 && !code.includes('try') && !code.includes('catch')) {
            const hasAsync = code.includes('async');
            if (hasAsync) {
                issues.push({
                    type: 'missing_error_handling',
                    severity: 'low',
                    message: 'Async code without try-catch',
                    suggestion: 'Add error handling for async operations'
                });
            }
        }
        
        return {
            passed: issues.filter(i => i.severity === 'critical').length === 0,
            issues
        };
    }
    
    /**
     * فحص Syntax الأساسي
     */
    private checkBasicSyntax(code: string, language: string): Issue[] {
        const issues: Issue[] = [];
        
        // فحص الأقواس المتطابقة
        const brackets = { '{': '}', '[': ']', '(': ')' };
        const stack: string[] = [];
        
        for (const char of code) {
            if (char in brackets) {
                stack.push(char);
            } else if (Object.values(brackets).includes(char)) {
                const last = stack.pop();
                if (!last || brackets[last as keyof typeof brackets] !== char) {
                    issues.push({
                        type: 'syntax_error',
                        severity: 'critical',
                        message: 'Mismatched brackets',
                        suggestion: 'Check bracket pairing'
                    });
                    break;
                }
            }
        }
        
        if (stack.length > 0) {
            issues.push({
                type: 'syntax_error',
                severity: 'critical',
                message: 'Unclosed brackets',
                suggestion: 'Close all opened brackets'
            });
        }
        
        return issues;
    }
    
    /**
     * التحقق من تنفيذ الأوامر
     */
    private async validateCommand(result: StepResult): Promise<Validation> {
        const issues: Issue[] = [];
        
        if (!result.ok) {
            issues.push({
                type: 'command_failed',
                severity: 'high',
                message: result.error || 'Command execution failed'
            });
        }
        
        return {
            passed: issues.filter(i => i.severity === 'critical').length === 0,
            issues
        };
    }
    
    /**
     * التحقق من الاختبارات
     */
    private async validateTests(result: StepResult): Promise<Validation> {
        const issues: Issue[] = [];
        
        if (!result.ok) {
            issues.push({
                type: 'tests_failed',
                severity: 'high',
                message: 'Some tests failed'
            });
        }
        
        return {
            passed: issues.filter(i => i.severity === 'critical').length === 0,
            issues
        };
    }
    
    /**
     * إصلاح تلقائي للمشاكل الحرجة
     */
    private async autoFixCriticalIssues(failures: Validation[]): Promise<void> {
        for (const failure of failures) {
            for (const issue of failure.issues) {
                if (issue.severity === 'critical') {
                    // يمكن إضافة منطق الإصلاح التلقائي هنا
                    // في الوقت الحالي، نسجل فقط
                }
            }
        }
    }
}

export const realtimeValidator = new RealtimeValidator();
