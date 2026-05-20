import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SocketService } from '../services/socket';
import { API_URL } from '../config';
import { RefreshCw, Trash2, Terminal as TerminalIcon } from 'lucide-react';

interface EmbeddedTerminalProps {
    terminalId?: string;
    workspaceId?: string;
    onReady?: () => void;
}

/**
 * EmbeddedTerminal - SAFE React-based fallback
 * Does not use xterm.js to avoid dimensions crashes in production.
 */
export default function EmbeddedTerminal({
    terminalId = 'panel-terminal',
    workspaceId,
    onReady
}: EmbeddedTerminalProps) {
    const [output, setOutput] = useState<string>('');
    const [inputValue, setInputValue] = useState<string>('');
    const [status, setStatus] = useState<'connecting' | 'ready' | 'error'>('connecting');
    const [error, setError] = useState<string | null>(null);
    const outputRef = useRef<HTMLPreElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const isMountedRef = useRef(true);

    // Auto-scroll output
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

    // Handle terminal creation
    const initTerminal = useCallback(async (isReconnect = false) => {
        setStatus('connecting');
        setError(null);
        const token = localStorage.getItem('token');

        try {
            // If reconnecting, try to kill existing first (optional but cleaner)
            if (isReconnect) {
                try {
                    await fetch(`${API_URL}/tools/terminal_manager/execute`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ action: 'kill', id: terminalId })
                    });
                } catch { /* ignore kill errors */ }
            }

            const res = await fetch(`${API_URL}/tools/terminal_manager/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    action: 'create',
                    id: terminalId,
                    shell: 'bash',
                    cols: 80,
                    rows: 24,
                    workspaceId
                })
            });

            const data = await res.json();
            if (data.ok || (data.output && data.output.existing)) {
                setStatus('ready');
                if (onReady) onReady();
            } else {
                setStatus('error');
                setError(data.error || 'Failed to create terminal');
            }
        } catch (e) {
            setStatus('error');
            setError('Connection failed');
        }
    }, [terminalId, workspaceId, onReady]);

    useEffect(() => {
        isMountedRef.current = true;
        initTerminal();

        const unsubscribe = SocketService.subscribe((msg: any) => {
            if (!isMountedRef.current) return;
            if (msg.type === 'terminal_output' && msg.id === terminalId) {
                console.debug('terminal_plain_output_received', msg.data);
                setOutput(prev => prev + msg.data);
            }
        });

        return () => {
            isMountedRef.current = false;
            unsubscribe();
        };
    }, [terminalId, initTerminal]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() && inputValue !== '\n') return;
        
        const cmd = inputValue + '\n';
        console.debug('terminal_plain_input_sent', cmd);
        
        SocketService.send({
            type: 'terminal_input',
            id: terminalId,
            data: cmd
        });

        // Instant local feedback (optional but helpful)
        // setOutput(prev => prev + 'joe$ ' + inputValue + '\n');
        setInputValue('');
    };

    const handleClear = () => setOutput('');

    const handleReconnect = () => {
        setOutput(prev => prev + '\n--- Reconnecting ---\n');
        initTerminal(true);
    };

    return (
        <div className="flex flex-col h-full bg-[#0d1117] text-[#c9d1d9] font-mono text-sm overflow-hidden border border-white/5 rounded-lg shadow-2xl">
            {/* Header / Status Bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-white/5 select-none">
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${
                        status === 'ready' ? 'bg-green-500/10 text-green-400' : 
                        status === 'connecting' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                        <TerminalIcon size={14} className={status === 'connecting' ? 'animate-pulse' : ''} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Terminal Session</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-200">{terminalId}</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                                status === 'ready' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 
                                status === 'connecting' ? 'bg-blue-500 animate-pulse' : 'bg-red-500'
                            }`} />
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleClear}
                        title="Clear Output"
                        className="p-1.5 hover:bg-white/5 rounded-md text-slate-400 hover:text-white transition-all active:scale-95"
                    >
                        <Trash2 size={14} />
                    </button>
                    <button 
                        onClick={handleReconnect}
                        title="Reconnect"
                        className="p-1.5 hover:bg-white/5 rounded-md text-slate-400 hover:text-white transition-all active:scale-95"
                    >
                        <RefreshCw size={14} className={status === 'connecting' ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Output Area */}
            <pre 
                ref={outputRef}
                className="flex-1 p-4 overflow-y-auto whitespace-pre-wrap break-all scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent selection:bg-blue-500/30"
                style={{ scrollBehavior: 'smooth' }}
            >
                {output || (status === 'connecting' ? 'Initializing Joe Terminal Runtime...\n' : 'Terminal started. Type a command to begin.\n')}
                {error && <div className="text-red-400 mt-2 font-bold uppercase tracking-widest text-[10px]">Error: {error}</div>}
            </pre>

            {/* Input Area */}
            <form 
                onSubmit={handleSend}
                className="p-3 bg-[#161b22] border-t border-white/5 flex items-center gap-2"
            >
                <span className="text-green-400 font-bold select-none">joe$</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={status === 'ready' ? "Enter command..." : "Connecting..."}
                    disabled={status !== 'ready'}
                    className="flex-1 bg-transparent border-none outline-none text-[#c9d1d9] placeholder-slate-600 font-mono text-sm"
                    autoFocus
                />
                {status === 'ready' && (
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter select-none px-2 py-1 border border-white/5 rounded bg-black/20">
                        Enter ↵
                    </div>
                )}
            </form>
        </div>
    );
}
