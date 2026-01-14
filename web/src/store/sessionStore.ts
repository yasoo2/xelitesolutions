import { create } from 'zustand';
import { API_URL as API } from '../config';

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

async function ensureToken() {
  const existing = (() => {
    try {
      return localStorage.getItem('token');
    } catch {
      return null;
    }
  })();
  if (existing) return existing;

  const host = (() => {
    try {
      return window.location.hostname || '';
    } catch {
      return '';
    }
  })();
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local');
  if (!isLocal) return null;

  try {
    const res = await fetch(`${API}/auth/dev`, { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const token = typeof data?.token === 'string' ? data.token : '';
    if (!token) return null;
    try {
      localStorage.setItem('token', token);
    } catch {}
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
    const token = await ensureToken();
    if (!token) {
      set({ sessions: [], agentSessions: [] });
      return;
    }
    try {
      const doFetch = (t: string) => fetch(`${API}/sessions?kind=chat,agent`, { headers: { Authorization: `Bearer ${t}` } });
      let res = await doFetch(token);
      if (res.status === 401) {
        try { localStorage.removeItem('token'); } catch {}
        const retryToken = await ensureToken();
        if (!retryToken) {
          set({ sessions: [], agentSessions: [] });
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          return;
        }
        res = await doFetch(retryToken);
        if (res.status === 401) {
          try { localStorage.removeItem('token'); } catch {}
          set({ sessions: [], agentSessions: [] });
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          return;
        }
      }
      const data = await res.json();
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
    const token = await ensureToken();
    if (!token) {
      set({ folders: [] });
      return;
    }
    try {
      const doFetch = (t: string) => fetch(`${API}/folders`, { headers: { Authorization: `Bearer ${t}` } });
      let res = await doFetch(token);
      if (res.status === 401) {
        try { localStorage.removeItem('token'); } catch {}
        const retryToken = await ensureToken();
        if (!retryToken) {
          set({ folders: [] });
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          return;
        }
        res = await doFetch(retryToken);
        if (res.status === 401) {
          try { localStorage.removeItem('token'); } catch {}
          set({ folders: [] });
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          return;
        }
      }
      if (res.ok) {
        const data = await res.json();
        set({ folders: data });
      }
    } catch (e) {
      console.error('Failed to load folders', e);
    }
  },
  createFolder: async (name: string) => {
    set(state => ({ loadingStates: { ...state.loadingStates, creatingFolder: true } }));
    const token = localStorage.getItem('token');
    if (!token) {
      set(state => ({ loadingStates: { ...state.loadingStates, creatingFolder: false } }));
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    const res = await fetch(`${API}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      await useSessionStore.getState().loadFolders();
    }
    set(state => ({ loadingStates: { ...state.loadingStates, creatingFolder: false } }));
  },
  deleteFolder: async (id: string) => {
    set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-folder-${id}`]: true } }));
    const token = localStorage.getItem('token');
    if (!token) {
      set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-folder-${id}`]: false } }));
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    await fetch(`${API}/folders/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await useSessionStore.getState().loadFolders();
    await useSessionStore.getState().loadAllSessions();
    set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-folder-${id}`]: false } }));
  },
  deleteSession: async (id: string) => {
    set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-session-${id}`]: true } }));
    const token = localStorage.getItem('token');
    if (!token) {
      set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-session-${id}`]: false } }));
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    await fetch(`${API}/sessions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await useSessionStore.getState().loadAllSessions();
    set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-session-${id}`]: false } }));
  },
}));
