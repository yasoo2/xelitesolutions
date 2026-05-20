import { useState, useEffect } from 'react';
import { ShieldCheck, Server, AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { API_URL } from '../../../config';

export default function AuditTrail() {
    const [logs, setLogs] = useState<any[]>([]);
    const [integrity, setIntegrity] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const token = localStorage.getItem('token');

    const fetchAudit = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/sentinel/audit`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLogs(data.data || []);
                setIntegrity(data.integrity);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAudit();
    }, []);

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spinning" size={32} /></div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Integrity Badge */}
            <div style={{
                background: integrity?.valid ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                border: `1px solid ${integrity?.valid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                padding: '16px 24px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {integrity?.valid ? (
                        <ShieldCheck size={32} color="#10b981" />
                    ) : (
                        <AlertTriangle size={32} color="#ef4444" />
                    )}
                    <div>
                        <h3 style={{ margin: '0 0 4px', color: integrity?.valid ? '#10b981' : '#ef4444', fontSize: '16px' }}>
                            {integrity?.valid ? 'Cryptographic Chain Valid' : 'Tampering Detected in Chain'}
                        </h3>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                            {integrity?.valid 
                                ? 'All system and user mitigation actions have been mathematically verified for absolute immutability.'
                                : `Hash verification failed at index ${integrity?.brokenAtIndex}. Audit log may be compromised.`}
                        </p>
                    </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>SHA-256 Chained Hash Algorithm</div>
            </div>

            {/* Log Table */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                        <tr>
                            <th style={{ padding: '16px 24px', fontWeight: 600 }}>Timestamp</th>
                            <th style={{ padding: '16px 24px', fontWeight: 600 }}>Actor</th>
                            <th style={{ padding: '16px 24px', fontWeight: 600 }}>Action</th>
                            <th style={{ padding: '16px 24px', fontWeight: 600 }}>Target Resource</th>
                            <th style={{ padding: '16px 24px', fontWeight: 600 }}>Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No audit events generated yet.</td></tr>
                        ) : logs.map((log) => (
                            <tr key={log._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{new Date(log.timestamp).toLocaleString()}</td>
                                <td style={{ padding: '16px 24px', color: log.actor === 'system' ? 'var(--accent-primary)' : '#60a5fa', fontWeight: 600 }}>
                                    {log.actor.toUpperCase()}
                                </td>
                                <td style={{ padding: '16px 24px', color: 'var(--text-primary)', fontWeight: 600 }}>{log.action}</td>
                                <td style={{ padding: '16px 24px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{log.resource}</td>
                                <td style={{ padding: '16px 24px' }}>
                                    <span style={{ 
                                        padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                        background: log.result === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                        color: log.result === 'success' ? '#10b981' : '#ef4444'
                                    }}>
                                        {log.result.toUpperCase()}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
