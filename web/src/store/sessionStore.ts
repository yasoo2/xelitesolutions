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
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/sessions?kind=chat,agent`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      if (res.status === 401) {
        localStorage.removeItem('token');
        set({ sessions: [], agentSessions: [] });
        return;
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
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/folders`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
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
    const res = await fetch(`${API}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
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
    await fetch(`${API}/folders/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    await useSessionStore.getState().loadFolders();
    await useSessionStore.getState().loadAllSessions();
    set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-folder-${id}`]: false } }));
  },
  deleteSession: async (id: string) => {
    set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-session-${id}`]: true } }));
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    await useSessionStore.getState().loadAllSessions();
    set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-session-${id}`]: false } }));
  },
}));
