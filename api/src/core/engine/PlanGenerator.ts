import type { EngineeringPlan, EngineeringPlanStep, PromptAnalysis, ProjectContext } from './types';

function step(id: string, title: string, type: EngineeringPlanStep['type'], reason: string, extra: Partial<EngineeringPlanStep> = {}): EngineeringPlanStep {
  return {
    id,
    title,
    type,
    reason,
    risk: extra.risk || 'low',
    successCriteria: extra.successCriteria || ['Step completes without error'],
    target: extra.target,
    command: extra.command,
  };
}

export class PlanGenerator {
  generate(analysis: PromptAnalysis, project: ProjectContext): EngineeringPlan {
    const steps: EngineeringPlanStep[] = [];

    steps.push(step(
      'inspect-context',
      'Inspect relevant project context',
      'read',
      'A senior engineer should inspect the existing code and project shape before making changes.',
      { target: analysis.likelyFiles[0] || project.backendRoot || project.frontendRoot || '.', successCriteria: ['Relevant project files are identified'] }
    ));

    if (analysis.taskType === 'bugfix' || analysis.taskType === 'security' || analysis.taskType === 'backend' || analysis.taskType === 'ui') {
      steps.push(step(
        'locate-cause',
        'Locate the concrete cause before editing',
        'read',
        'Avoid blind edits by finding the route, component, config, or service responsible for the behavior.',
        { target: analysis.likelyFiles.join(', ') || '.', successCriteria: ['Likely root cause is documented'] }
      ));
      steps.push(step(
        'apply-minimal-patch',
        'Apply the smallest safe patch',
        'edit',
        'Keep the current Joe system intact while improving the failing behavior.',
        { target: analysis.likelyFiles[0], risk: analysis.taskType === 'security' ? 'medium' : 'low', successCriteria: ['Patch is scoped to the identified issue'] }
      ));
    }

    if (analysis.taskType === 'feature' || analysis.taskType === 'unknown') {
      steps.push(step(
        'design-internal-upgrade',
        'Design a non-invasive internal upgrade',
        'create',
        'New engineering intelligence should be added as modules inside Joe, not as a replacement system.',
        { target: 'api/src/core/engine', successCriteria: ['New module is optional and does not disable existing routes'] }
      ));
    }

    const apiBuild = project.packageScripts['api:build'] ? 'npm --prefix api run build' : undefined;
    const webBuild = project.packageScripts['web:build'] ? 'npm --prefix web run build' : undefined;

    if (apiBuild) {
      steps.push(step('validate-api-build', 'Validate API build', 'test', 'Every backend change should prove TypeScript can still build.', { command: apiBuild, risk: 'low', successCriteria: ['API build exits successfully'] }));
    }
    if (webBuild && (analysis.taskType === 'ui' || analysis.taskType === 'feature' || analysis.taskType === 'bugfix')) {
      steps.push(step('validate-web-build', 'Validate web build', 'test', 'Frontend changes should prove the Vite/TypeScript build still works.', { command: webBuild, risk: 'low', successCriteria: ['Web build exits successfully'] }));
    }

    steps.push(step(
      'final-report',
      'Prepare deterministic final report',
      'read',
      'The user needs a clear engineering report, not a vague done message.',
      { successCriteria: ['Report lists changes, validation, risks, and next action'] }
    ));

    return {
      goal: analysis.goal,
      assumptions: analysis.assumptions,
      steps,
    };
  }
}

export const planGenerator = new PlanGenerator();
