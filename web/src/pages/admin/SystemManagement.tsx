import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, Hash, Server, Shield,
    RefreshCw, ArrowRight, Clock,
    ChevronDown, ChevronUp,
    Rocket, Search, UserPlus, UserMinus,
    Terminal, Loader2, Trash2, Copy,
    RotateCcw, XCircle, ShieldAlert, AlertTriangle,
} from 'lucide-react';
import { API_URL } from '../../config';
import { SocketService } from '../../services/socket';
import SentinelDashboard from './sentinel/SentinelDashboard';

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
    dockerAvailable?: boolean;
    apiService?: { name: string; status: string };
    database: {
        connected?: boolean;
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
    status: 'PENDING' | 'STARTED' | 'BUILDING' | 'SUCCESS' | 'FAILED' | 'ROLLBACK';
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

type Tab = 'dashboard' | 'deployments' | 'admins' | 'sentinel';

export default function SystemManagement() {
    const { t } = useTranslation();
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

    // Auto-deploy poller status
    // Half this panel is Mongo-backed and Joe runs locally with no MongoDB.
    // That is a normal state, not a failure — but it has to be SAID, or the
    // Deployments tab is an empty list with no explanation forever.
    const [dbOffline, setDbOffline] = useState(false);
    const [autoDeployStatus, setAutoDeployStatus] = useState<{
        pollerActive: boolean;
        pollerEnabled: boolean;
        pollCount: number;
        lastPollTime: string | null;
        lastPollError: string | null;
        lastLocalCommit: string | null;
        lastRemoteCommit: string | null;
        isDeploying: boolean;
    } | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    /**
     * LIVE LOGS — the feature that was fully built on both sides and never met.
     *
     * This listened for `admin:deployment_log` carrying `{ id, log }`. The
     * server has always broadcast `admin:deploy_log` carrying
     * `{ deploymentId, log, ts }` — a different NAME and a different FIELD, so
     * not one line ever arrived. The log modal was filled by the 3-second
     * poller alone, which is why it felt a beat behind reality.
     *
     * The status broadcast (`admin:deploy_status`) had no listener at all, so a
     * deployment that finished stayed "BUILDING" on screen until the next poll.
     */
    useEffect(() => {
        const unsubscribe = SocketService.subscribe((msg: any) => {
            if (msg?.type === 'admin:deploy_log') {
                const id = String(msg.data?.deploymentId || '');
                const log = String(msg.data?.log ?? '');
                if (!id) return;
                setSelectedDep(prev => (prev && prev._id === id
                    ? { ...prev, logs: [...(prev.logs || []), log] } : prev));
                setDeployments(prev => prev.map(d =>
                    d._id === id ? { ...d, logs: [...(d.logs || []), log] } : d));
            }
            if (msg?.type === 'admin:deploy_status') {
                const id = String(msg.data?._id || '');
                const status = msg.data?.status as Deployment['status'];
                const error = msg.data?.error ? String(msg.data.error) : undefined;
                if (!id || !status) return;
                setSelectedDep(prev => (prev && prev._id === id ? { ...prev, status, error } : prev));
                setDeployments(prev => prev.map(d => (d._id === id ? { ...d, status, error } : d)));
                if (status === 'SUCCESS' || status === 'FAILED') setIsDeploying(false);
            }
        });
        return () => unsubscribe();
    }, []);

    // Auto-scroll logic
    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedDep?.logs]);

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
            // 503 db_offline is an ANSWER, not a failure: say so once and stop
            // asking every three seconds for something that cannot exist.
            if (res.status === 503) { setDbOffline(true); setDeployments([]); return; }
            setDbOffline(false);
            if (res.ok) {
                const data = await res.json();
                setDeployments(data);
                setSelectedDep(prev => {
                    if (!prev) return null;
                    const match = data.find((d: any) => d._id === prev._id);
                    return match ? { ...prev, ...match } : prev;
                });
            }
        } catch (e) { console.error(e); }
    }, [token]);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/admin/users?search=${encodeURIComponent(userSearch)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 503) { setDbOffline(true); setUsers([]); return; }
            setDbOffline(false);
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
            await Promise.all([fetchDeployments(), fetchAutoDeployStatus()]);
        } else if (activeTab === 'admins') {
            await fetchUsers();
        }
        setLastRefresh(new Date());
        setLoading(false);
    };

    const fetchAutoDeployStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/autodeploy/status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setAutoDeployStatus(await res.json());
        } catch (e) { console.error(e); }
    };

    // Initial fetch when tab changes
    useEffect(() => {
        refreshAll();
    }, [activeTab, fetchHealth, fetchDeployments, fetchUsers]);

    // Background polling
    useEffect(() => {
        // Live logs arrive over the socket now, so the poller is a SAFETY NET,
        // not the source: 5s while a log modal is open, 15s otherwise — and a
        // full minute when there is no database to ask.
        const pollRate = dbOffline ? 60000 : selectedDep ? 5000 : 15000;
        const interval = setInterval(() => {
            if (activeTab === 'dashboard') fetchHealth();
            if (activeTab === 'deployments' || selectedDep) {
                fetchDeployments();
                fetchAutoDeployStatus();
            }
        }, pollRate);
        return () => clearInterval(interval);
    }, [activeTab, fetchHealth, fetchDeployments, selectedDep, dbOffline]);

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
        setIsDeploying(true);
        try {
            const res = await fetch(`${API_URL}/admin/deploy`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
            if (res.ok) {
                const data = await res.json();
                await fetchDeployments();
                if (data && data.id) {
                    const newDep: Deployment = {
                        _id: data.id,
                        commit: 'HEAD',
                        status: 'STARTED',
                        triggeredBy: 'manual',
                        startTime: new Date().toISOString(),
                        logs: ['=== Deployment Initiated ===']
                    };
                    setSelectedDep(newDep);
                    // Also add to the list immediately
                    setDeployments(prev => [newDep, ...prev]);
                }
            } else {
                const errorData = await res.text();
                alert(`Deployment failed to start: ${res.status} ${errorData}`);
            }
        } catch (e: any) { 
            console.error(e); 
            alert(`Network Error: ${e.message}`);
        } finally {
            setIsDeploying(false);
        }
    };

    const handleClearHistory = async () => {
        if (!window.confirm('Are you sure you want to clear all deployment history? This cannot be undone.')) return;
        try {
            const res = await fetch(`${API_URL}/admin/deployments`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                await fetchDeployments();
            }
        } catch (e) { console.error(e); }
    };

    /**
     * ROLLBACK — `POST /admin/rollback/:id` has existed on the server the whole
     * time, and no button in this panel ever called it. The icon for it was
     * even imported and never rendered. A capability you cannot reach is a
     * capability you do not have.
     */
    const handleRollback = async (dep: Deployment) => {
        if (!window.confirm(`الرجوع إلى النشرة #${dep.commit?.slice(0, 7)}؟ سيبدأ نشر جديد بهذا الإصدار.`)) return;
        setIsDeploying(true);
        try {
            const res = await fetch(`${API_URL}/admin/rollback/${dep._id}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                await fetchDeployments();
                if (data?.id) setSelectedDep({
                    _id: data.id, commit: dep.commit, status: 'STARTED', triggeredBy: 'rollback',
                    startTime: new Date().toISOString(), logs: [`=== Rollback to ${dep.commit?.slice(0, 7)} ===`],
                });
            } else {
                alert(`تعذّر الرجوع: ${data?.error || res.status}`);
            }
        } catch (e: any) { alert(`خطأ في الشبكة: ${e.message}`); }
        finally { setIsDeploying(false); }
    };

    /** DELETE /admin/deployments/:id — likewise reachable now, one record at a time. */
    const handleDeleteDeployment = async (dep: Deployment) => {
        if (!window.confirm(`حذف سجلّ النشرة #${dep.commit?.slice(0, 7)}؟`)) return;
        try {
            const res = await fetch(`${API_URL}/admin/deployments/${dep._id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setSelectedDep(prev => (prev?._id === dep._id ? null : prev));
                await fetchDeployments();
            }
        } catch (e) { console.error(e); }
    };

    const toggleAdmin = async (user: User) => {
        const newRole = user.role === 'SUPER_ADMIN' ? 'USER' : 'SUPER_ADMIN';

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
                                <span className="stat-label">المعالج (الآن)</span>
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
                                <span className="stat-label">الذاكرة</span>
                            </div>
                            <div className="stat-value" style={{ color: getHealthColor(parsePercent(health.system.memory)) }}>
                                {health.system.memory}
                            </div>
                            <div className="stat-sub">ذاكرة النظام المستعملة (لا العمليات وحدها)</div>
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
                                <span className="stat-label">القرص</span>
                            </div>
                            <div className="stat-value" style={{ color: getHealthColor(parsePercent(health.system.disk)) }}>
                                {health.system.disk}
                            </div>
                            <div className="stat-sub">القرص الذي يعمل عليه جو</div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{
                                    width: `${parsePercent(health.system.disk)}%`,
                                    background: getHealthColor(parsePercent(health.system.disk))
                                }}></div>
                            </div>
                        </div>

                        {/* DB — «N/A · 0 docs • 0 collections» read as an EMPTY database.
                            It was never empty; it was absent. */}
                        <div className="stat-card db">
                            <div className="stat-icon">
                                <Server size={18} color={health.database.connected ? '#10b981' : '#f59e0b'} />
                                <span className="stat-label">قاعدة البيانات</span>
                            </div>
                            <div className="stat-value" style={{
                                color: health.database.connected ? '#10b981' : '#f59e0b',
                                fontSize: health.database.connected ? undefined : '22px',
                            }}>
                                {health.database.connected ? (health.database.dataSize || '—') : 'غير متصلة'}
                            </div>
                            <div className="stat-sub">
                                {health.database.connected
                                    ? `${health.database.documents ?? 0} مستند • ${health.database.collections ?? 0} مجموعة`
                                    : 'جو يعمل محلياً بتخزين على القرص — MongoDB تلزم لسجلّ النشر والمستخدمين'}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Containers — the header USED to toggle `expandedSection`, and the body
                below ignored it completely: a control that did nothing, next to two
                chevron icons that were imported and never rendered. It collapses for
                real now, and an empty fleet says why instead of showing a void. */}
            <div className="section-card">
                <div className="section-header clickable"
                    onClick={() => setExpandedSection(expandedSection === 'containers' ? null : 'containers')}>
                    <div className="section-header-left">
                        <Server size={18} color="#60a5fa" />
                        <span className="section-title">حاويات Docker</span>
                        <span className="section-badge">
                            {health?.dockerAvailable === false ? 'Docker غير مثبّت' : `${health?.containers?.length || 0} تعمل`}
                        </span>
                        {health?.apiService && (
                            <span className="section-badge" style={{
                                background: health.apiService.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                color: health.apiService.status === 'active' ? '#10b981' : '#ef4444',
                            }}>{health.apiService.name}: {health.apiService.status}</span>
                        )}
                    </div>
                    {expandedSection === 'containers' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
                {expandedSection === 'containers' && (
                    <div className="section-body">
                        {health?.containers?.length ? (
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
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                                {health?.dockerAvailable === false
                                    ? 'Docker غير مثبّت على هذا الجهاز — وهذا طبيعي محلياً؛ جو يعمل مباشرة بلا حاويات.'
                                    : 'لا حاويات تعمل الآن.'}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );

    /** A missing database is a normal local state — it gets a sentence, not a spinner. */
    const renderDbBanner = () => (dbOffline ? (
        <div className="db-offline-banner">
            <AlertTriangle size={18} />
            <div>
                <strong>MongoDB غير متصلة على هذا الجهاز.</strong>
                <div>سجلّ النشر والمستخدمون والإعدادات تحتاجها؛ أمّا لوحة النظام (المعالج والذاكرة والقرص والنسخ الاحتياطية) فتعمل كما هي.</div>
            </div>
        </div>
    ) : null);

    const renderDeployments = () => (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="tab-pane">
            {renderDbBanner()}
            <div className="deploy-actions" style={{ display: 'flex', gap: '12px' }}>
                <button className="btn-deploy-refined" onClick={handleDeploy} disabled={isDeploying || dbOffline}
                    title={dbOffline ? 'يحتاج قاعدة بيانات لتسجيل النشرة' : 'Deploy Production'}>
                    {isDeploying ? <Loader2 size={20} className="spinning" /> : <Rocket size={20} />}
                    {isDeploying ? 'Processing Deployment...' : 'Deploy Production'}
                </button>
                <button className="btn-clear-refined" onClick={handleClearHistory} disabled={deployments.length === 0}>
                    <Trash2 size={20} />
                    Clear History
                </button>
            </div>

            {/* Auto-Deploy Status Card */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '16px 24px',
                marginBottom: '24px',
                gap: '16px',
                flexWrap: 'wrap' as const
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontWeight: 600,
                        fontSize: '15px',
                        color: (autoDeployStatus?.pollerEnabled ?? true) ? '#10b981' : '#ef4444'
                    }}>
                        <div style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: (autoDeployStatus?.pollerEnabled ?? true) ? '#10b981' : '#ef4444',
                            boxShadow: (autoDeployStatus?.pollerEnabled ?? true) ? '0 0 8px #10b981' : '0 0 8px #ef4444',
                            animation: autoDeployStatus?.pollerActive ? 'pulse-glow 2s infinite' : 'none'
                        }} />
                        <span>{!(autoDeployStatus?.pollerEnabled ?? true) ? '🔴 Auto-Deploy Disabled' : autoDeployStatus?.pollerActive ? '🟢 Auto-Deploy Fetching...' : '🟢 Auto-Deploy Standby'}</span>
                    </div>
                    {autoDeployStatus && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                            <span style={{
                                fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                                background: 'var(--sm-tint-2)', color: 'var(--text-muted)',
                                fontFamily: 'monospace'
                            }}>Poll #{autoDeployStatus.pollCount || 0}</span>
                            {autoDeployStatus.lastPollTime && (
                                <span style={{
                                    fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                                    background: 'var(--sm-tint-2)', color: 'var(--text-muted)',
                                    fontFamily: 'monospace'
                                }}>Last: {new Date(autoDeployStatus.lastPollTime).toLocaleTimeString()}</span>
                            )}
                            {autoDeployStatus.lastLocalCommit && (
                                <span style={{
                                    fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                                    background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                                    fontFamily: 'monospace'
                                }}>Local: {autoDeployStatus.lastLocalCommit}</span>
                            )}
                            {autoDeployStatus.lastRemoteCommit && (
                                <span style={{
                                    fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                                    background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                                    fontFamily: 'monospace'
                                }}>Remote: {autoDeployStatus.lastRemoteCommit}</span>
                            )}
                            {autoDeployStatus.lastPollError && (
                                <span style={{
                                    fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                                    background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                                    fontFamily: 'monospace'
                                }}>⚠️ {autoDeployStatus.lastPollError.slice(0, 60)}</span>
                            )}
                        </div>
                    )}
                </div>
                <button
                    onClick={async () => {
                        const newState = !(autoDeployStatus?.pollerEnabled ?? true);
                        try {
                            const res = await fetch(`${API_URL}/admin/autodeploy/toggle`, {
                                method: 'POST',
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ enabled: newState })
                            });
                            if (res.ok) setAutoDeployStatus(await res.json());
                        } catch (e) { console.error(e); }
                    }}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '10px',
                        border: '1px solid',
                        borderColor: (autoDeployStatus?.pollerEnabled ?? true) ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)',
                        background: (autoDeployStatus?.pollerEnabled ?? true) ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        color: (autoDeployStatus?.pollerEnabled ?? true) ? '#ef4444' : '#10b981',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s',
                        flexShrink: 0
                    }}
                >
                    {(autoDeployStatus?.pollerEnabled ?? true) ? '⏸ Disable' : '▶ Enable'}
                </button>
            </div>

            <div className="section-card">
                <div className="section-header">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Clock size={20} color="var(--accent-primary)" />
                        <span className="section-title">Deployment Pipeline</span>
                    </div>
                    <span className="section-badge" style={{ background: 'rgba(52, 196, 139,0.1)', color: 'var(--accent-primary)' }}>
                        {deployments.length} Total Logs
                    </span>
                </div>
                <div style={{ padding: '16px' }}>
                    {deployments.length > 0 ? deployments.map(dep => (
                        <div key={dep._id} className={`dep-item`}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <span className={`dep-badge ${dep.status.toLowerCase()}`}>{dep.status}</span>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span className="dep-commit">#{dep.commit.slice(0, 7)}</span>
                                        <span className="dep-time">{new Date(dep.startTime).toLocaleString()}</span>
                                    </div>
                                    <div className="dep-meta">
                                        Triggered by <span style={{ color: 'var(--text-primary)' }}>{dep.triggeredBy}</span> • Duration: {dep.duration?.toFixed(1) || '?'}s
                                    </div>
                                    {/* The server stores `error` on every failure; nothing ever showed it,
                                        so a red FAILED badge was the whole explanation. */}
                                    {dep.error && (
                                        <div className="dep-error" title={dep.error}>
                                            <AlertTriangle size={13} /> {dep.error.slice(0, 140)}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button className="dep-log-btn" onClick={() => setSelectedDep(dep)}>
                                    <Terminal size={14} /> View Logs
                                </button>
                                {/* Rollback: reachable at last, and only where it means something. */}
                                {dep.status === 'SUCCESS' && (
                                    <button className="dep-log-btn" title="ارجع إلى هذا الإصدار"
                                        onClick={() => handleRollback(dep)} disabled={isDeploying}>
                                        <RotateCcw size={14} /> Rollback
                                    </button>
                                )}
                                <button className="dep-log-btn danger" title="احذف هذا السجلّ"
                                    onClick={() => handleDeleteDeployment(dep)}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    )) : (
                        <div className="empty-state" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Rocket size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
                            <p>No deployment history available.</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );

    const renderAdmins = () => (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="tab-pane">
            {renderDbBanner()}
            <div className="admin-search-box">
                <Search size={20} className="search-icon" />
                <input
                    type="text"
                    placeholder="Search administrators by name or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyUp={(e) => e.key === 'Enter' && fetchUsers()}
                />
            </div>

            <div className="user-list">
                {users.map(user => (
                    <div key={user._id} className="user-item">
                        <div className="user-avatar">
                            {user.picture ? (
                                <img src={user.picture} alt="" />
                            ) : (
                                <div className="fallback">{user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}</div>
                            )}
                        </div>
                        <div className="user-info">
                            <div className="user-name">{user.name || 'Anonymous Operator'}</div>
                            <div className="user-email">{user.email}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div className="user-role-badge">
                                {user.role}
                            </div>
                            <button
                                className={`role-toggle-btn ${user.role === 'SUPER_ADMIN' ? 'is-admin' : ''}`}
                                onClick={() => toggleAdmin(user)}
                                disabled={updatingUser === user._id}
                            >
                                {updatingUser === user._id ? (
                                    <RefreshCw size={14} className="spinning" />
                                ) : user.role === 'SUPER_ADMIN' ? (
                                    <><UserMinus size={14} /> Revoke Access</>
                                ) : (
                                    <><UserPlus size={14} /> Promote to Admin</>
                                )}
                            </button>
                        </div>
                    </div>
                ))}
                {users.length === 0 && !loading && (
                    <div className="section-card" style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Shield size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
                        <p>No matching personnel records found.</p>
                    </div>
                )}
            </div>
        </motion.div>
    );

    return (
        <div className="system-management">
            <style>{`
                /* THE PANEL WAS DARK-ONLY, and Joe ships a light theme.
                   Every tint here was a hardcoded rgba(255,255,255,…) —
                   invisible on a white card — or an var(--sm-inset) inset that
                   became a black hole in light mode. The screenshot that
                   started this batch showed a washed-out panel with an
                   invisible progress track. These four tokens carry the
                   difference, and they flip with the theme. */
                .system-management {
                    --sm-tint: rgba(255,255,255,0.02);
                    --sm-tint-2: rgba(255,255,255,0.05);
                    --sm-tint-3: rgba(255,255,255,0.08);
                    --sm-inset: rgba(0,0,0,0.2);
                }
                html[data-theme="light"] .system-management {
                    --sm-tint: rgba(28,40,35,0.03);
                    --sm-tint-2: rgba(28,40,35,0.06);
                    --sm-tint-3: rgba(28,40,35,0.10);
                    --sm-inset: rgba(28,40,35,0.05);
                }
                .system-management {
                    min-height: 100vh;
                    background: var(--bg-dark);
                    color: var(--text-primary);
                    padding: 40px;
                    font-family: 'Inter', -apple-system, sans-serif;
                    position: relative;
                    overflow-x: hidden;
                }
                .system-management::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; height: 1px;
                    background: linear-gradient(to right, transparent, var(--accent-primary), transparent);
                    opacity: 0.3;
                }
                .mgmt-header {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                    gap: 20px;
                    margin-bottom: 48px;
                }
                .mgmt-back-container {
                    display: flex;
                    align-items: center;
                    flex: 1;
                    justify-content: flex-end;
                }
                .mgmt-title-row {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    flex: 1;
                    justify-content: flex-start;
                }
                .joe-logo-badge {
                    width: 50px;
                    height: 50px;
                    background: var(--brand-gradient);
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    font-weight: 900;
                    color: #000;
                    box-shadow: 0 10px 30px var(--accent-glow);
                }
                .mgmt-title h1 {
                    font-size: 32px;
                    font-weight: 800;
                    margin: 0;
                    letter-spacing: -0.02em;
                    background: var(--brand-text-gradient);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .mgmt-subtitle {
                    margin: 4px 0 0;
                    font-size: 14px;
                    color: var(--text-muted);
                    font-weight: 500;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }
                .mgmt-tabs {
                    display: flex;
                    gap: 8px;
                    background: var(--sm-tint);
                    padding: 6px;
                    border-radius: 16px;
                    border: 1px solid var(--border-color);
                    justify-content: center;
                    flex: 0 1 auto;
                    backdrop-filter: blur(10px);
                }
                .tab-btn {
                    padding: 10px 24px;
                    border-radius: 12px;
                    border: none;
                    background: transparent;
                    color: var(--text-secondary);
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .tab-btn.active {
                    background: var(--bg-card);
                    color: var(--accent-primary);
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                    border: 1px solid var(--border-light);
                }
                .tab-btn:hover:not(.active) {
                    background: var(--sm-tint-2);
                    color: var(--text-primary);
                }

                .grid-stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 24px;
                    margin-bottom: 32px;
                }
                .stat-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 24px;
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                }
                .stat-card:hover {
                    transform: translateY(-5px);
                    border-color: var(--border-light);
                    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
                }
                .stat-card::after {
                    content: '';
                    position: absolute;
                    top: 0; right: 0;
                    width: 100px; height: 100px;
                    background: radial-gradient(circle at top right, var(--accent-glow), transparent 70%);
                    opacity: 0.5;
                }
                .stat-icon { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
                .stat-label { font-size: 13px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
                .stat-value { font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
                .stat-sub { font-size: 13px; color: var(--text-muted); margin-top: 8px; }
                .progress-bar { height: 6px; background: var(--sm-tint-2); border-radius: 10px; margin-top: 16px; overflow: hidden; }
                .progress-fill { height: 100%; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1); }

                .section-card { 
                    background: var(--bg-card); 
                    border: 1px solid var(--border-color); 
                    border-radius: 24px; 
                    margin-bottom: 32px;
                    overflow: hidden;
                }
                .section-header { 
                    padding: 24px 32px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: space-between;
                    background: var(--sm-tint);
                    border-bottom: 1px solid var(--border-color);
                }
                .section-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-left: 12px; }
                .section-badge { 
                    padding: 4px 12px; 
                    background: rgba(16, 185, 129, 0.1); 
                    color: #10b981; 
                    border-radius: 20px; 
                    font-size: 12px; 
                    font-weight: 700; 
                }
                .section-body { padding: 32px; }
                .container-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
                .container-item { 
                    padding: 16px 20px; 
                    background: var(--sm-inset); 
                    border: 1px solid var(--border-color);
                    border-radius: 16px; 
                    display: flex; 
                    align-items: center; 
                    gap: 16px;
                    transition: all 0.2s ease;
                }
                .container-item:hover {
                    border-color: var(--border-light);
                    background: var(--sm-tint);
                }
                .section-header.clickable { cursor: pointer; user-select: none; }
                .section-header.clickable:hover { background: var(--sm-tint-2); }
                .db-offline-banner {
                    display: flex; align-items: flex-start; gap: 14px;
                    padding: 16px 20px; margin-bottom: 24px;
                    border: 1px solid rgba(245, 158, 11, 0.35);
                    background: rgba(245, 158, 11, 0.08);
                    color: #f59e0b; border-radius: 16px;
                    font-size: 13px; line-height: 1.7;
                }
                .db-offline-banner strong { color: #fbbf24; display: block; margin-bottom: 2px; }
                .db-offline-banner div div { color: var(--text-muted); }
                .dep-error {
                    display: flex; align-items: center; gap: 6px;
                    margin-top: 6px; font-size: 12px; color: #ff8a80;
                    font-family: 'JetBrains Mono', monospace;
                }
                .dep-log-btn.danger { color: #ff8a80; }
                .dep-log-btn.danger:hover { border-color: #ff5252; background: rgba(255,82,82,0.08); }
                .container-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
                .container-dot.healthy { background: #00e676; box-shadow: 0 0 10px rgba(0, 230, 118, 0.4); }
                .container-dot.unhealthy { background: #ff5252; box-shadow: 0 0 10px rgba(255, 82, 82, 0.4); }
                .container-name { font-weight: 700; font-size: 15px; color: var(--text-primary); margin-bottom: 2px; }
                .container-status { font-size: 12px; color: var(--text-muted); font-weight: 500; }

                .deploy-actions {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 32px;
                }
                .btn-deploy-refined {
                    padding: 14px 28px;
                    background: var(--brand-gradient);
                    color: #000;
                    border: none;
                    border-radius: 14px;
                    font-size: 15px;
                    font-weight: 800;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    box-shadow: 0 10px 25px var(--accent-glow);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .btn-deploy-refined:hover { 
                    transform: translateY(-3px) scale(1.02); 
                    box-shadow: 0 15px 35px rgba(52, 196, 139, 0.3); 
                }
                .btn-deploy-refined:active { transform: scale(0.98); }
                .btn-deploy-refined:disabled { opacity: 0.5; transform: none; box-shadow: none; cursor: not-allowed; }

                .btn-clear-refined {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    padding: 12px 24px;
                    border-radius: 14px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-size: 15px;
                }

                .btn-clear-refined:hover:not(:disabled) {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: #ef4444;
                    box-shadow: 0 0 20px rgba(239, 68, 68, 0.2);
                    transform: translateY(-2px);
                }

                .btn-clear-refined:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                    filter: grayscale(1);
                }

                .dep-item {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 20px 24px;
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    transition: all 0.2s ease;
                }
                .dep-item:hover { border-color: var(--border-light); }
                .dep-badge { 
                    padding: 6px 12px; 
                    border-radius: 8px; 
                    font-size: 11px; 
                    font-weight: 800; 
                    text-transform: uppercase; 
                    margin-right: 16px;
                    letter-spacing: 0.05em;
                }
                .dep-badge.success { background: rgba(0,230,118,0.15); color: #00e676; }
                .dep-badge.failed { background: rgba(255,82,82,0.15); color: #ff5252; }
                .dep-badge.building { background: rgba(52, 196, 139,0.15); color: var(--accent-primary); }
                
                .dep-commit { font-family: 'JetBrains Mono', monospace; color: var(--text-muted); margin-right: 16px; background: var(--sm-inset); padding: 4px 8px; border-radius: 6px; font-size: 13px; }
                .dep-time { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
                .dep-log-btn { 
                    background: var(--bg-secondary); 
                    border: 1px solid var(--border-color); 
                    color: var(--text-primary); 
                    padding: 8px 16px; 
                    border-radius: 10px; 
                    cursor: pointer; 
                    display: flex; 
                    align-items: center; 
                    gap: 8px; 
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .dep-log-btn:hover { background: var(--sm-tint-3); border-color: var(--accent-primary); }

                .admin-search-box {
                    position: relative;
                    margin-bottom: 32px;
                    max-width: 600px;
                }
                .admin-search-box input {
                    width: 100%;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 16px 16px 16px 52px;
                    color: var(--text-primary);
                    font-size: 16px;
                    outline: none;
                    transition: all 0.2s;
                }
                .admin-search-box input:focus { border-color: var(--accent-primary); box-shadow: 0 0 15px var(--accent-glow); }
                .admin-search-box .search-icon { position: absolute; left: 20px; top: 18px; color: var(--text-muted); }

                .user-item {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 20px;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    margin-bottom: 16px;
                    transition: all 0.2s;
                }
                .user-avatar { 
                    width: 56px; height: 56px; 
                    border-radius: 16px; 
                    background: var(--brand-gradient); 
                    display: flex; align-items: center; justify-content: center; overflow: hidden; 
                    padding: 2px;
                }
                .user-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 14px; }
                .user-avatar .fallback { color: #000; font-weight: 800; font-size: 20px; }
                .user-info { flex: 1; }
                .user-name { font-weight: 700; font-size: 17px; color: var(--text-primary); }
                .user-email { font-size: 14px; color: var(--text-secondary); margin-top: 2px; }
                .user-role-badge { 
                    padding: 6px 14px; 
                    background: rgba(52, 196, 139, 0.1); 
                    color: var(--accent-primary); 
                    border-radius: 24px; 
                    font-size: 12px; 
                    font-weight: 800; 
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .role-toggle-btn {
                    padding: 10px 20px;
                    border-radius: 12px;
                    border: 1px solid var(--border-color);
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 14px;
                    font-weight: 700;
                    transition: all 0.2s;
                }
                .role-toggle-btn.is-admin { border-color: rgba(255,82,82,0.3); color: #ff5252; }
                .role-toggle-btn:hover { background: var(--sm-tint-2); transform: translateY(-2px); }

                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 4px #10b981; }
                    50% { box-shadow: 0 0 16px #10b981; }
                }
                .spinning { animation: spin 1s linear infinite; }

                .btn-back {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 16px;
                    height: 44px;
                    border-radius: 12px;
                    border: 1px solid var(--accent-primary);
                    background: rgba(52, 196, 139, 0.1);
                    color: var(--accent-primary);
                    font-weight: 700;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    margin-right: 16px;
                }
                .btn-back:hover {
                    background: var(--accent-primary);
                    color: #000;
                    transform: translateX(-3px);
                }

                /* Laptop & Mobile Responsiveness */
                @media (max-width: 1440px) {
                    .system-management { padding: 24px; }
                    .mgmt-header { gap: 16px; margin-bottom: 24px; overflow-x: auto; }
                    .mgmt-title h1 { font-size: 24px; }
                    .mgmt-tabs { flex-wrap: nowrap; gap: 8px; flex-shrink: 0; }
                    .tab-btn { padding: 8px 16px; font-size: 13px; white-space: nowrap; }
                    .grid-stats { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
                    .stat-value { font-size: 28px; }
                    .section-card { margin-bottom: 24px; }
                }

                @media (max-width: 768px) {
                    .system-management { padding: 16px; min-height: auto; }
                    .mgmt-header { flex-direction: column; align-items: stretch; gap: 20px; }
                    .mgmt-back-container { justify-content: flex-start; margin-bottom: -10px; }
                    .mgmt-title-row { justify-content: flex-start; }
                    .mgmt-title h1 { font-size: 22px; }
                    .joe-logo-badge { width: 40px; height: 40px; font-size: 20px; }
                    .tab-btn { padding: 8px 12px; font-size: 12px; flex: 1; justify-content: center; }
                    .mgmt-tabs { width: 100%; display: flex; overflow-x: auto; flex-wrap: nowrap; }
                    .grid-stats { grid-template-columns: 1fr; }
                    .dep-item { flex-direction: column; align-items: flex-start; gap: 12px; }
                    .dep-log-btn { width: 100%; justify-content: center; }
                    .user-item { flex-direction: column; align-items: flex-start; }
                    .role-toggle-btn { width: 100%; justify-content: center; }
                }

                @keyframes orbit {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .rocket-loader-container {
                    position: relative;
                    width: 16px;
                    height: 16px;
                    display: flex;
                    alignItems: center;
                    justifyContent: center;
                }

                .deploying-rocket {
                    color: var(--accent-primary);
                    filter: drop-shadow(0 0 5px var(--accent-primary));
                }

                .rocket-orbit {
                    position: absolute;
                    top: -4px;
                    left: -4px;
                    right: -4px;
                    bottom: -4px;
                    border: 2px solid transparent;
                    border-top-color: var(--accent-primary);
                    border-radius: 50%;
                    animation: orbit 1s linear infinite;
                }
            `}</style>

            <div className="mgmt-header">
                <div className="mgmt-title-row">
                    <div className="joe-logo-badge">J</div>
                    <div className="mgmt-title">
                        <h1>⚙️ System Management</h1>
                        <p className="mgmt-subtitle">Joe Autonomous Infrastructure Control</p>
                    </div>
                </div>
                <div className="mgmt-tabs">
                    <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <Activity size={16} /> Dashboard
                    </button>
                    <button className={`tab-btn ${activeTab === 'deployments' ? 'active' : ''}`} onClick={() => setActiveTab('deployments')}>
                        {deployments.some(d => d.status === 'STARTED' || d.status === 'BUILDING') ? (
                            <div className="rocket-loader-container">
                                <Rocket size={16} className="deploying-rocket" />
                                <div className="rocket-orbit" />
                            </div>
                        ) : (
                            <Rocket size={16} />
                        )} 
                        Deployments
                    </button>
                    <button className={`tab-btn ${activeTab === 'admins' ? 'active' : ''}`} onClick={() => setActiveTab('admins')}>
                        <Shield size={16} /> Admins
                    </button>
                    <button className={`tab-btn ${activeTab === 'sentinel' ? 'active' : ''}`} onClick={() => setActiveTab('sentinel')}>
                        <ShieldAlert size={16} /> Sentinel <span style={{ padding: '2px 6px', background: '#ef4444', color: 'white', fontSize: '10px', borderRadius: '4px', marginLeft: '6px' }}>NEW</span>
                    </button>
                </div>
                <div className="mgmt-back-container">
                    <button className="btn-back" onClick={() => navigate('/joe')} title={t('backToWorkspace')}>
                        <ArrowRight size={18} style={{ marginRight: 6 }} /> رجوع للخلف
                    </button>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'deployments' && renderDeployments()}
                {activeTab === 'admins' && renderAdmins()}
                {activeTab === 'sentinel' && <SentinelDashboard />}
            </AnimatePresence>

            {/* Logs Modal - Direct Portal-like positioning */}
            {selectedDep && (
                <div
                    id="logs-modal-portal"
                    style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999 }}
                    onClick={() => setSelectedDep(null)}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        onClick={(e: any) => e.stopPropagation()}
                        style={{
                            background: 'var(--bg-card)',
                            width: '94%',
                            maxWidth: '1000px',
                            height: '85vh',
                            borderRadius: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            border: '1px solid var(--border-color)',
                            overflow: 'hidden',
                            boxShadow: '0 50px 100px -20px rgba(0, 0, 0, 0.7)'
                        }}
                    >
                        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--sm-tint)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <div style={{ width: '36px', height: '36px', background: 'rgba(52, 196, 139, 0.1)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Terminal size={20} color="var(--accent-primary)" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)', fontWeight: 700 }}>Deployment Logs</h3>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'monospace' }}>Commit #{selectedDep.commit?.slice(0, 7) || '??'}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={() => {
                                        const text = (selectedDep.logs || []).join('\n');
                                        navigator.clipboard.writeText(text);
                                        alert('Logs copied successfully!');
                                    }}
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--border-color)',
                                        padding: '10px 20px',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e: any) => { e.currentTarget.style.background = 'var(--sm-tint-3)'; e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                                    onMouseOut={(e: any) => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                                >
                                    <Copy size={16} /> Copy Logs
                                </button>
                                <button
                                    onClick={() => setSelectedDep(null)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
                                    onMouseOver={(e: any) => e.currentTarget.style.color = '#ef4444'}
                                    onMouseOut={(e: any) => e.currentTarget.style.color = 'var(--text-muted)'}
                                >
                                    <XCircle size={28} />
                                </button>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '32px', background: '#050505', color: '#cbd5e1', fontSize: '13px', lineHeight: '1.7', fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
                            {selectedDep.logs && selectedDep.logs.length > 0 ? (
                                selectedDep.logs.map((line: string, i: number) => (
                                    <div key={i} style={{ display: 'flex', gap: '20px', marginBottom: '4px', animation: 'fadeIn 0.3s ease-out' }}>
                                        <span style={{ color: '#2d3748', userSelect: 'none', minWidth: '40px', textAlign: 'right', fontSize: '11px' }}>{i + 1}</span>
                                        <span style={{
                                            color: line.toLowerCase().includes('error') ? '#ff5252' : 
                                                   line.toLowerCase().includes('success') ? '#00e676' : 
                                                   line.toLowerCase().includes('[build]') ? '#38bdf8' :
                                                   line.toLowerCase().includes('[docker]') ? '#fbbf24' : '#cbd5e1',
                                            textShadow: line.toLowerCase().includes('error') ? '0 0 8px rgba(255,82,82,0.3)' : 'none'
                                        }}>{line}</span>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '80px', color: '#334155', fontStyle: 'italic' }}>No deployment trace recorded.</div>
                            )}
                            <div ref={logEndRef} />
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
