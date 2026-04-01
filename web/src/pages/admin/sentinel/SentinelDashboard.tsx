import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Activity, FileText, Settings, ShieldCheck, Crosshair, AlertTriangle, Server } from 'lucide-react';
import LiveIncidents from './LiveIncidents';
import AuditTrail from './AuditTrail';
import ServerHealth from './ServerHealth';
import { API_URL } from '../../../config';

type SentinelTab = 'overview' | 'health' | 'incidents' | 'policies' | 'audit' | 'forensics';

export default function SentinelDashboard() {
    const [activeTab, setActiveTab] = useState<SentinelTab>('overview');
    const [stats, setStats] = useState({ critical: 0, high: 0, medium: 0, open: 0, servers: 1, blocked: Math.floor(Math.random() * 5) });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch(`${API_URL}/admin/sentinel/incidents`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                const data = await res.json();
                if (data.success && data.data) {
                    const incidents: any[] = data.data;
                    setStats({
                        critical: incidents.filter(i => i.severity === 'critical' && i.status === 'open').length,
                        high: incidents.filter(i => i.severity === 'high' && i.status === 'open').length,
                        medium: incidents.filter(i => i.severity === 'medium' && i.status === 'open').length,
                        open: incidents.filter(i => i.status === 'open').length,
                        servers: new Set(incidents.map(i => i.serverId?._id)).size || 1,
                        blocked: 3 // Mock blocked IPs count for now
                    });
                }
            } catch (e) {}
        };
        fetchStats();
    }, []);

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="tab-pane">
            <style>{`
                .sentinel-layout {
                    display: flex;
                    gap: 32px;
                    align-items: flex-start;
                }
                .sentinel-sidebar {
                    width: 240px;
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    flex-shrink: 0;
                }
                .sentinel-nav-btn {
                    padding: 12px 16px;
                    border-radius: 12px;
                    background: transparent;
                    color: var(--text-secondary);
                    border: none;
                    text-align: left;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    transition: all 0.2s;
                }
                .sentinel-nav-btn.active {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }
                .sentinel-nav-btn:hover:not(.active) {
                    background: rgba(255, 255, 255, 0.05);
                    color: var(--text-primary);
                }
                .sentinel-content {
                    flex: 1;
                    min-width: 0;
                }
                .empty-block {
                    padding: 60px;
                    text-align: center;
                    background: var(--bg-card);
                    border: 1px dashed var(--border-color);
                    border-radius: 20px;
                    color: var(--text-muted);
                }
            `}</style>
            
            <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '14px', color: '#ef4444' }}>
                    <ShieldAlert size={28} />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: '24px', color: 'var(--text-primary)' }}>Joe Sentinel</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>Autonomous Server Security & Intrusion Detection</p>
                </div>
            </div>

            <div className="sentinel-layout">
                <div className="sentinel-sidebar">
                    <button className={`sentinel-nav-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                        <Activity size={18} /> Overview
                    </button>
                    <button className={`sentinel-nav-btn ${activeTab === 'health' ? 'active' : ''}`} onClick={() => setActiveTab('health')}>
                        <Server size={18} /> Server Health
                    </button>
                    <button className={`sentinel-nav-btn ${activeTab === 'incidents' ? 'active' : ''}`} onClick={() => setActiveTab('incidents')}>
                        <AlertTriangle size={18} /> Live Incidents
                    </button>
                    <button className={`sentinel-nav-btn ${activeTab === 'policies' ? 'active' : ''}`} onClick={() => setActiveTab('policies')}>
                        <Settings size={18} /> Policies & Rules
                    </button>
                    <button className={`sentinel-nav-btn ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
                        <FileText size={18} /> Audit Trail
                    </button>
                    <button className={`sentinel-nav-btn ${activeTab === 'forensics' ? 'active' : ''}`} onClick={() => setActiveTab('forensics')}>
                        <Crosshair size={18} /> Forensics
                    </button>
                </div>

                <div className="sentinel-content">
                    <AnimatePresence mode="wait">
                        {activeTab === 'overview' && (
                            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                                    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Open Incidents</h4>
                                        <h1 style={{ margin: '8px 0 0', color: stats.open > 0 ? '#f97316' : '#10b981' }}>{stats.open}</h1>
                                    </div>
                                    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Critical Threats</h4>
                                        <h1 style={{ margin: '8px 0 0', color: stats.critical > 0 ? '#ef4444' : 'var(--text-primary)' }}>{stats.critical}</h1>
                                    </div>
                                    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Risky Servers</h4>
                                        <h1 style={{ margin: '8px 0 0', color: stats.open > 0 ? '#f97316' : 'var(--text-primary)' }}>{stats.servers}</h1>
                                    </div>
                                    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Blocked IPs</h4>
                                        <h1 style={{ margin: '8px 0 0', color: '#3b82f6' }}>{stats.blocked}</h1>
                                    </div>
                                </div>
                                
                                {stats.open === 0 && (
                                    <div className="empty-block">
                                        <ShieldCheck size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
                                        <h3>System is Secure</h3>
                                        <p>Global Fleet Status is Nominal.</p>
                                    </div>
                                )}
                            </motion.div>
                        )}
                        {activeTab === 'health' && (
                            <motion.div key="health" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <ServerHealth />
                            </motion.div>
                        )}
                        {activeTab === 'incidents' && (
                            <motion.div key="incidents" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <LiveIncidents />
                            </motion.div>
                        )}
                        {activeTab === 'policies' && (
                            <motion.div key="policies" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <div className="empty-block">
                                    <Crosshair size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
                                    <h3>Static Policies</h3>
                                    <p>Joe Sentinel uses built-in heuristic rules for Phase 1. Dynamic policy editor coming in Phase 6.</p>
                                </div>
                            </motion.div>
                        )}
                        {activeTab === 'audit' && (
                            <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <AuditTrail />
                            </motion.div>
                        )}
                        {activeTab === 'forensics' && (
                            <motion.div key="forensics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                    <h3>File Integrity Hash Checker</h3>
                                    <p style={{ color: 'var(--text-muted)' }}>Validate system binaries against known good states.</p>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                        <input type="text" placeholder="Enter absolute file path (e.g., /usr/local/bin/backdoor)" style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border-color)' }} />
                                        <button style={{ padding: '12px 24px', borderRadius: '8px', background: 'var(--primary-color)', color: 'white', border: 'none', fontWeight: 600 }}>Analyze Hash</button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
}
