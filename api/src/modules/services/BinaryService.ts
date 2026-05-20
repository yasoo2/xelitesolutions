
import os from 'os';
import { executionEngine } from '../../kernel/ExecutionEngine';

export interface BinaryCheckResult {
    exists: boolean;
    path?: string;
    version?: string;
    arch?: string;
    compatible: boolean;
    error?: string;
}

export class BinaryService {
    /**
     * Check if a binary is available and compatible
     */
    static async checkBinary(name: string): Promise<BinaryCheckResult> {
        try {
            // 1. Try which/where
            const whichCmd = os.platform() === 'win32' ? 'where' : 'which';
            const which = await executionEngine.execute({
                id: `check_binary_${name}`,
                type: 'shell',
                payload: { command: `${whichCmd} ${name}` },
                priority: 'low'
            });

            if (!which.success) {
                return { exists: false, compatible: false, error: 'binary_not_found' };
            }

            const binaryPath = (which.data?.output || '').trim().split('\n')[0];

            // 2. Check architecture on macOS
            if (os.platform() === 'darwin') {
                const fileInfo = await executionEngine.execute({
                    id: `check_arch_${name}`,
                    type: 'shell',
                    payload: { command: `file ${binaryPath}` },
                    priority: 'low'
                });
                const info = (fileInfo.data?.output || '').toLowerCase();

                const hasArm64 = info.includes('arm64');
                const hasX64 = info.includes('x86_64') || info.includes('x86-64');
                const isUniversal = info.includes('universal');

                const hwArchRes = await executionEngine.execute({
                    id: 'check_hw_arch',
                    type: 'shell',
                    payload: { command: 'uname -m' },
                    priority: 'low'
                });
                const hwArch = (hwArchRes.data?.output || '').trim();

                const isNative = (hwArch === 'arm64' && (hasArm64 || isUniversal)) || (hwArch === 'x86_64' && hasX64);

                let error: string | undefined = undefined;
                if (hwArch === 'arm64' && hasX64 && !hasArm64 && !isUniversal) {
                    error = 'warning_rosetta_required';
                }

                return {
                    exists: true,
                    path: binaryPath,
                    arch: hasArm64 ? 'arm64' : (hasX64 ? 'x64' : 'unknown'),
                    compatible: isNative || hasX64,
                    error
                };
            }

            return { exists: true, path: binaryPath, compatible: true };
        } catch (e: any) {
            return { exists: false, compatible: false, error: e.message };
        }
    }

    /**
     * Get a helpful hint for a missing or incompatible binary
     */
    static getHint(name: string, result: BinaryCheckResult): string {
        const lower = name.toLowerCase();
        if (result.error?.includes('binary_arch_mismatch')) {
            return `The binary '${name}' is compiled for x86_64 but your system is ARM64. Please install the native ARM64 version or ensure Rosetta 2 is installed.`;
        }
        if (lower === 'playwright' || lower === 'chromium' || lower === 'chrome') {
            return 'Run "npx playwright install" in the api directory.';
        }
        if (lower === 'fd') {
            return 'Install fd-find: "brew install fd" (macOS) or "apt install fd-find" (Linux).';
        }
        if (lower === 'rg' || lower === 'ripgrep') {
            return 'Install ripgrep: "brew install ripgrep" (macOS) or "apt install ripgrep" (Linux).';
        }
        return `Ensure '${name}' is installed and in your PATH.`;
    }
}
