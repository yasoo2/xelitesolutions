import { LiveEvent } from '../ws';

type Id = string;

export interface MockRun {
  id: Id;
  sessionId?: Id;
  status: 'pending' | 'running' | 'done' | 'blocked' | 'failed';
  steps: Array<{ name: string; status: 'pending' | 'running' | 'done' | 'blocked' | 'failed'; why?: string }>;
}
export interface MockToolExec {
  id: Id;
  runId: Id;
  name: string;
  input: any;
  output?: any;
  ok: boolean;
  logs: string[];
}
export interface MockArtifact {
  id: Id;
  runId: Id;
  name: string;
  href: string;
}
export interface MockApproval {
  id: Id;
  runId: Id;
  action: string;
  risk: string;
  status: 'pending' | 'approved' | 'denied';
  planName: string;
  planInput: any;
}

const runs: MockRun[] = [];
const execs: MockToolExec[] = [];
const artifacts: MockArtifact[] = [];
const approvals: MockApproval[] = [];
const sessions: Array<{ id: Id; title: string; mode: 'ADVISOR' | 'BUILDER' | 'SAFE' | 'OWNER'; lastSnippet?: string; lastUpdatedAt?: number }> = [];
const messages: Array<{ id: Id; sessionId: Id; role: 'user' | 'assistant' | 'system'; content: string; ts: number }> = [];

function nextId(prefix: string, n: number) {
  return `${prefix}${n}`;
}

export const store = {
  createRun(sessionId?: Id): MockRun {
    const id = nextId('run_', runs.length + 1);
    const run: MockRun = { id, sessionId, status: 'running', steps: [] };
    runs.push(run);
    return run;
  },
  updateRun(id: Id, patch: Partial<MockRun>) {
    const r = runs.find(x => x.id === id);
    if (r) Object.assign(r, patch);
    return r;
  },
  addStep(runId: Id, name: string, status: MockRun['status'], why?: string) {
    const r = runs.find(x => x.id === runId);
    if (!r) return;
    r.steps.push({ name, status, why });
  },
  addExec(runId: Id, name: string, input: any, output: any, ok: boolean, logs: string[]) {
    const id = nextId('exec_', execs.length + 1);
    const e: MockToolExec = { id, runId, name, input, output, ok, logs };
    execs.push(e);
    return e;
  },
  addArtifact(runId: Id, name: string, href: string) {
    const id = nextId('art_', artifacts.length + 1);
    const a: MockArtifact = { id, runId, name, href };
    artifacts.push(a);
    return a;
  },
  createApproval(runId: Id, action: string, risk: string, planName: string, planInput: any) {
    const id = nextId('appr_', approvals.length + 1);
    const ap: MockApproval = { id, runId, action, risk, status: 'pending', planName, planInput };
    approvals.push(ap);
    return ap;
  },
  updateApproval(id: Id, patch: Partial<MockApproval>) {
    const a = approvals.find(x => x.id === id);
    if (a) Object.assign(a, patch);
    return a;
  },
  getApproval(id: Id) {
    return approvals.find(x => x.id === id) || null;
  },
  listRuns() { return runs; },
  listExecs(runId?: Id) { return execs.filter(e => !runId || e.runId === runId); },
  listArtifacts(runId?: Id) { return artifacts.filter(a => !runId || a.runId === runId); },
  createSession(title: string, mode: 'ADVISOR' | 'BUILDER' | 'SAFE' | 'OWNER' = 'ADVISOR') {
    const existing = sessions.find(s => s.title === title);
    if (existing) return existing;
    const id = nextId('sess_', sessions.length + 1);
    const s = { id, title, mode };
    sessions.push(s);
    return s;
  },
  listSessions() { return sessions; },
  addMessage(sessionId: Id, role: 'user' | 'assistant' | 'system', content: string) {
    const id = nextId('msg_', messages.length + 1);
    const m = { id, sessionId, role, content, ts: Date.now() };
    messages.push(m);
    const s = sessions.find(s => s.id === sessionId);
    if (s) { s.lastSnippet = content.slice(0, 140); s.lastUpdatedAt = Date.now(); }
    return m;
  },
  listMessages(sessionId: Id) {
    return messages.filter(m => m.sessionId === sessionId);
  }
  ,
  mergeSessions(sourceId: Id, targetId: Id) {
    let movedMessages = 0;
    messages.forEach(m => {
      if (m.sessionId === sourceId) {
        m.sessionId = targetId;
        movedMessages++;
      }
    });
    runs.forEach(r => {
      if (r.sessionId === sourceId) {
        r.sessionId = targetId;
      }
    });
    const idx = sessions.findIndex(s => s.id === sourceId);
    if (idx >= 0) sessions.splice(idx, 1);
    return { movedMessages };
  }
};
