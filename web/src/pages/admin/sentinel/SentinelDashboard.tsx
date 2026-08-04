import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Activity, FileText, Settings, ShieldCheck, Crosshair, AlertTriangle, Server } from 'lucide-react';
import LiveIncidents from './LiveIncidents';
import AuditTrail from './AuditTrail';
import ServerHealth from './ServerHealth';
import { API_URL } from '../../../config';

type SentinelTab = 'overview' | 'health' | 'incidents' | 'policies' | 'audit' | 'forensics';

/**
 * Nothing on this panel may be invented.
 *
 * "Blocked IPs" used to start at `Math.floor(Math.random() * 5)` and then settle
 * on a hardcoded `3`, so a security console reported containments that had never
 * happened. The fetch failure was swallowed by an empty catch, which meant a
 * dashboard that could not reach the API at all showed four zeros and the words
 * "System is Secure" — the most dangerous thing a security screen can say when
 * it knows nothing.
 *
 * Every number below now comes from the API, and a number that could not be
 * loaded is shown as "—", never as zero.
 */
type Stats = {
    critical: number; high: number; medium: number; open: number;
    servers: number;
    /** null = not known yet, or the audit trail could not be read. */
    blocked: number | null;
};

const UNKNOWN: Stats = { critical: 0, high: 0, medium: 0, open: 0, servers: 0, blocked: null };

export default function SentinelDashboard() {
    const [activeTab, setActiveTab] = useState<SentinelTab>('overview');
    const [stats, setStats] = useState<Stats>(UNKNOWN);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [chainBusy, setChainBusy] = useState(false);
    const [chainResult, setChainResult] = useState<{ ok: boolean; text: string } | null>(null);

    /** The real verification the server actually performs — no invented hash. */
    const verifyChain = async () => {
        setChainBusy(true); setChainResult(null);
        try {
            const res = await fetch(`${API_URL}/admin/sentinel/audit`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            const data = await res.json();
            if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
            const integrity = data.integrity || {};
            const ok = integrity.valid === true || integrity.ok === true;
            setChainResult({
                ok,
                text: ok
                    ? `Chain intact — ${Array.isArray(data.data) ? data.data.length : 0} entries verified`
                    : `Chain BROKEN${integrity.brokenAt ? ` at ${integrity.brokenAt}` : ''}`,
            });
        } catch (e: any) {
            setChainResult({ ok: false, text: `Could not verify: ${String(e?.message || e).slice(0, 80)}` });
        } finally { setChainBusy(false); }
    };

    useEffect(() => {
        const auth = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const fetchStats = async () => {
            try {
                const res = await fetch(`${API_URL}/admin/sentinel/incidents`, { headers: auth });
                if (!res.ok) throw new Error(`incidents: HTTP ${res.status}`);
                const data = await res.json();
                if (!data.success || !Array.isArray(data.data)) throw new Error(data.error || 'incidents: malformed response');
                const incidents: any[] = data.data;

                // The real number of blocked addresses: distinct targets in the
                // chain-hashed audit log whose BLOCK_IP run actually succeeded.
                // A withheld (shadow-mode), skipped or failed block is not a block.
                let blocked: number | null = null;
                try {
                    const aRes = await fetch(`${API_URL}/admin/sentinel/audit`, { headers: auth });
                    if (aRes.ok) {
                        const aData = await aRes.json();
                        if (aData.success && Array.isArray(aData.data)) {
                            const targets = new Set(
                                aData.data
                                    .filter((l: any) => String(l.action || '').toUpperCase() === 'BLOCK_IP'
                                        && /^success$/i.test(String(l.result || '')))
                                    .map((l: any) => String(l.resource || '')),
                            );
                            blocked = targets.size;
                        }
                    }
                } catch { /* leave blocked as null — "—", not a guess */ }

                setStats({
                    critical: incidents.filter(i => i.severity === 'critical' && i.status === 'open').length,
                    high: incidents.filter(i => i.severity === 'high' && i.status === 'open').length,
                    medium: incidents.filter(i => i.severity === 'medium' && i.status === 'open').length,
                    open: incidents.filter(i => i.status === 'open').length,
                    servers: new Set(incidents.filter(i => i.status === 'open').map(i => i.serverId?._id)).size,
                    blocked,
                });
                setLoaded(true);
                setLoadError('');
            } catch (e: any) {
                // Say so. A security console that cannot read its own data must
                // not render as a clean bill of health.
                setLoaded(false);
                setLoadError(String(e?.message || e));
            }
        };
        fetchStats();
    }, []);

    const num = (v: number | null) => (loaded && v !== null ? String(v) : '—');

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
                                        <h1 style={{ margin: '8px 0 0', color: !loaded ? 'var(--text-secondary)' : stats.open > 0 ? '#f97316' : '#10b981' }}>{num(stats.open)}</h1>
                                    </div>
                                    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Critical Threats</h4>
                                        <h1 style={{ margin: '8px 0 0', color: !loaded ? 'var(--text-secondary)' : stats.critical > 0 ? '#ef4444' : 'var(--text-primary)' }}>{num(stats.critical)}</h1>
                                    </div>
                                    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Risky Servers</h4>
                                        <h1 style={{ margin: '8px 0 0', color: !loaded ? 'var(--text-secondary)' : stats.open > 0 ? '#f97316' : 'var(--text-primary)' }}>{num(stats.servers)}</h1>
                                    </div>
                                    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Blocked IPs</h4>
                                        <h1 style={{ margin: '8px 0 0', color: stats.blocked === null ? 'var(--text-secondary)' : '#3b82f6' }}>{num(stats.blocked)}</h1>
                                        {loaded && stats.blocked === null && (
                                            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>audit trail unreadable</p>
                                        )}
                                    </div>
                                </div>

                                {loadError && (
                                    <div className="empty-block" style={{ borderColor: '#ef4444' }}>
                                        <AlertTriangle size={48} style={{ opacity: 0.35, margin: '0 auto 16px', color: '#ef4444' }} />
                                        <h3>Security status unknown</h3>
                                        <p>Could not read Sentinel data: {loadError}. These figures are not a clean bill of health — nothing was checked.</p>
                                    </div>
                                )}

                                {loaded && stats.open === 0 && (
                                    <div className="empty-block">
                                        <ShieldCheck size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
                                        <h3>No open incidents</h3>
                                        <p>Sentinel reports no unresolved incidents across the monitored fleet.</p>
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
                                    {/* THIS CONTROL PROMISED SOMETHING THAT DID NOT EXIST.
                                        Found by sweeping «every rendered control does
                                        something»: an input and an «Analyze Hash» button with
                                        no handler at all, on a SECURITY screen — the worst
                                        place to fake a capability. There is no per-file hash
                                        endpoint; what the server really offers is the audit
                                        chain's own integrity verification, so that is what
                                        this button now does, under its true name. */}
                                    <h3>Audit Chain Integrity</h3>
                                    <p style={{ color: 'var(--text-muted)' }}>Verify that the tamper-evident audit log has not been altered.</p>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
                                        <button
                                            onClick={verifyChain}
                                            disabled={chainBusy}
                                            style={{ padding: '12px 24px', borderRadius: '8px', background: 'var(--primary-color)', color: 'white', border: 'none', fontWeight: 600, cursor: chainBusy ? 'not-allowed' : 'pointer', opacity: chainBusy ? 0.6 : 1 }}
                                        >
                                            {chainBusy ? 'Verifying…' : 'Verify chain'}
                                        </button>
                                        {chainResult && (
                                            <span style={{ color: chainResult.ok ? 'var(--success-color, #22c55e)' : 'var(--danger-color, #ef4444)', fontWeight: 600 }}>
                                                {chainResult.text}
                                            </span>
                                        )}
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
