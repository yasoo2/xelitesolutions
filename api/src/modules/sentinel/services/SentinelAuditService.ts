import crypto from 'crypto';
import { SentinelAuditLogModel } from '../../../shared/models/SentinelAuditLog';

export class SentinelAuditService {
    /**
     * Appends an immutable log entry to the Sentinel Audit Log.
     * Uses a chain-hash mechanism (hash of previous entry + this entry)
     * to ensure absolute tamper detection.
     * 
     * @param actor The entity that took the action (System, Agent, User:ID)
     * @param action The specific action taken (e.g., KILLED_PROCESS, BLOCKED_IP)
     * @param resource The target resource (e.g., Server:IP, PID:123)
     * @param result Status of the action (e.g., SUCCESS, FAILED)
     */
    static async logAction(actor: string, action: string, resource: string, result: string): Promise<void> {
        // Fetch the last audit log to get its hash
        const lastLog = await SentinelAuditLogModel.findOne().sort({ timestamp: -1 }).select('hash');
        
        const previousHash = lastLog ? lastLog.hash : '0000000000000000000000000000000000000000000000000000000000000000';
        
        const payload = `${previousHash}|${actor}|${action}|${resource}|${result}|${Date.now()}`;
        
        const currentHash = crypto.createHash('sha256').update(payload).digest('hex');

        await SentinelAuditLogModel.create({
            actor,
            action,
            resource,
            result,
            hash: currentHash
        });
    }

    /**
     * Verifies the cryptographic integrity of the entire audit chain.
     * Starts from the origin and re-calculates hashes forward.
     */
    static async verifyIntegrity(): Promise<{ valid: boolean; brokenAtIndex?: number }> {
        const logs = await SentinelAuditLogModel.find().sort({ timestamp: 1 });
        
        if (logs.length === 0) return { valid: true };

        let expectedHash = '0000000000000000000000000000000000000000000000000000000000000000';
        
        for (let i = 0; i < logs.length; ++i) {
            const log = logs[i];
            const payload = `${expectedHash}|${log.actor}|${log.action}|${log.resource}|${log.result}|${log.timestamp.getTime()}`;
            const calculatedHash = crypto.createHash('sha256').update(payload).digest('hex');

            if (calculatedHash !== log.hash) {
                return { valid: false, brokenAtIndex: i };
            }
            expectedHash = calculatedHash;
        }

        return { valid: true };
    }
}
