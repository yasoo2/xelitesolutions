/**
 * The terminal is wired to the session, streams during the build, and never
 * steals the screen.
 *
 * Asked «هل الترمنال مشبوك بشكل صحيح وهل يستخدمه النظام خلال البناء وهل يفتح
 * تلقائيًا؟», the honest answer was: no, only after the fact, and it opened at
 * the worst possible moment. Three defects, each pinned here:
 *
 *   1. WRONG ADDRESS. Build echoes went to the ids 'local'/'default'/
 *      'panel-terminal' — the terminal panel listens on the SESSION id, so
 *      during a real session none of those lines ever arrived. Broadcasting to
 *      "multiple common IDs to ensure visibility" ensured invisibility.
 *   2. PAST-TENSE STREAMING. ToolService flushed a tool's logs after it
 *      returned, under a comment saying "Real-time". A page build meant
 *      minutes of silence, then a flood narrating the work in the past.
 *   3. TAB THEFT. The frontend switched to the Terminal tab on EVERY
 *      terminal_output — and the closing flood lands right after
 *      preview_ready, yanking the user away from the page they just built.
 */

import fs from 'fs';
import path from 'path';

const BUILDER = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'), 'utf-8');
const TOOLSVC = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'services', 'ToolService.ts'), 'utf-8');
const JOE = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'web', 'src', 'pages', 'Joe.tsx'), 'utf-8');

describe('lines reach the terminal the user is actually looking at', () => {
    it('the builder addresses the SESSION id, not only the legacy trio', () => {
        expect(BUILDER).toMatch(/\[String\(sessionId \|\| ''\), 'local', 'default', 'panel-terminal'\]/);
    });

    it('ToolService includes the session id in its flush', () => {
        expect(TOOLSVC).toMatch(/String\(contextSessionId \|\| ''\), 'local', 'default', 'panel-terminal'/);
    });
});

describe('the stream is live, not a post-hoc flood', () => {
    it('the builder broadcasts each log line AT PUSH TIME', () => {
        // logs.push is wrapped: the broadcast happens inside the push override,
        // which runs at the moment the section landed / the image resolved.
        const wrap = BUILDER.indexOf('logs.push = (...lines: string[])');
        expect(wrap).toBeGreaterThan(-1);
        expect(BUILDER.slice(wrap, wrap + 500)).toContain("terminal_output");
    });

    it('a tool that streamed live is not flushed a second time', () => {
        expect(BUILDER).toContain('logsStreamedLive: true');
        expect(TOOLSVC).toMatch(/if \(!\(res as any\)\?\.logsStreamedLive\)/);
    });

    it('nobody claims "real-time" over a post-run flush any more', () => {
        expect(TOOLSVC).not.toContain('Real-time Log Streaming');
        expect(TOOLSVC).toMatch(/this is NOT real-time/);
    });
});

describe('the terminal opens when it should, and only then', () => {
    it('a command tool starting opens the terminal tab', () => {
        expect(JOE).toMatch(/'run_command', 'shell_execute', 'terminal_manager'[\s\S]{0,120}setWorkspaceTab\('terminal'\)/);
    });

    it('raw terminal_output NEVER steals the tab', () => {
        // The old handler: if (msg.type === 'terminal_output') { setWorkspaceTab('terminal') }
        expect(JOE).not.toMatch(/msg\.type === 'terminal_output'\)\s*\{\s*setWorkspaceTab/);
    });
});
