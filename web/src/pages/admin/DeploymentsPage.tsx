import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Rocket, RotateCcw, Activity, Shield, Terminal,
    CheckCircle, XCircle, Clock, Hash, Play, Info,
    ExternalLink, Loader2, Server, MoreHorizontal,
    RefreshCw
} from 'lucide-react';
import { API_URL } from '../../config';

// JWT decode helper
import { jwtDecode } from 'jwt-decode';

interface Deployment {
    _id: string;
    commit: string;
    status: 'PENDING' | 'BUILDING' | 'SUCCESS' | 'FAILED' | 'ROLLBACK';
    startTime: string;
    endTime?: string;
    duration?: number;
    logs: string[];
    triggeredBy: string;
    error?: string;
}

interface Container {
    Names: string;
    Status: string;
    Image: string;
    ID: string;
}

export default function DeploymentsPage() {
    const [deployments, setDeployments] = useState<Deployment[]>([]);
    const [containers, setContainers] = useState<Container[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
    const [liveLogs, setLiveLogs] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'history' | 'notifications'>('history');
    const [notifSettings, setNotifSettings] = useState({
        telegramBotToken: '',
        telegramChatId: '',
        webhookUrl: '',
        emailEnabled: false,
        emailRecipients: [] as string[]
    });
    const logContainerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const token = localStorage.getItem('token') || '';
    const isAdmin = (() => {
        try {
            const decoded: any = jwtDecode(token);
            const email = decoded.email?.toLowerCase().trim();
            const role = decoded.role;
            return role === 'SUPER_ADMIN' ||
                role === 'OWNER' ||
                email === 'info.auraaluxury@gmail.com' ||
                localStorage.getItem('admin') === 'true';
        } catch { return false; }
    })();

    const fetchAll = async () => {
        try {
            const [depRes, conRes, notifRes] = await Promise.all([
                fetch(`${API_URL}/admin/deployments`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/admin/system/containers`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/admin/settings/notifications`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            if (depRes.ok) setDeployments(await depRes.json());
            if (conRes.ok) setContainers(await conRes.json());
            if (notifRes.ok) setNotifSettings(await notifRes.json());
        } catch (e) {
            console.error('Fetch failed', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
        const inv = setInterval(fetchAll, 30000);
        return () => clearInterval(inv);
    }, []);

    // WebSocket for Live Logs
    useEffect(() => {
        if (!token) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = API_URL.replace(/^https?:\/\//, '');
        const ws = new WebSocket(`${protocol}//${host}/api/ws?token=${token}`);

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'admin:deploy_log') {
                    if (msg.data.deploymentId === selectedLogId) {
                        setLiveLogs(prev => [...prev, msg.data.log]);
                    }
                    // Refresh list to update status
                    fetchAll();
                }
            } catch { }
        };
        wsRef.current = ws;
        return () => ws.close();
    }, [token, selectedLogId]);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [liveLogs]);

    const handleDeploy = async () => {
        if (!confirm('Are you sure you want to trigger a production build?')) return;
        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/admin/deploy`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setSelectedLogId(data.id);
                setLiveLogs([`[JOE] Requesting deployment ${data.id}...`]);
                fetchAll();
            } else {
                alert(data.error || 'Deploy failed');
            }
        } catch (e: any) {
            alert(e.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleRollback = async (id: string) => {
        if (!confirm('Warning: This will reset project to this commit and rebuild. Proceed?')) return;
        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/admin/rollback/${id}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setSelectedLogId(data.id);
                setLiveLogs([`[JOE] Rolling back to deployment ${id}...`]);
                fetchAll();
            } else {
                alert(data.error || 'Rollback failed');
            }
        } catch (e: any) {
            alert(e.message);
        } finally {
            setActionLoading(false);
        }
    };

    const saveNotifSettings = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/admin/settings/notifications`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(notifSettings)
            });
            if (res.ok) alert('Settings saved successfully');
            else alert('Failed to save settings');
        } catch (e: any) {
            alert(e.message);
        } finally {
            setActionLoading(false);
        }
    };

    if (!isAdmin) return <div style={{ padding: 40, color: '#ef4444' }}><Shield size={48} /> Access Denied</div>;

    return (
        <div className="admin-deployments">
            <div className="header-bar">
                <div className="title">
                    <Rocket className="icon-gold" />
                    <h1>Deployment Control Center</h1>
                </div>
                <div className="actions">
                    <button className="btn-secondary" onClick={fetchAll} disabled={loading}>
                        <RefreshCw size={18} className={loading ? 'spin' : ''} />
                        Refresh
                    </button>
                    <button className="btn-primary" onClick={handleDeploy} disabled={actionLoading}>
                        {actionLoading ? <Loader2 size={18} className="spin" /> : <Play size={18} />}
                        Deploy Now
                    </button>
                </div>
            </div>

            <div className="tab-bar">
                <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                    <Clock size={18} /> History & Health
                </button>
                <button className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
                    <Info size={18} /> Notification Channels
                </button>
            </div>

            {activeTab === 'history' ? (
                <div className="dashboard-grid">
                    {/* Container Health */}
                    <div className="health-section">
                        <h2><Activity size={20} /> Container Fleet Status</h2>
                        <div className="health-cards">
                            {['joe_api', 'joe_web', 'joe_mongo', 'joe_nginx', 'joe_browser_worker'].map(name => {
                                const c = containers.find(x => x.Names.includes(name));
                                const isUp = c?.Status.toLowerCase().includes('up');
                                return (
                                    <motion.div key={name} className={`health-card ${isUp ? 'up' : 'down'}`} whileHover={{ scale: 1.02 }}>
                                        <div className="card-header">
                                            <Server size={18} />
                                            <span>{name.replace('joe_', '').toUpperCase()}</span>
                                        </div>
                                        <div className="card-status">
                                            {isUp ? <div className="dot green" /> : <div className="dot red" />}
                                            <span>{isUp ? (c?.Status || 'Running') : 'Exited'}</span>
                                        </div>
                                        <div className="card-info">{c?.Image || 'Unknown Image'}</div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>

                    {/* History */}
                    <div className="history-section">
                        <h2><Clock size={20} /> Deployment History</h2>
                        <div className="history-table-wrapper">
                            <table className="history-table">
                                <thead>
                                    <tr>
                                        <th><Hash size={14} /> ID</th>
                                        <th>Status</th>
                                        <th>Commit</th>
                                        <th>Time</th>
                                        <th>Logs</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deployments.map(d => (
                                        <tr key={d._id}>
                                            <td><span className="id-tag">{d._id.slice(-6)}</span></td>
                                            <td>
                                                <span className={`status-badge ${d.status.toLowerCase()}`}>
                                                    {d.status === 'SUCCESS' && <CheckCircle size={14} />}
                                                    {d.status === 'FAILED' && <XCircle size={14} />}
                                                    {d.status === 'BUILDING' && <Loader2 size={14} className="spin" />}
                                                    {d.status}
                                                </span>
                                            </td>
                                            <td><span className="commit-hash">{d.commit.slice(0, 7)}</span></td>
                                            <td>
                                                <div className="time-info">
                                                    <div>{new Date(d.startTime).toLocaleString()}</div>
                                                    {d.duration && <div className="duration">{d.duration}s</div>}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="actions-cell">
                                                    <button className="btn-icon" onClick={() => {
                                                        setSelectedLogId(d._id);
                                                        setLiveLogs(d.logs || []);
                                                    }}>
                                                        <Terminal size={14} />
                                                    </button>
                                                    {d.status === 'SUCCESS' && (
                                                        <button className="btn-icon rollback" onClick={() => handleRollback(d._id)}>
                                                            <RotateCcw size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="settings-section">
                    <div className="settings-card">
                        <h2><Shield size={20} /> Alert Channels</h2>
                        <p className="desc">Configure where Joe sends deployment notifications and failure alerts.</p>

                        <div className="settings-form">
                            <div className="form-group">
                                <label>Telegram Bot Token</label>
                                <input
                                    type="password"
                                    value={notifSettings.telegramBotToken}
                                    onChange={e => setNotifSettings({ ...notifSettings, telegramBotToken: e.target.value })}
                                    placeholder="000000000:AA-..."
                                />
                            </div>
                            <div className="form-group">
                                <label>Telegram Chat ID</label>
                                <input
                                    type="text"
                                    value={notifSettings.telegramChatId}
                                    onChange={e => setNotifSettings({ ...notifSettings, telegramChatId: e.target.value })}
                                    placeholder="-100..."
                                />
                            </div>
                            <hr className="divider" />
                            <div className="form-group">
                                <label>Generic Webhook URL</label>
                                <input
                                    type="text"
                                    value={notifSettings.webhookUrl}
                                    onChange={e => setNotifSettings({ ...notifSettings, webhookUrl: e.target.value })}
                                    placeholder="https://hooks.slack.com/services/..."
                                />
                            </div>
                            <div className="form-actions">
                                <button className="btn-primary" onClick={saveNotifSettings} disabled={actionLoading}>
                                    {actionLoading ? <Loader2 size={18} className="spin" /> : <CheckCircle size={18} />}
                                    Save Configurations
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Log Modal */}
            <AnimatePresence>
                {selectedLogId && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedLogId(null)}
                    >
                        <motion.div
                            className="log-modal"
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="modal-header">
                                <h3><Terminal size={20} /> Build Logs: {selectedLogId.slice(-8)}</h3>
                                <button className="close-btn" onClick={() => setSelectedLogId(null)}>×</button>
                            </div>
                            <div className="log-content" ref={logContainerRef}>
                                {liveLogs.map((l, i) => (
                                    <div key={i} className="log-line">
                                        <span className="line-num">{i + 1}</span>
                                        <span className="line-text">{l}</span>
                                    </div>
                                ))}
                                {deployments.find(x => x._id === selectedLogId)?.status === 'BUILDING' && (
                                    <div className="log-cursor">_</div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
        .admin-deployments {
          padding: 32px;
          background: #09090b;
          min-height: 100vh;
          color: #fafafa;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
        }
        .header-bar .title {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .header-bar .title h1 {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.025em;
          background: linear-gradient(to right, #fff, #a1a1aa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .icon-gold { color: #f59e0b; }
        .header-bar .actions { display: flex; gap: 12px; }

        .btn-primary {
          background: #f59e0b;
          color: #000;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary:hover { background: #fbbf24; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-secondary {
          background: #27272a;
          color: #fff;
          border: 1px solid #3f3f46;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .tab-bar {
          display: flex;
          gap: 16px;
          margin-bottom: 32px;
          border-bottom: 1px solid #27272a;
          padding-bottom: 2px;
        }
        .tab-btn {
          background: none;
          border: none;
          color: #71717a;
          padding: 12px 16px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          position: relative;
          transition: all 0.2s;
        }
        .tab-btn.active { color: #f59e0b; }
        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          right: 0;
          height: 2px;
          background: #f59e0b;
          border-radius: 2px;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 32px;
        }

        .settings-section {
          max-width: 800px;
        }
        .settings-card {
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 16px;
          padding: 32px;
        }
        .settings-card h2 { font-size: 20px; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; }
        .settings-card .desc { color: #a1a1aa; font-size: 14px; margin-bottom: 32px; }
        .settings-form { display: flex; flex-direction: column; gap: 24px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-size: 13px; font-weight: 600; color: #71717a; }
        .form-group input {
          background: #09090b;
          border: 1px solid #27272a;
          color: #fff;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
        }
        .form-group input:focus { border-color: #f59e0b; }
        .divider { border: 0; border-top: 1px solid #27272a; margin: 12px 0; }
        .form-actions { margin-top: 12px; }

        .health-section h2, .history-section h2 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #a1a1aa;
        }

        .health-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }
        .health-card {
          background: #18181b;
          border: 1px solid #27272a;
          padding: 20px;
          border-radius: 12px;
        }
        .health-card.up { border-left: 4px solid #10b981; }
        .health-card.down { border-left: 4px solid #ef4444; }
        .card-header { display: flex; gap: 8px; font-size: 13px; font-weight: 600; margin-bottom: 12px; color: #71717a; }
        .card-status { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; }
        .dot { width: 8px; height: 8px; border-radius: 50%; }
        .dot.green { background: #10b981; box-shadow: 0 0 8px #10b981; }
        .dot.red { background: #ef4444; }
        .card-info { font-size: 11px; color: #52525b; margin-top: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .history-table-wrapper {
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 12px;
          overflow: hidden;
        }
        .history-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .history-table th { background: #27272a; text-align: left; padding: 12px 16px; color: #a1a1aa; font-weight: 500; }
        .history-table td { padding: 16px; border-bottom: 1px solid #27272a; }
        .id-tag { font-family: monospace; background: #09090b; padding: 2px 6px; border-radius: 4px; color: #71717a; }
        
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }
        .status-badge.success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .status-badge.failed { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .status-badge.building { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .status-badge.rollback { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }

        .commit-hash { font-family: monospace; color: #3b82f6; cursor: pointer; }
        .time-info .duration { font-size: 11px; color: #71717a; }

        .actions-cell { display: flex; gap: 8px; }
        .btn-icon {
          background: #27272a;
          border: none;
          color: #a1a1aa;
          padding: 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-icon:hover { background: #3f3f46; color: #fff; }
        .btn-icon.rollback:hover { background: #4c1d95; color: #fff; }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 40px;
        }
        .log-modal {
          background: #09090b;
          border: 1px solid #27272a;
          width: 100%;
          maxWidth: 1000px;
          height: 80vh;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
        }
        .modal-header {
          padding: 16px 24px;
          border-bottom: 1px solid #27272a;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .close-btn { background: none; border: none; color: #a1a1aa; font-size: 24px; cursor: pointer; }
        .log-content {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 12px;
          background: #000;
          color: #d1d5db;
        }
        .log-line { display: flex; gap: 16px; margin-bottom: 2px; }
        .line-num { color: #4b5563; min-width: 30px; text-align: right; user-select: none; }
        .line-text { white-space: pre-wrap; word-break: break-all; }
        
        .log-cursor {
          display: inline-block;
          width: 8px;
          height: 15px;
          background: #f59e0b;
          animation: blink 1s step-end infinite;
          margin-left: 4px;
        }

        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
        </div>
    );
}
