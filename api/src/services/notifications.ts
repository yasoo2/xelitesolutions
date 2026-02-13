/**
 * Notification Service
 * Handles sending notifications to various channels (Slack, Discord, Email, etc.)
 */

export type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface NotificationOptions {
  title?: string;
  severity: NotificationSeverity;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Send notification to Slack
 */
export async function sendSlackNotification(options: NotificationOptions): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('SLACK_WEBHOOK_URL not configured, skipping Slack notification');
    return;
  }

  const colors: Record<NotificationSeverity, string> = {
    info: '#36a64f',
    warning: '#ff9900',
    error: '#ff0000',
    critical: '#8b0000'
  };

  const payload = {
    attachments: [{
      color: colors[options.severity],
      title: options.title || `[${options.severity.toUpperCase()}] InfinityX Alert`,
      text: options.message,
      fields: options.metadata ? Object.entries(options.metadata).map(([key, value]) => ({
        title: key,
        value: String(value),
        short: true
      })) : [],
      footer: 'InfinityX Monitoring System',
      ts: Math.floor(Date.now() / 1000)
    }]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Failed to send Slack notification:', response.statusText);
    }
  } catch (error: any) {
    console.error('Error sending Slack notification:', error.message);
  }
}

/**
 * Send notification to Discord
 */
export async function sendDiscordNotification(options: NotificationOptions): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('DISCORD_WEBHOOK_URL not configured, skipping Discord notification');
    return;
  }

  const emojis: Record<NotificationSeverity, string> = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    critical: '🚨'
  };

  const payload = {
    username: 'InfinityX Monitor',
    embeds: [{
      title: options.title || `${emojis[options.severity]} ${options.severity.toUpperCase()} Alert`,
      description: options.message,
      color: {
        info: 3066993,
        warning: 16776960,
        error: 16711680,
        critical: 9109504
      }[options.severity],
      fields: options.metadata ? Object.entries(options.metadata).map(([key, value]) => ({
        name: key,
        value: String(value),
        inline: true
      })) : [],
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Failed to send Discord notification:', response.statusText);
    }
  } catch (error: any) {
    console.error('Error sending Discord notification:', error.message);
  }
}

/**
 * Send notification to all configured channels
 */
export async function sendNotification(options: NotificationOptions): Promise<void> {
  const promises: Promise<void>[] = [];

  if (process.env.SLACK_WEBHOOK_URL) {
    promises.push(sendSlackNotification(options));
  }

  if (process.env.DISCORD_WEBHOOK_URL) {
    promises.push(sendDiscordNotification(options));
  }

  // Can add more notification channels here (Email, SMS, PagerDuty, etc.)

  await Promise.allSettled(promises);
}

/**
 * Send error notification
 */
export async function notifyError(error: Error, context?: Record<string, any>): Promise<void> {
  await sendNotification({
    severity: 'error',
    title: '❌ Error Occurred',
    message: error.message,
    metadata: {
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      ...context
    }
  });
}

/**
 * Send critical alert
 */
export async function notifyCritical(message: string, metadata?: Record<string, any>): Promise<void> {
  await sendNotification({
    severity: 'critical',
    title: '🚨 CRITICAL ALERT',
    message,
    metadata
  });
}

/**
 * Send recovery notification
 */
export async function notifyRecovery(message: string, metadata?: Record<string, any>): Promise<void> {
  await sendNotification({
    severity: 'info',
    title: '✅ System Recovered',
    message,
    metadata
  });
}
