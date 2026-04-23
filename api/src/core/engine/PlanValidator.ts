import type { EngineeringPlan, ValidationResult } from './types';

const DANGEROUS_COMMANDS = [
  /rm\s+-rf\s+\//i,
  /mkfs\b/i,
  /dd\s+if=/i,
  /drop\s+database/i,
  /drop\s+table/i,
  /shutdown\b/i,
  /reboot\b/i,
  /chmod\s+777\s+\//i,
  /curl\s+[^|]+\|\s*(sh|bash)/i,
];

function isOutsideWorkspace(target?: string) {
  const t = String(target || '').trim();
  if (!t) return false;
  return t.startsWith('/etc/') || t.startsWith('/root/') || t.startsWith('/var/lib/') || t.includes('..');
}

export class PlanValidator {
  validate(plan: EngineeringPlan): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!plan.goal || plan.goal.trim().length < 2) errors.push('plan_goal_missing');
    if (!Array.isArray(plan.steps) || plan.steps.length === 0) errors.push('plan_steps_missing');

    let hasValidation = false;
    let hasEditLikeStep = false;

    for (const s of plan.steps || []) {
      if (!s.id || !s.title || !s.reason) errors.push(`step_invalid:${s.id || 'unknown'}`);
      if (['edit', 'create', 'delete'].includes(s.type)) {
        hasEditLikeStep = true;
        if (!s.target) errors.push(`step_target_missing:${s.id}`);
      }
      if (['test', 'command'].includes(s.type)) hasValidation = true;
      if (s.command && DANGEROUS_COMMANDS.some((re) => re.test(s.command || ''))) errors.push(`dangerous_command:${s.id}`);
      if (isOutsideWorkspace(s.target)) errors.push(`target_outside_workspace:${s.id}`);
      if (!Array.isArray(s.successCriteria) || s.successCriteria.length === 0) warnings.push(`success_criteria_missing:${s.id}`);
      if (s.risk === 'high') warnings.push(`high_risk_step:${s.id}`);
    }

    if (hasEditLikeStep && !hasValidation) warnings.push('code_changes_without_validation_step');

    return { ok: errors.length === 0, errors, warnings };
  }
}

export const planValidator = new PlanValidator();
