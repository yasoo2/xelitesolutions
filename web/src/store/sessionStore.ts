import { create } from 'zustand';
import { api } from '../services/apiClient';
import { API_URL } from '../config';
import { isValidToken } from '../utils/auth';

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
// SECURITY: Only auto-creates dev tokens on localhost AND when not in production build
async function ensureToken() {
  const existing = localStorage.getItem('token');
  if (existing) {
    if (isValidToken(existing)) return existing;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  // Only allow dev token auto-creation on localhost - never in production
  const isLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);
  const isProduction = import.meta.env.PROD === true;
  if (!isLocal || isProduction) return null;

  try {
    const res = await fetch(`${API_URL}/auth/dev`, { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const token = typeof data?.token === 'string' ? data.token : '';
    if (token) {
      console.warn('[Auth] Using auto-generated dev token. This should NEVER happen in production.');
      localStorage.setItem('token', token);
    }
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
  deleteAllSessions: () => Promise<void>;
  /** After the LAST session dies, open a fresh one so a visible session owns the chat. */
  ensureOwnedSession: () => Promise<void>;
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
      const rawList = Array.isArray(data) ? data : (data.sessions || []);
      const allSessions = rawList.map((s: any) => ({ ...s, id: s.id || s._id }));

      const chatSessions = allSessions.filter((s: any) => s.kind === 'chat' || !s.kind);
      const agentSessions = allSessions.filter((s: any) => s.kind === 'agent');

      // CRITICAL invariant: the view derives its active session as
      // `agentSelected || selected`, so AT MOST ONE of them may be set — otherwise
      // an agent session permanently shadows whatever chat/session the user picked,
      // and every reload (create/delete/pin) snaps the view back to the first agent
      // session ("all sessions open the same chat"). Here we (1) drop any selection
      // that no longer exists, (2) never keep both set, and (3) only choose a
      // default when nothing is currently active.
      set(state => {
        const chatIds = new Set(chatSessions.map((s: any) => s.id));
        const agentIds = new Set(agentSessions.map((s: any) => s.id));
        let selected = state.selected && chatIds.has(state.selected) ? state.selected : null;
        let agentSelected = state.agentSelected && agentIds.has(state.agentSelected) ? state.agentSelected : null;
        // agentSelected wins in the view, so if both survived, keep only the chat one
        // when the user was last on chat; otherwise the agent one. We can't know
        // recency here, so prefer the explicitly-selected chat to avoid the shadow bug.
        if (selected && agentSelected) agentSelected = null;
        // Default to a single session only when the user has nothing active at all.
        if (!selected && !agentSelected) {
          if (agentSessions[0]) agentSelected = agentSessions[0].id;
          else if (chatSessions[0]) selected = chatSessions[0].id;
        }
        return { sessions: chatSessions, agentSessions, selected, agentSelected };
      });
    } catch (e: any) {
      if (e.message === 'Unauthorized' || e.message?.includes('Invalid token')) return;
      // Session load failed silently
    }
  },

  loadFolders: async () => {
    try {
      const folders: any = await api.get('/folders');
      set({ folders });
    } catch (e: any) {
      if (e.message === 'Unauthorized' || e.message?.includes('Invalid token')) return;
      // Folder load failed silently
      set({ folders: [] });
    }
  },

  createFolder: async (name: string) => {
    set(state => ({ loadingStates: { ...state.loadingStates, creatingFolder: true } }));
    try {
      await api.post('/folders', { name });
      await useSessionStore.getState().loadFolders();
    } catch {
      // Folder creation failed silently
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
    } catch {
      // Folder deletion failed silently
    } finally {
      set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-folder-${id}`]: false } }));
    }
  },

  deleteSession: async (id: string) => {
    set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-session-${id}`]: true } }));
    try {
      await api.delete(`/sessions/${id}`);
      await useSessionStore.getState().loadAllSessions();
      await useSessionStore.getState().ensureOwnedSession();
    } catch {
      // Session deletion failed silently
    } finally {
      set(state => ({ loadingStates: { ...state.loadingStates, [`deleting-session-${id}`]: false } }));
    }
  },

  deleteAllSessions: async () => {
    set(state => ({ loadingStates: { ...state.loadingStates, deletingAll: true } }));
    try {
      await api.delete('/sessions');
      set({ sessions: [], agentSessions: [], selected: null, agentSelected: null });
      await useSessionStore.getState().ensureOwnedSession();
    } catch {
      // Session deletion failed silently
    } finally {
      set(state => ({ loadingStates: { ...state.loadingStates, deletingAll: false } }));
    }
  },

  /**
   * A VISIBLE SESSION MUST OWN EVERY CONVERSATION.
   *
   * Measured on the owner's own screen: he deleted all sessions, the bar
   * showed «No results» — and the composer kept talking to Joe anyway,
   * because the page's active id had gone null (or dangling) while nothing
   * recreated it. An orphan chat has no visible home, no history entry and
   * no delete button of its own.
   *
   * So deleting the LAST session opens a fresh one immediately — the exact
   * behaviour of the «New Chat» button — and the new conversation lands in
   * a session the bar can show. When at least one session survives,
   * loadAllSessions' single-active invariant already reassigns, and this
   * does nothing.
   */
  ensureOwnedSession: async () => {
    const state = useSessionStore.getState();
    if (state.sessions.length || state.agentSessions.length) return;
    try {
      const data: any = await api.post('/sessions', { kind: 'agent' });
      const id = String((data as any)?.id || (data as any)?._id || '').trim();
      if (!id) return;
      set({ selected: null, agentSelected: id });
      await useSessionStore.getState().loadAllSessions();
    } catch {
      // Creation failed — the bar stays honestly empty rather than lying.
    }
  },
}));
