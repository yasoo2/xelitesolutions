import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, Hash, Server, Shield,
    RefreshCw, ArrowRight, Clock,
    CheckCircle, ChevronDown, ChevronUp,
    Rocket, Search, UserPlus, UserMinus,
    Database, Terminal, ExternalLink,
    Loader2, MoreHorizontal, Trash2, Copy,
    RotateCcw, Info, XCircle
} from 'lucide-react';
import { API_URL } from '../../config';

// ═══════════════════════════════════════════════
// TYPES (Cache Bust: v2)
// ═══════════════════════════════════════════════

interface SystemHealth {
    system: {
        cpu: string;
        memory: string;
        disk: string;
        nodeUptime: string;
        nodeVersion: string;
        platform: string;
    };
    containers: any[];
    database: {
        collections?: number;
        documents?: number;
        dataSize?: string;
        storageSize?: string;
        connections?: number;
        uptime?: string;
    };
    timestamp: string;
}

interface Backup {
    name: string;
    size: string;
    created: string;
}

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

interface User {
    _id: string;
    email: string;
    name?: string;
    role: string;
    picture?: string;
    createdAt: string;
}

type Tab = 'dashboard' | 'deployments' | 'admins';

export default function SystemManagement() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const token = localStorage.getItem('token');

    // Dashboard State
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [backups, setBackups] = useState<Backup[]>([]);
    const [backingUp, setBackingUp] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    // Deployments State
    const [deployments, setDeployments] = useState<Deployment[]>([]);
    const [isDeploying, setIsDeploying] = useState(false);
    const [selectedDep, setSelectedDep] = useState<Deployment | null>(null);

    // Admins State
    const [users, setUsers] = useState<User[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [updatingUser, setUpdatingUser] = useState<string | null>(null);

    // ═══════════════════════════════════════════════
    // DATA FETCHING
    // ═══════════════════════════════════════════════

    const fetchHealth = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/admin/system/health`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setHealth(data);
            }
        } catch (e) { console.error(e); }
    }, [token]);

    const fetchBackups = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/admin/system/backups`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setBackups(data.backups || []);
            }
        } catch (e) { console.error(e); }
    }, [token]);

    const fetchDeployments = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/admin/deployments`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setDeployments(data);
            }
        } catch (e) { console.error(e); }
    }, [token]);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/admin/users?search=${userSearch}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (e) { console.error(e); }
    }, [token, userSearch]);

    const refreshAll = async () => {
        setLoading(true);
        if (activeTab === 'dashboard') {
            await Promise.all([fetchHealth(), fetchBackups()]);
        } else if (activeTab === 'deployments') {
            await fetchDeployments();
        } else if (activeTab === 'admins') {
            await fetchUsers();
        }
        setLastRefresh(new Date());
        setLoading(false);
    };

    useEffect(() => {
        refreshAll();
        // Polling for dashboard or deployments
        const interval = setInterval(() => {
            if (activeTab === 'dashboard') fetchHealth();
            if (activeTab === 'deployments') fetchDeployments();
        }, 15000);
        return () => clearInterval(interval);
    }, [activeTab, fetchHealth, fetchDeployments, fetchUsers]);

    // ═══════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════

    const triggerBackup = async () => {
        setBackingUp(true);
        try {
            const res = await fetch(`${API_URL}/admin/system/backup`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) await fetchBackups();
        } catch (e) { console.error(e); }
        setBackingUp(false);
    };

    const handleDeploy = async () => {
        if (!window.confirm('Start production deployment?')) return;
        setIsDeploying(true);
        try {
            const res = await fetch(`${API_URL}/admin/deploy`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) await fetchDeployments();
        } catch (e) { console.error(e); }
        setIsDeploying(false);
    };

    const toggleAdmin = async (user: User) => {
        const newRole = user.role === 'SUPER_ADMIN' ? 'USER' : 'SUPER_ADMIN';
        if (!window.confirm(`Change ${user.email} role to ${newRole}?`)) return;

        setUpdatingUser(user._id);
        try {
            const res = await fetch(`${API_URL}/admin/users/${user._id}/role`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ role: newRole })
            });
            if (res.ok) await fetchUsers();
        } catch (e) { console.error(e); }
        setUpdatingUser(null);
    };

    // ═══════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════

    const parsePercent = (str: string) => {
        const match = str?.match(/([\d.]+)%/);
        return match ? parseFloat(match[1]) : 0;
    };

    const getHealthColor = (percent: number) => {
        if (percent < 60) return '#00e676';
        if (percent < 85) return '#ffc107';
        return '#ff5252';
    };

    // ═══════════════════════════════════════════════
    // RENDER HELPERS
    // ═══════════════════════════════════════════════

    const renderDashboard = () => (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tab-pane">
            <div className="grid-stats">
                {health && (
                    <>
                        {/* CPU */}
                        <div className="stat-card cpu">
                            <div className="stat-icon">
                                <Activity size={18} color="#60a5fa" />
                                <span className="stat-label">CPU Usage</span>
                            </div>
                            <div className="stat-value" style={{ color: getHealthColor(parsePercent(health.system.cpu)) }}>
                                {health.system.cpu}
                            </div>
                            <div className="stat-sub">{health.system.platform} • Node {health.system.nodeVersion}</div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{
                                    width: `${parsePercent(health.system.cpu)}%`,
                                    background: getHealthColor(parsePercent(health.system.cpu))
                                }}></div>
                            </div>
                        </div>

                        {/* Memory */}
                        <div className="stat-card memory">
                            <div className="stat-icon">
                                <Clock size={18} color="#a78bfa" />
                                <span className="stat-label">Memory</span>
                            </div>
                            <div className="stat-value" style={{ color: getHealthColor(parsePercent(health.system.memory)) }}>
                                {health.system.memory}
                            </div>
                            <div className="stat-sub">Active processes memory</div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{
                                    width: `${parsePercent(health.system.memory)}%`,
                                    background: getHealthColor(parsePercent(health.system.memory))
                                }}></div>
                            </div>
                        </div>

                        {/* Disk */}
                        <div className="stat-card disk">
                            <div className="stat-icon">
                                <Hash size={18} color="#f59e0b" />
                                <span className="stat-label">Disk Usage</span>
                            </div>
                            <div className="stat-value" style={{ color: getHealthColor(parsePercent(health.system.disk)) }}>
                                {health.system.disk}
                            </div>
                            <div className="stat-sub">Root filesystem</div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{
                                    width: `${parsePercent(health.system.disk)}%`,
                                    background: getHealthColor(parsePercent(health.system.disk))
                                }}></div>
                            </div>
                        </div>

                        {/* DB */}
                        <div className="stat-card db">
                            <div className="stat-icon">
                                <Server size={18} color="#10b981" />
                                <span className="stat-label">Database</span>
                            </div>
                            <div className="stat-value" style={{ color: '#10b981' }}>
                                {health.database.dataSize || 'N/A'}
                            </div>
                            <div className="stat-sub">
                                {health.database.documents || 0} docs • {health.database.collections || 0} collections
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Containers */}
            <div className="section-card">
                <div className="section-header" onClick={() => setExpandedSection(expandedSection === 'containers' ? null : 'containers')}>
                    <div className="section-header-left">
                        <Server size={18} color="#60a5fa" />
                        <span className="section-title">Container Fleet</span>
                        <span className="section-badge">{health?.containers?.length || 0} running</span>
                    </div>
                </div>
                {health?.containers && (
                    <div className="section-body">
                        <div className="container-grid">
                            {health.containers.map((c: any, i: number) => (
                                <div key={i} className="container-item">
                                    <div className={`container-dot ${c.Status?.includes('Up') ? 'healthy' : 'unhealthy'}`}></div>
                                    <div>
                                        <div className="container-name">{c.Names}</div>
                                        <div className="container-status">{c.Status}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );

    const renderDeployments = () => (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tab-pane">
            <div className="deploy-actions">
                <button className="dash-btn btn-deploy-big" onClick={handleDeploy} disabled={isDeploying}>
                    <Rocket size={20} />
                    {isDeploying ? 'Deploying...' : 'Deploy Production Now'}
                </button>
            </div>

            <div className="deploy-history">
                <div className="history-header">
                    <Clock size={16} /> Latest Deployments
                </div>
                {deployments.map(dep => (
                    <div key={dep._id} className={`dep-item ${dep.status.toLowerCase()}`}>
                        <div className="dep-main">
                            <div className="dep-info">
                                <span className={`dep-badge ${dep.status.toLowerCase()}`}>{dep.status}</span>
                                <span className="dep-commit">#{dep.commit.slice(0, 7)}</span>
                                <span className="dep-time">{new Date(dep.startTime).toLocaleString()}</span>
                            </div>
                            <div className="dep-meta">
                                By {dep.triggeredBy} • {dep.duration?.toFixed(1) || '?'}s
                            </div>
                        </div>
                        <button className="dep-log-btn" onClick={() => setSelectedDep(dep)}>
                            <Terminal size={14} /> Logs
                        </button>
                    </div>
                ))}
            </div>
        </motion.div>
    );

    const renderAdmins = () => (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tab-pane">
            <div className="admin-search-box">
                <Search size={18} className="search-icon" />
                <input
                    type="text"
                    placeholder="Search users by name or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyUp={(e) => e.key === 'Enter' && fetchUsers()}
                />
            </div>

            <div className="user-list">
                {users.map(user => (
                    <div key={user._id} className="user-item">
                        <div className="user-avatar">
                            {user.picture ? <img src={user.picture} alt="" /> : <Activity size={20} />}
                        </div>
                        <div className="user-info">
                            <div className="user-name">{user.name || 'No Name'}</div>
                            <div className="user-email">{user.email}</div>
                        </div>
                        <div className="user-role-badge">
                            {user.role}
                        </div>
                        <div className="user-actions">
                            <button
                                className={`role-toggle-btn ${user.role === 'SUPER_ADMIN' ? 'is-admin' : ''}`}
                                onClick={() => toggleAdmin(user)}
                                disabled={updatingUser === user._id}
                            >
                                {updatingUser === user._id ? (
                                    <RefreshCw size={14} className="spinning" />
                                ) : user.role === 'SUPER_ADMIN' ? (
                                    <><UserMinus size={14} /> Remove Admin</>
                                ) : (
                                    <><UserPlus size={14} /> Grant Admin</>
                                )}
                            </button>
                        </div>
                    </div>
                ))}
                {users.length === 0 && !loading && (
                    <div className="empty-state">No users found matching your search.</div>
                )}
            </div>
        </motion.div>
    );

    return (
        <div className="system-management">
            <style>{`
                .system-management {
                    min-height: 100vh;
                    background: linear-gradient(135deg, #0a0e1a 0%, #111827 50%, #0d1321 100%);
                    color: #e1e5ee;
                    padding: 24px;
                    font-family: 'Inter', -apple-system, sans-serif;
                }
                .mgmt-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 32px;
                }
                .mgmt-title h1 {
                    font-size: 24px;
                    font-weight: 700;
                    margin: 0;
                    background: linear-gradient(135deg, #60a5fa, #a78bfa);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .mgmt-tabs {
                    display: flex;
                    gap: 4px;
                    background: rgba(255,255,255,0.03);
                    padding: 4px;
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.06);
                }
                .tab-btn {
                    padding: 8px 20px;
                    border-radius: 8px;
                    border: none;
                    background: transparent;
                    color: #94a3b8;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .tab-btn.active {
                    background: rgba(255,255,255,0.1);
                    color: white;
                }
                .tab-btn:hover:not(.active) {
                    background: rgba(255,255,255,0.05);
                }

                .grid-stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 16px;
                    margin-bottom: 24px;
                }
                .stat-card {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 16px;
                    padding: 20px;
                }
                .stat-value { font-size: 28px; font-weight: 700; margin: 8px 0; }
                .progress-bar { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; margin-top: 12px; overflow: hidden; }
                .progress-fill { height: 100%; transition: width 0.8s ease; }

                .section-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; margin-bottom: 16px; }
                .section-header { padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; }
                .section-body { padding: 0 24px 20px; }
                .container-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
                .container-item { padding: 12px; background: rgba(0,0,0,0.2); border-radius: 12px; display: flex; align-items: center; gap: 12px; }
                .container-dot { width: 8px; height: 8px; border-radius: 50%; }
                .container-dot.healthy { background: #00e676; box-shadow: 0 0 8px #00e676; }
                .container-dot.unhealthy { background: #ff5252; box-shadow: 0 0 8px #ff5252; }

                .btn-deploy-big {
                    width: 100%;
                    padding: 20px;
                    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                    color: white;
                    border: none;
                    border-radius: 16px;
                    font-size: 16px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    margin-bottom: 24px;
                    transition: all 0.2s;
                }
                .btn-deploy-big:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3); }
                .btn-deploy-big:disabled { opacity: 0.5; transform: none; }

                .dep-item {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .dep-badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; margin-right: 12px; }
                .dep-badge.success { background: rgba(0,230,118,0.1); color: #00e676; }
                .dep-badge.failed { background: rgba(255,82,82,0.1); color: #ff5252; }
                .dep-commit { font-family: monospace; color: #94a3b8; margin-right: 12px; }
                .dep-meta { font-size: 12px; color: #475569; margin-top: 4px; }
                .dep-log-btn { background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 6px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 12px; }

                .admin-search-box {
                    position: relative;
                    margin-bottom: 24px;
                }
                .admin-search-box input {
                    width: 100%;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 12px;
                    padding: 14px 14px 14px 44px;
                    color: white;
                    font-size: 15px;
                }
                .admin-search-box .search-icon { position: absolute; left: 16px; top: 15px; color: #475569; }

                .user-item {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 16px;
                    padding: 16px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 12px;
                }
                .user-avatar { width: 44px; height: 44px; border-radius: 12px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; overflow: hidden; }
                .user-avatar img { width: 100%; height: 100%; object-fit: cover; }
                .user-info { flex: 1; }
                .user-name { font-weight: 600; font-size: 15px; }
                .user-email { font-size: 13px; color: #64748b; }
                .user-role-badge { padding: 4px 10px; background: rgba(96, 165, 250, 0.1); color: #60a5fa; border-radius: 20px; font-size: 11px; font-weight: 700; }
                .role-toggle-btn {
                    padding: 8px 16px;
                    border-radius: 10px;
                    border: 1px solid rgba(255,255,255,0.1);
                    background: transparent;
                    color: #94a3b8;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .role-toggle-btn.is-admin { border-color: rgba(255,82,82,0.2); color: #ff5252; }
                .role-toggle-btn:hover { background: rgba(255,255,255,0.05); }

                @keyframes spin { to { transform: rotate(360deg); } }
                .spinning { animation: spin 1s linear infinite; }

                /* Modal & Logs Styles */
                .modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.8);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 20px;
                }
                .modal-content {
                    background: #111827;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 20px;
                    width: 100%;
                    max-width: 900px;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }
                .modal-header {
                    padding: 20px 24px;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .modal-header-left { display: flex; align-items: center; gap: 12px; }
                .modal-header-left h3 { margin: 0; font-size: 18px; font-weight: 700; }
                .commit-hash { color: #64748b; font-family: monospace; font-size: 14px; font-weight: 400; }
                .modal-header-actions { display: flex; align-items: center; gap: 12px; }
                
                .modal-action-btn {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: #e2e8f0;
                    padding: 6px 14px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .modal-action-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
                .modal-close-btn { background: transparent; border: none; color: #64748b; cursor: pointer; transition: color 0.2s; padding: 4px; }
                .modal-close-btn:hover { color: #f87171; }

                .logs-body { flex: 1; overflow: hidden; padding: 0; }
                .log-container {
                    padding: 20px;
                    background: #0a0f1a;
                    height: 100%;
                    overflow-y: auto;
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    font-size: 13px;
                    line-height: 1.6;
                }
                .log-line { display: flex; gap: 16px; margin-bottom: 2px; }
                .log-num { color: #334155; user-select: none; width: 30px; text-align: right; flex-shrink: 0; }
                .log-text { color: #cbd5e1; white-space: pre-wrap; word-break: break-all; }
                .empty-logs { padding: 40px; text-align: center; color: #475569; font-style: italic; }
            `}</style>

            <div className="mgmt-header">
                <div className="mgmt-title">
                    <h1>⚙️ System Management</h1>
                </div>
                <div className="mgmt-tabs">
                    <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <Activity size={16} /> Dashboard
                    </button>
                    <button className={`tab-btn ${activeTab === 'deployments' ? 'active' : ''}`} onClick={() => setActiveTab('deployments')}>
                        <Rocket size={16} /> Deployments
                    </button>
                    <button className={`tab-btn ${activeTab === 'admins' ? 'active' : ''}`} onClick={() => setActiveTab('admins')}>
                        <Shield size={16} /> Admins
                    </button>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'deployments' && renderDeployments()}
                {activeTab === 'admins' && renderAdmins()}
            </AnimatePresence>

            {/* Logs Modal */}
            <AnimatePresence>
                {selectedDep && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedDep(null)}
                    >
                        <motion.div
                            className="modal-content logs-modal"
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="modal-header">
                                <div className="modal-header-left">
                                    <Terminal size={18} color="#60a5fa" />
                                    <h3>Deployment Logs <span className="commit-hash">#{selectedDep.commit.slice(0, 7)}</span></h3>
                                </div>
                                <div className="modal-header-actions">
                                    <button
                                        className="modal-action-btn"
                                        onClick={() => {
                                            const logText = selectedDep.logs.join('\n');
                                            navigator.clipboard.writeText(logText);
                                            alert('Logs copied to clipboard!');
                                        }}
                                        title="Copy Logs"
                                    >
                                        <Copy size={16} /> Copy
                                    </button>
                                    <button className="modal-close-btn" onClick={() => setSelectedDep(null)}>
                                        <XCircle size={20} />
                                    </button>
                                </div>
                            </div>
                            <div className="modal-body logs-body">
                                <div className="log-container">
                                    {selectedDep.logs.length > 0 ? (
                                        selectedDep.logs.map((line, i) => (
                                            <div key={i} className="log-line">
                                                <span className="log-num">{i + 1}</span>
                                                <span className="log-text">{line}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="empty-logs">No logs available for this deployment.</div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
