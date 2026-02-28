import axios from 'axios';
import { logger } from '../utils/logger';

export class AlertService {
    private static instance: AlertService;
    private telegramBotToken: string | undefined;
    private telegramChatId: string | undefined;
    private webhookUrl: string | undefined;

    private constructor() {
        this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
        this.webhookUrl = process.env.ALERT_WEBHOOK_URL;
    }

    static getInstance() {
        if (!AlertService.instance) {
            AlertService.instance = new AlertService();
        }
        return AlertService.instance;
    }

    async notify(message: string, level: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO') {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${level}] [${timestamp}] Joe Deployment: ${message}`;

        // 1. Log to system logger
        if (level === 'CRITICAL') {
            logger.error(formattedMessage);
        } else {
            logger.info(formattedMessage);
        }

        // 2. Telegram Notification
        if (this.telegramBotToken && this.telegramChatId) {
            try {
                await axios.post(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
                    chat_id: this.telegramChatId,
                    text: formattedMessage,
                    parse_mode: 'HTML'
                });
            } catch (e: any) {
                logger.error(`[AlertService] Telegram notification failed: ${e.message}`);
            }
        }

        // 3. Generic Webhook
        if (this.webhookUrl) {
            try {
                await axios.post(this.webhookUrl, {
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
