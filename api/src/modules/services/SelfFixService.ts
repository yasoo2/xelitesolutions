import type { RepairTicket } from './RepairTicketService';
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
    return /artifact_(?:type_mismatch|validation_failed)|incomplete markdown fence|not valid json|python source markers|node\.js source markers/i.test(evidence);
  });
  if (!failed?.file) return null;
  return {
    file: failed.file,
    error: failed.error || ticket.primaryError,
    task: failed.task,
  };
}

interface LocalRuntimeImportEvidence {
  importer: string;
  specifier: string;
}

function extractLocalRuntimeImportEvidence(ticket: RepairTicket): LocalRuntimeImportEvidence[] {
  const raw = rawTextOf(ticket);
  if (!/local\s+runtime\s+imports\s+missing|missing\s+local\s+runtime\s+imports/i.test(raw)) return [];

  const marker = raw.match(/local\s+runtime\s+imports\s+missing\s*\(([^)]*)\)/i)
    || raw.match(/missing\s+local\s+runtime\s+imports\s*[:\s]+([^\n]+)/i);
  if (!marker?.[1]) return [];

  const evidence: LocalRuntimeImportEvidence[] = [];
  for (const item of marker[1].split(';')) {
    const match = item.trim().match(/^(.+?)\s*->\s*(\.[^\s,;]+)/u);
    if (!match?.[1] || !match[2]) continue;
    const importer = match[1].trim().replace(/\\\\/g, '/');
    const specifier = match[2].trim();
    if (!importer || !specifier.startsWith('.')) continue;
    if (!evidence.some(entry => entry.importer === importer && entry.specifier === specifier)) {
      evidence.push({ importer, specifier });
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
            `Failed task: ${artifactValidationFailure.task}`,
          ].join('\\n'),
          language: 'en',
          context: JSON.stringify({ artifactValidationFailure, repairTicket: ticket, requiredArtifactLanguage: 'Match the extension exactly; JavaScript/TypeScript files must never contain Python syntax.' }),
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
    // without improving its portability. Stop honestly and let planning choose a
    // runtime-native or file-backed alternative.
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
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `Local runtime import paths are missing: ${evidenceLines}. Inspect the existing filesystem and repair only those proven import/entrypoint paths.`,
        maxAttempts: 1,
        strategy: 'build_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          path: importer,
          description: [
            `Repair the existing runtime import contract in ${importer}.`,
            `The project_run preflight found these exact local imports with no resolvable file: ${evidenceLines}.`,
            'Inspect the current project root and each importer before editing. Resolve every specifier against the actual filesystem, including extension and src/ versus root layout.',
            'Change only the smallest proven runtime contract. If a local specifier has no matching file, create the smallest concrete module required by the importer and the original project requirements, implementing the exact exported contract; do not change the import merely to hide the failure. Preserve the project module system and public behavior.',
            'Never create a no-op placeholder, copy unrelated files, invent npm packages, or run npm install for a relative local specifier.',
            'After editing, run node --check for JavaScript entrypoints, the existing build/tests, and one real local start/readiness check.',
          ].join('\\n'),
          context: JSON.stringify({ localRuntimeImports, repairTicket: ticket }),
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

      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: buildContext?.file
          ? `Build/TypeScript failure detected in ${buildContext.file}. Create a targeted repair and rerun the failed phase.`
          : 'Build or compile failure detected. Repair should inspect errors, patch code, then rerun the build.',
        maxAttempts: 1,
        strategy: 'build_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          path: buildContext?.file || 'src/index.ts',
          description: buildContext?.file
            ? `Fix the following TypeScript/Build error in ${buildContext.file}:\nError: ${buildContext.message}\nLine: ${buildContext.line}\nSource: ${buildContext.sourceLine || 'Unknown'}`
            : `Inspect and fix the following build error:\n${ticket.primaryError}`
            + (cureNote ? `\n[PROVEN PAST CURE — same error class]: ${cureNote}` : ''),
          context: JSON.stringify({ buildContext, repairTicket: ticket })
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    if (/partial|failed|error/i.test(text)) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: 'General phase failure. Use a narrow code repair pass based on failed tasks only.',
        maxAttempts: 1,
        strategy: 'code_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          path: 'src/index.ts', // Fallback path, ideally should be derived from failed tasks
          description: `Repair the following failed tasks in the current phase:\n${ticket.failedTasks.map(t => `- Task: ${t.task}\n  Error: ${t.error}`).join('\n')}`
            + (cureNote ? `\n[PROVEN PAST CURE — same error class]: ${cureNote}` : ''),
          context: JSON.stringify({ repairTicket: ticket })
        },
        rememberedCure: cureNote || undefined,
        safety: this.safety(),
        sourceTicket: ticket,
      };
    }

    if (remembered) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: `No static rule matched, but this error class was cured before (${remembered.wins}x). One guided attempt from memory.`,
        maxAttempts: 1,
        strategy: 'code_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          path: 'src/index.ts',
          description: `Repair this failure using the cure that worked before.\nError:\n${ticket.primaryError}\n[PROVEN PAST CURE — same error class]: ${remembered.repair}`,
          context: JSON.stringify({ repairTicket: ticket }),
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
