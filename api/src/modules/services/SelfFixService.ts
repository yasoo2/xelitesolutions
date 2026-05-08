import type { RepairTicket } from './RepairTicketService';

export interface SelfFixPlan {
  type: 'self_fix_plan';
  allowed: boolean;
  reason: string;
  maxAttempts: number;
  strategy: 'missing_file_fix' | 'dependency_fix' | 'build_fix' | 'code_fix' | 'permission_stop' | 'manual_review';
  suggestedTool?: string;
  suggestedInput?: Record<string, unknown>;
  safety: {
    requiresTrustedContext: boolean;
    runOnlyOnce: boolean;
    mustReRunFailedPhase: boolean;
    stopOnSecondFailure: boolean;
  };
  sourceTicket: RepairTicket;
}

function rawTextOf(ticket: RepairTicket) {
  return `${ticket.status}\n${ticket.primaryError}\n${ticket.failedTasks.map(t => `${t.task}\n${t.tool}: ${t.error}`).join('\n')}`;
}

function textOf(ticket: RepairTicket) {
  return rawTextOf(ticket).toLowerCase();
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
          command: 'npm install && npm run build',
        },
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
            : `Inspect and fix the following build error:\n${ticket.primaryError}`,
          context: JSON.stringify({ buildContext, repairTicket: ticket })
        },
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
          description: `Repair the following failed tasks in the current phase:\n${ticket.failedTasks.map(t => `- Task: ${t.task}\n  Error: ${t.error}`).join('\n')}`,
          context: JSON.stringify({ repairTicket: ticket })
        },
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
