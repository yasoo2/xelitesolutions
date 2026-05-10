
import { ToolDefinition, ToolPermission } from '../types';
import { executionEngine } from '../../../kernel/ExecutionEngine';

export class VideoActionTool implements ToolDefinition {
    name = 'video_action';
    version = '1.0.0';
    tags = ['media', 'video', 'audio', 'ffmpeg'];
    description = 'Edit, convert, and process videos/audio using FFMPEG. Machine must have ffmpeg installed.';

    inputSchema: any = {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['extract_audio', 'trim', 'convert', 'extract_frame', 'custom'], description: 'Type of video operation' },
            inputFile: { type: 'string', description: 'Path to source media file' },
            outputFile: { type: 'string', description: 'Path to save result' },
            options: { type: 'string', description: 'Action specific options (e.g. "-ss 00:00:10 -t 5" for trim, or full custom args if action is "custom")' }
        },
        required: ['action', 'inputFile', 'outputFile']
    };

    outputSchema: any = {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            savedPath: { type: 'string' },
            ffmpegLogs: { type: 'string' }
        }
    };

    permissions: ToolPermission[] = ['execute', 'read', 'write'];
    sideEffects: ToolPermission[] = ['execute', 'write'];
    rateLimitPerMinute = 5; 
    auditFields = ['action', 'inputFile'];
    mockSupported = false;

    async execute(input: { action: string; inputFile: string; outputFile: string; options?: string; workspaceId?: string }) {
        let args = '';
        
        switch(input.action) {
            case 'extract_audio':
                args = `-i "${input.inputFile}" -vn -acodec libmp3lame -q:a 2 "${input.outputFile}"`;
                break;
            case 'trim':
                args = `-i "${input.inputFile}" ${input.options} -c copy "${input.outputFile}"`;
                break;
            case 'convert':
                args = `-i "${input.inputFile}" "${input.outputFile}"`;
                break;
            case 'extract_frame':
                args = `-i "${input.inputFile}" -vframes 1 ${input.options} "${input.outputFile}"`;
                break;
            case 'custom':
                args = `-i "${input.inputFile}" ${input.options} "${input.outputFile}"`;
                break;
            default:
                return { ok: false, error: 'Unknown action', logs: [] };
        }

        const command = `ffmpeg -y ${args}`;

        const result = await executionEngine.run(command);
        
        if (result.ok) {
            return {
                ok: true,
                output: { success: true, savedPath: input.outputFile, ffmpegLogs: result.error },
                logs: [`FFMPEG Success: ${command}`]
            };
        } else {
            return {
                ok: false,
                error: result.error || result.output,
                output: { success: false, ffmpegLogs: result.error },
                logs: [`FFMPEG Failed: ${command}`]
            };
        }
    }
}
