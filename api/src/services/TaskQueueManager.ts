import { OpenAI } from 'openai';

interface QueuedTask {
    id: string;
    message: string;
    timestamp: Date;
    priority: 'high' | 'normal';
    relatedToCurrentTask: boolean;
    sessionId?: string;
}

interface ContextAnalysis {
    action: 'merge' | 'queue' | 'execute';
    isCorrection: boolean;
    confidence: number;
    reason: string;
}

class TaskQueueManager {
    private queue: Map<string, QueuedTask[]> = new Map(); // sessionId -> tasks
    private currentTasks: Map<string, string> = new Map(); // sessionId -> current task description
    private openai: OpenAI;

    constructor() {
        const envKey = typeof process.env.OPENAI_API_KEY === 'string' ? process.env.OPENAI_API_KEY.trim() : '';
        this.openai = new OpenAI({
            apiKey: envKey || 'sk-local-dev',
        });
    }

    /**
     * Analyze if a new message is a correction/clarification or a new task
     */
    async analyzeContext(
        newMessage: string,
        currentTaskDescription: string | null,
        sessionId: string
    ): Promise<ContextAnalysis> {
        // If no current task, always execute immediately
        if (!currentTaskDescription) {
            return {
                action: 'execute',
                isCorrection: false,
                confidence: 1.0,
                reason: 'No current task running',
            };
        }

        // Quick keyword-based detection for corrections
        const correctionKeywords = [
            'لا', 'خطأ', 'صحح', 'بدلاً', 'غير', 'عدل', 'ليس', 'توقف',
            'no', 'wrong', 'fix', 'instead', 'change', 'modify', 'not', 'stop',
            'actually', 'wait', 'correction', 'mistake'
        ];

        const messageLower = newMessage.toLowerCase();
        const hasCorrectionKeyword = correctionKeywords.some(kw =>
            messageLower.includes(kw)
        );

        // Use LLM for semantic analysis
        try {
            const prompt = `You are analyzing whether a new user message is a correction/clarification of the current task, or a completely new task.

Current Task: "${currentTaskDescription}"
New Message: "${newMessage}"

Analyze and respond in JSON format:
{
  "isCorrection": boolean,
  "confidence": number (0-1),
  "reason": "brief explanation"
}

Guidelines:
- isCorrection = true if the new message:
  * Corrects/modifies the current task
  * Adds clarification to the current task
  * Uses pronouns referring to current task (it, this, that)
  * Mentions same files/components as current task
- isCorrection = false if the new message:
  * Introduces a completely different topic
  * Asks about unrelated functionality
  * Requests a new feature unrelated to current work`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 200,
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('No response from LLM');
            }

            const analysis = JSON.parse(content);

            // Boost confidence if correction keywords are present
            if (hasCorrectionKeyword && analysis.isCorrection) {
                analysis.confidence = Math.min(1.0, analysis.confidence + 0.2);
            }

            return {
                action: analysis.isCorrection && analysis.confidence > 0.6 ? 'merge' : 'queue',
                isCorrection: analysis.isCorrection,
                confidence: analysis.confidence,
                reason: analysis.reason,
            };
        } catch (error) {
            console.error('Context analysis failed:', error);
            // Fallback to keyword-based detection
            return {
                action: hasCorrectionKeyword ? 'merge' : 'queue',
                isCorrection: hasCorrectionKeyword,
                confidence: 0.5,
                reason: 'Fallback to keyword detection due to LLM error',
            };
        }
    }

    /**
     * Add a task to the queue
     */
    addToQueue(task: Omit<QueuedTask, 'id' | 'timestamp'>): QueuedTask {
        const sessionId = task.sessionId || 'default';
        const newTask: QueuedTask = {
            ...task,
            id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(),
        };

        if (!this.queue.has(sessionId)) {
            this.queue.set(sessionId, []);
        }

        this.queue.get(sessionId)!.push(newTask);
        return newTask;
    }

    /**
     * Remove a task from the queue
     */
    removeFromQueue(taskId: string, sessionId: string): boolean {
        const tasks = this.queue.get(sessionId);
        if (!tasks) return false;

        const index = tasks.findIndex(t => t.id === taskId);
        if (index === -1) return false;

        tasks.splice(index, 1);
        return true;
    }

    /**
     * Get all queued tasks for a session
     */
    getQueue(sessionId: string): QueuedTask[] {
        return this.queue.get(sessionId) || [];
    }

    /**
     * Get the next task to execute
     */
    getNextTask(sessionId: string): QueuedTask | null {
        const tasks = this.queue.get(sessionId);
        if (!tasks || tasks.length === 0) return null;

        // Sort by priority (high first) then by timestamp (oldest first)
        tasks.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority === 'high' ? -1 : 1;
            }
            return a.timestamp.getTime() - b.timestamp.getTime();
        });

        return tasks[0];
    }

    /**
     * Mark a task as started (remove from queue)
     */
    startTask(taskId: string, sessionId: string): boolean {
        const task = this.queue.get(sessionId)?.find(t => t.id === taskId);
        if (!task) return false;

        this.currentTasks.set(sessionId, task.message);
        return this.removeFromQueue(taskId, sessionId);
    }

    /**
     * Set the current task description
     */
    setCurrentTask(sessionId: string, description: string): void {
        this.currentTasks.set(sessionId, description);
    }

    /**
     * Clear the current task
     */
    clearCurrentTask(sessionId: string): void {
        this.currentTasks.delete(sessionId);
    }

    /**
     * Get the current task description
     */
    getCurrentTask(sessionId: string): string | null {
        return this.currentTasks.get(sessionId) || null;
    }

    /**
     * Clear all tasks for a session
     */
    clearQueue(sessionId: string): void {
        this.queue.delete(sessionId);
        this.currentTasks.delete(sessionId);
    }
}

export const taskQueueManager = new TaskQueueManager();
export type { QueuedTask, ContextAnalysis };
