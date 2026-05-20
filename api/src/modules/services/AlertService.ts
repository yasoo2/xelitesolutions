import axios from 'axios';
import { logger } from '../../shared/utils/logger';

import { SystemConfig } from '../../shared/models/systemConfig';

export class AlertService {
    private static instance: AlertService;

    private constructor() { }

    static getInstance() {
        if (!AlertService.instance) {
            AlertService.instance = new AlertService();
        }
        return AlertService.instance;
    }

    private async getSettings() {
        const config = await SystemConfig.findOne({ key: 'notification_settings' });
        const settings = config?.value || {};
        return {
            telegramBotToken: settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN,
            telegramChatId: settings.telegramChatId || process.env.TELEGRAM_CHAT_ID,
            webhookUrl: settings.webhookUrl || process.env.ALERT_WEBHOOK_URL,
            emailEnabled: settings.emailEnabled || false,
            emailRecipients: settings.emailRecipients || []
        };
    }

    async notify(message: string, level: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO') {
        const settings = await this.getSettings();
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${level}] [${timestamp}] Joe Deployment: ${message}`;

        // 1. Log to system logger
        if (level === 'CRITICAL') {
            logger.error(formattedMessage);
        } else {
            logger.info(formattedMessage);
        }

        // 2. Telegram Notification
        if (settings.telegramBotToken && settings.telegramChatId) {
            try {
                await axios.post(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
                    chat_id: settings.telegramChatId,
                    text: formattedMessage,
                    parse_mode: 'HTML'
                });
            } catch (e: any) {
                logger.error(`[AlertService] Telegram notification failed: ${e.message}`);
            }
        }

        // 3. Generic Webhook
        if (settings.webhookUrl) {
            try {
                await axios.post(settings.webhookUrl, {
                    text: formattedMessage,
                    level,
                    timestamp,
                    source: 'joe-deployment-manager'
                });
            } catch (e: any) {
                logger.error(`[AlertService] Webhook notification failed: ${e.message}`);
            }
        }
    }

    async notifySuccess(deploymentId: string, commit: string) {
        await this.notify(
            `✅ Deployment <b>${deploymentId.slice(-6)}</b> (Commit: ${commit.slice(0, 7)}) completed successfully!`,
            'INFO'
        );
    }

    async notifyFailure(deploymentId: string, error: string) {
        await this.notify(
            `❌ <b>CRITICAL:</b> Deployment <b>${deploymentId}</b> failed!\nError: <code>${error}</code>`,
            'CRITICAL'
        );
    }

    async notifyRollback(deploymentId: string, targetCommit: string, reason: string) {
        await this.notify(
            `⚠️ <b>AUTO-ROLLBACK:</b> Deployment <b>${deploymentId}</b> encountered a failure during verification. Automatically rolling back to stable commit: <code>${targetCommit.slice(0, 7)}</code>.\nReason: ${reason}`,
            'WARNING'
        );
    }
}

export const alertService = AlertService.getInstance();
