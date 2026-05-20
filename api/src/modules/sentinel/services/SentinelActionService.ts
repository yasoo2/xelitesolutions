import { logger } from '../../../shared/utils/logger';
import { SentinelAction } from './SentinelPolicyEngine';
import { ShellExecuteTool } from '../../tools/definitions/SystemTools';
import { executionFirewall } from '../../../orchestration/AgentExecutionFirewall';

export class SentinelActionService {
    private static shellTool = new ShellExecuteTool();

    /**
     * Executes an intervention action based on the policy recommendation.
     */
    static async executeIntervention(serverId: string, action: string, target: string) {
        const shadowMode = process.env.SENTINEL_SHADOW_MODE !== 'false';
        
        if (shadowMode) {
            logger.info(`[Sentinel] SHADOW MODE: Skipping active interdiction ${action} on ${target}`);
            return;
        }

        logger.warn(`[Sentinel] ACTIVE MODE: Executing interdiction ${action} on ${target}`);

        try {
            switch (action) {
                case 'KILL_PROCESS':
                    await this.killProcess(target);
                    break;
                case 'BLOCK_IP':
                    await this.blockIP(target);
                    break;
                default:
                    logger.error(`[Sentinel] Unknown interdiction type: ${action}`);
            }
        } catch (error: any) {
            logger.error(`[Sentinel] Failed to execute interdiction: ${error.message}`);
        }
    }

    private static async killProcess(pid: string) {
        logger.warn(`[Sentinel] TERMINATING SUSPICIOUS PROCESS: PID ${pid}`);
        // We use the shell tool directly to ensure we have context
        const result = await executionFirewall.runAsSystem(() => this.shellTool.execute({
            command: `kill -9 ${pid}`,
            cwd: process.cwd()
        }));
        
        if (!result.ok) {
            throw new Error(`Kill command failed: ${result.error}`);
        }
        logger.info(`[Sentinel] Process ${pid} terminated successfully.`);
    }

    private static async blockIP(ip: string) {
        logger.warn(`[Sentinel] BLOCKING SUSPICIOUS IP: ${ip}`);
        // Windows or Linux specific? Let's assume generic iptables for now as a placeholder
        // or a generic "deny" policy.
        const result = await executionFirewall.runAsSystem(() => this.shellTool.execute({
            command: `iptables -A INPUT -s ${ip} -j DROP`,
            cwd: process.cwd()
        }));

        if (!result.ok) {
            // If iptables fails (e.g. on Windows), log it but don't crash
            logger.error(`[Sentinel] Failed to block IP ${ip} (might be non-linux environment): ${result.error}`);
        }
    }
}
