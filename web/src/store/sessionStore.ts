import { create } from 'zustand';
import { api } from '../services/apiClient';

export interface Session {
  id: string;
  title: string;
  lastSnippet?: string;
  isPinned?: boolean;
  folderId?: string;
  terminalState?: string;
}

export interface Folder {
  _id: string;
  name: string;
}

// Helper to ensure token exists (for dev environment auto-creation)
// We keep this specific logic here or move to auth service? 
// For now, keep it local or use apiClient helper if extended.
// But apiClient uses localStorage. 
// This ensureToken logic actually *fetches* a dev token if none exists.
async function ensureToken() {
  const existing = localStorage.getItem('token');
  if (existing) return existing;

  const isLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);
  if (!isLocal) return null;

  try {
    // We use raw fetch here because api.post would fail with 401/no token logic loop?
    // Actually api.post handles headers. If we call a public endpoint it's fine.
    // But /auth/dev might need special handling. Let's stick to simple fetch for this bootstrap.
    const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';
    const res = await fetch(`${API_URL}/auth/dev`, { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const token = typeof data?.token === 'string' ? data.token : '';
    if (token) localStorage.setItem('token', token);
    return token;
  } catch {
    return null;
  }
}

interface SessionState {
  sessions: Session[];
  agentSessions: Session[];
  folders: Folder[];
  selected: string | null;
  agentSelected: string | null;
  loadingStates: Record<string, boolean>;
  loadAllSessions: () => Promise<void>;
  loadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  setSelected: (id: string | null) => void;
  setAgentSelected: (id: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  agentSessions: [],
  folders: [],
  selected: null,
  agentSelected: null,
  loadingStates: {},
  setSelected: (id: string | null) => set({ selected: id }),
  setAgentSelected: (id: string | null) => set({ agentSelected: id }),

  loadAllSessions: async () => {
    try {
      const token = await ensureToken();
      if (!token) {
        set({ sessions: [], agentSessions: [] });
        return;
      }
      const data: any = await api.get('/sessions', { kind: 'chat,agent' });
      const allSessions = (data.sessions || []).map((s: any) => ({ ...s, id: s.id || s._id }));

      const chatSessions = allSessions.filter((s: any) => s.kind === 'chat' || !s.kind);
      const agentSessions = allSessions.filter((s: any) => s.kind === 'agent');

      set(state => ({
        sessions: chatSessions,
        agentSessions: agentSessions,
        selected: state.selected || chatSessions[0]?.id || null,
        agentSelected: state.agentSelected || agentSessions[0]?.id || null,
      }));
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
  },

  loadFolders: async () => {
    try {
      const folders: any = await api.get('/folders');
      set({ folders });
    } catch (e) {
      console.error('Failed to load folders', e);
      set({ folders: [] });
    }
  },

  createFolder: async (name: string) => {
    set(state => ({ loadingStates: { ...state.loadingStates, creatingFolder: true } }));
    try {
      await api.post('/folders', { name });
      await useSessionStore.getState().loadFolders();
    } catch (e) {
      console.error(e);
    } finally {
      set(state => ({ loadingStates: { ...state.loadingStates, creatingFolder: false } }));
    }
  },

  deleteFolder: async (id: string) => {
    set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-folder-${id}`]: true } }));
    try {
      await api.delete(`/folders/${id}`);
      await useSessionStore.getState().loadFolders();
      await useSessionStore.getState().loadAllSessions();
    } catch (e) {
      console.error(e);
    } finally {
      set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-folder-${id}`]: false } }));
    }
  },

  deleteSession: async (id: string) => {
    set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-session-${id}`]: true } }));
    try {
      await api.delete(`/sessions/${id}`);
      await useSessionStore.getState().loadAllSessions();
    } catch (e) {
      console.error(e);
    } finally {
      set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-session-${id}`]: false } }));
    }
  },
}));
