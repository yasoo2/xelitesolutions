import fs from 'fs';
import path from 'path';
import { RepairTicketService } from '../modules/services/RepairTicketService';
import { SelfFixService } from '../modules/services/SelfFixService';

describe('self-fix launcher recovery', () => {
  const root = path.join(process.cwd(), '..', 'data', 'builds', `self-fix-launcher-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      scripts: {
        start: 'node server.js',
        build: 'tsc --noEmit',
      },
    }), 'utf8');
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('preserves shell evidence and selects the manifest launcher instead of repeating npm run server', () => {
    const ticket = RepairTicketService.build({
      projectName: 'NEXUS',
      phase: { phaseNumber: 1, name: 'Start Joe System' },
      phaseResult: {
        error: 'npm error Missing script: "server"',
        output: {
          status: 'partial',
          results: [{
            task: 'Start Joe System',
            tool: 'shell_execute',
            ok: false,
            error: 'npm error Missing script: "server"',
            command: 'npm run server',
            cwd: root,
            background: true,
          }],
        },
      },
    });

    expect(ticket.failedTasks[0]).toMatchObject({
      command: 'npm run server',
      cwd: root,
      background: true,
    });

    const plan = SelfFixService.plan(ticket);
    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('launcher_fix');
    expect(plan.suggestedTool).toBe('shell_execute');
    expect(plan.suggestedInput).toMatchObject({
      command: 'npm run start',
      cwd: root,
      background: true,
    });
    expect(String(plan.reason)).toMatch(/package evidence/i);
  });

  it('does not invent a launcher when the manifest has no safe start-like script', () => {
    const noLauncher = path.join(process.cwd(), '..', 'data', 'builds', `self-fix-no-launcher-${Date.now()}`);
    fs.mkdirSync(noLauncher, { recursive: true });
    fs.writeFileSync(path.join(noLauncher, 'package.json'), JSON.stringify({
      scripts: { build: 'tsc --noEmit' },
    }), 'utf8');

    const ticket = RepairTicketService.build({
      phase: { phaseNumber: 1, name: 'Start Joe System' },
      phaseResult: {
        error: 'npm error Missing script: "server"',
        output: {
          status: 'partial',
          results: [{
            task: 'Start Joe System',
            tool: 'shell_execute',
            ok: false,
            error: 'npm error Missing script: "server"',
            command: 'npm run server',
            cwd: noLauncher,
          }],
        },
      },
    });

    const plan = SelfFixService.plan(ticket);
    expect(plan.strategy).not.toBe('launcher_fix');
    expect(plan.allowed).toBe(true);
  });
});
