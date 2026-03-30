import { useState, useEffect } from 'react';
import { Shield, AlertCircle, CheckCircle, Crosshair, Terminal, Loader2, ArrowRight } from 'lucide-react';
import { API_URL } from '../../../config';

interface Incident {
    _id: string;
    title: string;
    severity: string;
    status: string;
    serverId: { name: string; host: string };
    detectingRules: string[];
    evidence: any;
    recommendedActions: string[];
    createdAt: string;
}

export default function LiveIncidents() {
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [loading, setLoading] = useState(true);
    const [executingMap, setExecutingMap] = useState<Record<string, boolean>>({});
    const token = localStorage.getItem('token');

    const fetchIncidents = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/sentinel/incidents`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setIncidents(data.data || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Executes a playbook action against an incident target.
     */
    const executePlaybook = async (incidentId: string, actionType: string, targetValue: string) => {
        if (!window.confirm(`Are you sure you want to execute [${actionType}] on [${targetValue}]?`)) return;

        setExecutingMap(prev => ({ ...prev, [incidentId]: true }));
        try {
            const res = await fetch(`${API_URL}/admin/sentinel/incidents/${incidentId}/action/${actionType}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ target: targetValue, dryRun: false })
            });
            const data = await res.json();
            if (data.success) {
                alert('Playbook executed successfully. Check the Audit Trail for logs.');
                fetchIncidents();
            } else {
                alert(`Action Failed: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
        }
        setExecutingMap(prev => ({ ...prev, [incidentId]: false }));
    };

    useEffect(() => {
        fetchIncidents();
        const interval = setInterval(fetchIncidents, 10000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spinning" size={32} /></div>;

    if (incidents.length === 0) {
        return (
            <div style={{ padding: '60px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
                <CheckCircle size={48} color="#10b981" style={{ marginBottom: '16px' }} />
                <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px' }}>Zero Open Incidents</h3>
                <p style={{ color: 'var(--text-muted)' }}>No threats detected across your infrastructure.</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {incidents.map(inc => (
                <div key={inc._id} style={{
                    background: 'var(--bg-card)', 
                    border: `1px solid ${inc.severity === 'critical' || inc.severity === 'high' ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)'}`,
                    borderRadius: '20px',
                    padding: '24px',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    {/* Urgency Ribbon */}
                    {(inc.status === 'open') && (
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                            background: inc.severity === 'critical' ? '#ef4444' : inc.severity === 'high' ? '#f97316' : '#eab308'
                        }} />
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <span style={{
                                    padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
                                    background: inc.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(249,115,22,0.2)',
                                    color: inc.severity === 'critical' ? '#ef4444' : '#f97316'
                                }}>
                                    {inc.severity}
                                </span>
                                <span style={{
                                    padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
                                    background: inc.status === 'open' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                                    color: inc.status === 'open' ? '#ef4444' : '#10b981'
                                }}>
                                    {inc.status}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                    {new Date(inc.createdAt).toLocaleString()}
                                </span>
                            </div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '20px', color: 'var(--text-primary)' }}>{inc.title}</h3>
                            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
                                Detected on <strong>{inc.serverId?.name}</strong> ({inc.serverId?.host})
                            </p>
                        </div>
                    </div>

                    <div style={{ background: '#050505', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 700 }}>Evidence Forensics</div>
                        <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '12px', color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
                            {JSON.stringify(inc.evidence, null, 2)}
                        </pre>
                    </div>

                    {inc.status === 'open' && inc.recommendedActions?.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', fontWeight: 700 }}>Recommended One-Click Mitigations</div>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {inc.recommendedActions.map(action => {
                                    // Parse targets from evidence to prepopulate buttons
                                    let targetStr = 'Select Target...';
                                    let finalTarget = '';
                                    
                                    if (action === 'kill_process_tree' && inc.evidence.suspicious_processes) {
                                        targetStr = `Kill PID ${inc.evidence.suspicious_processes[0]?.pid}`;
                                        finalTarget = inc.evidence.suspicious_processes[0]?.pid;
                                    } else if (action === 'quarantine_file' && inc.evidence.fim_changes) {
                                        const file = inc.evidence.fim_changes[0]?.path;
                                        targetStr = `Quarantine ${file?.split('/').pop()}`;
                                        finalTarget = file;
                                    }

                                    return (
                                        <button
                                            key={action}
                                            disabled={executingMap[inc._id] || !finalTarget}
                                            onClick={() => executePlaybook(inc._id, action, finalTarget)}
                                            style={{
                                                padding: '10px 16px',
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                                color: '#ef4444',
                                                borderRadius: '10px',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                cursor: executingMap[inc._id] || !finalTarget ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseOver={(e: any) => { if(!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
                                            onMouseOut={(e: any) => { if(!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                                        >
                                            <Crosshair size={14} />
                                            {action.toUpperCase()}: {targetStr}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
