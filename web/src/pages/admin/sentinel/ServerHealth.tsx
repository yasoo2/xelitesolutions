import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Server, Cpu, HardDrive, ShieldAlert, Crosshair } from 'lucide-react';

export default function ServerHealth() {
    const [telemetry, setTelemetry] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchLive = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/admin/sentinel/telemetry/live', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) setTelemetry(data.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLive();
        const t = setInterval(fetchLive, 5000);
        return () => clearInterval(t);
    }, []);

    const executeAction = async (serverId: string, actionType: string, target: string) => {
        try {
            const token = localStorage.getItem('token');
            await fetch('/api/admin/sentinel/actions/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ serverId, actionType, target })
            });
            alert('Action enqueued for Agent Execution.');
        } catch (e) {
            alert('Failed to execute');
        }
    };

    if (loading) return <div style={{ color: 'var(--text-muted)' }}>Connecting to Host Telemetry...</div>;

    // We just take the first server object for now, or display a dropdown if multi-server
    const servers = telemetry ? Object.values(telemetry) : [];
    if (servers.length === 0) return <div style={{ color: 'var(--text-muted)' }}>No live telemetry available. Is the agent running?</div>;

    const host: any = servers[0]; // Active server

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top Cards */}
            <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1, background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                    <Server size={24} style={{ opacity: 0.5, marginBottom: '8px' }} />
                    <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Host Identity</h4>
                    <h2 style={{ margin: '8px 0 0' }}>{host.metrics?.hostname || 'Unknown'}</h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>{host.metrics?.os?.platform} {host.metrics?.os?.release}</p>
                </div>
                <div style={{ flex: 1, background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                    <Cpu size={24} style={{ opacity: 0.5, marginBottom: '8px' }} />
                    <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Load Average (1m)</h4>
                    <h2 style={{ margin: '8px 0 0' }}>{host.metrics?.cpu?.load1m?.toFixed(2)}</h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>Cores: {host.metrics?.cpu?.cores}</p>
                </div>
                <div style={{ flex: 1, background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                    <HardDrive size={24} style={{ opacity: 0.5, marginBottom: '8px' }} />
                    <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Memory Usage</h4>
                    <h2 style={{ margin: '8px 0 0' }}>{host.metrics?.memory?.usedPercent}%</h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>{host.metrics?.memory?.freeMB} MB Free</p>
                </div>
            </div>

            {/* Active SSH Users */}
            <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <ShieldAlert size={20} color="#ef4444" />
                    <h3 style={{ margin: 0 }}>Active SSH Sessions</h3>
                </div>
                {host.users && host.users.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '8px 0' }}>User</th>
                                <th>Terminal</th>
                                <th>Login Time</th>
                                <th>Source IP</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {host.users.map((u: any, i: number) => {
                                const isAuthorized = u.user === 'joe' || u.user === 'root';
                                return (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '12px 0', fontWeight: 'bold', color: isAuthorized ? 'var(--text-primary)' : '#ef4444' }}>
                                        {u.user} {isAuthorized ? '' : '(UNAUTHORIZED)'}
                                    </td>
                                    <td>{u.terminal}</td>
                                    <td>{u.time}</td>
                                    <td>{u.ip}</td>
                                    <td>
                                        <button 
                                            onClick={() => executeAction(host.serverId, 'KILL_PROCESS', `-u ${u.user}`)}
                                            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}>
                                            Kick User
                                        </button>
                                    </td>
                                </tr>
                                )
                            })}
                        </tbody>
                    </table>
                ) : <div style={{ color: 'var(--text-muted)' }}>No active SSH sessions detected.</div>}
            </div>

            {/* Top Memory Hogs */}
            <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <Activity size={20} color="#10b981" />
                    <h3 style={{ margin: 0 }}>Top Process Consumers (RAM)</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ padding: '8px 0' }}>PID</th>
                            <th>User</th>
                            <th>CPU %</th>
                            <th>MEM %</th>
                            <th>Command</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {host.processes?.topMem?.map((p: any, i: number) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '12px 0' }}>{p.pid}</td>
                                <td style={{ color: p.user === 'root' ? '#ef4444' : 'inherit' }}>{p.user}</td>
                                <td>{p.cpu}</td>
                                <td style={{ fontWeight: 'bold' }}>{p.mem}</td>
                                <td style={{ fontFamily: 'monospace', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cmd}</td>
                                <td>
                                    <button 
                                        onClick={() => executeAction(host.serverId, 'KILL_PROCESS', p.pid)}
                                        style={{ background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>
                                        Kill
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

        </div>
    );
}
