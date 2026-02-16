```
import { useState } from 'react';
import { api } from '../services/apiClient';
import { useSessionStore } from '../store/sessionStore';
import { useTranslation } from 'react-i18next';

export function useSessionActions() {
    const { loadAllSessions, setSelected, selected } = useSessionStore();
    const { t } = useTranslation();
    const [isCreatingChatSession, setIsCreatingChatSession] = useState(false);

    async function createSession(options?: { kind?: 'chat' | 'agent', onSuccess?: () => void }) {
        setIsCreatingChatSession(true);
        const { kind = 'chat', onSuccess } = options || {};
        try {
            const data: any = await api.post('/sessions', { kind });
            const id = String(data?.id || data?._id || '').trim();
            if (!id) return;

            if (kind === 'agent') {
                useSessionStore.getState().setAgentSelected(id);
            } else {
                setSelected(id);
            }

            await loadAllSessions();
            onSuccess?.();

        } catch (e) {
            console.error(e);
        } finally {
            setIsCreatingChatSession(false);
        }
    }

    async function moveSessionToFolder(sessionId: string, folderId: string | null) {
        try {
            await api.patch(`/sessions/${sessionId}/move`, { folderId });
            await loadAllSessions();
        } catch (e) { console.error(e); }
    }

    async function mergeSessions(sourceId: string, targetId: string) {
        if (sourceId === targetId) return;
        if (!confirm('Are you sure you want to merge these sessions? This cannot be undone.')) return;
        try {
            const res: any = await api.post('/sessions/merge', { sourceId, targetId });
            if (res.ok) {
                await loadAllSessions();
                if (selected === sourceId) setSelected(targetId);
            }
        } catch (e) { console.error(e); }
    }

    async function deleteAllSessions() {
        if (!confirm('هل أنت متأكد من حذف جميع الجلسات؟ لا يمكن التراجع عن هذا الإجراء.')) return;
        try {
            await api.delete('/sessions');
            await loadAllSessions();
            setSelected(null);
        } catch (e) { console.error(e); }
    }

    async function togglePin(id: string, currentPinned: boolean) {
        try {
            await api.patch(`/sessions/${id}/pin`, { isPinned: !currentPinned });
            await loadAllSessions();
        } catch (e) { console.error(e); }
    }

    return {
        createSession,
        isCreatingChatSession,
        moveSessionToFolder,
        mergeSessions,
        deleteAllSessions,
        togglePin
    };
}
