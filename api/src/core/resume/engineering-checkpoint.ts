/**
 * GENERAL ENGINEERING CHECKPOINTS — resumable execution for any engineering task.
  *
  * The web page checkpoint system (checkpoint.ts) only handles section-wise page builds.
  * This module extends checkpointing to GENERAL engineering tasks:
  *   - Phase-level: entire phases of a multi-phase plan
  *   - Tool-level: individual tool executions with inputs/outputs
  *   - Artifact-level: generated files, build outputs, test results
  *
  * Key differences from page checkpoints:
  *   - Not tied to HTML sections; works with any tool result
  *   - Tracks tool execution state (inputs, outputs, errors, verification)
  *   - Supports resumption at phase, tool, or artifact granularity
  *   - Integrates with PhaseExecutor's verification ledger
  *   - Keyed by runId + phaseIndex + toolName for fine-grained resumption
  */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface EngineeringCheckpoint {
    v: 1;
    key: string;
    runId: string;
    phaseIndex: number;
    phaseName: string;
    toolName?: string;
    taskDescription: string;
    ts: number;
    /** Tool input arguments */
    input: Record<string, any>;
    /** Tool output/result */
    output?: any;
    /** Verification result if applicable */
    verification?: {
        status: 'passed' | 'failed' | 'skipped';
        checkId?: string;
        evidence?: any;
    };
    /** Runtime context for resumption */
    runtimeContext: {
        projectRoot: string;
        workspaceId: string;
        sessionId: string;
        runId: string;
        verificationLedger?: any;
    };
    /** Artifact references for resumption */
    artifacts: Array<{
        type: 'file' | 'directory' | 'url' | 'binary';
        path: string;
        hash?: string;
        size?: number;
    }>;
}

export interface CheckpointReadResult {
    status: 'ok' | 'failed' | 'empty' | 'expired';
    checkpoint?: EngineeringCheckpoint;
    reason?: string;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for engineering tasks (longer than page builds)
const DIR_NAME = '.engineering-checkpoints';

export function engineeringCheckpointKey(runId: string, phaseIndex: number, toolName?: string, taskDescription?: string): string {
    const components = [runId, String(phaseIndex), toolName || '', taskDescription || ''];
    return crypto.createHash('md5').update(components.filter(Boolean).join('|')).digest('hex');
}

function fileFor(artifactDir: string, key: string): string {
    return path.join(artifactDir, DIR_NAME, `${key}.json`);
}

function failedCheckpoint(reason: unknown): CheckpointReadResult {
    return {
        status: 'failed',
        reason: String((reason as any)?.message || reason).slice(0, 160),
    };
}

export function loadEngineeringCheckpoint(artifactDir: string, key: string): CheckpointReadResult {
    const file = fileFor(artifactDir, key);
    try {
        if (!fs.existsSync(file)) return { status: 'empty' };
        const cp = JSON.parse(fs.readFileSync(file, 'utf-8')) as EngineeringCheckpoint;
        if (cp?.v !== 1 || cp.key !== key) return failedCheckpoint('checkpoint schema or key is invalid');
        if (Date.now() - cp.ts > TTL_MS) {
            try { fs.unlinkSync(file); } catch { }
            return { status: 'expired' };
        }
        return { status: 'ok', checkpoint: cp };
    } catch (e: any) {
        return failedCheckpoint(e);
    }
}

export function saveEngineeringCheckpoint(
    artifactDir: string,
    key: string,
    checkpoint: Omit<EngineeringCheckpoint, 'v' | 'key' | 'ts'>
): void {
    const file = fileFor(artifactDir, key);
    try {
        const dir = path.join(artifactDir, DIR_NAME);
        fs.mkdirSync(dir, { recursive: true });
        const existing = loadEngineeringCheckpoint(artifactDir, key);
        if (existing.status === 'failed') {
            console.warn(`[EngineeringCheckpoint] refusing write (${existing.reason}) — preserving unreadable checkpoint.`);
            return;
        }
        const cp: EngineeringCheckpoint = {
            v: 1,
            key,
            ts: Date.now(),
            ...checkpoint,
        };
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(cp), 'utf-8');
        fs.renameSync(tmp, file);
    } catch (e: any) {
        console.warn(`[EngineeringCheckpoint] write failed (${String(e?.message || e).slice(0, 160)}).`);
    }
}

export function clearEngineeringCheckpoint(artifactDir: string, key: string): void {
    try { fs.unlinkSync(fileFor(artifactDir, key)); } catch { }
}

/**
 * Load all checkpoints for a given run (useful for resumption UI)
 */
export function loadAllRunCheckpoints(artifactDir: string, runId: string): EngineeringCheckpoint[] {
    const dir = path.join(artifactDir, DIR_NAME);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    const checkpoints: EngineeringCheckpoint[] = [];
    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const key = file.slice(0, -5);
        const result = loadEngineeringCheckpoint(artifactDir, key);
        if (result.status === 'ok' && result.checkpoint?.runId === runId) {
            checkpoints.push(result.checkpoint);
        }
    }
    // Sort by phaseIndex, then toolName
    return checkpoints.sort((a, b) => {
        if (a.phaseIndex !== b.phaseIndex) return a.phaseIndex - b.phaseIndex;
        return (a.toolName || '').localeCompare(b.toolName || '');
    });
}

/**
 * Checkpoint a completed phase with all its tool results
 */
export function checkpointPhase(
    artifactDir: string,
    runId: string,
    phaseIndex: number,
    phaseName: string,
    phaseResult: any,
    projectContext: any,
    executionContext: any
): void {
    const key = engineeringCheckpointKey(runId, phaseIndex, 'phase');
    const toolResults = phaseResult?.output?.results || [];
    
    saveEngineeringCheckpoint(artifactDir, key, {
        runId,
        phaseIndex,
        phaseName,
        taskDescription: `Phase: ${phaseName}`,
        input: { phase: 'completed' },
        output: phaseResult?.output,
        verification: phaseResult?.output?.verification,
        runtimeContext: {
            projectRoot: projectContext.projectRoot,
            workspaceId: projectContext.workspaceId,
            sessionId: projectContext.sessionId,
            runId,
            verificationLedger: phaseResult?.output?.verificationLedger,
        },
        artifacts: extractArtifactsFromPhase(phaseResult),
    });
}

/**
 * Checkpoint a single tool execution within a phase
 */
export function checkpointTool(
    artifactDir: string,
    runId: string,
    phaseIndex: number,
    toolName: string,
    taskDescription: string,
    input: any,
    output: any,
    projectContext: any,
    executionContext: any
): void {
    const key = engineeringCheckpointKey(runId, phaseIndex, toolName, taskDescription);
    
    saveEngineeringCheckpoint(artifactDir, key, {
        runId,
        phaseIndex,
        phaseName: projectContext.phaseName || `phase-${phaseIndex}`,
        toolName,
        taskDescription,
        input,
        output,
        verification: output?.verification,
        runtimeContext: {
            projectRoot: projectContext.projectRoot,
            workspaceId: projectContext.workspaceId,
            sessionId: projectContext.sessionId,
            runId,
        },
        artifacts: extractArtifactsFromToolOutput(output),
    });
}

function extractArtifactsFromPhase(phaseResult: any): EngineeringCheckpoint['artifacts'] {
    const artifacts: EngineeringCheckpoint['artifacts'] = [];
    const results = phaseResult?.output?.results || [];
    
    for (const result of results) {
        if (result?.output?.artifactPaths) {
            for (const path of result.output.artifactPaths) {
                artifacts.push({ type: 'file', path });
            }
        }
        if (result?.output?.projectRoot) {
            artifacts.push({ type: 'directory', path: result.output.projectRoot });
        }
        if (result?.output?.previewUrl) {
            artifacts.push({ type: 'url', path: result.output.previewUrl });
        }
    }
    
    return artifacts;
}

function extractArtifactsFromToolOutput(output: any): EngineeringCheckpoint['artifacts'] {
    const artifacts: EngineeringCheckpoint['artifacts'] = [];
    
    if (output?.artifactPaths) {
        for (const path of output.artifactPaths) {
            artifacts.push({ type: 'file', path });
        }
    }
    if (output?.projectRoot) {
        artifacts.push({ type: 'directory', path: output.projectRoot });
    }
    if (output?.previewUrl) {
        artifacts.push({ type: 'url', path: output.previewUrl });
    }
    if (output?.buildOutput) {
        artifacts.push({ type: 'directory', path: output.buildOutput });
    }
    
    return artifacts;
}

export function clearAllRunCheckpoints(artifactDir: string, runId: string): void {
    const dir = path.join(artifactDir, DIR_NAME);
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const key = file.slice(0, -5);
        const result = loadEngineeringCheckpoint(artifactDir, key);
        if (result.status === 'ok' && result.checkpoint?.runId === runId) {
            clearEngineeringCheckpoint(artifactDir, key);
        }
    }
}

export default {
    EngineeringCheckpoint: {} as EngineeringCheckpoint,
    CheckpointReadResult: {} as CheckpointReadResult,
    loadEngineeringCheckpoint,
    saveEngineeringCheckpoint,
    clearEngineeringCheckpoint,
    engineeringCheckpointKey,
    loadAllRunCheckpoints,
    checkpointPhase,
    checkpointTool,
    clearAllRunCheckpoints,
};