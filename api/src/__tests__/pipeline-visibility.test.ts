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
    /**
     * These five lines used to be hardcoded Arabic, and that is what leaked
     * «⚙️ المرحلة 1/3 — Backend & database» into his English run in English
     * mode. They are still announced — every one of them — but now in the
     * language of the run, so the assertion is that BOTH sentences exist.
     */
    test('each phase is announced, completion and failure alike, in the run\'s language', () => {
        expect(loop).toMatch(/voice\(pick\(isAr,\s*\n\s*`⚙️ المرحلة \$\{/);
        expect(loop).toMatch(/`⚙️ Phase \$\{n\}\/\$\{totalPhases\}/);
        expect(loop).toMatch(/`✅ اكتملت المرحلة/);
        expect(loop).toMatch(/`✅ Phase \$\{n\}\/\$\{totalPhases\} completed and verified`/);
        expect(loop).toMatch(/`⚠️ تعثرت المرحلة/);
        expect(loop).toMatch(/`⚠️ Phase \$\{n\} stumbled/);
        expect(loop).toMatch(/`⛔ لم ينجح الإصلاح الذاتي — أتوقف بصدق/);
        expect(loop).toMatch(/`⛔ Self-healing did not work/);
        expect(loop).toMatch(/`🔧 نجح الإصلاح الذاتي/);
        expect(loop).toMatch(/`🔧 Self-healing worked/);
    });

    test('and the language is the RUN\'s, handed down by the caller — not a default', () => {
        expect(loop).toMatch(/const isAr = isArabicReply\(\{\s*\n\s*language: opts\.language,/);
        expect(pipeTool).toMatch(/language: isAr \? 'ar' : 'en',/);
    });

    test('the voice reaches the phase executor context so per-task progress flows', () => {
        expect(loop).toMatch(/onProgress: voice,\s*onThought: voice/);
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
