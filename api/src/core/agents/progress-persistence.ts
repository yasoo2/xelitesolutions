/**
 * Progress Persistence - حفظ واستعادة حالة المشروع الكاملة
 * 
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';

export interface ProjectState {
    projectName: string;
    projectType: string;
    currentPhase: string;
    completedPhases: string[];
    filesCreated: string[];
    filesModified: string[];
    filesDeleted: string[];
    commandsExecuted: string[];
    commandsPending: string[];
    errorsEncountered: Array<{ error: string; timestamp: number }>;
    errorsFixed: Array<{ error: string; fix: string; timestamp: number }>;
    errorsPending: string[];
    currentGoal: string;
    nextSteps: string[];
    blockers: string[];
    decisions: Array<{ decision: string; reason: string; timestamp: number }>;
    learnings: Array<{ lesson: string; timestamp: number }>;
}

export interface Checkpoint {
    version: string;
    timestamp: number;
    sessionId: string;
    project: {
        name: string;
        type: string;
        phase: string;
        completedPhases: string[];
    };
    files: {
        created: string[];
        modified: string[];
        deleted: string[];
    };
    commands: {
        executed: string[];
        pending: string[];
    };
    errors: {
        encountered: Array<{ error: string; timestamp: number }>;
        fixed: Array<{ error: string; fix: string; timestamp: number }>;
        pending: string[];
    };
    context: {
        currentGoal: string;
        nextSteps: string[];
        blockers: string[];
    };
    memory: {
        decisions: Array<{ decision: string; reason: string; timestamp: number }>;
        learnings: Array<{ lesson: string; timestamp: number }>;
    };
}

export interface RecoveryResult {
    success: boolean;
    message: string;
    state?: ProjectState;
    resumePoint?: string;
    progress?: number;
}

export class ProgressPersistence {
    private checkpointDir: string;
    
    constructor(baseDir: string = '.joe/checkpoints') {
        this.checkpointDir = baseDir;
        this.ensureCheckpointDir();
    }
    
    /**
     * التأكد من وجود مجلد الـ checkpoints
     */
    private ensureCheckpointDir(): void {
        if (!fs.existsSync(this.checkpointDir)) {
            fs.mkdirSync(this.checkpointDir, { recursive: true });
        }
    }
    
    /**
     * حفظ حالة المشروع الكاملة
     */
    async saveFullProjectState(
        sessionId: string,
        state: ProjectState
    ): Promise<void> {
        const checkpoint: Checkpoint = {
            version: '2.0',
            timestamp: Date.now(),
            sessionId,
            
            project: {
                name: state.projectName,
                type: state.projectType,
                phase: state.currentPhase,
                completedPhases: state.completedPhases
            },
            
            files: {
                created: state.filesCreated,
                modified: state.filesModified,
                deleted: state.filesDeleted
            },
            
            commands: {
                executed: state.commandsExecuted,
                pending: state.commandsPending
            },
            
            errors: {
                encountered: state.errorsEncountered,
                fixed: state.errorsFixed,
                pending: state.errorsPending
            },
            
            context: {
                currentGoal: state.currentGoal,
                nextSteps: state.nextSteps,
                blockers: state.blockers
            },
            
            memory: {
                decisions: state.decisions,
                learnings: state.learnings
            }
        };
        
        // حفظ في ملف
        await this.saveToFile(sessionId, checkpoint);
        
        // يمكن إضافة حفظ في قاعدة البيانات لاحقاً
        // await this.saveToDatabase(sessionId, checkpoint);
    }
    
    /**
     * حفظ في ملف
     */
    private async saveToFile(sessionId: string, checkpoint: Checkpoint): Promise<void> {
        const filePath = path.join(this.checkpointDir, `${sessionId}.json`);
        
        try {
            fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
        } catch (error: any) {
            throw new Error(`Failed to save checkpoint: ${error.message}`);
        }
    }
    
    /**
     * استعادة حالة المشروع
     */
    async restoreProjectState(sessionId: string): Promise<ProjectState | null> {
        // محاولة الاستعادة من الملف
        const checkpoint = await this.loadFromFile(sessionId);
        
        if (!checkpoint) {
            return null;
        }
        
        return this.reconstructProjectState(checkpoint);
    }
    
    /**
     * تحميل من ملف
     */
    private async loadFromFile(sessionId: string): Promise<Checkpoint | null> {
        const filePath = path.join(this.checkpointDir, `${sessionId}.json`);
        
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }
    
    /**
     * إعادة بناء حالة المشروع من الـ checkpoint
     */
    private reconstructProjectState(checkpoint: Checkpoint): ProjectState {
        return {
            projectName: checkpoint.project.name,
            projectType: checkpoint.project.type,
            currentPhase: checkpoint.project.phase,
            completedPhases: checkpoint.project.completedPhases,
            filesCreated: checkpoint.files.created,
            filesModified: checkpoint.files.modified,
            filesDeleted: checkpoint.files.deleted,
            commandsExecuted: checkpoint.commands.executed,
            commandsPending: checkpoint.commands.pending,
            errorsEncountered: checkpoint.errors.encountered,
            errorsFixed: checkpoint.errors.fixed,
            errorsPending: checkpoint.errors.pending,
            currentGoal: checkpoint.context.currentGoal,
            nextSteps: checkpoint.context.nextSteps,
            blockers: checkpoint.context.blockers,
            decisions: checkpoint.memory.decisions,
            learnings: checkpoint.memory.learnings
        };
    }
    
    /**
     * استعادة بعد انقطاع (crash recovery)
     */
    async recoverFromCrash(sessionId: string): Promise<RecoveryResult> {
        const state = await this.restoreProjectState(sessionId);
        
        if (!state) {
            return {
                success: false,
                message: 'No checkpoint found for this session'
            };
        }
        
        // تحليل ما تم إنجازه
        const progress = this.calculateProgress(state);
        
        // تحديد نقطة الاستئناف
        const resumePoint = this.determineResumePoint(state);
        
        return {
            success: true,
            message: `Recovered successfully. Progress: ${progress}%. Resuming from: ${resumePoint}`,
            state,
            resumePoint,
            progress
        };
    }
    
    /**
     * حساب نسبة التقدم
     */
    private calculateProgress(state: ProjectState): number {
        const totalPhases = state.completedPhases.length + 1; // +1 للمرحلة الحالية
        const completed = state.completedPhases.length;
        
        return Math.round((completed / totalPhases) * 100);
    }
    
    /**
     * تحديد نقطة الاستئناف
     */
    private determineResumePoint(state: ProjectState): string {
        if (state.errorsPending.length > 0) {
            return `Fix pending errors: ${state.errorsPending[0]}`;
        }
        
        if (state.commandsPending.length > 0) {
            return `Execute pending command: ${state.commandsPending[0]}`;
        }
        
        if (state.blockers.length > 0) {
            return `Resolve blocker: ${state.blockers[0]}`;
        }
        
        return state.currentPhase || 'Continue from last phase';
    }
    
    /**
     * حذف checkpoint بعد النجاح
     */
    async clearCheckpoint(sessionId: string): Promise<void> {
        const filePath = path.join(this.checkpointDir, `${sessionId}.json`);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    
    /**
     * الحصول على جميع الـ checkpoints
     */
    async getAllCheckpoints(): Promise<Array<{ sessionId: string; timestamp: number }>> {
        const files = fs.readdirSync(this.checkpointDir);
        const checkpoints: Array<{ sessionId: string; timestamp: number }> = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const sessionId = file.replace('.json', '');
                const checkpoint = await this.loadFromFile(sessionId);
                
                if (checkpoint) {
                    checkpoints.push({
                        sessionId,
                        timestamp: checkpoint.timestamp
                    });
                }
            }
        }
        
        return checkpoints.sort((a, b) => b.timestamp - a.timestamp);
    }
}

// Export singleton instance
export const progressPersistence = new ProgressPersistence();
