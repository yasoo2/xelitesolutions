
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'cortex.json');

export interface TaskState {
    id: string;
    goal: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
    step: number;
    history: any[];
    rootDir: string;
    createdAt: number;
    updatedAt: number;
    metadata?: any;
}

export interface FinancialState {
    balance: number;
    totalUsage: number;
    transactions: {
        timestamp: number;
        amount: number;
        description: string;
        taskId?: string;
    }[];
}

interface CortexDB {
    tasks: Record<string, TaskState>;
    financials: FinancialState;
}

export class CortexState {
    private static instance: CortexState;
    private db: CortexDB;

    private constructor() {
        this.db = this.load();
    }

    public static getInstance(): CortexState {
        if (!CortexState.instance) {
            CortexState.instance = new CortexState();
        }
        return CortexState.instance;
    }

    private load(): CortexDB {
        if (!fs.existsSync(DB_PATH)) {
            return {
                tasks: {},
                financials: { balance: 100.0, totalUsage: 0, transactions: [] } // Start with $100 credit
            };
        }
        try {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        } catch (e) {
            console.error('Failed to load Cortex DB, resetting:', e);
            return { tasks: {}, financials: { balance: 100.0, totalUsage: 0, transactions: [] } };
        }
    }

    private save() {
        fs.writeFileSync(DB_PATH, JSON.stringify(this.db, null, 2));
    }

    // --- Task Management ---

    public saveTask(state: TaskState) {
        state.updatedAt = Date.now();
        this.db.tasks[state.id] = state;
        this.save();
    }

    public getTask(id: string): TaskState | undefined {
        return this.db.tasks[id];
    }

    public getAllTasks(): TaskState[] {
        return Object.values(this.db.tasks);
    }

    // --- Financial Management ---

    public recordTransaction(amount: number, description: string, taskId?: string): boolean {
        // Negative amount = cost, Positive = deposit
        if (this.db.financials.balance + amount < 0) {
            console.warn(`[Cortex] Financial Transaction Blocked: Insufficient Funds. Balance: ${this.db.financials.balance}, Req: ${amount}`);
            return false;
        }

        this.db.financials.balance += amount;
        if (amount < 0) {
            this.db.financials.totalUsage += Math.abs(amount);
        }

        this.db.financials.transactions.push({
            timestamp: Date.now(),
            amount,
            description,
            taskId
        });
        this.save();
        return true;
    }

    public getBalance(): number {
        return this.db.financials.balance;
    }
}
