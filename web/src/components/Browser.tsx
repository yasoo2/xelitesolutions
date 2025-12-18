import { useState, useEffect, useRef } from 'react';
import { 
    Globe, ArrowLeft, ArrowRight, RotateCw, 
    Monitor, Code, Eye, Play, MousePointer2,
    X, Terminal, Activity, Sparkles, ChevronUp, ChevronDown,
    ShieldCheck, AlertTriangle, Smartphone, Tablet, Maximize2, Minimize2,
    Search, MoreVertical, Star, PanelBottom, PanelTop
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
    const [viewport, setViewport] = useState({ width: 1280, height: 800 });
    const [clickPos, setClickPos] = useState<{x: number, y: number} | null>(null);
    
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
        const interval = setInterval(refreshData, 1000);
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
                if (data.viewport) setViewport(data.viewport);
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
        
        const relX = x / rect.width;
        const relY = y / rect.height;
        
        // Use actual backend viewport size
        const viewportW = viewport.width; 
        const viewportH = viewport.height;
        
        const finalX = relX * viewportW;
        const finalY = relY * viewportH;

        // Visual feedback
        setClickPos({ x, y });
        setTimeout(() => setClickPos(null), 500);

        if (inspectMode) {
            const data = await handleAction('inspect', { x: finalX, y: finalY });
            if (data?.info) {
                setInspectedElement(data.info);
                // Modal will open automatically when inspectedElement is set
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
        }
    };

    const analyzeDom = async () => {
        setShowAiMenu(false);
        const data = await handleAction('dom');
        if (data?.dom) {
            setDomAnalysis(JSON.stringify(data.dom, null, 2));
        }
    };

    return (
        <div className="h-full flex flex-col bg-zinc-900 relative overflow-hidden font-sans selection:bg-blue-500/30">
            
            {/* Top Bar - Chrome Style */}
            <div className="flex flex-col bg-zinc-900 border-b border-zinc-800">
                
                {/* Tab Bar Strip */}
                <div className="flex items-end px-2 pt-2 gap-1 h-10 bg-zinc-950">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-t-lg text-xs font-medium text-zinc-300 min-w-[160px] max-w-[240px] border-t border-x border-zinc-700 relative group">
                        <Globe size={14} className="text-blue-400" />
                        <span className="truncate flex-1">{currentUrl || 'New Tab'}</span>
                        <button onClick={closeSession} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-700 rounded-full transition-all">
                            <X size={12} />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />
                    </div>
                    <button className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-full transition-all mb-1">
                        <X size={16} className="rotate-45" />
                    </button>
                </div>

                {/* Navigation Toolbar */}
                <div className="flex items-center gap-2 p-2 bg-zinc-800 shadow-sm">
                    <div className="flex items-center gap-1">
                        <button onClick={() => handleAction('back')} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-full transition-all"><ArrowLeft size={16} /></button>
                        <button onClick={() => handleAction('forward')} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-full transition-all"><ArrowRight size={16} /></button>
                        <button onClick={() => handleAction('reload')} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-full transition-all"><RotateCw size={16} /></button>
                    </div>

                    {/* Omnibox / Address Bar */}
                    <form onSubmit={handleNavigate} className="flex-1 flex items-center bg-zinc-900 rounded-full px-3 py-1.5 border border-zinc-700 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                        <div className="mr-2">
                            {isConnected ? <ShieldCheck size={14} className="text-emerald-500" /> : <Search size={14} className="text-zinc-500" />}
                        </div>
                        <input 
                            type="text" 
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600 font-normal"
                            placeholder="Search or type URL"
                        />
                        <button type="button" className="p-1 text-zinc-500 hover:text-yellow-400 transition-colors">
                            <Star size={14} />
                        </button>
                    </form>

                    {/* Toolbar Actions */}
                    <div className="flex items-center gap-1 pl-1 border-l border-zinc-700 ml-1">
                         {/* AI Tools Dropdown */}
                         <div className="relative">
                            <button 
                                onClick={() => setShowAiMenu(!showAiMenu)} 
                                className={`p-1.5 rounded-full transition-all ${showAiMenu ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-indigo-400 hover:bg-zinc-700'}`}
                                title="AI Assistant"
                            >
                                <Sparkles size={18} />
                            </button>
                            {showAiMenu && (
                                <div className="absolute top-full right-0 mt-2 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                    <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">AI Assistant</div>
                                    <button onClick={() => { setInspectMode(!inspectMode); setShowAiMenu(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-zinc-700 flex items-center gap-2 ${inspectMode ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-300'}`}>
                                        <MousePointer2 size={14} /> Inspect Element
                                    </button>
                                    <button onClick={runAudit} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 flex items-center gap-2">
                                        <Activity size={14} /> UI/UX Audit
                                    </button>
                                    <button onClick={analyzeDom} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 flex items-center gap-2">
                                        <Code size={14} /> Analyze DOM
                                    </button>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={() => setIsDevToolsOpen(!isDevToolsOpen)} 
                            className={`p-1.5 rounded-full transition-all ${isDevToolsOpen ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'}`}
                            title="Developer Tools"
                        >
                            <PanelBottom size={18} />
                        </button>

                        <button className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-full transition-all">
                            <MoreVertical size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative w-full overflow-hidden bg-zinc-200 flex flex-col">
                {/* Browser Viewport */}
                <div className="flex-1 relative bg-white flex items-center justify-center overflow-hidden">
                    {isConnected && image ? (
                        <div className="w-full h-full relative group">
                            <img 
                                ref={imageRef}
                                src={image} 
                                alt="Browser Content"
                                onClick={handleImageClick}
                                className={`w-full h-full object-contain ${inspectMode ? 'cursor-crosshair' : 'cursor-default'}`}
                            />
                            
                            {/* Inspect Indicator */}
                            {inspectMode && (
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-1.5 rounded-full shadow-lg text-xs font-medium flex items-center gap-2 animate-in slide-in-from-top-2">
                                    <MousePointer2 size={12} />
                                    <span>Select an element to inspect</span>
                                    <button onClick={() => setInspectMode(false)} className="ml-2 hover:bg-indigo-700 rounded-full p-0.5"><X size={12}/></button>
                                </div>
                            )}

                            {/* Click Feedback */}
                            {clickPos && (
                                <div 
                                    className="absolute w-4 h-4 rounded-full border-2 border-red-500 bg-red-500/30 animate-ping pointer-events-none"
                                    style={{ left: clickPos.x - 8, top: clickPos.y - 8 }}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-zinc-400 gap-4">
                            <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center">
                                <Globe size={40} className="text-zinc-300" />
                            </div>
                            <p className="text-zinc-500 font-medium">Enter a URL to start browsing</p>
                        </div>
                    )}
                </div>

                {/* Status Bar */}
                <div className="h-6 bg-zinc-900 border-t border-zinc-800 flex items-center px-3 text-[10px] text-zinc-500 gap-4 select-none shrink-0 z-20">
                    <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-zinc-600'}`} />
                        <span className="font-medium">{isConnected ? 'Remote Session Active' : 'Disconnected'}</span>
                    </div>
                    <div className="h-3 w-[1px] bg-zinc-700" />
                    <div>Viewport: {viewport.width}x{viewport.height}</div>
                    <div className="h-3 w-[1px] bg-zinc-700" />
                    <div className="flex-1 truncate text-zinc-600">
                        {currentUrl}
                    </div>
                    <button 
                        onClick={() => setIsDevToolsOpen(!isDevToolsOpen)} 
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors ${isDevToolsOpen ? 'text-blue-400' : 'text-zinc-400'}`}
                    >
                        <PanelBottom size={10} />
                        <span>DevTools</span>
                        {(logs.length > 0 || network.length > 0) && (
                            <span className="bg-zinc-800 text-zinc-300 px-1 rounded-sm min-w-[16px] text-center">
                                {logs.length + network.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* DevTools Panel - Docked at Bottom */}
                {isDevToolsOpen && (
                    <div className="h-[350px] bg-zinc-900 border-t border-zinc-700 flex flex-col animate-in slide-in-from-bottom-10 duration-200 shadow-[0_-4px_20px_rgba(0,0,0,0.3)] z-30 relative">
                         {/* DevTools Header */}
                         <div className="flex items-center justify-between px-2 bg-zinc-800 border-b border-zinc-700 h-9">
                            <div className="flex items-center">
                                {['console', 'network', 'script'].map((tab) => (
                                    <button 
                                        key={tab}
                                        onClick={() => setDevToolsTab(tab as any)}
                                        className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-all ${devToolsTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                                    >
                                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                        {tab === 'console' && logs.length > 0 && <span className="ml-1.5 px-1 bg-zinc-700 rounded text-[10px]">{logs.length}</span>}
                                        {tab === 'network' && network.length > 0 && <span className="ml-1.5 px-1 bg-zinc-700 rounded text-[10px]">{network.length}</span>}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => setIsDevToolsOpen(false)} className="p-1 text-zinc-500 hover:text-white transition-colors">
                                <X size={14} />
                            </button>
                        </div>

                        {/* DevTools Content */}
                        <div className="flex-1 overflow-hidden bg-zinc-900 font-mono text-xs">
                            {/* Console Tab */}
                            {devToolsTab === 'console' && (
                                <div className="h-full overflow-auto p-2 space-y-1">
                                    {logs.length === 0 && <div className="text-zinc-600 italic p-2">No logs captured yet</div>}
                                    {logs.map((log, i) => (
                                        <div key={i} className={`flex gap-2 p-1 border-b border-zinc-800/50 ${log.type === 'error' ? 'text-red-400 bg-red-500/5' : log.type === 'warn' ? 'text-amber-400 bg-amber-500/5' : 'text-zinc-300'}`}>
                                            <span className="text-zinc-600 shrink-0 select-none w-14">{new Date(log.timestamp).toLocaleTimeString().split(' ')[0]}</span>
                                            <span className="break-all whitespace-pre-wrap">{log.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Network Tab */}
                            {devToolsTab === 'network' && (
                                <div className="h-full flex flex-col">
                                    <div className="flex bg-zinc-800 text-zinc-400 font-medium py-1 px-2 border-b border-zinc-700 select-none">
                                        <div className="w-16">Status</div>
                                        <div className="w-16">Method</div>
                                        <div className="flex-1">Name</div>
                                        <div className="w-24">Type</div>
                                    </div>
                                    <div className="flex-1 overflow-auto">
                                        {network.map((req, i) => (
                                            <div key={i} onClick={() => setSelectedNetworkItem(req)} className={`flex py-1 px-2 border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800 ${selectedNetworkItem === req ? 'bg-blue-900/20' : ''}`}>
                                                <div className={`w-16 ${req.status && req.status >= 400 ? 'text-red-400' : 'text-emerald-400'}`}>{req.status || '-'}</div>
                                                <div className="w-16 text-amber-400">{req.method}</div>
                                                <div className="flex-1 text-zinc-300 truncate pr-4" title={req.url}>{req.url.split('/').pop() || req.url}</div>
                                                <div className="w-24 text-zinc-500">{req.type}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Script Tab */}
                            {devToolsTab === 'script' && (
                                <div className="h-full flex flex-col">
                                    <div className="flex-1 flex">
                                        <div className="w-8 bg-zinc-800 text-zinc-500 text-right pr-2 pt-2 select-none border-r border-zinc-700">1</div>
                                        <textarea 
                                            value={script}
                                            onChange={e => setScript(e.target.value)}
                                            className="flex-1 bg-zinc-900 text-zinc-300 p-2 outline-none resize-none"
                                            placeholder="// Enter JavaScript..."
                                        />
                                    </div>
                                    <div className="h-10 border-t border-zinc-700 flex items-center justify-between px-4 bg-zinc-800">
                                        <span className="text-zinc-500">Press Execute to run code in page context</span>
                                        <button onClick={async () => {
                                            const data = await handleAction('evaluate', { script });
                                            if (data?.result) setScriptResult(JSON.stringify(data.result, null, 2));
                                        }} className="px-4 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-colors flex items-center gap-2">
                                            <Play size={10} fill="currentColor" /> EXECUTE
                                        </button>
                                    </div>
                                    {scriptResult && (
                                        <div className="h-24 border-t border-zinc-700 bg-black/30 p-2 overflow-auto text-emerald-400">
                                            <div className="text-zinc-500 mb-1 opacity-50">&gt; Result:</div>
                                            {scriptResult}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Results Overlay Modal */}
            {(domAnalysis || auditReport || inspectedElement) && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-800">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                                {inspectedElement ? <><MousePointer2 size={16} className="text-blue-400"/> Element Inspection</> : 
                                 auditReport ? <><Activity size={16} className="text-blue-400"/> UI/UX Audit Report</> : 
                                 <><Code size={16} className="text-blue-400"/> DOM Analysis</>}
                            </h2>
                            <button 
                                onClick={() => { setDomAnalysis(''); setAuditReport(null); setInspectedElement(null); }}
                                className="p-1.5 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 overflow-auto bg-zinc-900 text-zinc-300">
                            {inspectedElement && (
                                <div className="space-y-4 font-mono text-sm">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-zinc-950 p-4 rounded border border-zinc-800">
                                            <div className="text-zinc-500 text-xs uppercase mb-2">Tag</div>
                                            <div className="text-blue-400 font-bold text-lg">&lt;{inspectedElement.tagName.toLowerCase()}&gt;</div>
                                        </div>
                                        {inspectedElement.id && (
                                            <div className="bg-zinc-950 p-4 rounded border border-zinc-800">
                                                <div className="text-zinc-500 text-xs uppercase mb-2">ID</div>
                                                <div className="text-emerald-400">#{inspectedElement.id}</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="bg-zinc-950 p-4 rounded border border-zinc-800">
                                        <div className="text-zinc-500 text-xs uppercase mb-2">Attributes</div>
                                        <div className="space-y-1">
                                            {Object.entries(inspectedElement.attributes || {}).map(([k, v]) => (
                                                <div key={k} className="flex gap-2">
                                                    <span className="text-amber-400">{k}=</span>
                                                    <span className="text-zinc-300">"{String(v)}"</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-zinc-950 p-4 rounded border border-zinc-800">
                                        <div className="text-zinc-500 text-xs uppercase mb-2">Text Content</div>
                                        <div className="text-zinc-300 break-words">{inspectedElement.text?.slice(0, 200)}</div>
                                    </div>
                                </div>
                            )}

                            {auditReport && (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-20 h-20 rounded-full flex items-center justify-center border-4 border-zinc-800 text-xl font-bold relative">
                                            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                                                <circle cx="50" cy="50" r="46" fill="none" stroke="#27272a" strokeWidth="8" />
                                                <circle cx="50" cy="50" r="46" fill="none" stroke={auditReport.score > 80 ? '#10b981' : auditReport.score > 50 ? '#f59e0b' : '#ef4444'} strokeWidth="8" strokeDasharray={`${auditReport.score * 2.89} 289`} strokeLinecap="round" />
                                            </svg>
                                            {auditReport.score}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold">Performance Score</h3>
                                            <p className="text-zinc-500 text-sm">Automated analysis results.</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        {auditReport.issues.map((issue, i) => (
                                            <div key={i} className="flex gap-3 p-3 rounded bg-zinc-950 border border-zinc-800">
                                                <div className={`w-1.5 h-full rounded-full self-stretch ${issue.severity === 'critical' ? 'bg-red-500' : issue.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                                <div>
                                                    <div className={`text-[10px] font-bold uppercase mb-0.5 ${issue.severity === 'critical' ? 'text-red-400' : issue.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>{issue.severity}</div>
                                                    <div className="text-zinc-300 text-sm">{issue.message}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {domAnalysis && (
                                <pre className="font-mono text-xs text-zinc-300 bg-zinc-950 p-4 rounded border border-zinc-800 overflow-auto max-h-[60vh]">
                                    {domAnalysis}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
