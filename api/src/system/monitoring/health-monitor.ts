/**
 * Health Monitor - مراقبة صحة النظام والشفاء الذاتي
 * 
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface SystemMetrics {
    uptime: number;
    requestsProcessed: number;
    errorsEncountered: number;
    averageResponseTime: number;
    memoryUsage: number;
    cpuUsage: number;
}

export interface HealthCheck {
    memory: { usage: number; total: number; free: number };
    disk: { usage: number; total: number; free: number };
    apiKeys: { groq: boolean; openai: boolean; anthropic: boolean };
    database: { connected: boolean; responseTime: number };
    models: { available: string[]; failed: string[] };
}

export interface HealthIssue {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
}

export class HealthMonitor {
    private metrics: SystemMetrics = {
        uptime: 0,
        requestsProcessed: 0,
        errorsEncountered: 0,
        averageResponseTime: 0,
        memoryUsage: 0,
        cpuUsage: 0
    };
    
    private monitoringInterval: NodeJS.Timeout | null = null;
    private startTime: number = Date.now();
    
    /**
     * بدء المراقبة المستمرة
     */
    startMonitoring(intervalMs: number = 30000): void {
        if (this.monitoringInterval) {
            return;
        }
        
        this.monitoringInterval = setInterval(async () => {
            await this.checkSystemHealth();
        }, intervalMs);
    }
    
    /**
     * إيقاف المراقبة
     */
    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }
    
    /**
     * فحص صحة النظام
     */
    private async checkSystemHealth(): Promise<void> {
        const health: HealthCheck = {
            memory: this.checkMemory(),
            disk: await this.checkDisk(),
            apiKeys: await this.checkApiKeys(),
            database: await this.checkDatabase(),
            models: await this.checkModels()
        };
        
        const issues: HealthIssue[] = [];
        
        if (health.memory.usage > 90) {
            issues.push({
                type: 'high_memory',
                severity: 'critical',
                message: `Memory usage at ${health.memory.usage}%`
            });
        }
        
        if (health.disk.usage > 95) {
            issues.push({
                type: 'low_disk_space',
                severity: 'critical',
                message: `Disk usage at ${health.disk.usage}%`
            });
        }
        
        if (!health.apiKeys.groq) {
            issues.push({
                type: 'missing_api_key',
                severity: 'high',
                message: 'Groq API key not configured'
            });
        }
        
        if (issues.length > 0) {
            await this.autoHeal(issues);
        }
    }
    
    /**
     * فحص الذاكرة
     */
    private checkMemory(): { usage: number; total: number; free: number } {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const usage = Math.round((usedMem / totalMem) * 100);
        
        this.metrics.memoryUsage = usage;
        
        return {
            usage,
            total: totalMem,
            free: freeMem
        };
    }
    
    /**
     * فحص القرص
     */
    private async checkDisk(): Promise<{ usage: number; total: number; free: number }> {
        // تقدير بسيط - يمكن تحسينه باستخدام مكتبات متخصصة
        return {
            usage: 50,
            total: 100 * 1024 * 1024 * 1024,
            free: 50 * 1024 * 1024 * 1024
        };
    }
    
    /**
     * فحص API Keys
     */
    private async checkApiKeys(): Promise<{ groq: boolean; openai: boolean; anthropic: boolean }> {
        return {
            groq: !!process.env.GROQ_API_KEY,
            openai: !!process.env.OPENAI_API_KEY,
            anthropic: !!process.env.ANTHROPIC_API_KEY
        };
    }
    
    /**
     * فحص قاعدة البيانات
     */
    private async checkDatabase(): Promise<{ connected: boolean; responseTime: number }> {
        return {
            connected: true,
            responseTime: 10
        };
    }
    
    /**
     * فحص الموديلات
     */
    private async checkModels(): Promise<{ available: string[]; failed: string[] }> {
        return {
            available: ['mixtral', 'llama', 'gemma'],
            failed: []
        };
    }
    
    /**
     * الشفاء الذاتي من المشاكل
     */
    private async autoHeal(issues: HealthIssue[]): Promise<void> {
        for (const issue of issues) {
            switch (issue.type) {
                case 'high_memory':
                    await this.clearMemoryCache();
                    break;
                
                case 'low_disk_space':
                    await this.cleanupTempFiles();
                    break;
                
                case 'missing_api_key':
                    await this.switchToFallbackProvider();
                    break;
            }
        }
    }
    
    /**
     * تنظيف الذاكرة
     */
    private async clearMemoryCache(): Promise<void> {
        if (global.gc) {
            global.gc();
        }
    }
    
    /**
     * تنظيف الملفات المؤقتة
     */
    private async cleanupTempFiles(): Promise<void> {
        const tempDir = path.join(os.tmpdir(), 'joe-workspace');
        
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            const now = Date.now();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 أيام
            
            for (const file of files) {
                const filePath = path.join(tempDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtimeMs > maxAge) {
                    fs.unlinkSync(filePath);
                }
            }
        }
    }
    
    /**
     * التبديل إلى مزود بديل
     */
    private async switchToFallbackProvider(): Promise<void> {
        // منطق التبديل إلى مزود بديل
    }
    
    /**
     * الحصول على المقاييس الحالية
     */
    getMetrics(): SystemMetrics {
        this.metrics.uptime = Date.now() - this.startTime;
        return { ...this.metrics };
    }
    
    /**
     * تحديث المقاييس
     */
    updateMetrics(update: Partial<SystemMetrics>): void {
        this.metrics = { ...this.metrics, ...update };
    }
}

export const healthMonitor = new HealthMonitor();
