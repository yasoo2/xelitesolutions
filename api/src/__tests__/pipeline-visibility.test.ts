/**
 * The visibility audit: tools accepted onProgress/onThought, but the
 * orchestrator never provided them — every progress call was a silent no-op,
 * and a multi-phase project build ran MUTE for minutes. A user watching
 * silence reads it as a freeze. The voice is now wired end to end:
 * orchestrator → tool context → pipeline → phase executor → the same
 * thinking_detail stream the panel already renders.
 */
import fs from 'fs';
import path from 'path';

const orch = fs.readFileSync(
    path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
const loop = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf-8');
const pipeTool = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');

describe('the orchestrator gives every tool a live voice', () => {
    test('executionContext wires onProgress AND onThought to thinking_detail', () => {
        expect(orch).toMatch(/onProgress: \(m: string\) => \{ try \{ broadcastThinkingDetail\(liveSessionId, m\); \}/);
        expect(orch).toMatch(/onThought: \(m: string\) => \{ try \{ broadcastThinkingDetail\(liveSessionId, m\); \}/);
    });

    test('a broken panel can never break the run (voice is try-wrapped)', () => {
        const at = orch.indexOf('onProgress: (m: string) =>');
        expect(orch.slice(at, at + 140)).toMatch(/catch \{/);
    });
});

describe('the canonical pipeline narrates phase by phase', () => {
    test('each phase is announced, completion and failure alike, in Arabic', () => {
        expect(loop).toMatch(/voice\(`⚙️ المرحلة \$\{/);
        expect(loop).toMatch(/voice\(`✅ اكتملت المرحلة/);
        expect(loop).toMatch(/voice\(`⚠️ تعثرت المرحلة/);
        expect(loop).toMatch(/voice\(`⛔ لم ينجح الإصلاح الذاتي — أتوقف بصدق/);
        expect(loop).toMatch(/voice\(`🔧 نجح الإصلاح الذاتي/);
    });

    test('the voice reaches the phase executor context so per-task progress flows', () => {
        expect(loop).toMatch(/onProgress: voice, onThought: voice/);
    });

    test('without a callback the voice falls back to the panel stream directly', () => {
        expect(loop).toMatch(/opts\.onProgress \? opts\.onProgress\(m\) : broadcastThinkingDetail\(sessionId, m\)/);
    });

    test('project_pipeline hands its voice down into the pipeline', () => {
        expect(pipeTool).toMatch(/onProgress: \(m: string\) => say\(m\)/);
    });
});

describe('the frontend actually renders what the voice says', () => {
    test('socket service consumes thinking_detail into the visible details feed', () => {
        const ui = fs.readFileSync(
            path.join(__dirname, '..', '..', '..', 'web', 'src', 'services', 'socket.ts'), 'utf-8');
        expect(ui).toMatch(/msgType === 'thinking_detail'/);
        expect(ui).toMatch(/thinkingDetails\.push\(detail\)/);
    });
});
