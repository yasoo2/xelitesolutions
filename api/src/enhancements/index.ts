/**
 * Continuous Operation Enhancements - نقطة الدخول الرئيسية لجميع التحسينات
 * 
 * يدمج جميع الأنظمة السبعة:
 * 1. Smart Context Manager
 * 2. Intelligent Retry System
 * 3. Progress Persistence
 * 4. Autonomous Decision Maker
 * 5. Realtime Validator
 * 6. Multi-Model Fallback
 * 7. Health Monitor
 * 
 * @version 2.0.0
 */

import { smartContextManager } from '../llm/smart-context-manager';
import { intelligentRetrySystem } from '../agents/intelligent-retry-system';
import { progressPersistence } from '../agents/progress-persistence';
import { autonomousDecisionMaker } from '../agents/autonomous-decision-maker';
import { realtimeValidator } from '../agents/realtime-validator';
import { multiModelFallback } from '../llm/multi-model-fallback';
import { healthMonitor } from '../monitoring/health-monitor';

/**
 * تهيئة جميع التحسينات
 */
export function initializeEnhancements(): void {
    console.log('[Enhancements] 🚀 Initializing Continuous Operation Enhancements v2.0...');
    
    // 1. بدء مراقبة الصحة
    healthMonitor.startMonitoring(30000); // كل 30 ثانية
    console.log('[Enhancements] ✅ Health Monitor started');
    
    // 2. تحميل البيانات المحفوظة
    intelligentRetrySystem.loadFromStorage();
    console.log('[Enhancements] ✅ Intelligent Retry System loaded');
    
    console.log('[Enhancements] 🎉 All enhancements initialized successfully!');
    console.log('[Enhancements] 📊 System Status:');
    console.log('  - Smart Context Management: Active');
    console.log('  - Intelligent Retry: Active');
    console.log('  - Progress Persistence: Active');
    console.log('  - Autonomous Decisions: Active');
    console.log('  - Realtime Validation: Active');
    console.log('  - Multi-Model Fallback: Active');
    console.log('  - Health Monitoring: Active');
}

/**
 * إيقاف جميع التحسينات
 */
export function shutdownEnhancements(): void {
    console.log('[Enhancements] 🛑 Shutting down enhancements...');
    
    healthMonitor.stopMonitoring();
    
    console.log('[Enhancements] ✅ All enhancements shut down successfully');
}

// Export all systems
export {
    smartContextManager,
    intelligentRetrySystem,
    progressPersistence,
    autonomousDecisionMaker,
    realtimeValidator,
    multiModelFallback,
    healthMonitor
};

// Auto-initialize on import
if (process.env.NODE_ENV !== 'test') {
    initializeEnhancements();
}
