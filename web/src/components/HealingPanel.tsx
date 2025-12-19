import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle2, AlertTriangle, Play, Loader2, FileCode } from 'lucide-react';
import { API_URL as API, WS_URL } from '../config';

interface ErrorLog {
    id: string;
    message: string;
    stack: string;
    context: string;
    timestamp: string;
}

export default function HealingPanel() {
    const [errors, setErrors] = useState<ErrorLog[]>([]);
    const [selectedError, setSelectedError] = useState<string | null>(null);
    const [diagnosis, setDiagnosis] = useState<any>(null);
    const [diagnosing, setDiagnosing] = useState(false);
    const [fixing, setFixing] = useState(false);

    useEffect(() => {
        // Fetch initial errors
        const fetchErrors = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API}/healing/errors`, {
                    headers: { Authorization: token ? `Bearer ${token}` : '' }
                });
                if (res.ok) setErrors(await res.json());
            } catch (e) {}
        };
        fetchErrors();

        // Listen for new errors
        const ws = new WebSocket(WS_URL);
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'healing:error') {
                    setErrors(prev => [msg.data, ...prev]);
                }
            } catch (e) {}
        };
        return () => ws.close();
    }, []);

    const diagnoseError = async (id: string) => {
        setDiagnosing(true);
        setDiagnosis(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/healing/diagnose`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: token ? `Bearer ${token}` : '' 
                },
                body: JSON.stringify({ errorId: id })
            });
            if (res.ok) {
                setDiagnosis(await res.json());
            }
        } catch (e) {
            console.error(e);
        } finally {
            setDiagnosing(false);
        }
    };

    const applyFix = async () => {
        if (!diagnosis?.isAutoFixable || !diagnosis.filePath) return;
        setFixing(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/healing/apply`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: token ? `Bearer ${token}` : '' 
                },
                body: JSON.stringify({ 
                    filePath: diagnosis.filePath, 
                    content: diagnosis.suggestedFix 
                })
            });
            if (res.ok) {
                alert('Fix applied successfully! Server may restart.');
                setDiagnosis(null);
            } else {
                alert('Failed to apply fix');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setFixing(false);
        }
    };

    const currentError = errors.find(e => e.id === selectedError);

    return (
        <div className="flex h-full bg-[var(--bg-dark)]">
            {/* Error List */}
            <div className="w-1/3 border-r border-[var(--border-color)] flex flex-col bg-[var(--bg-card)]">
                <div className="p-3 border-b border-[var(--border-color)] font-semibold text-sm flex items-center gap-2 text-[var(--text-primary)]">
                    <ShieldAlert size={16} className="text-[var(--accent-danger)]" /> Detected Issues
                </div>
                <div className="flex-1 overflow-auto">
                    {errors.map(err => (
                        <div 
                            key={err.id}
                            onClick={() => { setSelectedError(err.id); setDiagnosis(null); }}
                            className={`p-3 border-b border-[var(--border-color)] cursor-pointer hover:bg-[var(--bg-hover)] ${selectedError === err.id ? 'bg-[var(--bg-card-hover)]' : ''}`}
                        >
                            <div className="text-xs text-[var(--text-muted)] mb-1">{new Date(err.timestamp).toLocaleTimeString()}</div>
                            <div className="text-sm font-medium text-[var(--accent-danger)] line-clamp-2">{err.message}</div>
                            <div className="text-xs text-[var(--text-secondary)] mt-1">{err.context}</div>
                        </div>
                    ))}
                    {errors.length === 0 && (
                        <div className="p-8 text-center text-[var(--text-muted)] text-xs">
                            <CheckCircle2 size={32} className="mx-auto mb-2 text-[var(--accent-success)] opacity-50" />
                            System Healthy
                        </div>
                    )}
                </div>
            </div>

            {/* Diagnosis Panel */}
            <div className="flex-1 flex flex-col bg-[var(--bg-dark)]">
                {currentError ? (
                    <>
                        <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
                            <h3 className="font-bold text-[var(--accent-danger)] mb-2">{currentError.message}</h3>
                            <pre className="text-xs bg-[var(--bg-input)] p-2 rounded overflow-auto max-h-32 text-[var(--text-secondary)] font-mono border border-[var(--border-color)]">
                                {currentError.stack}
                            </pre>
                            
                            {!diagnosis && (
                                <button 
                                    onClick={() => diagnoseError(currentError.id)}
                                    disabled={diagnosing}
                                    className="mt-4 btn-primary w-full flex justify-center items-center gap-2 py-2 rounded bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)] transition-colors"
                                >
                                    {diagnosing ? <Loader2 className="animate-spin" /> : <Play size={16} />}
                                    Run AI Diagnosis
                                </button>
                            )}
                        </div>

                        {diagnosis && (
                            <div className="flex-1 p-4 overflow-auto">
                                <div className="card p-4 mb-4 border-l-4 border-l-[var(--accent-primary)] bg-[var(--bg-card)] shadow-sm">
                                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2 text-[var(--text-primary)]">
                                        <FileCode size={16} /> Analysis
                                    </h4>
                                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                                        {diagnosis.analysis}
                                    </p>
                                </div>

                                <div className="card p-4 border-l-4 border-l-[var(--accent-success)] bg-[var(--bg-card)] shadow-sm">
                                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2 text-[var(--text-primary)]">
                                        <CheckCircle2 size={16} /> Suggested Fix
                                    </h4>
                                    {diagnosis.isAutoFixable ? (
                                        <>
                                            <div className="text-xs text-[var(--text-muted)] mb-2">Target File: {diagnosis.filePath}</div>
                                            <pre className="bg-[var(--bg-input)] p-3 rounded text-xs font-mono text-[var(--accent-success)] overflow-auto max-h-60 border border-[var(--border-color)]">
                                                {diagnosis.suggestedFix}
                                            </pre>
                                            <button 
                                                type="button"
                                                onClick={applyFix}
                                                disabled={fixing}
                                                className="mt-4 w-full py-2 bg-[var(--accent-success)] hover:brightness-110 text-white rounded font-medium text-sm flex justify-center items-center gap-2 transition-all"
                                            >
                                                {fixing ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={16} />}
                                                Apply Auto-Fix
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-sm text-[var(--accent-warning)] flex items-center gap-2">
                                            <AlertTriangle size={16} />
                                            Manual intervention required. Follow the analysis above.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
                        Select an issue to view details
                    </div>
                )}
            </div>
        </div>
    );
}
