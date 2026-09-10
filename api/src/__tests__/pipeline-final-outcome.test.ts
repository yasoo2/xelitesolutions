import fs from 'fs';
import path from 'path';
import { isFinalPipelineOutcome } from '../orchestration/AgentOrchestrator';
import { applyLiveRunOutcome, durablePreviewEligible, externalApiExpectationFromRecord, finalBrowserQaUrl, hasOnlyBrowserQaInfrastructureFindings } from '../modules/tools/definitions/ProjectPipelineTool';

describe('canonical engineering pipeline terminal outcomes', () => {
  it('prefers the durable project preview for final browser QA', () => {
    expect(finalBrowserQaUrl('http://127.0.0.1:4300/', 'http://127.0.0.1:5002/project-preview/session/index.html'))
      .toBe('http://127.0.0.1:5002/project-preview/session/index.html');
    expect(finalBrowserQaUrl('http://127.0.0.1:4300/', '')).toBe('http://127.0.0.1:4300/');
  });

  it('limits durable preview QA to maintained static external-API integrations', () => {
    expect(durablePreviewEligible({
      projectType: 'react', hasDist: true, hasPackagedRuntime: false,
      integrationProfileId: 'frankfurter-currency-v2',
    })).toBe(true);
    expect(durablePreviewEligible({
      projectType: 'react', hasDist: true, hasPackagedRuntime: true,
      integrationProfileId: 'frankfurter-currency-v2',
    })).toBe(false);
    expect(durablePreviewEligible({
      projectType: 'react', hasDist: true, hasPackagedRuntime: false,
      integrationProfileId: '',
    })).toBe(false);
  });

  it('hands final Browser QA only a maintained external API identity', () => {
    expect(externalApiExpectationFromRecord({
      capability: 'currency', integrationProfileId: 'frankfurter-currency-v2',
    })).toEqual({
      capability: 'currency',
      integrationProfileId: 'frankfurter-currency-v2',
      providerName: 'Frankfurter',
      auth: 'none',
      pricing: 'UNKNOWN',
      health: 'UNKNOWN',
    });
    expect(externalApiExpectationFromRecord({
      capability: 'currency', integrationProfileId: 'unknown-profile',
    })).toBeUndefined();
    expect(externalApiExpectationFromRecord({
      capability: 'shell', integrationProfileId: 'frankfurter-currency-v2',
    })).toBeUndefined();
  });

  it('retries only browser-infrastructure findings without treating app defects as instrumentation', () => {
    expect(hasOnlyBrowserQaInfrastructureFindings([
      { code: 'viewport_emulation_failed' },
    ])).toBe(true);
    expect(hasOnlyBrowserQaInfrastructureFindings([
      { id: 'qa_target_unavailable' },
      { code: 'browser_unavailable' },
    ])).toBe(true);
    expect(hasOnlyBrowserQaInfrastructureFindings([])).toBe(false);
    expect(hasOnlyBrowserQaInfrastructureFindings([
      { code: 'viewport_emulation_failed' },
      { code: 'low_contrast' },
    ])).toBe(false);
  });
  it('stops outer recovery only for a pipeline result explicitly marked final', () => {
    expect(isFinalPipelineOutcome('project_pipeline', { pipelineFinal: true })).toBe(true);
    expect(isFinalPipelineOutcome('project_pipeline', { verificationFailed: true })).toBe(false);
    expect(isFinalPipelineOutcome('shell_execute', { pipelineFinal: true })).toBe(false);
    expect(isFinalPipelineOutcome('project_pipeline', undefined)).toBe(false);
    expect(isFinalPipelineOutcome('project_edit', { acceptance: { unmet: 1 } })).toBe(true);
    expect(isFinalPipelineOutcome('project_edit', { visualVerificationBlocked: true })).toBe(true);
    expect(isFinalPipelineOutcome('project_edit', { acceptance: { unmet: 0 } })).toBe(false);
  });

  it('marks every outward failure state of the canonical pipeline as final evidence', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'),
      'utf8',
    );
    expect(src).toContain('pipelineFinal: true');
    expect(src).toContain("error: plannerResult?.error || 'planner returned no phases'");
    expect(src).toContain("verificationStatus: 'not_run'");
    expect(src).toContain('liveRunError');
    expect(src).toContain('Live-run evidence:');
    expect(src).toContain('liveRepairStatus');
    expect(src).toContain('Bounded live-repair status:');
  });

  it('does not deliver a verified pipeline without a confirmed live URL', () => {
    expect(applyLiveRunOutcome(true, { ok: false, error: 'no port answered' })).toMatchObject({
      verified: false,
      liveUrl: '',
      verificationFailed: true,
    });
    expect(applyLiveRunOutcome(true, { ok: true, output: {} })).toMatchObject({
      verified: false,
      liveUrl: '',
      verificationFailed: true,
    });
    expect(applyLiveRunOutcome(true, { ok: true, output: { url: 'http://localhost:4317/' } })).toEqual({
      verified: true,
      liveUrl: 'http://localhost:4317/',
      verificationFailed: false,
    });
    expect(applyLiveRunOutcome(false, { ok: false, error: 'not reached' })).toEqual({
      verified: false,
      liveUrl: '',
      verificationFailed: false,
    });
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
