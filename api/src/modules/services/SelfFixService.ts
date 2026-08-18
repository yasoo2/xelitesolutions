import type { RepairTicket } from './RepairTicketService';
import fs from 'fs';
import path from 'path';
import { repairMemory } from '../../core/memory/repair-memory';
import { recoverMissingNpmLauncher } from '../tools/npm-launcher-recovery';

export interface SelfFixPlan {
  type: 'self_fix_plan';
  allowed: boolean;
  reason: string;
  maxAttempts: number;
  strategy: 'missing_file_fix' | 'dependency_fix' | 'launcher_fix' | 'build_fix' | 'code_fix' | 'permission_stop' | 'manual_review';
  suggestedTool?: string;
  suggestedInput?: Record<string, unknown>;
  /** A cure proven on this same error class in a past run — context, not a script. */
  rememberedCure?: string;
  safety: {
    requiresTrustedContext: boolean;
    runOnlyOnce: boolean;
    mustReRunFailedPhase: boolean;
    stopOnSecondFailure: boolean;
  };
  sourceTicket: RepairTicket;
}

function rawTextOf(ticket: RepairTicket) {
  return `${ticket.status}\n${ticket.primaryError}\n${ticket.failedTasks.map(t => `${t.task}\n${t.tool}: ${t.error}${t.command ? `\ncommand: ${t.command}` : ''}${t.cwd ? `\ncwd: ${t.cwd}` : ''}${t.file ? `\nfile: ${t.file}` : ''}${t.find ? `\nfind: ${t.find}` : ''}${t.replace !== undefined ? `\nreplace: ${t.replace}` : ''}`).join('\n')}`;
}

function extractFailedEdit(ticket: RepairTicket) {
  const failed = ticket.failedTasks.find(task =>
    ['file_edit', 'file_edit_advanced'].includes(task.tool)
    && typeof task.file === 'string'
    && typeof task.find === 'string'
    && task.find.length > 0
    && typeof task.replace === 'string'
  );
  if (!failed) return null;
  return { file: failed.file!, find: failed.find!, replace: failed.replace ?? '' };
}

function textOf(ticket: RepairTicket) {
  return rawTextOf(ticket).toLowerCase();
}

interface NpmInvalidVersionEvidence {
  packageName: string;
  requestedSpec: string;
  cwd: string;
  explicitSpecifier: boolean;
}

interface UndeclaredRuntimePackageEvidence {
  file: string;
  packages: string[];
  cwd: string;
}

function extractUndeclaredRuntimePackageEvidence(ticket: RepairTicket): UndeclaredRuntimePackageEvidence | null {
  const raw = rawTextOf(ticket);
  // The orchestrator may truncate the prose that follows the package list.
  // Stop at a sentence boundary, but keep dots that are part of a valid npm
  // package name (for example, `@scope/pkg.name`). This prevents words from
  // the repair guidance (such as `explicitly`) from becoming install targets.
  const match = raw.match(/runtime_contract_mismatch:\s*([^\s]+)\s+imports undeclared (?:packages?|package\(s\)):\s*([\s\S]*?)(?=(?:[.;]\s+(?:[A-Z]|Update\b)|\n|$))/i);
  if (!match?.[1] || !match[2]) return null;

  const file = match[1].trim().replace(/\\/g, '/');
  const packages = [...match[2].matchAll(/(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)/giu)]
    .map(item => item[0].replace(/[.,;:)}\]]+$/u, ''))
    .filter((name, index, all) => isSafeNpmPackageName(name) && all.indexOf(name) === index);
  if (!packages.length) return null;

  const failed = ticket.failedTasks.find(task => /runtime_contract_mismatch/i.test(`${task.error || ''}\n${task.file || ''}`));
  const fileRoot = file.match(/^(.+?)\/src\//i)?.[1];
  const cwd = fileRoot || failed?.cwd || '.';
  return { file, packages, cwd };
}

function extractNpmInvalidVersionEvidence(ticket: RepairTicket): NpmInvalidVersionEvidence | null {
  const raw = rawTextOf(ticket);
  if (!/(?:ETARGET|notarget|No matching version|No match found for version)/i.test(raw)) return null;
  const match = raw.match(/No matching version found for\s+((?:@[^/\s]+\/[^@\s]+|[^@\s]+))@([^\s]+)/i);
  if (!match?.[1] || !match[2]) return null;
  const packageName = match[1].trim();
  const requestedSpec = match[2].trim().replace(/[.,;:)\]}]+$/u, '');
  if (!/^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/i.test(packageName) || !requestedSpec) return null;
  const failed = ticket.failedTasks.find(task => /(?:ETARGET|notarget|No matching version)/i.test(`${task.error}\n${task.command || ''}`));
  const token = `${packageName}@${requestedSpec}`;
  return {
    packageName,
    requestedSpec,
    cwd: failed?.cwd || '.',
    explicitSpecifier: !!failed?.command?.split(/\s+/u).includes(token),
  };
}

function extractArtifactValidationFailure(ticket: RepairTicket) {
  const failed = ticket.failedTasks.find(task => {
    if (!task.file) return false;
    const evidence = `${task.error || ''}\n${ticket.primaryError || ''}`;
    return /artifact_(?:type_mismatch|validation_failed)|source_syntax_mismatch|incomplete markdown fence|not valid json|python source markers|node\.js source markers/i.test(evidence);
  });
  if (!failed?.file) return null;
  return {
    file: failed.file,
    error: failed.error || ticket.primaryError,
    task: failed.task,
    description: typeof failed.description === 'string' ? failed.description : undefined,
    artifactContext: typeof failed.artifactContext === 'string' ? failed.artifactContext : undefined,
  };
}

interface LocalRuntimeImportEvidence {
  importer: string;
  specifier: string;
}

/**
 * When launchability proves an explicit local asset is missing, repair that
 * exact target instead of asking a source-file author to guess a path change.
 * This is deliberately narrow: only absolute importers, explicit extensions,
 * and a target that is absent on disk qualify. Extensionless module imports
 * still go through the importer repair path below because choosing .js/.jsx or
 * .ts/.tsx without evidence would be guesswork.
 */
function missingExplicitLocalTarget(entry: LocalRuntimeImportEvidence): string | null {
  const importer = entry.importer.replace(/\\\\/g, '/');
  const specifier = entry.specifier.split(/[?#]/u, 1)[0].trim();
  const extension = path.extname(specifier).toLowerCase();
  if (!path.isAbsolute(importer) || !specifier.startsWith('.') || !extension) return null;
  const target = path.resolve(path.dirname(importer), specifier);
  if (fs.existsSync(target)) return null;
  return target.replace(/\\\\/g, '/');
}

interface LocalImportRedirectEvidence {
  importer: string;
  find: string;
  replace: string;
  target: string;
}

/**
 * Resolve a broken explicit local import only when the filesystem provides a
 * single, deterministic parent-layout correction. This handles a common
 * generated-source defect such as `src/components/WeatherApp.jsx` importing
 * `./styles/app.css` while the generated project contains `src/styles/app.css`.
 * It never creates a placeholder and never asks a model to invent a path.
 */
function findEvidenceBackedLocalImportRedirect(entry: LocalRuntimeImportEvidence): LocalImportRedirectEvidence | null {
  const importer = entry.importer.replace(/\\/g, '/');
  const specifier = entry.specifier.split(/[?#]/u, 1)[0].trim();
  const extension = path.extname(specifier).toLowerCase();
  if (!path.isAbsolute(importer) || !specifier.startsWith('.') || !extension) return null;

  const importerPath = path.resolve(importer);
  const directTarget = path.resolve(path.dirname(importerPath), specifier);
  if (fs.existsSync(directTarget)) return null;

  // Only search within the generated project root inferred from `/src/`.
  // Without that boundary, a repair could accidentally point outside the
  // artifact or into a neighbouring workspace project.
  const marker = `${path.sep}src${path.sep}`;
  const markerIndex = importerPath.toLowerCase().indexOf(marker.toLowerCase());
  if (markerIndex < 0) return null;
  const projectRoot = importerPath.slice(0, markerIndex);
  const rootPrefix = projectRoot.endsWith(path.sep) ? projectRoot : `${projectRoot}${path.sep}`;

  // Move the same explicit suffix up at most four directory levels. The first
  // existing file wins because it is the nearest measured correction; all
  // candidates remain inside this project root.
  for (let levels = 1; levels <= 4; levels += 1) {
    const candidate = path.resolve(
      path.dirname(importerPath),
      ...Array.from({ length: levels }, () => '..'),
      specifier,
    );
    if (candidate === directTarget || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    if (!candidate.startsWith(rootPrefix)) continue;

    let replacement = path.relative(path.dirname(importerPath), candidate).replace(/\\/g, '/');
    if (!replacement.startsWith('.')) replacement = `./${replacement}`;
    return { importer, find: entry.specifier, replace: replacement, target: candidate.replace(/\\/g, '/') };
  }

  return null;
}

function extractLocalRuntimeImportEvidence(ticket: RepairTicket): LocalRuntimeImportEvidence[] {
  const raw = rawTextOf(ticket);
  const evidence: LocalRuntimeImportEvidence[] = [];

  // project_run emits a compact launchability marker with `importer -> specifier`.
  const launchabilityMarker = raw.match(/local\s+runtime\s+imports\s+missing\s*\(([^)]*)\)/i)
    || raw.match(/missing\s+local\s+runtime\s+imports\s*[:\s]+([^\n]+)/i);
  if (launchabilityMarker?.[1]) {
    for (const item of launchabilityMarker[1].split(';')) {
      const match = item.trim().match(/^(.+?)\s*->\s*(\.[^\s,;]+)/u);
      if (!match?.[1] || !match[2]) continue;
      const importer = match[1].trim().replace(/\\\\/g, '/');
      const specifier = match[2].trim();
      if (!importer || !specifier.startsWith('.')) continue;
      if (!evidence.some(entry => entry.importer === importer && entry.specifier === specifier)) {
        evidence.push({ importer, specifier });
      }
    }
  }

  // ai_write_file performs an earlier import preflight and emits one importer
  // followed by one or more quoted relative specifiers. Preserve that evidence
  // instead of collapsing the failure to generic `domain_generation_failed`.
  const generationMarker = raw.match(/unresolved_local_import:\s*(.+?)\s+imports\s+(.+?),\s+but\s+no\s+file\s+resolves/i);
  if (generationMarker?.[1] && generationMarker[2]) {
    const importer = generationMarker[1].trim().replace(/\\\\/g, '/');
    for (const quoted of generationMarker[2].matchAll(/["'](\.[^"']+)["']/gu)) {
      const specifier = quoted[1].trim();
      if (!importer || !specifier.startsWith('.')) continue;
      if (!evidence.some(entry => entry.importer === importer && entry.specifier === specifier)) {
        evidence.push({ importer, specifier });
      }
    }
  }

  return evidence.slice(0, 24);
}

function extractMissingFilename(ticket: RepairTicket, text: string): string | null {
  const candidates = [
    ...ticket.failedTasks.map(t => `${t.task}\n${t.error}`),
    ticket.primaryError,
    text,
  ];

  for (const raw of candidates) {
    const value = String(raw || '');
    const quotedTxt = value.match(/['"]([^'"]+\.(?:txt|json|ts|tsx|js|jsx|md|css|html|env))['"]/i);
    if (quotedTxt?.[1]) return quotedTxt[1];

    const enoent = value.match(/ENOENT[^\n]*['"]([^'"]+)['"]/i);
    if (enoent?.[1]) return enoent[1];

    const explicitMissing = value.match(/missing\s+(?:file|asset|config)[:\s]+([A-Za-z0-9._\-/]+\.[A-Za-z0-9]+)/i);
    if (explicitMissing?.[1]) return explicitMissing[1];
  }

  return null;
}

interface EvidenceBoundRepairTarget {
  path: string;
  cwd?: string;
}

/**
 * Select a repair target only from execution evidence preserved in the ticket.
 * A generic source file is never a safe target for an unrelated failed task:
 * writing src/index.ts can silently mutate the workspace root while the failed
 * artifact lives in a generated child project. If no file is evidenced, the
 * caller must stop instead of guessing.
 */
function extractEvidenceBoundRepairTarget(ticket: RepairTicket): EvidenceBoundRepairTarget | null {
  const fileTask = ticket.failedTasks.find(task => typeof task.file === 'string' && task.file.trim().length > 0);
  if (fileTask?.file) return { path: fileTask.file, cwd: fileTask.cwd };

  const candidates = [
    ...ticket.failedTasks.map(task => task.error),
    ticket.primaryError,
  ];
  const sourceFilePattern = /(?:^|[\s'"`(])((?:[A-Za-z]:[\\/]|\/|\.\.?[\\/]|[A-Za-z0-9_.-]+[\\/])[^\s'"`):,)]*\.(?:[cm]?[jt]sx?|json|css|html|md|ya?ml|env))(?=$|[\s'"`):,])/i;
  const bareFilePattern = /(?:^|[\s'"`(])([A-Za-z0-9_.-]+\.(?:[cm]?[jt]sx?|json|css|html|md|ya?ml|env))(?=$|[\s'"`):,])/i;

  for (const candidate of candidates) {
    const value = String(candidate || '');
    const match = value.match(sourceFilePattern) || value.match(bareFilePattern);
    if (match?.[1]) {
      const path = match[1].replace(/\\/g, '/');
      const task = ticket.failedTasks.find(item => String(item.error || '').includes(match[1])) || fileTask;
      return { path, cwd: task?.cwd };
    }
  }

  return null;
}

function extractMissingLauncher(ticket: RepairTicket) {
  const failed = ticket.failedTasks.find(task =>
    task.tool === 'shell_execute'
    && typeof task.command === 'string'
    && /missing script/i.test(`${task.error} ${ticket.primaryError}`)
    && /^npm\s+run\s+[A-Za-z0-9:_-]+(?:\s|$)/i.test(task.command)
  );
  if (!failed?.command) return null;
  return recoverMissingNpmLauncher(
    failed.command,
    failed.task,
    failed.cwd || '.',
    ticket.context.workspaceId,
    failed.background,
  );
}

function hasNativeAddonBuildFailure(ticket: RepairTicket) {
  const evidence = rawTextOf(ticket);
  return /(?:node-gyp|prebuild-install|binding\.gyp|gyp ERR!|C\+\+\s+(?:compiler|build)|MSBuild|make(?:\.exe)?\s+failed|native addon|better-sqlite3|sqlite3|node-sass|sharp|canvas|ffi-napi)/i.test(evidence)
    && /(?:build|compile|install|prebuild|gyp|compiler|MSBuild|make|not found|failed|error)/i.test(evidence);
}

function extractMissingNpmRunner(ticket: RepairTicket) {
  const npmRunners = new Set(['jest', 'vitest', 'mocha', 'ava', 'tap']);
  for (const failed of ticket.failedTasks) {
    const evidence = `${failed.error || ''}\n${ticket.primaryError || ''}`;
    if (failed.tool !== 'shell_execute' || !failed.cwd) continue;
    if (!/(?:not found|command not found|cannot find module|is not recognized)/i.test(evidence)) continue;
    const match = evidence.match(/(?:^|[\s'\"/])((?:jest|vitest|mocha|ava|tap))(?:$|[\s:'\"/])/im);
    const runner = match?.[1]?.toLowerCase();
    if (!runner || !npmRunners.has(runner)) continue;
    return { runner, cwd: failed.cwd, task: failed.task };
  }
  return null;
}

interface MissingNpmTestDependencyEvidence {
  packageName: string;
  cwd: string;
  task: string;
}

function isSafeNpmPackageName(value: string): boolean {
  const packageName = value.trim();
  return /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/i.test(packageName)
    && !packageName.startsWith('.')
    && !packageName.startsWith('node:');
}

function extractMissingNpmTestDependency(ticket: RepairTicket): MissingNpmTestDependencyEvidence | null {
  for (const failed of ticket.failedTasks) {
    const evidence = `${failed.error || ''}\n${ticket.primaryError || ''}`;
    const command = String(failed.command || '');
    const task = String(failed.task || '');
    if (!['shell_execute', 'auto_tester'].includes(String(failed.tool)) || !failed.cwd) continue;
    if (!/(?:npm\s+(?:run\s+)?(?:test|unit|integration)|(?:jest|vitest|mocha|ava|tap)|test|preset|test\s+(?:environment|runner))/i.test(`${task}\n${command}\n${evidence}`)) continue;

    const moduleMatch = evidence.match(/(?:cannot\s+find\s+module|module\s+not\s+found|can't\s+resolve)\s*['\"]([^'\"]+)['\"]/i);
    const presetMatch = evidence.match(/(?:preset|test\s+environment|test\s+runner)\s+['\"]?((?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*)['\"]?\s+(?:is\s+)?(?:not\s+found|could\s+not\s+be\s+found)/i);
    const packageName = String(moduleMatch?.[1] || presetMatch?.[1] || '').trim();
    if (!packageName || !isSafeNpmPackageName(packageName)) continue;
    // Only install an exact package proven by a test failure. Relative imports,
    // Node built-ins, and arbitrary prose never reach npm_manager.
    if (!/^(?:jest(?:[-./]|$)|vitest(?:[-./]|$)|mocha(?:[-./]|$)|ava(?:[-./]|$)|tap(?:[-./]|$)|@testing-library\/|@types\/jest(?:[-./]|$))/i.test(packageName)) continue;
    return { packageName, cwd: failed.cwd, task: failed.task };
  }
  return null;
}

function extractEslintConfigFailure(ticket: RepairTicket) {
  const raw = rawTextOf(ticket);
  const isEslintConfigFailure = /eslint/i.test(raw)
    && /(?:couldn['’]t find a configuration file|could not find (?:an )?eslint configuration|failed to read (?:json )?file|cannot read config file|not valid json|unexpected token[^\n]*import)/i.test(raw);
  if (!isEslintConfigFailure) return null;

  const configMatch = raw.match(/(?:file at|config(?:uration)? file[:\s]+)\s*([A-Za-z0-9_./\\-]*\.eslintrc(?:\.json)?|eslint\.config\.[cm]?js)/i);
  const lintTask = ticket.failedTasks.find(task =>
    task.tool === 'shell_execute' && /(?:eslint|npm\s+run\s+lint|\blint\b)/i.test(`${task.command || ''}\n${task.error || ''}`),
  );
  const rawConfigPath = configMatch?.[1]?.replace(/\\/g, '/');
  const cwd = lintTask?.cwd?.replace(/\\/g, '/').replace(/\/$/, '');
  const configPath = rawConfigPath && cwd && rawConfigPath.startsWith(`${cwd}/`)
    ? rawConfigPath.slice(cwd.length + 1)
    : rawConfigPath && !rawConfigPath.startsWith('/') && !/^[A-Za-z]:\//i.test(rawConfigPath)
      ? rawConfigPath
      : '.eslintrc.json';

  return {
    configPath: configPath || '.eslintrc.json',
    cwd: lintTask?.cwd || undefined,
    command: lintTask?.command || undefined,
    error: ticket.primaryError,
  };
}

function extractBuildContext(ticket: RepairTicket) {
  const raw = rawTextOf(ticket);
  const tsStyle = raw.match(/([A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\):\s*error\s*(TS\d+)?[:\s]+([^\n]+)/i);
  if (tsStyle) {
    const sourceLine = extractSourceLineAfter(raw, tsStyle.index || 0);
    return {
      file: tsStyle[1].replace(/\\/g, '/'),
      line: Number(tsStyle[2]),
      column: Number(tsStyle[3]),
      code: tsStyle[4] || undefined,
      message: tsStyle[5]?.trim(),
      sourceLine,
    };
  }

  const viteStyle = raw.match(/([A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx)):(\d+):(\d+)[:\s]+([^\n]+)/i);
  if (viteStyle) {
    const sourceLine = extractSourceLineAfter(raw, viteStyle.index || 0);
    return {
      file: viteStyle[1].replace(/\\/g, '/'),
      line: Number(viteStyle[2]),
      column: Number(viteStyle[3]),
      message: viteStyle[4]?.trim(),
      sourceLine,
    };
  }

  const genericFile = raw.match(/([A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx|json|css|html))/i);
  if (genericFile) {
    return {
      file: genericFile[1].replace(/\\/g, '/'),
      message: ticket.primaryError,
    };
  }

  return null;
}

function extractSourceLineAfter(raw: string, matchIndex: number) {
  const tail = raw.slice(matchIndex).split(/\r?\n/).slice(1, 6);
  for (const line of tail) {
    const candidate = String(line || '').trim();
    if (!candidate) continue;
    if (/^\^+|^~+/.test(candidate)) continue;
    if (/error\s+TS\d+|^\s*at\s+/i.test(candidate)) continue;
    if (candidate.includes('=') || /^return\s+/.test(candidate)) return candidate;
  }
  return undefined;
}

function buildTargetedTypeScriptEdit(buildContext: any) {
  if (!buildContext?.file || !buildContext?.sourceLine) return null;
  const code = String(buildContext.code || '');
  const message = String(buildContext.message || '');
  const sourceLine = String(buildContext.sourceLine || '').trim();

  if (code === 'TS2322' && /type 'string' is not assignable to type 'number'/i.test(message)) {
    const replace = sourceLine.replace(/=\s*['"](-?\d+(?:\.\d+)?)['"](\s*[;,]?)/, '= $1$2');
    if (replace !== sourceLine) {
      return {
        filename: buildContext.file,
        find: sourceLine,
        replace,
      };
    }
  }

  if (code === 'TS2322' && /type 'number' is not assignable to type 'string'/i.test(message)) {
    const replace = sourceLine.replace(/=\s*(-?\d+(?:\.\d+)?)(\s*[;,]?)/, '= "$1"$2');
    if (replace !== sourceLine) {
      return {
        filename: buildContext.file,
        find: sourceLine,
        replace,
      };
    }
  }

  if (code === 'TS2304' && /cannot find name/i.test(message)) {
    const missingName = message.match(/cannot find name ['"]?([A-Za-z_$][\w$]*)['"]?/i)?.[1];
    if (missingName) {
      const returnMatch = sourceLine.match(/^(\s*)return\s+([A-Za-z_$][\w$]*)(\s*[;,]?)$/);
      if (returnMatch && returnMatch[2] === missingName) {
        const indent = returnMatch[1] || '';
        return {
          filename: buildContext.file,
          find: sourceLine,
          replace: `${indent}const ${missingName} = 42;\n${sourceLine}`,
        };
      }
    }
  }

  return null;
}

export class SelfFixService {
  static plan(ticket: RepairTicket): SelfFixPlan {
    const text = textOf(ticket);

    if (ticket.severity === 'critical') {
      return this.stop(ticket, 'Critical/security-related issue requires explicit review before repair.', 'permission_stop');
    }

    // Scar tissue: a cure proven on this same error class in a past run.
    // The deterministic rules below stay in charge — they extract the CURRENT
    // filenames and lines — but the remembered cure rides along as context,
    // and it rescues the one case the rules abandon: no rule matched, yet the
    // disease is one Joe already beat.
    // The recall key is primaryError ALONE — the exact shape recording uses
    // (here on rerun success, and in the orchestrator where the node's raw
    // error becomes the ticket's primaryError). Keying on rawTextOf prefixed
    // the phase STATUS («failed …») and the signatures never met; appending
    // failedTasks[0].error doubled the text with the same effect.
    const remembered = (() => {
      try {
        const errKey = String(ticket.primaryError || '').trim();
        return errKey ? repairMemory.recallRepair(errKey) : null;
      } catch { return null; }
    })();
    const cureNote = remembered
      ? `A cure proven ${remembered.wins}x on this same error class: ${remembered.repair}`
      : '';

    const launcher = extractMissingLauncher(ticket);
    if (launcher) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `The requested npm launcher is absent; package evidence selects npm run ${launcher.script} from ${launcher.manifest}.`,
        maxAttempts: 1,
        strategy: 'launcher_fix',
        suggestedTool: 'shell_execute',
        suggestedInput: {
          command: launcher.command,
          cwd: launcher.cwd,
          background: launcher.background,
          timeout: 600000,
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    // A runtime contract mismatch is dependency evidence, not a malformed
    // artifact. Classify it before the generic artifact/code repair branch so
    // recovery installs the evidenced package in the evidenced project root.
    const undeclaredRuntimePackage = extractUndeclaredRuntimePackageEvidence(ticket);
    if (undeclaredRuntimePackage) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `The generated file ${undeclaredRuntimePackage.file} imports undeclared runtime package(s): ${undeclaredRuntimePackage.packages.join(', ')}. Install only those evidenced packages in the project cwd, then rerun the failed phase.`,
        maxAttempts: 1,
        strategy: 'dependency_fix',
        suggestedTool: 'npm_manager',
        suggestedInput: {
          command: 'install',
          packages: undeclaredRuntimePackage.packages,
          cwd: undeclaredRuntimePackage.cwd,
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    const artifactValidationFailure = extractArtifactValidationFailure(ticket);
    if (artifactValidationFailure) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `Artifact validation rejected ${artifactValidationFailure.file}; regenerate that exact file in the language and format required by its extension, then rerun the failed phase.`,
        maxAttempts: 1,
        strategy: 'code_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          path: artifactValidationFailure.file,
          description: [
            `Repair only ${artifactValidationFailure.file}; do not redirect the fix to another file.`,
            'The previous content was rejected before it was written because it violated the destination artifact contract.',
            'Inspect the surrounding project files and preserve the requested behavior, but return a complete valid artifact for this exact extension.',
            'For .json, return strict parseable JSON with no Markdown fences or explanatory prose. For .js/.jsx/.mjs/.cjs use JavaScript only (CommonJS require/module.exports or ECMAScript imports); for .ts/.tsx use TypeScript. Never emit Python markers such as from ... import, def, elif, @app.route, None, True, False, Flask, Django, or Python indentation blocks.',
            `Observed validator error: ${artifactValidationFailure.error}`,
            'For source_syntax_mismatch, first inspect the existing file and its imports/exports, then rewrite the complete file as syntactically valid source. Do not return a patch, explanation, Markdown fence, truncated fragment, or a different file. Run node --check for .js/.mjs/.cjs (or the project build for JSX/TSX) before reporting success.',
            `Failed task: ${artifactValidationFailure.task}`,
            ...(artifactValidationFailure.description
              ? [
                'ORIGINAL GENERATION BRIEF — preserve the requested behavior and interfaces while repairing syntax/format only:',
                artifactValidationFailure.description,
              ]
              : []),
          ].join('\\n'),
          language: 'en',
          context: JSON.stringify({
            artifactValidationFailure,
            originalGenerationBrief: artifactValidationFailure.description,
            originalArtifactContext: artifactValidationFailure.artifactContext,
            repairTicket: ticket,
            requiredArtifactLanguage: 'Match the extension exactly; JavaScript/TypeScript files must never contain Python syntax.',
          }),
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    const failedEdit = extractFailedEdit(ticket);
    if (failedEdit && /text to replace not found|search text.*not found|find.*not found/i.test(text)) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `The exact file edit missed the current file. Retry once with evidence-preserving advanced edit for ${failedEdit.file}; if the current content still does not match, stop for review.`,
        maxAttempts: 1,
        strategy: 'code_fix',
        suggestedTool: 'file_edit_advanced',
        suggestedInput: {
          filePath: failedEdit.file,
          edits: [{ find: failedEdit.find, replace: failedEdit.replace }],
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    const invalidNpmVersion = extractNpmInvalidVersionEvidence(ticket);
    if (invalidNpmVersion) {
      const token = `${invalidNpmVersion.packageName}@${invalidNpmVersion.requestedSpec}`;
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `npm registry rejected ${token} as ETARGET. Use the recorded project cwd, inspect published stable versions, update only this dependency specifier, retry npm install once, and rerun the failed phase for verification.`,
        maxAttempts: 1,
        strategy: 'dependency_fix',
        suggestedTool: 'npm_manager',
        suggestedInput: {
          command: 'install',
          ...(invalidNpmVersion.explicitSpecifier ? { packages: [token] } : {}),
          cwd: invalidNpmVersion.cwd,
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    // Native addons are not a missing-runner problem. Re-running npm install
    // would repeat the same compiler/toolchain failure and can mutate the project
    // without improving its portability. Stop honestly and let planning choose
    // a runtime-native or file-backed alternative.
    if (hasNativeAddonBuildFailure(ticket)) {
      return this.stop(
        ticket,
        'A native dependency failed to install or compile. No automatic retry is safe; choose node:sqlite or a JSON/file fallback instead of repeating npm install.',
        'manual_review',
      );
    }

    const missingNpmRunner = extractMissingNpmRunner(ticket);
    if (missingNpmRunner) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `The project test runner ${missingNpmRunner.runner} is missing. Install it as a project-local dev dependency in the recorded project cwd, then rerun the failed phase once.`,
        maxAttempts: 1,
        strategy: 'dependency_fix',
        suggestedTool: 'npm_manager',
        suggestedInput: {
          command: 'install',
          packages: [missingNpmRunner.runner],
          dev: true,
          cwd: missingNpmRunner.cwd,
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    const missingNpmTestDependency = extractMissingNpmTestDependency(ticket);
    if (missingNpmTestDependency) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `The test preset/environment ${missingNpmTestDependency.packageName} is missing. Install the exact package proven by the test failure as a project-local dev dependency, then rerun the failed phase once.`,
        maxAttempts: 1,
        strategy: 'dependency_fix',
        suggestedTool: 'npm_manager',
        suggestedInput: {
          command: 'install',
          packages: [missingNpmTestDependency.packageName],
          dev: true,
          cwd: missingNpmTestDependency.cwd,
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    const eslintConfigFailure = extractEslintConfigFailure(ticket);
    if (eslintConfigFailure) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `ESLint configuration discovery/parsing failure detected in ${eslintConfigFailure.configPath}. Rewrite only the config in the recorded project cwd using a format supported by the installed ESLint version, then rerun the failed phase.`,
        maxAttempts: 1,
        strategy: 'build_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          path: eslintConfigFailure.configPath,
          description: [
            `Repair the ESLint configuration file ${eslintConfigFailure.configPath} in the project cwd.`,
            'The lint command cannot discover or parse the current config. Inspect the existing file and package.json first.',
            'Preserve the project intent, but rewrite the file in the configuration format supported by the installed ESLint version and the dependencies actually present in package.json.',
            'Do not edit application source files, invent dependencies, or create a second config unless the evidence requires it.',
            `Observed command: ${eslintConfigFailure.command || 'unknown'}`,
            `Observed error: ${eslintConfigFailure.error}`,
          ].join('\\n'),
          context: JSON.stringify({ eslintConfigFailure, repairTicket: ticket }),
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    const localRuntimeImports = extractLocalRuntimeImportEvidence(ticket);
    if (localRuntimeImports.length > 0) {
      const importer = localRuntimeImports[0].importer;
      const evidenceLines = localRuntimeImports
        .map(item => `${item.importer} -> ${item.specifier}`)
        .join('; ');
      const redirect = localRuntimeImports
        .map(findEvidenceBackedLocalImportRedirect)
        .find((candidate): candidate is LocalImportRedirectEvidence => !!candidate);
      if (redirect) {
        return {
          type: 'self_fix_plan',
          allowed: true,
          reason: `The filesystem proves ${redirect.replace} is the nearest valid path for ${redirect.find} from ${redirect.importer}; edit only that import and rerun the failed phase.`,
          maxAttempts: 1,
          strategy: 'code_fix',
          suggestedTool: 'file_edit',
          // `file_edit` owns the filename contract; `filePath` belongs to
          // file_edit_advanced and the analysis tools. Sending the latter
          // silently made the real editor resolve an undefined target and
          // stopped an otherwise evidence-backed recovery.
          suggestedInput: {
            filename: redirect.importer,
            find: redirect.find,
            replace: redirect.replace,
          },
          rememberedCure: cureNote || undefined,
          safety: this.safety(),
          sourceTicket: ticket,
        };
      }

      const missingTarget = localRuntimeImports
        .map(missingExplicitLocalTarget)
        .find((target): target is string => !!target);
      const repairPath = missingTarget || importer;
      const targetRepair = missingTarget
        ? [
            `The exact missing target is ${missingTarget}; generate that file, not a substitute importer.`,
            'Inspect the importer and the existing styles/assets/modules first, then implement the concrete exported or stylesheet contract required by that exact import and the original requirements.',
            'Do not remove a required import, redirect it to an unrelated file, or write an empty/no-op placeholder.',
          ]
        : [
            `Repair the existing runtime import contract in ${importer}.`,
            'If a local specifier has no matching file and its exact target cannot be established from an explicit extension, repair only the importer after inspecting the actual filesystem; do not guess a module extension or folder.',
          ];
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: missingTarget
          ? `A proven explicit local runtime target is missing: ${missingTarget}. Generate that exact evidence-backed artifact and rerun the failed phase.`
          : `Local runtime import paths are missing: ${evidenceLines}. Inspect the existing filesystem and repair only those proven import/entrypoint paths.`,
        maxAttempts: 1,
        strategy: 'build_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          path: repairPath,
          description: [
            ...targetRepair,
            `The project_run preflight found these exact local imports with no resolvable file: ${evidenceLines}.`,
            'Inspect the current project root and each importer before editing. Resolve every specifier against the actual filesystem, including extension and src/ versus root layout.',
            'Preserve the project module system and public behavior. Never create a no-op placeholder, copy unrelated files, invent npm packages, or run npm install for a relative local specifier.',
            'After editing, run node --check for JavaScript entrypoints, the existing build/tests, and one real local start/readiness check.',
          ].join('\\n'),
          context: JSON.stringify({ localRuntimeImports, missingTarget, repairTicket: ticket }),
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    const missingFilename = extractMissingFilename(ticket, text);
    if (missingFilename && /missing file|enoent|existssync|not found|missing asset|missing config|process\.exit\(1\)/i.test(text)) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `Missing file detected: ${missingFilename}. Create a minimal placeholder and rerun the failed phase.`,
        maxAttempts: 1,
        strategy: 'missing_file_fix',
        suggestedTool: 'write_file',
        suggestedInput: {
          filename: missingFilename,
          content: `Created by JOE self-healing to satisfy missing file check: ${missingFilename}\n`,
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    if (/cannot find module|module not found|missing dependency|dependency/i.test(text)) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: 'Likely missing dependency or install issue.',
        maxAttempts: 1,
        strategy: 'dependency_fix',
        suggestedTool: 'shell_execute',
        suggestedInput: {
          // --if-present: a project without a build script must not turn a
          // SUCCESSFUL install into a failed repair. The timeout matches
          // reality on a weak laptop — npm install alone can take minutes.
          // Strict install first; --legacy-peer-deps only as the fallback when
          // the strict one refuses — the healer must never repeat a refused
          // command byte for byte (MyBudget field run), and must never loosen
          // an install that would have succeeded strictly.
          command: 'npm install --no-audit --no-fund || npm install --no-audit --no-fund --legacy-peer-deps && npm run --if-present build',
          timeout: 600000,
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    if (/build failed|compile|typescript|tsc|syntaxerror|typeerror|ts\d+/i.test(text)) {
      const buildContext = extractBuildContext(ticket);
      const evidenceTarget = extractEvidenceBoundRepairTarget(ticket);
      const targetedEdit = buildTargetedTypeScriptEdit(buildContext);
      if (targetedEdit && buildContext) {
        return {
          type: 'self_fix_plan',
          allowed: true,
          reason: `Build/TypeScript failure detected in ${buildContext.file}. Apply a targeted single-line edit and rerun the failed phase.`,
          maxAttempts: 1,
          strategy: 'build_fix',
          suggestedTool: 'file_edit',
          suggestedInput: targetedEdit,
          rememberedCure: cureNote || undefined,
          safety: this.safety(),
          sourceTicket: ticket,
        };
      }

      const target = buildContext?.file
        ? { path: buildContext.file, cwd: evidenceTarget?.cwd }
        : evidenceTarget;
      if (!target?.path) {
        return this.stop(ticket, 'Build/compile failure has no evidence-bound source file. Refusing to guess a repair target.', 'manual_review');
      }

      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `Build/TypeScript failure detected in ${target.path}. Create a targeted repair and rerun the failed phase.`,
        maxAttempts: 1,
        strategy: 'build_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          path: target.path,
          description: buildContext?.file
            ? `Fix the following TypeScript/Build error in ${target.path}:\nError: ${buildContext.message}\nLine: ${buildContext.line}\nSource: ${buildContext.sourceLine || 'Unknown'}`
            : `Inspect and fix the following build error in ${target.path}:\n${ticket.primaryError}`
            + (cureNote ? `\n[PROVEN PAST CURE — same error class]: ${cureNote}` : ''),
          context: JSON.stringify({ buildContext, repairTarget: target, repairTicket: ticket })
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    // A missing launcher with no safe manifest alternative is a valid,
    // non-actionable recovery outcome. Keep the ticket in the recovery flow so
    // the caller can report manual review, but never invent a start command.
    if (/(?:missing script|npm run server|launcher)/i.test(text)) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: 'The requested launcher is missing and the manifest exposes no safe start-like script; refusing to invent a command and stopping for manual review.',
        maxAttempts: 0,
        strategy: 'manual_review',
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    if (/partial|failed|error/i.test(text)) {
      const repairTarget = extractEvidenceBoundRepairTarget(ticket);
      if (!repairTarget?.path) {
        return this.stop(ticket, 'General phase failure has no evidence-bound repair file. Refusing to guess a workspace target.', 'manual_review');
      }
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `General phase failure. Repair only the evidenced file ${repairTarget.path}, then rerun the failed phase.`,
        maxAttempts: 1,
        strategy: 'code_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          path: repairTarget.path,
          description: `Repair only the evidenced file ${repairTarget.path}; do not redirect the fix to another file.\nFailed tasks in the current phase:\n${ticket.failedTasks.map(t => `- Task: ${t.task}\n  Error: ${t.error}`).join('\n')}`
            + (cureNote ? `\n[PROVEN PAST CURE — same error class]: ${cureNote}` : ''),
          context: JSON.stringify({ repairTarget, repairTicket: ticket })
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    if (remembered) {
      const repairTarget = extractEvidenceBoundRepairTarget(ticket);
      if (!repairTarget?.path) {
        return this.stop(ticket, 'A remembered cure has no evidence-bound repair file in the current ticket. Refusing to apply it to a generic source file.', 'manual_review');
      }
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `No static rule matched, but this error class was cured before (${remembered.wins}x). One guided attempt on the evidenced file ${repairTarget.path}.`,
        maxAttempts: 1,
        strategy: 'code_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          path: repairTarget.path,
          description: `Repair only ${repairTarget.path} using the cure that worked before.\nError:\n${ticket.primaryError}\n[PROVEN PAST CURE — same error class]: ${remembered.repair}`,
          context: JSON.stringify({ repairTarget, repairTicket: ticket }),
        },
        rememberedCure: cureNote,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    return this.stop(ticket, 'No safe automatic repair strategy matched this ticket.', 'manual_review');
  }

  private static safety() {
    return {
      requiresTrustedContext: true,
      runOnlyOnce: true,
      mustReRunFailedPhase: true,
      stopOnSecondFailure: true,
    };
  }

  private static stop(ticket: RepairTicket, reason: string, strategy: SelfFixPlan['strategy']): SelfFixPlan {
    return {
      type: 'self_fix_plan',
      allowed: false,
      reason,
      maxAttempts: 0,
      strategy,
      safety: this.safety(),
      sourceTicket: ticket,
    };
  }
}
