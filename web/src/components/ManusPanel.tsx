import { useState, useEffect, useRef } from 'react';
import { 
    Monitor, Terminal, Globe, X, Layout, Activity, Maximize2, Minimize2, 
    Cpu, Wifi, HardDrive, Battery, Clock, Radio
} from 'lucide-react';
import { Browser } from './Browser';
import { API_URL } from '../config';

interface ManusPanelProps {
    onClose?: () => void;
    activeTab?: 'COMPUTER' | 'BROWSER' | 'TERMINAL' | 'LOGS';
    steps?: any[];
}

export default function ManusPanel({ onClose, activeTab = 'COMPUTER', steps = [] }: ManusPanelProps) {
    const [mode, setMode] = useState<'COMPUTER' | 'BROWSER' | 'TERMINAL' | 'LOGS'>(activeTab);
    const [isExpanded, setIsExpanded] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [systemStats, setSystemStats] = useState({ cpu: 12, ram: 45, net: '1.2 MB/s' });
    const logEndRef = useRef<HTMLDivElement>(null);

    // Auto-switch based on steps
    useEffect(() => {
        if (!steps || steps.length === 0) return;
        const last = steps[steps.length - 1];
        if (last.type === 'step_started') {
            if (last.data.name === 'shell_execute' || last.data.name.includes('exec')) {
                setMode('TERMINAL');
            }
            else if (last.data.name === 'browser_snapshot' || last.data.name === 'web_search' || last.data.name === 'browser_open') {
                setMode('BROWSER');
            }
        }
    }, [steps]);

    // Update local mode if activeTab prop changes
    useEffect(() => {
        if (activeTab) setMode(activeTab);
    }, [activeTab]);

    // Mock live system stats
    useEffect(() => {
        const interval = setInterval(() => {
            setSystemStats({
                cpu: Math.floor(Math.random() * 30) + 10,
                ram: Math.floor(Math.random() * 20) + 40,
                net: (Math.random() * 2).toFixed(1) + ' MB/s'
            });
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    // Mock logs stream (replace with real if available)
    useEffect(() => {
        // Here we would connect to a real log stream
        const interval = setInterval(() => {
            if (Math.random() > 0.7) {
                const msgs = [
                    'Analyzing context...',
                    'Optimizing query plan...',
                    'Fetching resources...',
                    'Syncing state...',
                    ' verifying integrity...',
                    'Executing tool: browser_snapshot',
                    'Parsing DOM tree...',
                ];
                const msg = msgs[Math.floor(Math.random() * msgs.length)];
                setLogs(prev => [...prev.slice(-100), `[${new Date().toLocaleTimeString()}] ${msg}`]);
            }
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className={`manus-panel ${isExpanded ? 'expanded' : ''}`} style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: isExpanded ? '100%' : '450px',
            background: '#0a0a0a',
            borderLeft: '1px solid #333',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 50,
            boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
            transition: 'width 0.3s ease'
        }}>
            {/* Header / Status Bar */}
            <div style={{
                height: 40,
                background: '#111',
                borderBottom: '1px solid #333',
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                justifyContent: 'space-between',
                userSelect: 'none'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>JOE OS</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: 'monospace', color: '#666' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Cpu size={10} /> {systemStats.cpu}%</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><HardDrive size={10} /> {systemStats.ram}%</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Wifi size={10} /> {systemStats.net}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setIsExpanded(!isExpanded)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
                        {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Mode Tabs */}
            <div style={{
                padding: '12px 12px 0',
                display: 'flex',
                gap: 4,
                background: '#0a0a0a'
            }}>
                {[
                    { id: 'COMPUTER', icon: Monitor, label: 'Computer' },
                    { id: 'BROWSER', icon: Globe, label: 'Browser' },
                    { id: 'TERMINAL', icon: Terminal, label: 'Terminal' },
                    { id: 'LOGS', icon: Activity, label: 'Logs' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setMode(tab.id as any)}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            padding: '8px 0',
                            background: mode === tab.id ? '#1a1a1a' : 'transparent',
                            border: '1px solid #333',
                            borderBottom: 'none',
                            borderRadius: '6px 6px 0 0',
                            color: mode === tab.id ? '#fff' : '#666',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        <tab.icon size={14} />
                        {tab.label}
                        {mode === tab.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', marginLeft: 4 }} className="pulse" />}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div style={{
                flex: 1,
                background: '#1a1a1a',
                position: 'relative',
                overflow: 'hidden',
                borderTop: '1px solid #333'
            }}>
                {mode === 'COMPUTER' && (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Computer View - Shows "Desktop" or combined view */}
                        <div style={{ 
                            flex: 1, 
                            backgroundImage: 'url("https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2670&auto=format&fit=crop")',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                             {/* Floating Windows Simulation */}
                             <div style={{
                                 width: '80%',
                                 height: '70%',
                                 background: '#000',
                                 borderRadius: 8,
                                 boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
                                 overflow: 'hidden',
                                 border: '1px solid #333'
                             }}>
                                 <div style={{ padding: '8px 12px', background: '#222', borderBottom: '1px solid #333', display: 'flex', gap: 6 }}>
                                     <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                                     <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
                                     <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                                 </div>
                                 <Browser />
                             </div>
                        </div>
                    </div>
                )}

                {mode === 'BROWSER' && (
                    <div style={{ height: '100%', background: '#000' }}>
                        <Browser />
                    </div>
                )}

                {mode === 'TERMINAL' && (
                    <div style={{ height: '100%', background: '#0f0f0f', padding: 16, fontFamily: 'monospace', color: '#0f0' }}>
                        <div style={{ marginBottom: 16 }}>joe-agent@v1.0.0:~$ connected</div>
                        {logs.map((log, i) => (
                            <div key={i} style={{ marginBottom: 4, opacity: 0.8 }}>{log}</div>
                        ))}
                        <div ref={logEndRef} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                            <span style={{ color: '#22c55e' }}>➜</span>
                            <span className="cursor-blink" style={{ width: 8, height: 16, background: '#22c55e' }} />
                        </div>
                    </div>
                )}

                {mode === 'LOGS' && (
                    <div style={{ height: '100%', background: '#111', padding: 0, display: 'flex', flexDirection: 'column' }}>
                         <div style={{ padding: '8px 16px', borderBottom: '1px solid #333', fontSize: 12, fontWeight: 600, color: '#888' }}>
                             SYSTEM LOGS
                         </div>
                         <div style={{ flex: 1, overflowY: 'auto', padding: 16, fontFamily: 'monospace', fontSize: 12 }}>
                            {logs.map((log, i) => (
                                <div key={i} style={{ 
                                    padding: '4px 0', 
                                    borderBottom: '1px solid #222', 
                                    color: log.includes('Error') ? '#ef4444' : '#ccc' 
                                }}>
                                    {log}
                                </div>
                            ))}
                            <div ref={logEndRef} />
                         </div>
                    </div>
                )}
            </div>
            
            <style>{`
                .pulse {
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
                .cursor-blink {
                    animation: blink 1s step-end infinite;
                }
                @keyframes blink {
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}
