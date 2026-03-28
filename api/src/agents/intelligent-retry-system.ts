/**
 * Intelligent Retry System - نظام إعادة محاولة ذكي يتعلم من الأخطاء
 * 
 * @version 1.0.0
 */

export interface Task {
    id: string;
    name: string;
    type: string;
    input?: any;
}

export interface ErrorPattern {
    type: string;
    signature: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface Fix {
    action: string;
    input?: any;
    confidence: number;
    timestamp: number;
}

export interface RootCause {
    category: string;
    description: string;
    suggestedFix: string;
}

export interface RetryStrategy {
    strategy: 'apply_known_fix' | 'direct_fix' | 'alternative_approach' | 'simplify' | 'ask_user';
    action?: string;
    fix?: Fix;
    confidence: number;
}

export class IntelligentRetrySystem {
    private errorPatterns: Map<string, ErrorPattern> = new Map();
    private successfulFixes: Map<string, Fix> = new Map();
    private errorHistory: Map<string, number> = new Map();
    
    /**
     * إعادة محاولة ذكية - تتعلم من الأخطاء
     */
    async retryWithLearning(
        task: Task,
        error: string,
        attemptNumber: number
    ): Promise<RetryStrategy> {
        // 1. تحليل نمط الخطأ
        const errorPattern = this.analyzeErrorPattern(error);
        
        // 2. البحث عن حلول سابقة ناجحة
        const knownFix = this.successfulFixes.get(errorPattern.signature);
        if (knownFix && attemptNumber <= 2) {
            return {
                strategy: 'apply_known_fix',
                fix: knownFix,
                confidence: 0.9
            };
        }
        
        // 3. تحليل السبب الجذري
        const rootCause = await this.analyzeRootCause(error, task);
        
        // 4. اقتراح استراتيجية مختلفة
        return this.suggestAlternativeStrategy(rootCause, attemptNumber);
    }
    
    /**
     * تحليل نمط الخطأ
     */
    private analyzeErrorPattern(error: string): ErrorPattern {
        const patterns = [
            { type: 'dependency_missing', regex: /cannot find module|module not found|ENOENT|ERR_MODULE_NOT_FOUND/i, severity: 'high' as const },
            { type: 'syntax_error', regex: /SyntaxError|Unexpected token|Parse error|Unexpected end of input/i, severity: 'critical' as const },
            { type: 'type_error', regex: /TypeError|is not a function|undefined|null/i, severity: 'high' as const },
            { type: 'permission_denied', regex: /EACCES|permission denied|EPERM/i, severity: 'critical' as const },
            { type: 'network_error', regex: /ECONNREFUSED|ETIMEDOUT|network|fetch failed/i, severity: 'medium' as const },
            { type: 'build_failed', regex: /build failed|compilation error|failed to compile/i, severity: 'high' as const },
            { type: 'test_failed', regex: /test.*failed|assertion.*failed|expected.*to/i, severity: 'medium' as const },
            { type: 'port_in_use', regex: /EADDRINUSE|port.*already in use/i, severity: 'medium' as const },
            { type: 'out_of_memory', regex: /out of memory|heap out of memory|ENOMEM/i, severity: 'critical' as const }
        ];
        
        for (const pattern of patterns) {
            if (pattern.regex.test(error)) {
                return {
                    type: pattern.type,
                    signature: this.generateSignature(error, pattern.type),
                    severity: pattern.severity
                };
            }
        }
        
        return {
            type: 'unknown',
            signature: this.generateSignature(error, 'unknown'),
            severity: 'medium'
        };
    }
    
    /**
     * توليد توقيع فريد للخطأ
     */
    private generateSignature(error: string, type: string): string {
        const normalized = error
            .toLowerCase()
            .replace(/[0-9]+/g, 'N')
            .replace(/['"]/g, '')
            .slice(0, 100);
        
        return `${type}:${normalized}`;
    }
    
    /**
     * تحليل السبب الجذري
     */
    private async analyzeRootCause(error: string, task: Task): Promise<RootCause> {
        const errorPattern = this.analyzeErrorPattern(error);
        
        const rootCauses: Record<string, RootCause> = {
            'dependency_missing': {
                category: 'dependencies',
                description: 'Missing npm package or module',
                suggestedFix: 'Install missing dependencies using npm install'
            },
            'syntax_error': {
                category: 'code_quality',
                description: 'Invalid JavaScript/TypeScript syntax',
                suggestedFix: 'Fix syntax errors in the generated code'
            },
            'type_error': {
                category: 'code_quality',
                description: 'Type mismatch or undefined reference',
                suggestedFix: 'Add proper type checking and null checks'
            },
            'permission_denied': {
                category: 'system',
                description: 'Insufficient file system permissions',
                suggestedFix: 'Check file permissions or run with appropriate privileges'
            },
            'network_error': {
                category: 'network',
                description: 'Network connectivity issue',
                suggestedFix: 'Retry with exponential backoff or check network connection'
            },
            'build_failed': {
                category: 'build',
                description: 'Build process failed',
                suggestedFix: 'Fix compilation errors and ensure all dependencies are installed'
            },
            'port_in_use': {
                category: 'system',
                description: 'Port already in use by another process',
                suggestedFix: 'Use a different port or kill the process using the port'
            }
        };
        
        return rootCauses[errorPattern.type] || {
            category: 'unknown',
            description: 'Unknown error type',
            suggestedFix: 'Review error message and try alternative approach'
        };
    }
    
    /**
     * اقتراح استراتيجية بديلة بناءً على عدد المحاولات
     */
    private suggestAlternativeStrategy(
        rootCause: RootCause,
        attemptNumber: number
    ): RetryStrategy {
        switch (attemptNumber) {
            case 1:
                // المحاولة الأولى: إصلاح مباشر
                return {
                    strategy: 'direct_fix',
                    action: rootCause.suggestedFix,
                    confidence: 0.7
                };
            
            case 2:
                // المحاولة الثانية: نهج مختلف
                return {
                    strategy: 'alternative_approach',
                    action: 'Try a different implementation method or tool',
                    confidence: 0.6
                };
            
            case 3:
                // المحاولة الثالثة: تبسيط
                return {
                    strategy: 'simplify',
                    action: 'Break down into smaller, simpler steps',
                    confidence: 0.5
                };
            
            default:
                // بعد 3 محاولات: طلب مساعدة المستخدم
                return {
                    strategy: 'ask_user',
                    action: 'Request user guidance or clarification',
                    confidence: 0.3
                };
        }
    }
    
    /**
     * حفظ الحل الناجح للتعلم المستقبلي
     */
    recordSuccessfulFix(errorSignature: string, fix: Fix): void {
        this.successfulFixes.set(errorSignature, {
            ...fix,
            timestamp: Date.now()
        });
        
        // حفظ في الذاكرة الدائمة (يمكن تحسينه لاحقاً بحفظ في قاعدة البيانات)
        this.persistToStorage();
    }
    
    /**
     * تسجيل فشل للتعلم
     */
    recordFailure(errorSignature: string): void {
        const count = this.errorHistory.get(errorSignature) || 0;
        this.errorHistory.set(errorSignature, count + 1);
    }
    
    /**
     * الحصول على إحصائيات التعلم
     */
    getStats(): {
        knownFixes: number;
        errorPatterns: number;
        totalFailures: number;
    } {
        const totalFailures = Array.from(this.errorHistory.values())
            .reduce((sum, count) => sum + count, 0);
        
        return {
            knownFixes: this.successfulFixes.size,
            errorPatterns: this.errorPatterns.size,
            totalFailures
        };
    }
    
    /**
     * حفظ في التخزين الدائم
     */
    private persistToStorage(): void {
        // يمكن تحسينه لاحقاً بحفظ في ملف أو قاعدة بيانات
        // في الوقت الحالي، نحتفظ بالبيانات في الذاكرة فقط
    }
    
    /**
     * استعادة من التخزين الدائم
     */
    loadFromStorage(): void {
        // يمكن تحسينه لاحقاً بالتحميل من ملف أو قاعدة بيانات
    }
}

// Export singleton instance
export const intelligentRetrySystem = new IntelligentRetrySystem();
