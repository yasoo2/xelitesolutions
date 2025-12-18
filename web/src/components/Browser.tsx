import { useState, useEffect, useRef } from 'react';
import { 
    Globe, ArrowLeft, ArrowRight, RotateCw, Camera, FileText, 
    Smartphone, Tablet, Monitor, Code, Eye, Play, MousePointer2,
    X, Terminal, Activity, Bot, Zap, ChevronUp, ChevronDown,
    ShieldCheck, Sparkles, Layout, Settings, AlertTriangle
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
    const [activeTab, setActiveTab] = useState<'console' | 'network' | 'script'>('console');
    const [showAiMenu, setShowAiMenu] = useState(false);
    const [viewport, setViewport] = useState({ w: 1280, h: 800, label: 'Desktop' });

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
            // Always get screenshot in view mode
            const imgRes = await fetch(`${API_URL}/browser/screenshot`, { headers });
            const imgData = await imgRes.json();
            if (imgData.image) setImage(imgData.image);

            // Get Logs & Network if DevTools is open
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

    const handleViewportChange = async (w: number, h: number, label: string) => {
        setViewport({ w, h, label });
        await handleAction('viewport', { width: w, height: h });
    };

    const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
        if (!imageRef.current) return;
        const rect = imageRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Scale coordinates to actual viewport
        const scaleX = viewport.w / rect.width;
        const scaleY = viewport.h / rect.height;
        
        const finalX = x * scaleX;
        const finalY = y * scaleY;

        if (inspectMode) {
            const data = await handleAction('inspect', { x: finalX, y: finalY });
            if (data?.info) {
                setInspectedElement(data.info);
                setIsDevToolsOpen(true); // Auto-open tools to show result
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

    // AI Tools Handlers
    const runAudit = async () => {
        setShowAiMenu(false);
        const data = await handleAction('audit');
        if (data?.audit) {
            setAuditReport(data.audit);
            setIsDevToolsOpen(true); // Show results
        }
    };

    const analyzeDom = async () => {
        setShowAiMenu(false);
        const data = await handleAction('dom');
        if (data?.dom) {
            setDomAnalysis(JSON.stringify(data.dom, null, 2));
            setIsDevToolsOpen(true); // Show results
        }
    };

    return (
        <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30 overflow-hidden">
            
            {/* Top Navigation Bar */}
            <div className="h-14 px-4 flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md z-20">
                {/* Navigation Controls */}
                <div className="flex items-center gap-1 text-zinc-400">
                    <button onClick={() => handleAction('back')} className="p-2 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors">
                        <ArrowLeft size={18} />
                    </button>
                    <button onClick={() => handleAction('forward')} className="p-2 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors">
                        <ArrowRight size={18} />
                    </button>
                    <button onClick={() => handleAction('reload')} className="p-2 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors">
                        <RotateCw size={18} />
                    </button>
                </div>

                {/* Omnibar */}
                <form onSubmit={handleNavigate} className="flex-1 relative group max-w-3xl mx-auto">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        {isConnected ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-500 animate-pulse" />
                        ) : (
                            <Globe className="w-4 h-4 text-zinc-500" />
                        )}
                    </div>
                    <input 
                        type="text" 
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="Enter URL to start browsing..."
                        className="w-full bg-zinc-950 border border-zinc-800 group-hover:border-zinc-700 focus:border-indigo-500 rounded-xl py-2.5 pl-10 pr-16 text-sm text-zinc-200 placeholder:text-zinc-600 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-sm outline-none"
                    />
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-zinc-800 hover:bg-indigo-600 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                    >
                        {loading ? '...' : 'GO'}
                    </button>
                </form>

                {/* Right Actions */}
                <div className="flex items-center gap-2">
                    <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                        <button onClick={() => handleViewportChange(1920, 1080, 'Desktop')} className={`p-1.5 rounded ${viewport.label === 'Desktop' ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}><Monitor size={16} /></button>
                        <button onClick={() => handleViewportChange(768, 1024, 'Tablet')} className={`p-1.5 rounded ${viewport.label === 'Tablet' ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}><Tablet size={16} /></button>
                        <button onClick={() => handleViewportChange(375, 812, 'Mobile')} className={`p-1.5 rounded ${viewport.label === 'Mobile' ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}><Smartphone size={16} /></button>
                    </div>
                    
                    <button 
                        onClick={closeSession}
                        disabled={!isConnected}
                        className="p-2 rounded-lg hover:bg-red-900/20 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-30"
                        title="End Session"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center bg-zinc-950"
                 style={{
                     backgroundImage: 'radial-gradient(circle at center, #18181b 0%, #09090b 100%)',
                     backgroundSize: '100% 100%'
                 }}>
                
                {isConnected && image ? (
                    <div className="relative group perspective-1000">
                        {/* Browser Container */}
                        <div className={`
                            relative shadow-2xl shadow-black rounded-xl overflow-hidden border border-zinc-800 
                            transition-all duration-500 ease-out bg-white
                            ${inspectMode ? 'ring-2 ring-indigo-500 cursor-help' : ''}
                        `}>
                            <img 
                                ref={imageRef}
                                src={image} 
                                alt="Browser View" 
                                onClick={handleImageClick}
                                className="max-w-none transition-transform"
                                style={{ 
                                    width: viewport.w, 
                                    height: viewport.h, 
                                    transform: `scale(${viewport.w > 1200 ? 0.65 : viewport.w > 800 ? 0.75 : 0.9})`, 
                                    transformOrigin: 'center center' 
                                }}
                            />
                            
                            {/* Overlay Indicators */}
                            <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none">
                                <div className="bg-black/70 backdrop-blur text-white text-[10px] px-2 py-1 rounded-md font-mono border border-white/10">
                                    {viewport.w}x{viewport.h}
                                </div>
                                {inspectMode && (
                                    <div className="bg-indigo-600/90 backdrop-blur text-white text-xs px-2 py-1 rounded-md font-bold shadow-lg animate-bounce">
                                        INSPECT MODE ON
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Landing State */
                    <div className="text-center max-w-md p-8 animate-fade-in">
                        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-zinc-900 flex items-center justify-center relative">
                            <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping opacity-75"></div>
                            <Globe className="w-10 h-10 text-indigo-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-3">Joe's Cloud Browser</h2>
                        <p className="text-zinc-400 leading-relaxed">
                            Secure, headless browsing environment powered by AI. 
                            Enter a URL above to start analyzing, debugging, or auditing any website.
                        </p>
                    </div>
                )}

                {/* Floating AI Action Button (FAB) */}
                {isConnected && (
                    <div className="absolute right-8 top-8 z-30 flex flex-col items-end gap-4">
                        {/* Menu Items */}
                        {showAiMenu && (
                            <div className="flex flex-col gap-3 items-end animate-in slide-in-from-bottom-5 fade-in duration-200">
                                <button onClick={() => setInspectMode(!inspectMode)} className={`flex items-center gap-3 px-4 py-2 rounded-full shadow-lg border backdrop-blur-md transition-all ${inspectMode ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-900/90 border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}>
                                    <span className="text-sm font-medium">Inspect Element</span>
                                    <MousePointer2 size={18} />
                                </button>
                                
                                <button onClick={runAudit} className="flex items-center gap-3 px-4 py-2 bg-zinc-900/90 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 hover:text-orange-400 rounded-full shadow-lg backdrop-blur-md transition-all">
                                    <span className="text-sm font-medium">UI/UX Audit</span>
                                    <Activity size={18} />
                                </button>
                                
                                <button onClick={analyzeDom} className="flex items-center gap-3 px-4 py-2 bg-zinc-900/90 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 hover:text-pink-400 rounded-full shadow-lg backdrop-blur-md transition-all">
                                    <span className="text-sm font-medium">DOM Analysis</span>
                                    <Code size={18} />
                                </button>
                            </div>
                        )}

                        {/* Main Toggle Button */}
                        <button 
                            onClick={() => setShowAiMenu(!showAiMenu)} 
                            className={`w-14 h-14 rounded-full shadow-xl shadow-indigo-900/30 flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 ${showAiMenu ? 'bg-indigo-500 rotate-90' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                        >
                            {showAiMenu ? <X size={24} /> : <Sparkles size={24} />}
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom DevTools Panel (Collapsible) */}
            <div className={`border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-sm flex flex-col transition-all duration-300 ease-in-out ${isDevToolsOpen ? 'h-96' : 'h-10'}`}>
                {/* Panel Header / Tabs */}
                <div className="flex items-center px-4 h-10 border-b border-zinc-800 bg-zinc-900 select-none cursor-pointer" onClick={() => setIsDevToolsOpen(!isDevToolsOpen)}>
                    <div className="mr-4 p-1 rounded hover:bg-zinc-800 text-zinc-500">
                        {isDevToolsOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </div>
                    
                    <div className="flex gap-6 h-full">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDevToolsTab('console'); setIsDevToolsOpen(true); }}
                            className={`flex items-center gap-2 text-xs font-bold tracking-wide h-full border-b-2 transition-colors ${devToolsTab === 'console' ? 'text-white border-indigo-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
                        >
                            <Terminal size={14} /> CONSOLE
                            {logs.length > 0 && <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded-full text-[10px]">{logs.length}</span>}
                        </button>
                        
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDevToolsTab('network'); setIsDevToolsOpen(true); }}
                            className={`flex items-center gap-2 text-xs font-bold tracking-wide h-full border-b-2 transition-colors ${devToolsTab === 'network' ? 'text-white border-emerald-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
                        >
                            <Activity size={14} /> NETWORK
                            {network.length > 0 && <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded-full text-[10px]">{network.length}</span>}
                        </button>
                        
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDevToolsTab('script'); setIsDevToolsOpen(true); }}
                            className={`flex items-center gap-2 text-xs font-bold tracking-wide h-full border-b-2 transition-colors ${devToolsTab === 'script' ? 'text-white border-purple-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
                        >
                            <Code size={14} /> SCRIPT
                        </button>
                    </div>

                    <div className="ml-auto flex items-center gap-4 text-[10px] text-zinc-500 font-mono">
                        {inspectedElement && <span className="text-indigo-400 flex items-center gap-1"><Eye size={10} /> Element Selected</span>}
                        {auditReport && <span className="text-orange-400 flex items-center gap-1"><AlertTriangle size={10} /> Audit Ready</span>}
                    </div>
                </div>

                {/* Panel Content */}
                <div className="flex-1 overflow-hidden relative">
                    {!isDevToolsOpen && (
                        <div className="absolute inset-0 bg-transparent" onClick={() => setIsDevToolsOpen(true)} />
                    )}
                    
                    {devToolsTab === 'console' && (
                        <div className="w-full h-full overflow-auto p-2 font-mono text-xs space-y-1">
                            {logs.length === 0 && <div className="text-zinc-600 italic p-4">No console logs available.</div>}
                            {logs.map((log, i) => (
                                <div key={i} className={`flex gap-3 p-1.5 rounded hover:bg-white/5 ${log.type === 'error' ? 'text-red-400 bg-red-900/10' : log.type === 'warn' ? 'text-yellow-400' : 'text-zinc-300'}`}>
                                    <span className="text-zinc-600 select-none shrink-0 w-16 text-right">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    <span className={`uppercase font-bold w-10 shrink-0 text-center text-[10px] pt-0.5 rounded ${log.type === 'error' ? 'bg-red-900/30' : 'bg-zinc-800'}`}>{log.type}</span>
                                    <span className="break-all whitespace-pre-wrap flex-1">{log.message}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {devToolsTab === 'network' && (
                        <div className="flex w-full h-full">
                            <div className={`${selectedNetworkItem ? 'w-1/2' : 'w-full'} h-full overflow-auto`}>
                                <table className="w-full text-left border-collapse text-xs font-mono">
                                    <thead className="bg-zinc-950 text-zinc-500 sticky top-0 z-10">
                                        <tr>
                                            <th className="p-2 border-b border-zinc-800">Status</th>
                                            <th className="p-2 border-b border-zinc-800">Method</th>
                                            <th className="p-2 border-b border-zinc-800">Resource</th>
                                            <th className="p-2 border-b border-zinc-800">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {network.map((req, i) => (
                                            <tr key={i} onClick={() => setSelectedNetworkItem(req)} className={`border-b border-zinc-800/50 hover:bg-zinc-800 cursor-pointer ${selectedNetworkItem === req ? 'bg-zinc-800' : ''}`}>
                                                <td className={`p-2 ${req.status && req.status >= 400 ? 'text-red-400' : 'text-emerald-400'}`}>{req.status || '-'}</td>
                                                <td className="p-2 text-yellow-400">{req.method}</td>
                                                <td className="p-2 text-zinc-300 truncate max-w-xs" title={req.url}>{req.url.split('/').pop() || req.url}</td>
                                                <td className="p-2 text-zinc-500">{req.type}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {selectedNetworkItem && (
                                <div className="w-1/2 h-full bg-zinc-900 border-l border-zinc-800 p-4 font-mono text-xs overflow-auto">
                                    <div className="flex justify-between mb-4">
                                        <h3 className="font-bold text-zinc-200">Headers</h3>
                                        <button onClick={() => setSelectedNetworkItem(null)}><X size={14}/></button>
                                    </div>
                                    <div className="text-indigo-300 break-all mb-4">{selectedNetworkItem.url}</div>
                                    {selectedNetworkItem.requestBody && (
                                        <div className="mb-4">
                                            <div className="text-zinc-500 mb-1">Request Payload</div>
                                            <pre className="bg-black/30 p-2 rounded text-zinc-400 overflow-auto max-h-40">{selectedNetworkItem.requestBody}</pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {devToolsTab === 'script' && (
                        <div className="h-full flex flex-col p-4 gap-4">
                            <div className="flex-1 flex gap-4">
                                <textarea 
                                    value={script}
                                    onChange={e => setScript(e.target.value)}
                                    placeholder="// Inject JavaScript..."
                                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-300 focus:border-indigo-500 outline-none resize-none"
                                />
                                {scriptResult && (
                                    <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs overflow-auto">
                                        <div className="text-emerald-500 mb-2 font-bold">Result:</div>
                                        <pre className="text-zinc-400 whitespace-pre-wrap">{scriptResult}</pre>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end">
                                <button onClick={async () => {
                                    const data = await handleAction('evaluate', { script });
                                    if (data?.result) setScriptResult(JSON.stringify(data.result, null, 2));
                                }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center gap-2">
                                    <Play size={14} /> EXECUTE
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Overlays for Audit/DOM/Inspect Results (Modal style inside viewport) */}
            {isDevToolsOpen && (auditReport || inspectedElement || domAnalysis) && (
                <div className="absolute bottom-96 left-0 right-0 top-14 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-8 animate-in fade-in">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-full flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
                            <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                {inspectedElement ? <><Eye className="text-indigo-400"/> Inspector</> : 
                                 auditReport ? <><Activity className="text-orange-400"/> Audit Report</> : 
                                 <><Code className="text-pink-400"/> DOM Analysis</>}
                            </h3>
                            <button onClick={() => { setAuditReport(null); setInspectedElement(null); setDomAnalysis(''); }} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-auto font-mono text-sm">
                            {inspectedElement && (
                                <div className="space-y-4">
                                    <div className="text-indigo-300">&lt;{inspectedElement.tagName} className="{inspectedElement.className}"&gt;</div>
                                    <div className="grid grid-cols-2 gap-4 text-zinc-400">
                                        <div className="bg-zinc-950 p-3 rounded">
                                            <div className="text-zinc-600 text-xs mb-1">Dimensions</div>
                                            {Math.round(inspectedElement.rect.width)} x {Math.round(inspectedElement.rect.height)} px
                                        </div>
                                        <div className="bg-zinc-950 p-3 rounded">
                                            <div className="text-zinc-600 text-xs mb-1">Content</div>
                                            {inspectedElement.innerText?.slice(0, 50)}...
                                        </div>
                                    </div>
                                </div>
                            )}

                            {auditReport && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-zinc-400">Overall Score</span>
                                        <span className={`text-3xl font-bold ${auditReport.score > 80 ? 'text-emerald-400' : 'text-orange-400'}`}>{auditReport.score}</span>
                                    </div>
                                    {auditReport.issues.map((issue, i) => (
                                        <div key={i} className="flex gap-3 p-3 bg-zinc-950 rounded border border-zinc-800">
                                            <AlertTriangle size={16} className={issue.severity === 'critical' ? 'text-red-500' : 'text-yellow-500'} />
                                            <div>
                                                <div className="text-zinc-200">{issue.message}</div>
                                                <div className="text-zinc-600 text-xs mt-1">{issue.selector}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {domAnalysis && (
                                <pre className="text-pink-300 whitespace-pre-wrap">{domAnalysis}</pre>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
