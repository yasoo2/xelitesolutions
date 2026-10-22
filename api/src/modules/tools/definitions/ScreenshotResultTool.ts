import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { listScreenshots, readScreenshot } from '../../services/ScreenshotArtifactService';

/** Read-only artifact delivery remains behind the same policy gateway as capture. */
export class ScreenshotResultTool extends BaseTool {
    name = 'screenshot_result';
    description = 'Read verified captured-image results for the current owned conversation.';
    version = '1.0.0';
    tags = ['artifact', 'read'];
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 60;
    inputSchema = { type: 'object' as const, properties: { captureId: { type: 'string', description: 'Optional capture UUID; omit to list recent results' } } };
    async execute(input: any, context?: any) {
        const cancelled = () => Boolean(context?.signal?.aborted || context?.isCancelled?.());
        if (cancelled()) return { ok: false, error: 'cancelled', logs: [] };
        try {
            if (input?.captureId !== undefined && typeof input.captureId !== 'string') throw new Error('invalid_capture_id');
            const ids = { sessionId: context?.sessionId, workspaceId: context?.workspaceId, userId: context?.userId };
            const output = input?.captureId === undefined ? { captures: await listScreenshots(ids) } : await readScreenshot(ids, input.captureId);
            if (cancelled()) return { ok: false, error: 'cancelled', logs: [] };
            return { ok: true, output, logs: [] };
        } catch { return { ok: false, error: 'screenshot_unavailable', logs: [] }; }
    }
}
