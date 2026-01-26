import fs from 'fs';
import path from 'path';

export class WorkspaceService {
    private static instance: WorkspaceService;
    private activeWorkspaceRoot: string;
    private systemRoot: string;
    private configPath: string;

    private constructor() {
        this.systemRoot = path.resolve(process.cwd());
        this.configPath = path.join(this.systemRoot, '.workspace.json');
        this.activeWorkspaceRoot = this.loadPersistentRoot() || this.systemRoot;

        // Initial validation
        if (!fs.existsSync(this.activeWorkspaceRoot)) {
            console.warn(`[WorkspaceService] Persistent root ${this.activeWorkspaceRoot} not found. Falling back to system root.`);
            this.activeWorkspaceRoot = this.systemRoot;
        }

        console.log(`[WorkspaceService] Initialized with root: ${this.activeWorkspaceRoot}`);
    }

    public static getInstance(): WorkspaceService {
        if (!WorkspaceService.instance) {
            WorkspaceService.instance = new WorkspaceService();
        }
        return WorkspaceService.instance;
    }

    private loadPersistentRoot(): string | null {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
                return data.path || null;
            }
        } catch (e) {
            console.error('[WorkspaceService] Failed to load persistent root:', e);
        }
        return null;
    }

    private savePersistentRoot(newPath: string) {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify({ path: newPath, updatedAt: new Date().toISOString() }, null, 2));
        } catch (e) {
            console.error('[WorkspaceService] Failed to save persistent root:', e);
        }
    }

    public getActiveRoot(): string {
        return this.activeWorkspaceRoot;
    }

    public async setActiveRoot(newPath: string): Promise<boolean> {
        const resolved = path.resolve(newPath);
        try {
            await fs.promises.access(resolved);
            this.activeWorkspaceRoot = resolved;
            this.savePersistentRoot(resolved);
            return true;
        } catch {
            return false;
        }
    }

    public resetToSystem(): void {
        this.activeWorkspaceRoot = this.systemRoot;
        this.savePersistentRoot(this.systemRoot);
    }

    public getSystemRoot(): string {
        return this.systemRoot;
    }

    public isSystemRoot(): boolean {
        return this.activeWorkspaceRoot === this.systemRoot;
    }
}

export const workspaceService = WorkspaceService.getInstance();
