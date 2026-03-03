import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Cpu, MemoryStick, HardDrive, Database, Container,
    RefreshCw, Download, Shield, Activity, ArrowLeft,
    CheckCircle, XCircle, Clock, Server, Wifi,
    ChevronDown, ChevronUp
} from 'lucide-react';
import { API_URL } from '../../config';

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

export default function SystemDashboard() {
    const navigate = useNavigate();
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loading, setLoading] = useState(true);
    const [backingUp, setBackingUp] = useState(false);
    const [error, setError] = useState('');
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const token = localStorage.getItem('token');

    const fetchHealth = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/admin/system/health`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setHealth(data);
                setError('');
            }
        } catch (e: any) {
            setError('Failed to fetch system health');
        }
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
        } catch { }
    }, [token]);

    const triggerBackup = async () => {
        setBackingUp(true);
        try {
            const res = await fetch(`${API_URL}/admin/system/backup`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                await fetchBackups();
            }
        } catch { }
        setBackingUp(false);
    };

    const refreshAll = async () => {
        setLoading(true);
        await Promise.all([fetchHealth(), fetchBackups()]);
        setLastRefresh(new Date());
        setLoading(false);
    };

    useEffect(() => {
        refreshAll();
        const interval = setInterval(fetchHealth, 15000);
        return () => clearInterval(interval);
    }, []);

    const parsePercent = (str: string) => {
        const match = str?.match(/([\d.]+)%/);
        return match ? parseFloat(match[1]) : 0;
    };

    const getHealthColor = (percent: number) => {
        if (percent < 60) return '#00e676';
        if (percent < 85) return '#ffc107';
        return '#ff5252';
    };

    return (
        <div className="system-dashboard">
            <style>{`
                .system-dashboard {
                    min-height: 100vh;
                    background: linear-gradient(135deg, #0a0e1a 0%, #111827 50%, #0d1321 100%);
                    color: #e1e5ee;
                    padding: 24px;
                    font-family: 'Inter', -apple-system, sans-serif;
                }
                .dash-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 32px;
                }
                .dash-header-left {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .dash-header h1 {
                    font-size: 24px;
                    font-weight: 700;
                    background: linear-gradient(135deg, #60a5fa, #a78bfa);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin: 0;
                }
                .dash-header-actions {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                }
                .dash-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 20px;
                    border-radius: 12px;
                    border: none;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .dash-btn:hover { transform: translateY(-1px); }
                .btn-back {
                    background: rgba(255,255,255,0.05);
                    color: #94a3b8;
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .btn-back:hover { background: rgba(255,255,255,0.1); }
                .btn-refresh {
                    background: rgba(96,165,250,0.15);
                    color: #60a5fa;
                    border: 1px solid rgba(96,165,250,0.2);
                }
                .btn-refresh:hover { background: rgba(96,165,250,0.25); }
                .btn-backup {
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                }
                .btn-backup:hover { opacity: 0.9; }
                .btn-backup:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                }
                .last-refresh {
                    color: #475569;
                    font-size: 12px;
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
                    position: relative;
                    overflow: hidden;
                }
                .stat-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    border-radius: 16px 16px 0 0;
                }
                .stat-card.cpu::before { background: linear-gradient(90deg, #60a5fa, #3b82f6); }
                .stat-card.memory::before { background: linear-gradient(90deg, #a78bfa, #8b5cf6); }
                .stat-card.disk::before { background: linear-gradient(90deg, #f59e0b, #d97706); }
                .stat-card.db::before { background: linear-gradient(90deg, #10b981, #059669); }
                .stat-icon {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 12px;
                }
                .stat-icon svg { opacity: 0.7; }
                .stat-label {
                    font-size: 12px;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    font-weight: 600;
                }
                .stat-value {
                    font-size: 28px;
                    font-weight: 700;
                    margin: 4px 0;
                }
                .stat-sub {
                    font-size: 12px;
                    color: #475569;
                }
                .progress-bar {
                    height: 6px;
                    background: rgba(255,255,255,0.06);
                    border-radius: 3px;
                    margin-top: 12px;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    border-radius: 3px;
                    transition: width 0.8s ease;
                }
                .section-card {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 16px;
                    margin-bottom: 16px;
                    overflow: hidden;
                }
                .section-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 18px 24px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .section-header:hover { background: rgba(255,255,255,0.02); }
                .section-header-left {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .section-title {
                    font-size: 16px;
                    font-weight: 600;
                }
                .section-badge {
                    background: rgba(96,165,250,0.15);
                    color: #60a5fa;
                    padding: 2px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                }
                .section-body {
                    padding: 0 24px 20px;
                }
                .container-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 12px;
                }
                .container-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px 16px;
                    background: rgba(0,0,0,0.2);
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.04);
                }
                .container-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .container-dot.healthy { background: #00e676; box-shadow: 0 0 8px rgba(0,230,118,0.4); }
                .container-dot.unhealthy { background: #ff5252; box-shadow: 0 0 8px rgba(255,82,82,0.4); }
                .container-name {
                    font-weight: 600;
                    font-size: 14px;
                }
                .container-status {
                    font-size: 12px;
                    color: #64748b;
                }
                .container-image {
                    font-size: 11px;
                    color: #475569;
                    margin-left: auto;
                    font-family: monospace;
                }
                .backup-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .backup-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    background: rgba(0,0,0,0.2);
                    border-radius: 10px;
                    border: 1px solid rgba(255,255,255,0.04);
                }
                .backup-name {
                    font-size: 13px;
                    font-weight: 500;
                    font-family: monospace;
                }
                .backup-meta {
                    display: flex;
                    gap: 16px;
                    font-size: 12px;
                    color: #64748b;
                }
                .db-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                    gap: 12px;
                }
                .db-stat {
                    padding: 14px 16px;
                    background: rgba(0,0,0,0.2);
                    border-radius: 10px;
                    border: 1px solid rgba(255,255,255,0.04);
                }
                .db-stat-label {
                    font-size: 11px;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .db-stat-value {
                    font-size: 20px;
                    font-weight: 700;
                    margin-top: 4px;
                }
                .empty-state {
                    text-align: center;
                    padding: 32px;
                    color: #475569;
                    font-size: 14px;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .spinning { animation: spin 1s linear infinite; }
            `}</style>

            {/* Header */}
            <div className="dash-header">
                <div className="dash-header-left">
                    <button className="dash-btn btn-back" onClick={() => navigate(-1)}>
                        <ArrowLeft size={16} /> Back
                    </button>
                    <h1>⚡ System Dashboard</h1>
                </div>
                <div className="dash-header-actions">
                    <span className="last-refresh">
                        Last refresh: {lastRefresh.toLocaleTimeString()}
                    </span>
                    <button className="dash-btn btn-refresh" onClick={refreshAll}>
                        <RefreshCw size={14} className={loading ? 'spinning' : ''} /> Refresh
                    </button>
                    <button className="dash-btn btn-backup" onClick={triggerBackup} disabled={backingUp}>
                        <Download size={14} /> {backingUp ? 'Backing up...' : 'Backup Now'}
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            {health && (
                <motion.div
                    className="grid-stats"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    {/* CPU */}
                    <div className="stat-card cpu">
                        <div className="stat-icon">
                            <Cpu size={18} color="#60a5fa" />
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
                            <MemoryStick size={18} color="#a78bfa" />
                            <span className="stat-label">Memory</span>
                        </div>
                        <div className="stat-value" style={{ color: getHealthColor(parsePercent(health.system.memory)) }}>
                            {health.system.memory}
                        </div>
                        <div className="stat-sub">Active processes memory usage</div>
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
                            <HardDrive size={18} color="#f59e0b" />
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
                            <Database size={18} color="#10b981" />
                            <span className="stat-label">Database</span>
                        </div>
                        <div className="stat-value" style={{ color: '#10b981' }}>
                            {health.database.dataSize || 'N/A'}
                        </div>
                        <div className="stat-sub">
                            {health.database.documents || 0} docs • {health.database.collections || 0} collections
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Container Fleet */}
            <div className="section-card">
                <div className="section-header" onClick={() => setExpandedSection(expandedSection === 'containers' ? null : 'containers')}>
                    <div className="section-header-left">
                        <Server size={18} color="#60a5fa" />
                        <span className="section-title">Container Fleet</span>
                        <span className="section-badge">{health?.containers?.length || 0} running</span>
                    </div>
                    {expandedSection === 'containers' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
                <AnimatePresence>
                    {expandedSection === 'containers' && health?.containers && (
                        <motion.div
                            className="section-body"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="container-grid">
                                {health.containers.map((c: any, i: number) => (
                                    <div key={i} className="container-item">
                                        <div className={`container-dot ${c.Status?.includes('Up') ? 'healthy' : 'unhealthy'}`}></div>
                                        <div>
                                            <div className="container-name">{c.Names}</div>
                                            <div className="container-status">{c.Status}</div>
                                        </div>
                                        <div className="container-image">{c.Image}</div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Database Details */}
            <div className="section-card">
                <div className="section-header" onClick={() => setExpandedSection(expandedSection === 'database' ? null : 'database')}>
                    <div className="section-header-left">
                        <Database size={18} color="#10b981" />
                        <span className="section-title">MongoDB Details</span>
                        <span className="section-badge">{health?.database?.uptime || 'N/A'}</span>
                    </div>
                    {expandedSection === 'database' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
                <AnimatePresence>
                    {expandedSection === 'database' && health?.database && (
                        <motion.div
                            className="section-body"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="db-stats-grid">
                                <div className="db-stat">
                                    <div className="db-stat-label">Collections</div>
                                    <div className="db-stat-value">{health.database.collections || 0}</div>
                                </div>
                                <div className="db-stat">
                                    <div className="db-stat-label">Documents</div>
                                    <div className="db-stat-value">{health.database.documents?.toLocaleString() || 0}</div>
                                </div>
                                <div className="db-stat">
                                    <div className="db-stat-label">Data Size</div>
                                    <div className="db-stat-value">{health.database.dataSize || 'N/A'}</div>
                                </div>
                                <div className="db-stat">
                                    <div className="db-stat-label">Storage</div>
                                    <div className="db-stat-value">{health.database.storageSize || 'N/A'}</div>
                                </div>
                                <div className="db-stat">
                                    <div className="db-stat-label">Connections</div>
                                    <div className="db-stat-value">{health.database.connections || 0}</div>
                                </div>
                                <div className="db-stat">
                                    <div className="db-stat-label">Uptime</div>
                                    <div className="db-stat-value">{health.database.uptime || 'N/A'}</div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Backups */}
            <div className="section-card">
                <div className="section-header" onClick={() => setExpandedSection(expandedSection === 'backups' ? null : 'backups')}>
                    <div className="section-header-left">
                        <Shield size={18} color="#f59e0b" />
                        <span className="section-title">Backups</span>
                        <span className="section-badge">{backups.length} available</span>
                    </div>
                    {expandedSection === 'backups' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
                <AnimatePresence>
                    {expandedSection === 'backups' && (
                        <motion.div
                            className="section-body"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            {backups.length > 0 ? (
                                <div className="backup-list">
                                    {backups.map((b, i) => (
                                        <div key={i} className="backup-item">
                                            <div className="backup-name">{b.name}</div>
                                            <div className="backup-meta">
                                                <span>{b.size}</span>
                                                <span>{new Date(b.created).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    No backups yet. Click "Backup Now" to create one.
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Node.js Info */}
            {health && (
                <div className="section-card">
                    <div className="section-header" onClick={() => setExpandedSection(expandedSection === 'node' ? null : 'node')}>
                        <div className="section-header-left">
                            <Activity size={18} color="#a78bfa" />
                            <span className="section-title">API Runtime</span>
                            <span className="section-badge">Uptime: {health.system.nodeUptime}</span>
                        </div>
                        {expandedSection === 'node' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                    <AnimatePresence>
                        {expandedSection === 'node' && (
                            <motion.div
                                className="section-body"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="db-stats-grid">
                                    <div className="db-stat">
                                        <div className="db-stat-label">Node Version</div>
                                        <div className="db-stat-value">{health.system.nodeVersion}</div>
                                    </div>
                                    <div className="db-stat">
                                        <div className="db-stat-label">Platform</div>
                                        <div className="db-stat-value">{health.system.platform}</div>
                                    </div>
                                    <div className="db-stat">
                                        <div className="db-stat-label">Uptime</div>
                                        <div className="db-stat-value">{health.system.nodeUptime}</div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
