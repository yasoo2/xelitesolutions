/**
 * Smart Context Manager - إدارة ذكية للسياق في المحادثات الطويلة
 * 
 * بدلاً من حذف الرسائل القديمة، يتم تلخيصها بذكاء للحفاظ على المعلومات الحرجة
 * 
 * @version 1.0.0
 */

export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ContextSummary {
    filesCreated: string[];
    decisions: string[];
    errorsFixed: string[];
    currentGoal: string;
    timestamp: number;
}

export interface ContextStats {
    totalMessages: number;
    estimatedTokens: number;
    compressionRatio: number;
}

export class SmartContextManager {
    private contextSummaries: Map<string, ContextSummary> = new Map();
    private readonly CHARS_PER_TOKEN = 4; // تقريبي
    
    /**
     * ضغط السياق بذكاء - يحتفظ بالمعلومات الحرجة
     */
    async compressContext(
        messages: Message[],
        maxTokens: number = 8000
    ): Promise<Message[]> {
        const estimatedTokens = this.estimateTokens(messages);
        
        if (estimatedTokens <= maxTokens) {
            return messages;
        }
        
        console.log(`[SmartContextManager] Compressing ${messages.length} messages (${estimatedTokens} tokens → ${maxTokens} tokens)`);
        
        // 1. احتفظ بأول رسالة (system prompt)
        const system = messages[0];
        
        // 2. احتفظ بآخر 20 رسالة (السياق الحالي)
        const recentCount = Math.min(20, messages.length - 1);
        const recent = messages.slice(-recentCount);
        
        // 3. لخص الرسائل الوسطى
        const middle = messages.slice(1, -recentCount);
        
        if (middle.length === 0) {
            return messages;
        }
        
        const summary = await this.summarizeMessages(middle);
        
        const compressed = [
            system,
            {
                role: 'system' as const,
                content: `📚 **ملخص السياق السابق** (${middle.length} رسالة):\n\n${summary}\n\n---\n`
            },
            ...recent
        ];
        
        const newTokens = this.estimateTokens(compressed);
        console.log(`[SmartContextManager] ✅ Compressed: ${messages.length} → ${compressed.length} messages, ${estimatedTokens} → ${newTokens} tokens`);
        
        return compressed;
    }
    
    /**
     * تلخيص ذكي يحتفظ بالمعلومات الحرجة
     */
    private async summarizeMessages(messages: Message[]): Promise<string> {
        const criticalInfo = {
            filesCreated: this.extractFilesCreated(messages),
            decisions: this.extractDecisions(messages),
            errorsFixed: this.extractErrorsFixes(messages),
            currentGoal: this.extractCurrentGoal(messages),
            toolsUsed: this.extractToolsUsed(messages)
        };
        
        const parts: string[] = [];
        
        if (criticalInfo.filesCreated.length > 0) {
            parts.push(`**الملفات المنشأة**: ${criticalInfo.filesCreated.slice(0, 20).join(', ')}${criticalInfo.filesCreated.length > 20 ? ` (+${criticalInfo.filesCreated.length - 20} ملف)` : ''}`);
        }
        
        if (criticalInfo.decisions.length > 0) {
            parts.push(`**القرارات المتخذة**:\n${criticalInfo.decisions.map(d => `  - ${d}`).join('\n')}`);
        }
        
        if (criticalInfo.errorsFixed.length > 0) {
            parts.push(`**الأخطاء المصلحة**: ${criticalInfo.errorsFixed.length} خطأ`);
        }
        
        if (criticalInfo.toolsUsed.length > 0) {
            parts.push(`**الأدوات المستخدمة**: ${criticalInfo.toolsUsed.join(', ')}`);
        }
        
        if (criticalInfo.currentGoal) {
            parts.push(`**الهدف**: ${criticalInfo.currentGoal}`);
        }
        
        return parts.join('\n\n');
    }
    
    /**
     * استخراج الملفات المنشأة من التاريخ
     */
    private extractFilesCreated(messages: Message[]): string[] {
        const files = new Set<string>();
        const patterns = [
            /(?:created|wrote|generated|writing|creating)\s+(?:file\s+)?[`']?([^\s`'"]+\.[a-z]{2,4})[`']?/gi,
            /(?:ملف|كتبت|أنشأت|توليد)\s+[`']?([^\s`'"]+\.[a-z]{2,4})[`']?/gi,
            /[`']([^\s`'"]+\.(ts|js|tsx|jsx|json|md|css|html|py|java|go|rs))[`']/gi
        ];
        
        for (const msg of messages) {
            const content = String(msg.content || '');
            for (const pattern of patterns) {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    if (match[1] && match[1].length < 100) {
                        files.add(match[1]);
                    }
                }
            }
        }
        
        return Array.from(files);
    }
    
    /**
     * استخراج القرارات الهامة
     */
    private extractDecisions(messages: Message[]): string[] {
        const decisions: string[] = [];
        const decisionPatterns = [
            /(?:decided to|chose to|selected|using|will use|opted for)\s+([^.!?\n]{10,100})/gi,
            /(?:قررت|اخترت|استخدمت|سأستخدم|اعتمدت)\s+([^.!?\n]{10,100})/gi
        ];
        
        for (const msg of messages) {
            if (msg.role !== 'assistant') continue;
            
            const content = String(msg.content || '');
            for (const pattern of decisionPatterns) {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    if (match[1]) {
                        const decision = match[1].trim();
                        if (decision.length > 10 && decision.length < 150) {
                            decisions.push(decision);
                        }
                    }
                }
            }
        }
        
        return decisions.slice(-10); // آخر 10 قرارات
    }
    
    /**
     * استخراج الأخطاء المصلحة
     */
    private extractErrorsFixes(messages: Message[]): string[] {
        const fixes: string[] = [];
        const fixPatterns = [
            /(?:fixed|resolved|corrected|solved)\s+([^.!?\n]{10,100})/gi,
            /(?:صلحت|حللت|أصلحت|عالجت)\s+([^.!?\n]{10,100})/gi
        ];
        
        for (const msg of messages) {
            const content = String(msg.content || '');
            for (const pattern of fixPatterns) {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    if (match[1]) {
                        fixes.push(match[1].trim());
                    }
                }
            }
        }
        
        return fixes;
    }
    
    /**
     * استخراج الأدوات المستخدمة
     */
    private extractToolsUsed(messages: Message[]): string[] {
        const tools = new Set<string>();
        const toolPattern = /"name":\s*"([a-z_]+)"/gi;
        
        for (const msg of messages) {
            const content = String(msg.content || '');
            const matches = content.matchAll(toolPattern);
            for (const match of matches) {
                if (match[1]) {
                    tools.add(match[1]);
                }
            }
        }
        
        return Array.from(tools);
    }
    
    /**
     * استخراج الهدف الحالي
     */
    private extractCurrentGoal(messages: Message[]): string {
        // ابحث في آخر 10 رسائل من المستخدم عن الهدف
        const userMessages = messages.filter(m => m.role === 'user').slice(-10);
        
        for (let i = userMessages.length - 1; i >= 0; i--) {
            const content = String(userMessages[i].content || '');
            if (content.length > 20 && content.length < 300) {
                return content.slice(0, 200);
            }
        }
        
        return 'استكمال المشروع الحالي';
    }
    
    /**
     * تقدير عدد الـ tokens
     */
    private estimateTokens(messages: Message[]): number {
        const totalChars = messages.reduce((sum, msg) => {
            return sum + String(msg.content || '').length;
        }, 0);
        
        return Math.ceil(totalChars / this.CHARS_PER_TOKEN);
    }
    
    /**
     * الحصول على إحصائيات السياق
     */
    getContextStats(messages: Message[]): ContextStats {
        const estimatedTokens = this.estimateTokens(messages);
        
        return {
            totalMessages: messages.length,
            estimatedTokens,
            compressionRatio: 0
        };
    }
    
    /**
     * حفظ ملخص السياق
     */
    saveSummary(sessionId: string, summary: ContextSummary): void {
        this.contextSummaries.set(sessionId, summary);
    }
    
    /**
     * استرجاع ملخص السياق
     */
    getSummary(sessionId: string): ContextSummary | undefined {
        return this.contextSummaries.get(sessionId);
    }
}

// Export singleton instance
export const smartContextManager = new SmartContextManager();
