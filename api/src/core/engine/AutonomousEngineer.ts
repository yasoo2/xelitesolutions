import type { AutonomousEngineerInput, AutonomousEngineerResult, ExecutionJournalEntry } from './types';
import { promptAnalyzer } from './PromptAnalyzer';
import { projectInspector } from './ProjectInspector';
import { planGenerator } from './PlanGenerator';
import { planValidator } from './PlanValidator';
import { toolRouter } from './ToolRouter';
import { finalReportComposer } from './FinalReport';

function emit(input: AutonomousEngineerInput, type: string, data?: any) {
  try {
    input.onEvent?.({ type, data });
  } catch {
    // Event broadcasting should never break engineering flow.
  }
}

export class AutonomousEngineer {
  async analyzeOnly(input: AutonomousEngineerInput): Promise<AutonomousEngineerResult> {
    emit(input, 'phase_started', { phase: 'understand' });
    const analysis = promptAnalyzer.analyze(input.prompt);
    emit(input, 'phase_done', { phase: 'understand', analysis });

    emit(input, 'phase_started', { phase: 'inspect' });
    const project = projectInspector.inspect(input.projectRoot);
    emit(input, 'phase_done', { phase: 'inspect', project });

    emit(input, 'phase_started', { phase: 'plan' });
    const plan = planGenerator.generate(analysis, project);
    const route = toolRouter.selectTools(analysis, project);
    emit(input, 'phase_done', { phase: 'plan', plan, route });

    emit(input, 'phase_started', { phase: 'validate_plan' });
    const validation = planValidator.validate(plan);
    emit(input, 'phase_done', { phase: 'validate_plan', validation });

    const journal: ExecutionJournalEntry[] = [
      {
        stepId: 'analysis-only',
        tool: 'autonomous_engine',
        inputSummary: analysis.goal,
        outputSummary: `Selected task type ${analysis.taskType}; selected tools: ${route.tools.join(', ')}`,
        filesTouched: [],
        confidence: validation.ok ? 0.82 : 0.55,
        error: validation.ok ? undefined : validation.errors.join('; '),
      },
    ];

    emit(input, 'phase_started', { phase: 'finalize' });
    const report = finalReportComposer.compose({
      goal: analysis.goal,
      validation,
      journal,
      remainingRisks: analysis.risks,
    });
    emit(input, 'phase_done', { phase: 'finalize', report });

    return {
      ok: validation.ok,
      analysis,
      project,
      plan,
      validation,
      journal,
      report,
    };
  }
}

export const autonomousEngineer = new AutonomousEngineer();
