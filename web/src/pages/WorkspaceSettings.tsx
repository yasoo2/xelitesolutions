import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Key, CreditCard, Settings as SettingsIcon, Trash2, Plus, AlertCircle, CheckCircle } from 'lucide-react';

interface Member {
    _id: string;
    userId: { _id: string, name: string, email: string, picture?: string };
    role: string;
}

export default function WorkspaceSettings() {
    const { t } = useTranslation();
    const { workspaceId } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('members');
    const [workspace, setWorkspace] = useState<any>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('VIEWER');
    const [apiKeys, setApiKeys] = useState({ openai: '', anthropic: '' });
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    useEffect(() => {
        fetchData();
    }, [workspaceId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const wsRes = await axios.get(`${import.meta.env.VITE_API_URL}/api/workspaces/${workspaceId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setWorkspace(wsRes.data);
            setApiKeys({
                openai: wsRes.data.providerConfig?.openai?.apiKey || '',
                anthropic: wsRes.data.providerConfig?.anthropic?.apiKey || ''
            });

            const memRes = await axios.get(`${import.meta.env.VITE_API_URL}/api/workspaces/${workspaceId}/members`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMembers(memRes.data);
        } catch (e) {
            console.error(e);
            navigate('/');
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${import.meta.env.VITE_API_URL}/api/workspaces/${workspaceId}/members`, {
                email: inviteEmail,
                role: inviteRole
            }, { headers: { Authorization: `Bearer ${token}` } });

            setInviteEmail('');
            showFeedback('success', 'Member invited successfully');
            fetchData();
        } catch (e: any) {
            showFeedback('error', e.response?.data?.error || 'Failed to invite');
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        if (!confirm('Are you sure you want to remove this member?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${import.meta.env.VITE_API_URL}/api/workspaces/${workspaceId}/members/${memberId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showFeedback('success', 'Member removed');
            fetchData();
        } catch (e: any) {
            showFeedback('error', e.response?.data?.error || 'Failed to remove');
        }
    };

    const handleSaveKeys = async () => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${import.meta.env.VITE_API_URL}/api/workspaces/${workspaceId}`, {
                providerConfig: {
                    openai: { apiKey: apiKeys.openai },
                    anthropic: { apiKey: apiKeys.anthropic }
                }
            }, { headers: { Authorization: `Bearer ${token}` } });
            showFeedback('success', 'API Keys saved successfully');
        } catch (e: any) {
            showFeedback('error', 'Failed to save keys');
        }
    };

    const showFeedback = (type: 'success' | 'error', msg: string) => {
        setFeedback({ type, msg });
        setTimeout(() => setFeedback(null), 3000);
    };

    if (loading) return <div className="p-8 text-center text-white/50">Loading settings...</div>;

    return (
        <div className="max-w-4xl mx-auto p-6 text-white pt-24">
            <header className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-lg">
                        {workspace?.name?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">{workspace?.name} Settings</h1>
                        <p className="text-white/50 text-sm">Manage your workspace preferences</p>
                    </div>
                </div>
            </header>

            {feedback && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3 rounded-lg mb-6 flex items-center gap-2 ${feedback.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}
                >
                    {feedback.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    {feedback.msg}
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Sidebar */}
                <div className="space-y-1">
                    {[
                        { id: 'members', label: 'Members', icon: Users },
                        { id: 'providers', label: 'AI Providers', icon: Key },
                        { id: 'billing', label: 'Billing & Plans', icon: CreditCard },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${activeTab === tab.id ? 'bg-white/10 text-white font-medium' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="md:col-span-3 bg-[#161b22] border border-white/10 rounded-xl p-6 min-h-[400px]">

                    {activeTab === 'members' && (
                        <div className="space-y-6">
                            <h2 className="text-xl font-bold mb-4">Team Members</h2>

                            {/* Invite Form */}
                            <form onSubmit={handleInvite} className="flex gap-2 p-4 bg-white/5 rounded-lg border border-white/10">
                                <input
                                    type="email"
                                    required
                                    placeholder="Enter email to invite..."
                                    className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30"
                                    value={inviteEmail}
                                    onChange={e => setInviteEmail(e.target.value)}
                                />
                                <select
                                    className="bg-[#0f1115] border border-white/10 rounded px-2 py-1 text-sm outline-none"
                                    value={inviteRole}
                                    onChange={e => setInviteRole(e.target.value)}
                                >
                                    <option value="ADMIN">Admin</option>
                                    <option value="DEVELOPER">Developer</option>
                                    <option value="VIEWER">Viewer</option>
                                </select>
                                <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-1 rounded text-sm font-medium transition-colors">
                                    <Plus size={16} className="inline mr-1" /> Invite
                                </button>
                            </form>

                            {/* Member List */}
                            <div className="space-y-2">
                                {members.map(m => (
                                    <div key={m._id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-xs font-bold">
                                                {m.userId.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium">{m.userId.name}</div>
                                                <div className="text-xs text-white/50">{m.userId.email}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-xs px-2 py-1 rounded bg-white/10 text-white/70 font-mono uppercase">{m.role}</span>
                                            {m.role !== 'OWNER' && (
                                                <button
                                                    onClick={() => handleRemoveMember(m._id)}
                                                    className="text-white/30 hover:text-red-400 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'providers' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-bold">AI Providers</h2>
                                <p className="text-white/50 text-sm mt-1">Configure your own API keys to bypass rate limits and access premium models.</p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white/80">OpenAI API Key</label>
                                    <input
                                        type="password"
                                        placeholder="sk-..."
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/20 outline-none focus:border-blue-500 transition-colors"
                                        value={apiKeys.openai}
                                        onChange={e => setApiKeys({ ...apiKeys, openai: e.target.value })}
                                        autoComplete="new-password"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white/80">Anthropic API Key</label>
                                    <input
                                        type="password"
                                        placeholder="sk-ant-..."
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/20 outline-none focus:border-blue-500 transition-colors"
                                        value={apiKeys.anthropic}
                                        onChange={e => setApiKeys({ ...apiKeys, anthropic: e.target.value })}
                                        autoComplete="new-password"
                                    />
                                </div>

                                <div className="pt-4">
                                    <button
                                        onClick={handleSaveKeys}
                                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-green-900/20"
                                    >
                                        Save Configuration
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'billing' && (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-white/20">
                                <CreditCard size={32} />
                            </div>
                            <h2 className="text-xl font-bold mb-2">Current Plan: {workspace?.plan.toUpperCase()}</h2>
                            <p className="text-white/50 max-w-sm mx-auto mb-6">You are currently on the {workspace?.plan} plan. Usage limits apply.</p>

                            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto mb-8 text-left">
                                <div className="p-3 bg-white/5 rounded border border-white/10">
                                    <div className="text-xs text-white/40 uppercase">Daily Tokens</div>
                                    <div className="text-lg font-mono">{workspace?.limits?.maxTokensPerDay.toLocaleString()}</div>
                                </div>
                                <div className="p-3 bg-white/5 rounded border border-white/10">
                                    <div className="text-xs text-white/40 uppercase">Agents</div>
                                    <div className="text-lg font-mono">{workspace?.limits?.maxAgents}</div>
                                </div>
                            </div>

                            <button className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                                Upgrade Plan (Coming Soon)
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
