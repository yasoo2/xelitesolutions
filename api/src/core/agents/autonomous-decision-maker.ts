/**
 * Autonomous Decision Maker - اتخاذ قرارات ذكية تلقائياً
 * 
 * @version 1.0.0
 */

export interface DecisionContext {
    projectType?: string;
    userPreferences?: Record<string, any>;
    previousDecisions?: string[];
    constraints?: string[];
}

export interface Decision {
    choice: string;
    reason: string;
    confidence: number;
    alternatives?: string[];
}

export class AutonomousDecisionMaker {
    private decisionHistory: Map<string, Decision> = new Map();
    
    /**
     * اتخاذ قرارات ذاتية بناءً على السياق
     */
    async makeDecision(
        question: string,
        context: DecisionContext
    ): Promise<Decision> {
        const confidence = this.calculateConfidence(question, context);
        
        if (confidence >= 0.8) {
            return this.makeConfidentDecision(question, context);
        } else if (confidence >= 0.5) {
            const decision = this.makeConfidentDecision(question, context);
            return decision;
        } else {
            return this.askUser(question, context);
        }
    }
    
    /**
     * حساب مستوى الثقة
     */
    private calculateConfidence(question: string, context: DecisionContext): number {
        let confidence = 0.5;
        
        if (context.projectType) confidence += 0.2;
        if (context.userPreferences && Object.keys(context.userPreferences).length > 0) confidence += 0.2;
        if (context.previousDecisions && context.previousDecisions.length > 0) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }
    
    /**
     * قرارات شائعة يمكن اتخاذها تلقائياً
     */
    private makeConfidentDecision(
        question: string,
        context: DecisionContext
    ): Decision {
        const commonDecisions = [
            {
                pattern: /which.*framework|what.*framework|أي.*إطار|ما.*إطار/i,
                decision: () => this.chooseFramework(context)
            },
            {
                pattern: /which.*database|what.*database|أي.*قاعدة.*بيانات|ما.*قاعدة/i,
                decision: () => this.chooseDatabase(context)
            },
            {
                pattern: /which.*styling|what.*css|أي.*تنسيق|ما.*تنسيق/i,
                decision: () => ({ choice: 'TailwindCSS', reason: 'Modern utility-first CSS framework', confidence: 0.9 })
            },
            {
                pattern: /typescript.*javascript|ts.*js/i,
                decision: () => ({ choice: 'TypeScript', reason: 'Type safety and better developer experience', confidence: 0.95 })
            },
            {
                pattern: /npm.*yarn.*pnpm/i,
                decision: () => ({ choice: 'npm', reason: 'Default package manager, widely compatible', confidence: 0.8 })
            },
            {
                pattern: /which.*port|what.*port/i,
                decision: () => ({ choice: '3000', reason: 'Standard development port', confidence: 0.9 })
            }
        ];
        
        for (const cd of commonDecisions) {
            if (cd.pattern.test(question)) {
                return cd.decision();
            }
        }
        
        return {
            choice: 'Use industry best practices',
            reason: 'Following modern development standards',
            confidence: 0.7
        };
    }
    
    /**
     * اختيار Framework بناءً على السياق
     */
    private chooseFramework(context: DecisionContext): Decision {
        const projectType = context.projectType?.toLowerCase() || '';
        
        if (projectType.includes('api') || projectType.includes('backend')) {
            return {
                choice: 'Express.js',
                reason: 'Lightweight, flexible, widely used for Node.js APIs',
                confidence: 0.9,
                alternatives: ['Fastify', 'NestJS']
            };
        }
        
        if (projectType.includes('web') || projectType.includes('frontend')) {
            return {
                choice: 'React + Vite',
                reason: 'Fast build tool, modern React setup, excellent DX',
                confidence: 0.9,
                alternatives: ['Next.js', 'Vue.js']
            };
        }
        
        return {
            choice: 'Next.js',
            reason: 'Full-stack framework with SSR, great for most projects',
            confidence: 0.85,
            alternatives: ['Remix', 'SvelteKit']
        };
    }
    
    /**
     * اختيار Database بناءً على السياق
     */
    private chooseDatabase(context: DecisionContext): Decision {
        const projectType = context.projectType?.toLowerCase() || '';
        
        if (projectType.includes('real-time') || projectType.includes('chat')) {
            return {
                choice: 'MongoDB',
                reason: 'Flexible schema, good for real-time applications',
                confidence: 0.85,
                alternatives: ['PostgreSQL with real-time extensions']
            };
        }
        
        if (projectType.includes('analytics') || projectType.includes('reporting')) {
            return {
                choice: 'PostgreSQL',
                reason: 'Powerful querying, ACID compliance, great for analytics',
                confidence: 0.9,
                alternatives: ['MySQL', 'TimescaleDB']
            };
        }
        
        return {
            choice: 'MongoDB',
            reason: 'Flexible, easy to start with, good for most applications',
            confidence: 0.8,
            alternatives: ['PostgreSQL', 'MySQL']
        };
    }
    
    /**
     * طلب مساعدة المستخدم
     */
    private askUser(question: string, context: DecisionContext): Decision {
        return {
            choice: 'ask_user',
            reason: 'Confidence too low, need user input',
            confidence: 0.3
        };
    }
    
    /**
     * حفظ القرار في التاريخ
     */
    recordDecision(question: string, decision: Decision): void {
        this.decisionHistory.set(question, decision);
    }
    
    /**
     * الحصول على قرار سابق
     */
    getPreviousDecision(question: string): Decision | undefined {
        return this.decisionHistory.get(question);
    }
}

export const autonomousDecisionMaker = new AutonomousDecisionMaker();
