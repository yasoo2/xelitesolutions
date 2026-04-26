import type { RepairTicket } from './RepairTicketService';

export interface SelfFixPlan {
  type: 'self_fix_plan';
  allowed: boolean;
  reason: string;
  maxAttempts: number;
  strategy: 'dependency_fix' | 'build_fix' | 'code_fix' | 'permission_stop' | 'manual_review';
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

function textOf(ticket: RepairTicket) {
  return `${ticket.status}\n${ticket.primaryError}\n${ticket.failedTasks.map(t => `${t.tool}: ${t.error}`).join('\n')}`.toLowerCase();
}

export class SelfFixService {
  static plan(ticket: RepairTicket): SelfFixPlan {
    const text = textOf(ticket);

    if (ticket.severity === 'critical') {
      return this.stop(ticket, 'Critical/security-related issue requires explicit review before repair.', 'permission_stop');
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

    if (/build failed|compile|typescript|tsc|syntaxerror|typeerror/i.test(text)) {
      return {
        type: 'self_fix_plan',
        allowed: true,
        reason: 'Build or compile failure detected. Repair should inspect errors, patch code, then rebuild.',
        maxAttempts: 1,
        strategy: 'build_fix',
        suggestedTool: 'ai_write_file',
        suggestedInput: {
          instruction: 'Inspect the build error from the repair ticket, patch only the broken files, then rerun the build. Do not rewrite unrelated files.',
          repairTicket: ticket,
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
          instruction: 'Repair only the failed tasks listed in the repair ticket. Preserve existing project structure and do not change unrelated files.',
          repairTicket: ticket,
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
