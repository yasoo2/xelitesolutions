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

  it('installs a missing npm test runner in the recorded project cwd', () => {
    const projectCwd = path.join(process.cwd(), '..', 'data', 'builds', `self-fix-runner-${Date.now()}`, 'NEXUS', 'backend');
    const ticket = RepairTicketService.build({
      projectName: 'NEXUS',
      phase: { phaseNumber: 2, name: 'Backend Core & Authentication' },
      phaseResult: {
        error: 'sh: 1: jest: not found',
        output: {
          status: 'partial',
          results: [{
            task: 'Backend Core & Authentication',
            tool: 'shell_execute',
            ok: false,
            error: 'sh: 1: jest: not found',
            command: 'npm run test',
            cwd: projectCwd,
          }],
        },
      },
    });

    const plan = SelfFixService.plan(ticket);
    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('dependency_fix');
    expect(plan.suggestedTool).toBe('npm_manager');
    expect(plan.suggestedInput).toMatchObject({
      command: 'install',
      packages: ['jest'],
      dev: true,
      cwd: projectCwd,
    });
    expect(plan.maxAttempts).toBe(1);
  });

  it('installs a missing test preset as an exact project-local dev dependency', () => {
    const projectCwd = path.join(process.cwd(), '..', 'data', 'builds', `self-fix-jest-preset-${Date.now()}`, 'WeatherGo');
    const ticket = RepairTicketService.build({
      projectName: 'WeatherGo',
      phase: { phaseNumber: 4, name: 'Testing and QA' },
      phaseResult: {
        error: 'Validation Error: Preset jest-expo not found.',
        output: {
          status: 'partial',
          results: [{
            task: 'Run unit tests',
            tool: 'shell_execute',
            ok: false,
            error: 'Validation Error: Preset jest-expo not found.',
            command: 'npm run test',
            cwd: projectCwd,
          }],
        },
      },
    });

    const plan = SelfFixService.plan(ticket);
    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('dependency_fix');
    expect(plan.suggestedTool).toBe('npm_manager');
    expect(plan.suggestedInput).toMatchObject({
      command: 'install',
      packages: ['jest-expo'],
      dev: true,
      cwd: projectCwd,
    });
    expect(plan.maxAttempts).toBe(1);
  });

  it('recovers a missing test preset reported by auto_tester', () => {
    const projectCwd = path.join(process.cwd(), '..', 'data', 'builds', `self-fix-auto-tester-preset-${Date.now()}`, 'WeatherGo');
    const ticket = RepairTicketService.build({
      projectName: 'WeatherGo',
      phase: { phaseNumber: 8, name: 'Testing and QA' },
      phaseResult: {
        error: 'Validation Error: Preset jest-expo not found.',
        output: {
          status: 'partial',
          results: [{
            task: 'Run tests',
            tool: 'auto_tester',
            ok: false,
            error: 'Validation Error: Preset jest-expo not found.',
            cwd: projectCwd,
          }],
        },
      },
    });

    const plan = SelfFixService.plan(ticket);
    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('dependency_fix');
    expect(plan.suggestedTool).toBe('npm_manager');
    expect(plan.suggestedInput).toMatchObject({
      command: 'install',
      packages: ['jest-expo'],
      dev: true,
      cwd: projectCwd,
    });
  });

  it('installs a missing test preset from a module-resolution error', () => {
    const projectCwd = path.join(process.cwd(), '..', 'data', 'builds', `self-fix-jest-module-${Date.now()}`, 'WeatherGo');
    const ticket = RepairTicketService.build({
      projectName: 'WeatherGo',
      phase: { phaseNumber: 4, name: 'Testing and QA' },
      phaseResult: {
        error: "Cannot find module 'jest-expo' from 'jest.config.js'",
        output: {
          status: 'partial',
          results: [{
            task: 'Run unit tests',
            tool: 'shell_execute',
            ok: false,
            error: "Cannot find module 'jest-expo' from 'jest.config.js'",
            command: 'npm run test',
            cwd: projectCwd,
          }],
        },
      },
    });

    const plan = SelfFixService.plan(ticket);
    expect(plan.suggestedTool).toBe('npm_manager');
    expect(plan.suggestedInput).toMatchObject({ packages: ['jest-expo'], dev: true, cwd: projectCwd });
  });

  it('does not treat a missing non-npm runner as an npm dependency', () => {
    const ticket = RepairTicketService.build({
      phase: { phaseNumber: 2, name: 'Backend Core & Authentication' },
      phaseResult: {
        error: 'pytest: command not found',
        output: {
          status: 'partial',
          results: [{
            task: 'Backend Core & Authentication',
            tool: 'shell_execute',
            ok: false,
            error: 'pytest: command not found',
            command: 'pytest -q',
            cwd: path.join(process.cwd(), '..', 'data', 'builds', `self-fix-python-${Date.now()}`),
          }],
        },
      },
    });

    const plan = SelfFixService.plan(ticket);
    expect(plan.suggestedTool).not.toBe('npm_manager');
  });
});


  it('stops honestly on a native addon toolchain failure instead of retrying npm install', () => {
    const projectCwd = path.join(process.cwd(), '..', 'data', 'builds', `self-fix-native-${Date.now()}`, 'NEXUS', 'backend');
    const ticket = RepairTicketService.build({
      projectName: 'NEXUS',
      phase: { phaseNumber: 1, name: 'Backend data layer' },
      phaseResult: {
        error: 'npm ERR! code 1\nnode-gyp ERR! build error\nC++ compiler not found while building better-sqlite3',
        output: {
          status: 'partial',
          results: [{
            task: 'Install database dependency',
            tool: 'shell_execute',
            ok: false,
            error: 'npm ERR! code 1\nnode-gyp ERR! build error\nC++ compiler not found while building better-sqlite3',
            command: 'npm install better-sqlite3',
            cwd: projectCwd,
          }],
        },
      },
    });

    const plan = SelfFixService.plan(ticket);
    expect(plan.allowed).toBe(false);
    expect(plan.strategy).toBe('manual_review');
    expect(plan.suggestedTool).toBeUndefined();
    expect(String(plan.reason)).toMatch(/native dependency/i);
    expect(String(plan.reason)).toMatch(/node:sqlite|JSON\/file/i);
  });


describe('self-fix npm registry recovery', () => {
  it('routes an ETARGET failure to npm_manager with the recorded project cwd and package evidence', () => {
    const projectCwd = path.join(process.cwd(), '..', 'data', 'builds', `self-fix-etarget-${Date.now()}`, 'TaskFlow AI');
    const ticket = RepairTicketService.build({
      projectName: 'TaskFlow AI',
      phase: { phaseNumber: 1, name: 'Project Setup' },
      phaseResult: {
        error: 'npm error code ETARGET\nnpm error notarget No matching version found for @prisma/client@^4.18.0.',
        output: {
          status: 'partial',
          results: [{
            task: 'Install project dependencies',
            tool: 'shell_execute',
            ok: false,
            error: 'npm error code ETARGET\nnpm error notarget No matching version found for @prisma/client@^4.18.0.',
            command: 'npm install',
            cwd: projectCwd,
          }],
        },
      },
    });

    const plan = SelfFixService.plan(ticket);
    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('dependency_fix');
    expect(plan.suggestedTool).toBe('npm_manager');
    expect(plan.suggestedInput).toMatchObject({
      command: 'install',
      cwd: projectCwd,
    });
    expect(plan.suggestedInput).not.toHaveProperty('packages');
    expect(String(plan.reason)).toMatch(/ETARGET|published stable versions/i);
  });

  it('preserves explicit package specifiers when ETARGET came from a direct npm command', () => {
    const projectCwd = path.join(process.cwd(), '..', 'data', 'builds', `self-fix-etarget-explicit-${Date.now()}`);
    const ticket = RepairTicketService.build({
      phase: { phaseNumber: 1, name: 'Project Setup' },
      phaseResult: {
        error: 'No matching version found for left-pad@^99.99.99.',
        output: {
          status: 'partial',
          results: [{
            task: 'Install dependency',
            tool: 'shell_execute',
            ok: false,
            error: 'npm error code ETARGET\nNo matching version found for left-pad@^99.99.99.',
            command: 'npm install left-pad@^99.99.99',
            cwd: projectCwd,
          }],
        },
      },
    });

    const plan = SelfFixService.plan(ticket);
    expect(plan.suggestedTool).toBe('npm_manager');
    expect(plan.suggestedInput).toMatchObject({
      command: 'install',
      packages: ['left-pad@^99.99.99'],
      cwd: projectCwd,
    });
  });
});
