import type { ExecutionJournalEntry, FinalEngineeringReport, ValidationResult } from './types';

export class FinalReportComposer {
  compose(input: {
    goal: string;
    validation: ValidationResult;
    journal: ExecutionJournalEntry[];
    testsRun?: string[];
    filesChanged?: string[];
    issuesFixed?: string[];
    remainingRisks?: string[];
  }): FinalEngineeringReport {
    const filesChanged = input.filesChanged || Array.from(new Set(input.journal.flatMap((j) => j.filesTouched || [])));
    const failed = input.journal.filter((j) => j.error);
    const testsRun = input.testsRun || input.journal.filter((j) => j.tool.includes('test') || j.tool.includes('npm')).map((j) => j.inputSummary);

    const remainingRisks = [
      ...(input.remainingRisks || []),
      ...input.validation.warnings,
      ...failed.map((j) => `${j.stepId}: ${j.error}`),
    ].filter(Boolean);

    return {
      summary: failed.length
        ? `Completed analysis for: ${input.goal}. Some steps need attention before this can be considered fully complete.`
        : `Completed engineering workflow for: ${input.goal}.`,
      filesChanged,
      testsRun,
      issuesFixed: input.issuesFixed || input.journal.filter((j) => !j.error).map((j) => j.outputSummary).filter(Boolean),
      remainingRisks,
      nextAction: remainingRisks.length ? 'Review the listed risks and rerun validation after fixes.' : 'Ready for final validation/deployment review.',
    };
  }
}

export const finalReportComposer = new FinalReportComposer();
