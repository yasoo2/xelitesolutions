export const terminals = new Map<string, { 
    pty: any; 
    history: string[]; 
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    kill: () => void;
    fallback?: boolean;
}>();

export function registerTerminal(id: string, entry: any) {
    terminals.set(id, entry);
}

export function getTerminal(id: string) {
    return terminals.get(id);
}

export function removeTerminal(id: string) {
    terminals.delete(id);
}
