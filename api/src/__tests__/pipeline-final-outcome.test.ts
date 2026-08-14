import fs from 'fs';
import path from 'path';
import { isFinalPipelineOutcome } from '../orchestration/AgentOrchestrator';

describe('canonical engineering pipeline terminal outcomes', () => {
  it('stops outer recovery only for a pipeline result explicitly marked final', () => {
    expect(isFinalPipelineOutcome('project_pipeline', { pipelineFinal: true })).toBe(true);
    expect(isFinalPipelineOutcome('project_pipeline', { verificationFailed: true })).toBe(false);
    expect(isFinalPipelineOutcome('shell_execute', { pipelineFinal: true })).toBe(false);
    expect(isFinalPipelineOutcome('project_pipeline', undefined)).toBe(false);
  });

  it('marks every outward failure state of the canonical pipeline as final evidence', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'),
      'utf8',
    );
    expect(src).toContain('pipelineFinal: true');
    expect(src).toContain("error: plannerResult?.error || 'planner returned no phases'");
    expect(src).toContain("verificationStatus: 'not_run'");
  });

  it('places the terminal-pipeline guard before generative recovery', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'),
      'utf8',
    );
    const guard = src.indexOf('const isFinalPipelineFailure = isFinalPipelineOutcome(node.tool, out);');
    const recovery = src.indexOf('await this.attemptRecovery(');
    expect(guard).toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(guard);
  });
});
