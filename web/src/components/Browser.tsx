import { useState, useEffect, useRef } from 'react';
import { 
    Globe, ArrowLeft, ArrowRight, RotateCw, 
    Monitor, Code, Eye, Play, MousePointer2,
    X, Terminal, Activity, Sparkles, ChevronUp, ChevronDown,
    ShieldCheck, AlertTriangle, Smartphone, Tablet, Maximize2, Minimize2
} from 'lucide-react';
import { API_URL } from '../config';

interface LogEntry {
    type: 'log' | 'error' | 'warn' | 'info';
    message: string;
    timestamp: number;
    stackTrace?: string;
}

interface NetworkEntry {
    url: string;
    method: string;
    status?: number;
    type: string;
    timestamp: number;
    requestBody?: string;
    responseBody?: string;
}

interface AuditReport {
    score: number;
    issues: {
        severity: 'critical' | 'warning' | 'info';
        message: string;
        selector?: string;
    }[];
}

export function Browser() {
    // Core State
    const [url, setUrl] = useState('');
    const [currentUrl, setCurrentUrl] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    
    // UI State
    const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
    const [devToolsTab, setDevToolsTab] = useState<'console' | 'network' | 'script'>('console');
    const [showAiMenu, setShowAiMenu] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Data State
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [network, setNetwork] = useState<NetworkEntry[]>([]);
    
    // Feature State
    const [inspectMode, setInspectMode] = useState(false);
    const [inspectedElement, setInspectedElement] = useState<any>(null);
    const [script, setScript] = useState('');
    const [scriptResult, setScriptResult] = useState('');
    const [domAnalysis, setDomAnalysis] = useState('');
    const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
    const [selectedNetworkItem, setSelectedNetworkItem] = useState<NetworkEntry | null>(null);

    const imageRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        checkStatus();
        const interval = setInterval(refreshData, 2000);
        return () => clearInterval(interval);
    }, []);

    const checkStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/browser/status`, {
                headers: (token ? { Authorization: `Bearer ${token}` } : {}) as Record<string, string>
            });
            const data = await res.json();
            if (data.active) {
                setIsConnected(true);
                setCurrentUrl(data.url);
                if (!url) setUrl(data.url);
                refreshData();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const refreshData = async () => {
        if (!isConnected) return;
        const token = localStorage.getItem('token');
        const headers = (token ? { Authorization: `Bearer ${token}` } : {}) as Record<string, string>;

        try {
            const imgRes = await fetch(`${API_URL}/browser/screenshot`, { headers });
            const imgData = await imgRes.json();
            if (imgData.image) setImage(imgData.image);

            if (isDevToolsOpen) {
                const logRes = await fetch(`${API_URL}/browser/logs`, { headers });
                setLogs(await logRes.json());

                const netRes = await fetch(`${API_URL}/browser/network`, { headers });
                setNetwork(await netRes.json());
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleNavigate = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/browser/navigate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                } as Record<string, string>,
                body: JSON.stringify({ url })
            });
            const data = await res.json();
            if (data.success) {
                setIsConnected(true);
                setCurrentUrl(data.url);
                setUrl(data.url);
                refreshData();
            }
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (type: string, payload: any = {}) => {
        if (!isConnected) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/browser/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                } as Record<string, string>,
                body: JSON.stringify({ type, ...payload })
            });
            const data = await res.json();
            if (data.success) {
                if (type === 'viewport') refreshData();
                else setTimeout(refreshData, 500);
            }
            return data;
        } catch (e) {
            console.error(e);
        }
    };

    const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
        if (!imageRef.current) return;
        const rect = imageRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Calculate relative coordinates (0-1)
        const relX = x / rect.width;
        const relY = y / rect.height;
        
        // Send actual coordinates based on current viewport logic if needed, 
        // but typically headless browsers expect pixels. 
        // For simplicity, we assume the backend handles viewport scaling or we send raw clicks.
        // But since we are displaying "contain", we need to map visual click to actual browser coordinates.
        // Let's assume a fixed standard viewport of 1280x800 for now or fetch it.
        // A better approach is to send relative % and let backend multiply by viewport.
        // For this version, let's keep it simple: 
        
        // We'll fetch current viewport from backend in a real app.
        // Here we assume 1280x800 base.
        const viewportW = 1280; 
        const viewportH = 800;
        
        const finalX = relX * viewportW;
        const finalY = relY * viewportH;

        if (inspectMode) {
            const data = await handleAction('inspect', { x: finalX, y: finalY });
            if (data?.info) {
                setInspectedElement(data.info);
                setIsDevToolsOpen(true);
            }
        } else {
            await handleAction('click', { x: finalX, y: finalY });
            setTimeout(refreshData, 500);
        }
    };

    const closeSession = async () => {
        const token = localStorage.getItem('token');
        await fetch(`${API_URL}/browser/close`, {
            method: 'POST',
            headers: (token ? { Authorization: `Bearer ${token}` } : {}) as Record<string, string>
        });
        setIsConnected(false);
        setImage(null);
        setLogs([]);
        setNetwork([]);
    };

    // AI Tools
    const runAudit = async () => {
        setShowAiMenu(false);
        const data = await handleAction('audit');
        if (data?.audit) {
            setAuditReport(data.audit);
            setIsDevToolsOpen(true);
        }
    };

    const analyzeDom = async () => {
        setShowAiMenu(false);
        const data = await handleAction('dom');
        if (data?.dom) {
            setDomAnalysis(JSON.stringify(data.dom, null, 2));
            setIsDevToolsOpen(true);
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#1E1E1E] text-gray-200 font-sans overflow-hidden">
            
            {/* Top Navigation Bar - Mac Style */}
            <div className="h-12 bg-[#2D2D2D] border-b border-[#1E1E1E] flex items-center px-4 gap-4 shrink-0">
                {/* Window Controls */}
                <div className="flex gap-2 mr-2">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F57] hover:bg-[#FF5F57]/80 transition-colors" />
                    <div className="w-3 h-3 rounded-full bg-[#FEBC2E] hover:bg-[#FEBC2E]/80 transition-colors" />
                    <div className="w-3 h-3 rounded-full bg-[#28C840] hover:bg-[#28C840]/80 transition-colors" />
                </div>

                {/* Navigation Buttons */}
                <div className="flex items-center gap-1 text-gray-400">
                    <button onClick={() => handleAction('back')} className="p-1.5 hover:bg-[#3D3D3D] rounded transition-colors"><ArrowLeft size={16} /></button>
                    <button onClick={() => handleAction('forward')} className="p-1.5 hover:bg-[#3D3D3D] rounded transition-colors"><ArrowRight size={16} /></button>
                    <button onClick={() => handleAction('reload')} className="p-1.5 hover:bg-[#3D3D3D] rounded transition-colors"><RotateCw size={16} /></button>
                </div>

                {/* Address Bar */}
                <form onSubmit={handleNavigate} className="flex-1 max-w-2xl mx-auto relative group">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        {isConnected ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Globe className="w-3.5 h-3.5 text-gray-500" />}
                    </div>
                    <input 
                        type="text" 
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        className="w-full bg-[#1E1E1E] text-sm text-gray-300 rounded-full py-1.5 pl-9 pr-4 border border-transparent focus:border-blue-500/50 focus:bg-[#151515] outline-none transition-all placeholder:text-gray-600 text-center focus:text-left"
                        placeholder="Search or enter website name"
                    />
                </form>

                {/* Right Actions */}
                <div className="flex items-center gap-2 text-gray-400">
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 hover:bg-[#3D3D3D] rounded transition-colors">
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    {isConnected && (
                        <button onClick={closeSession} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded transition-colors">
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative bg-[#151515] flex items-center justify-center overflow-hidden">
                {isConnected && image ? (
                    <div className={`relative transition-all duration-300 ${isFullscreen ? 'w-full h-full' : 'w-[95%] h-[90%] border border-[#333] shadow-2xl rounded-lg overflow-hidden bg-white'}`}>
                        <img 
                            ref={imageRef}
                            src={image} 
                            alt="Browser Content"
                            onClick={handleImageClick}
                            className="w-full h-full object-contain bg-white cursor-crosshair"
                        />
                        
                        {/* Inspect Overlay */}
                        {inspectMode && (
                            <div className="absolute top-4 right-4 bg-blue-600 text-white text-xs px-3 py-1 rounded-full shadow-lg font-medium animate-pulse pointer-events-none">
                                INSPECT MODE
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500 gap-4">
                        <div className="w-20 h-20 bg-[#252525] rounded-3xl flex items-center justify-center">
                            <Globe size={40} className="text-gray-600" />
                        </div>
                        <p className="text-sm">Enter a URL to begin browsing</p>
                    </div>
                )}

                {/* AI Floating Action Button */}
                {isConnected && (
                    <div className="absolute bottom-6 right-6 flex flex-col items-end gap-3">
                        {showAiMenu && (
                            <div className="bg-[#252525] border border-[#333] rounded-xl p-2 shadow-2xl mb-2 flex flex-col gap-1 min-w-[160px] animate-in slide-in-from-bottom-5 fade-in duration-200">
                                <button onClick={() => setInspectMode(!inspectMode)} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${inspectMode ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#333]'}`}>
                                    <MousePointer2 size={14} /> Inspect Element
                                </button>
                                <button onClick={runAudit} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-300 hover:bg-[#333] transition-all">
                                    <Activity size={14} /> UI/UX Audit
                                </button>
                                <button onClick={analyzeDom} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-300 hover:bg-[#333] transition-all">
                                    <Code size={14} /> Analyze DOM
                                </button>
                            </div>
                        )}
                        <button 
                            onClick={() => setShowAiMenu(!showAiMenu)}
                            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 ${showAiMenu ? 'bg-blue-500 rotate-90' : 'bg-blue-600 hover:bg-blue-500'}`}
                        >
                            {showAiMenu ? <X size={20} /> : <Sparkles size={20} />}
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom Panel (DevTools) */}
            <div className={`bg-[#1E1E1E] border-t border-[#333] transition-all duration-300 ease-in-out flex flex-col ${isDevToolsOpen ? 'h-80' : 'h-8'}`}>
                <div className="h-8 flex items-center px-4 bg-[#252525] border-b border-[#333] cursor-pointer hover:bg-[#2A2A2A]" onClick={() => setIsDevToolsOpen(!isDevToolsOpen)}>
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
                        {isDevToolsOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        <span>Developer Tools</span>
                    </div>
                    <div className="flex-1" />
                    <div className="flex h-full">
                         <button 
                            onClick={(e) => { e.stopPropagation(); setDevToolsTab('console'); setIsDevToolsOpen(true); }}
                            className={`px-3 h-full text-[10px] font-bold tracking-wider flex items-center gap-2 ${devToolsTab === 'console' ? 'text-blue-400 bg-[#1E1E1E] border-t-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            CONSOLE {logs.length > 0 && <span className="bg-[#333] text-gray-300 px-1.5 rounded-full">{logs.length}</span>}
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDevToolsTab('network'); setIsDevToolsOpen(true); }}
                            className={`px-3 h-full text-[10px] font-bold tracking-wider flex items-center gap-2 ${devToolsTab === 'network' ? 'text-emerald-400 bg-[#1E1E1E] border-t-2 border-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            NETWORK {network.length > 0 && <span className="bg-[#333] text-gray-300 px-1.5 rounded-full">{network.length}</span>}
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDevToolsTab('script'); setIsDevToolsOpen(true); }}
                            className={`px-3 h-full text-[10px] font-bold tracking-wider flex items-center gap-2 ${devToolsTab === 'script' ? 'text-purple-400 bg-[#1E1E1E] border-t-2 border-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            SCRIPT
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    {/* Console Tab */}
                    {devToolsTab === 'console' && (
                        <div className="h-full overflow-auto p-2 font-mono text-xs space-y-1 bg-[#1E1E1E]">
                            {logs.length === 0 && <div className="text-gray-600 p-2 italic">No logs to display.</div>}
                            {logs.map((log, i) => (
                                <div key={i} className={`flex gap-2 p-1 border-b border-[#2A2A2A] ${log.type === 'error' ? 'text-red-400 bg-red-900/10' : log.type === 'warn' ? 'text-yellow-400' : 'text-gray-300'}`}>
                                    <span className="text-gray-600 w-16 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    <span className="uppercase font-bold w-12 shrink-0">{log.type}</span>
                                    <span className="break-all whitespace-pre-wrap">{log.message}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Network Tab */}
                    {devToolsTab === 'network' && (
                        <div className="h-full flex">
                            <div className={`${selectedNetworkItem ? 'w-1/2' : 'w-full'} h-full overflow-auto border-r border-[#333]`}>
                                <table className="w-full text-left text-xs font-mono">
                                    <thead className="bg-[#252525] text-gray-500 sticky top-0">
                                        <tr>
                                            <th className="p-2">Status</th>
                                            <th className="p-2">Method</th>
                                            <th className="p-2">Name</th>
                                            <th className="p-2">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {network.map((req, i) => (
                                            <tr key={i} onClick={() => setSelectedNetworkItem(req)} className={`cursor-pointer hover:bg-[#2A2A2A] border-b border-[#2A2A2A] ${selectedNetworkItem === req ? 'bg-[#2A2A2A]' : ''}`}>
                                                <td className={`p-2 ${req.status && req.status >= 400 ? 'text-red-400' : 'text-emerald-400'}`}>{req.status || '-'}</td>
                                                <td className="p-2 text-yellow-400">{req.method}</td>
                                                <td className="p-2 text-gray-300 truncate max-w-xs" title={req.url}>{req.url.split('/').pop() || req.url}</td>
                                                <td className="p-2 text-gray-500">{req.type}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {selectedNetworkItem && (
                                <div className="w-1/2 h-full bg-[#1E1E1E] p-4 overflow-auto font-mono text-xs">
                                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#333]">
                                        <h3 className="font-bold text-gray-200">Request Details</h3>
                                        <button onClick={() => setSelectedNetworkItem(null)}><X size={14}/></button>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <div className="text-gray-500 mb-1">URL</div>
                                            <div className="text-blue-400 break-all select-all">{selectedNetworkItem.url}</div>
                                        </div>
                                        {selectedNetworkItem.requestBody && (
                                            <div>
                                                <div className="text-gray-500 mb-1">Payload</div>
                                                <pre className="bg-[#151515] p-2 rounded text-gray-300 overflow-auto max-h-40">{selectedNetworkItem.requestBody}</pre>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Script Tab */}
                    {devToolsTab === 'script' && (
                        <div className="h-full flex flex-col p-2 gap-2 bg-[#1E1E1E]">
                            <textarea 
                                value={script}
                                onChange={e => setScript(e.target.value)}
                                placeholder="// Write JavaScript to execute on the page..."
                                className="flex-1 bg-[#151515] border border-[#333] rounded p-3 font-mono text-xs text-gray-300 focus:border-blue-500 outline-none resize-none"
                            />
                            <div className="flex justify-between items-center h-1/3">
                                {scriptResult && (
                                    <div className="flex-1 bg-[#151515] border border-[#333] rounded p-2 font-mono text-xs overflow-auto h-full mr-2">
                                        <div className="text-emerald-500 mb-1 font-bold">Result</div>
                                        <pre className="text-gray-400 whitespace-pre-wrap">{scriptResult}</pre>
                                    </div>
                                )}
                                <button onClick={async () => {
                                    const data = await handleAction('evaluate', { script });
                                    if (data?.result) setScriptResult(JSON.stringify(data.result, null, 2));
                                }} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold flex items-center gap-2 h-fit self-end">
                                    <Play size={14} /> Run
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Overlays (Audit/Inspect) */}
            {(auditReport || inspectedElement || domAnalysis) && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-8 animate-in fade-in">
                    <div className="bg-[#1E1E1E] border border-[#333] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-[#333] flex justify-between items-center">
                            <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                {inspectedElement ? <><Eye className="text-blue-400"/> Inspector</> : 
                                 auditReport ? <><Activity className="text-orange-400"/> Audit Report</> : 
                                 <><Code className="text-pink-400"/> DOM Analysis</>}
                            </h3>
                            <button onClick={() => { setAuditReport(null); setInspectedElement(null); setDomAnalysis(''); }} className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 overflow-auto font-mono text-sm">
                            {inspectedElement && (
                                <div className="space-y-4">
                                    <div className="text-blue-300 font-bold">&lt;{inspectedElement.tagName} className="{inspectedElement.className}"&gt;</div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-[#151515] p-3 rounded border border-[#333]">
                                            <div className="text-gray-500 text-xs mb-1">Text Content</div>
                                            <div className="text-gray-300 break-words">{inspectedElement.innerText || 'No text content'}</div>
                                        </div>
                                        <div className="bg-[#151515] p-3 rounded border border-[#333]">
                                            <div className="text-gray-500 text-xs mb-1">Dimensions</div>
                                            <div className="text-gray-300">{Math.round(inspectedElement.rect.width)} x {Math.round(inspectedElement.rect.height)} px</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {auditReport && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between bg-[#151515] p-4 rounded-lg border border-[#333]">
                                        <span className="text-gray-400">Score</span>
                                        <span className={`text-3xl font-bold ${auditReport.score > 80 ? 'text-emerald-400' : 'text-orange-400'}`}>{auditReport.score}</span>
                                    </div>
                                    {auditReport.issues.map((issue, i) => (
                                        <div key={i} className="flex gap-3 p-3 bg-[#151515] rounded border border-[#333]">
                                            <AlertTriangle size={16} className={issue.severity === 'critical' ? 'text-red-500' : 'text-yellow-500'} />
                                            <div>
                                                <div className="text-gray-200">{issue.message}</div>
                                                <div className="text-gray-600 text-xs mt-1">{issue.selector}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {domAnalysis && <pre className="text-pink-300 whitespace-pre-wrap text-xs">{domAnalysis}</pre>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
