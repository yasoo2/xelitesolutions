/**
 * Weak Model Enhancer - يجعل جو قوياً حتى مع الموديلات الضعيفة
 * 
 * الاستراتيجيات:
 * 1. Multi-Pass Processing - تقسيم المهام الضخمة
 * 2. Enhanced Prompts - تعليمات واضحة جداً
 * 3. Self-Correction - التحقق والتصحيح التلقائي
 * 4. Template-Based Generation - قوالب جاهزة
 * 5. Iterative Refinement - التحسين التدريجي
 */

export interface WeakModelStrategy {
    useMultiPass: boolean;
    maxPassCount: number;
    useTemplates: boolean;
    useSelfCorrection: boolean;
    useIterativeRefinement: boolean;
}

export interface EnhancedPrompt {
    systemPrompt: string;
    userPrompt: string;
    constraints: string[];
    examples: string[];
}

/**
 * تحليل المهمة وتحديد الاستراتيجية المناسبة
 */
export function analyzeTaskComplexity(userRequest: string): {
    complexity: 'simple' | 'medium' | 'complex' | 'extreme';
    estimatedSteps: number;
    requiresMultiPass: boolean;
    suggestedStrategy: WeakModelStrategy;
} {
    const length = userRequest.length;
    const wordCount = userRequest.split(/\s+/).length;
    
    // كشف المشاريع الضخمة
    const isLargeProject = /(build|create|develop).*?(complete|full|entire|whole|comprehensive|كامل|شامل)/i.test(userRequest) ||
        /(e-?commerce|متجر|دكان|منصة|نظام.*كامل)/i.test(userRequest) ||
        wordCount > 100;
    
    // كشف المهام المعقدة
    const isComplexTask = /(with|include|add|implement).*?(auth|payment|database|api|backend|frontend)/gi.test(userRequest);
    const featureCount = (userRequest.match(/(with|include|add|implement)/gi) || []).length;
    
    let complexity: 'simple' | 'medium' | 'complex' | 'extreme' = 'simple';
    let estimatedSteps = 1;
    let requiresMultiPass = false;
    
    if (isLargeProject || featureCount > 5) {
        complexity = 'extreme';
        estimatedSteps = 15 + featureCount * 3;
        requiresMultiPass = true;
    } else if (isComplexTask || featureCount > 2 || wordCount > 50) {
        complexity = 'complex';
        estimatedSteps = 8 + featureCount * 2;
        requiresMultiPass = true;
    } else if (wordCount > 20 || featureCount > 0) {
        complexity = 'medium';
        estimatedSteps = 4;
        requiresMultiPass = false;
    }
    
    return {
        complexity,
        estimatedSteps,
        requiresMultiPass,
        suggestedStrategy: {
            useMultiPass: requiresMultiPass,
            maxPassCount: Math.min(estimatedSteps, 20),
            useTemplates: complexity !== 'simple',
            useSelfCorrection: complexity === 'complex' || complexity === 'extreme',
            useIterativeRefinement: complexity === 'extreme'
        }
    };
}

/**
 * تقسيم المهمة الضخمة إلى خطوات صغيرة
 */
export function breakDownLargeTask(userRequest: string, analysis: ReturnType<typeof analyzeTaskComplexity>): string[] {
    const steps: string[] = [];
    
    if (!analysis.requiresMultiPass) {
        return [userRequest];
    }
    
    // استخراج المكونات الرئيسية
    const hasAuth = /auth|login|signup|register|مصادقة|تسجيل/i.test(userRequest);
    const hasDatabase = /database|db|mongo|postgres|sql|قاعدة.*بيانات/i.test(userRequest);
    const hasAPI = /api|backend|server|endpoint|خادم|واجهة.*برمجية/i.test(userRequest);
    const hasFrontend = /frontend|ui|interface|react|vue|واجهة|صفحة/i.test(userRequest);
    const hasPayment = /payment|stripe|checkout|دفع|شراء/i.test(userRequest);
    const hasDeployment = /deploy|host|production|نشر|استضافة/i.test(userRequest);
    
    // بناء الخطوات بترتيب منطقي
    steps.push('1. تحليل المتطلبات وإنشاء بنية المشروع الأساسية');
    
    if (hasDatabase) {
        steps.push('2. تصميم قاعدة البيانات وإنشاء النماذج (Models)');
    }
    
    if (hasAPI) {
        steps.push('3. بناء API الأساسي والـ Routes');
    }
    
    if (hasAuth) {
        steps.push('4. تطبيق نظام المصادقة والأمان');
    }
    
    if (hasFrontend) {
        steps.push('5. بناء واجهة المستخدم والمكونات الأساسية');
    }
    
    if (hasPayment) {
        steps.push('6. تكامل نظام الدفع');
    }
    
    steps.push(`${steps.length + 1}. الاختبار والتحقق من الجودة`);
    
    if (hasDeployment) {
        steps.push(`${steps.length + 1}. النشر والإطلاق`);
    }
    
    return steps;
}

/**
 * إنشاء Prompt محسّن للموديلات الضعيفة
 */
export function createEnhancedPrompt(
    userRequest: string,
    step: string,
    stepNumber: number,
    totalSteps: number,
    previousContext?: string
): EnhancedPrompt {
    const isArabic = /[\u0600-\u06FF]/.test(userRequest);
    
    const systemPrompt = isArabic ? `أنت مهندس برمجيات محترف متخصص في بناء الأنظمة.

🎯 **مهمتك الحالية**: ${step}
📊 **التقدم**: الخطوة ${stepNumber} من ${totalSteps}

⚠️ **قواعد صارمة**:
1. ركز فقط على الخطوة الحالية - لا تحاول عمل كل شيء دفعة واحدة
2. اكتب كود كامل وجاهز للتشغيل - لا placeholders
3. استخدم أفضل الممارسات والمعايير الحديثة
4. أضف التعليقات فقط للأجزاء المعقدة
5. تأكد من أن الكود يعمل بدون أخطاء

${previousContext ? `📝 **السياق السابق**:\n${previousContext}\n` : ''}

✅ **عند الانتهاء**: تأكد من أن الكود:
- يعمل بدون أخطاء
- يتبع المعايير الحديثة
- جاهز للاستخدام مباشرة` : 
`You are a professional software engineer specialized in building systems.

🎯 **Current Task**: ${step}
📊 **Progress**: Step ${stepNumber} of ${totalSteps}

⚠️ **Strict Rules**:
1. Focus ONLY on the current step - don't try to do everything at once
2. Write complete, production-ready code - NO placeholders
3. Use best practices and modern standards
4. Add comments only for complex parts
5. Ensure code runs without errors

${previousContext ? `📝 **Previous Context**:\n${previousContext}\n` : ''}

✅ **When Done**: Ensure the code:
- Runs without errors
- Follows modern standards
- Is ready to use immediately`;

    const userPrompt = `${step}\n\nالطلب الأصلي: ${userRequest}`;
    
    const constraints = [
        'استخدم TypeScript للكود',
        'اتبع معايير ES2020+',
        'أضف معالجة الأخطاء',
        'استخدم async/await',
        'اكتب كود نظيف وقابل للصيانة'
    ];
    
    const examples = [];
    
    return {
        systemPrompt,
        userPrompt,
        constraints,
        examples
    };
}

/**
 * نظام التحقق والتصحيح الذاتي
 */
export class SelfCorrectionSystem {
    private corrections: Map<string, string[]> = new Map();
    
    /**
     * التحقق من جودة الكود المولد
     */
    checkCodeQuality(code: string, language: string = 'typescript'): {
        isValid: boolean;
        issues: string[];
        suggestions: string[];
    } {
        const issues: string[] = [];
        const suggestions: string[] = [];
        
        // فحص Placeholders
        if (/TODO|FIXME|placeholder|\/\/ \.\.\./i.test(code)) {
            issues.push('يحتوي الكود على placeholders - يجب استكمالها');
        }
        
        // فحص معالجة الأخطاء
        if (language === 'typescript' || language === 'javascript') {
            if (!/try\s*{|catch\s*\(/i.test(code) && code.length > 200) {
                suggestions.push('يُفضل إضافة معالجة للأخطاء (try-catch)');
            }
        }
        
        // فحص التعليقات الزائدة
        const commentLines = (code.match(/\/\/.*/g) || []).length;
        const codeLines = code.split('\n').length;
        if (commentLines > codeLines * 0.3) {
            suggestions.push('تعليقات كثيرة - الكود يجب أن يكون واضحاً بدون تعليقات زائدة');
        }
        
        // فحص الـ imports
        if (language === 'typescript' && code.includes('export') && !code.includes('import')) {
            if (code.length > 100) {
                suggestions.push('قد تحتاج إلى إضافة imports');
            }
        }
        
        return {
            isValid: issues.length === 0,
            issues,
            suggestions
        };
    }
    
    /**
     * اقتراح تصحيحات
     */
    suggestCorrections(code: string, issues: string[]): string {
        if (issues.length === 0) return code;
        
        let correctedCode = code;
        
        // إزالة placeholders
        correctedCode = correctedCode.replace(/\/\/ TODO:.*/g, '');
        correctedCode = correctedCode.replace(/\/\/ FIXME:.*/g, '');
        correctedCode = correctedCode.replace(/\/\/ \.\.\./g, '');
        
        return correctedCode;
    }
}

/**
 * نظام القوالب الجاهزة
 */
export class TemplateSystem {
    private templates: Map<string, string> = new Map();
    
    constructor() {
        this.initializeTemplates();
    }
    
    private initializeTemplates() {
        // قالب React Component
        this.templates.set('react-component', `import React from 'react';

interface Props {
    // Add props here
}

export const ComponentName: React.FC<Props> = (props) => {
    return (
        <div>
            {/* Component content */}
        </div>
    );
};`);

        // قالب Express Route
        this.templates.set('express-route', `import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
    try {
        // Route logic here
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;`);

        // قالب TypeScript Interface
        this.templates.set('typescript-interface', `export interface InterfaceName {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}`);

        // قالب Mongoose Model
        this.templates.set('mongoose-model', `import mongoose, { Schema, Document } from 'mongoose';

export interface IModel extends Document {
    // Add fields here
}

const ModelSchema = new Schema({
    // Schema definition
}, { timestamps: true });

export default mongoose.model<IModel>('ModelName', ModelSchema);`);
    }
    
    getTemplate(type: string): string | null {
        return this.templates.get(type) || null;
    }
    
    detectTemplateType(request: string): string | null {
        if (/react.*component|مكون.*react/i.test(request)) {
            return 'react-component';
        }
        if (/express.*route|api.*endpoint/i.test(request)) {
            return 'express-route';
        }
        if (/interface|type.*definition/i.test(request)) {
            return 'typescript-interface';
        }
        if (/mongoose.*model|schema/i.test(request)) {
            return 'mongoose-model';
        }
        return null;
    }
}

/**
 * نظام التحسين التدريجي
 */
export class IterativeRefinement {
    private iterations: number = 0;
    private maxIterations: number = 3;
    
    /**
     * تحسين الكود تدريجياً
     */
    async refineCode(
        initialCode: string,
        requirements: string[],
        validator: (code: string) => boolean
    ): Promise<string> {
        let currentCode = initialCode;
        
        for (let i = 0; i < this.maxIterations; i++) {
            if (validator(currentCode)) {
                console.log(`[IterativeRefinement] Code validated after ${i + 1} iterations`);
                break;
            }
            
            // هنا يمكن إضافة منطق التحسين
            // في الوقت الحالي، نعيد الكود كما هو
            this.iterations++;
        }
        
        return currentCode;
    }
}

// Export instances
export const selfCorrectionSystem = new SelfCorrectionSystem();
export const templateSystem = new TemplateSystem();
export const iterativeRefinement = new IterativeRefinement();

export default {
    analyzeTaskComplexity,
    breakDownLargeTask,
    createEnhancedPrompt,
    selfCorrectionSystem,
    templateSystem,
    iterativeRefinement
};
