"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.store = void 0;
const runs = [];
const execs = [];
const artifacts = [];
const approvals = [];
const sessions = [];
const messages = [];
function nextId(prefix, n) {
    return `${prefix}${n}`;
}
exports.store = {
    createRun(sessionId) {
        const id = nextId('run_', runs.length + 1);
        const run = { id, sessionId, status: 'running', steps: [] };
        runs.push(run);
        return run;
    },
    updateRun(id, patch) {
        const r = runs.find(x => x.id === id);
        if (r)
            Object.assign(r, patch);
        return r;
    },
    addStep(runId, name, status, why) {
        const r = runs.find(x => x.id === runId);
        if (!r)
            return;
        r.steps.push({ name, status, why });
    },
    addExec(runId, name, input, output, ok, logs) {
        const id = nextId('exec_', execs.length + 1);
        const e = { id, runId, name, input, output, ok, logs };
        execs.push(e);
        return e;
    },
    addArtifact(runId, name, href) {
        const id = nextId('art_', artifacts.length + 1);
        const a = { id, runId, name, href };
        artifacts.push(a);
        return a;
    },
    createApproval(runId, action, risk, planName, planInput) {
        const id = nextId('appr_', approvals.length + 1);
        const ap = { id, runId, action, risk, status: 'pending', planName, planInput };
        approvals.push(ap);
        return ap;
    },
    updateApproval(id, patch) {
        const a = approvals.find(x => x.id === id);
        if (a)
            Object.assign(a, patch);
        return a;
    },
    getApproval(id) {
        return approvals.find(x => x.id === id) || null;
    },
    listRuns() { return runs; },
    listExecs(runId) { return execs.filter(e => !runId || e.runId === runId); },
    listArtifacts(runId) { return artifacts.filter(a => !runId || a.runId === runId); },
    createSession(title, mode = 'ADVISOR') {
        const id = nextId('sess_', sessions.length + 1);
        const s = { id, title, mode };
        sessions.push(s);
        return s;
    },
    listSessions() { return sessions; },
    addMessage(sessionId, role, content) {
        const id = nextId('msg_', messages.length + 1);
        const m = { id, sessionId, role, content, ts: Date.now() };
        messages.push(m);
        return m;
    },
    listMessages(sessionId) {
        return messages.filter(m => m.sessionId === sessionId);
    }
};
