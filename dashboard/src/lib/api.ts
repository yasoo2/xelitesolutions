import axios from 'axios';

const API_Base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const api = axios.create({
    baseURL: API_Base,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add interceptor to handle auth token if we implement login later
api.interceptors.request.use((config) => {
    // const token = localStorage.getItem('token');
    // if (token) {
    //     config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
});

export const getSystemStats = async () => {
    // In a real app, we'd have a specific stats endpoint.
    // For now, we'll try to get tools count and maybe health check.
    try {
        const health = await api.get('/health');
        const tools = await api.get('/tools');
        const runs = await api.get('/runs?limit=1'); // Just to check if endpoint works

        return {
            status: health.data.status,
            toolsCount: Array.isArray(tools.data) ? tools.data.length : 0,
            uptime: '99.9%', // Mock
            activeRuns: 0, // Mock
        };
    } catch (e) {
        console.error('Failed to fetch stats', e);
        return {
            status: 'Offline',
            toolsCount: 0,
            uptime: '0%',
            activeRuns: 0,
        };
    }
};

export const getTools = async () => {
    const res = await api.get('/tools');
    return res.data;
};

export const getKnowledge = async () => {
    const res = await api.get('/knowledge/list');
    return res.data;
};

export const deleteKnowledge = async (id: string) => {
    await api.delete(`/knowledge/${id}`);
};
