# Monitoring & Observability Integration

This document outlines the monitoring, logging, and alerting integrations for the InfinityX system.

## 1. Error Tracking - Sentry Integration

### Configuration

```typescript
// api/src/monitoring/sentry.ts
import * as Sentry from '@sentry/node';

export function initializeSentry() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 1.0,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app: true }),
      ],
    });
  }
}

export { Sentry };
```

### Environment Variables

```bash
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production
```

### Implementation Status

- ✅ Tool definition exists: `api/src/tools/definitions/MonitoringTool.ts`
- ✅ Metrics collection endpoint: `api/src/routes/system.ts`
- ⚠️ **Partial**: Sentry SDK integration needs to be added
- 🔄 **Action Required**: Install `@sentry/node` and configure in main app

## 2. Application Performance Monitoring (APM)

### Metrics Collected

The existing `MonitoringTool` tracks:
- Total requests
- Success/failure rates
- Build times
- Cache hit rates
- Error logs (last 100)

### Endpoints

- `GET /api/system/metrics` - Get current metrics
- `POST /api/system/metrics/track` - Track custom events

### Code Reference

```typescript
// api/src/tools/definitions/MonitoringTool.ts
static metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalBuildTime: 0,
  averageBuildTime: 0,
  cacheHits: 0,
  cacheMisses: 0,
  errors: []
};
```

## 3. Alert Management

### Existing Implementation

File: `api/src/tools/definitions/AlertManagerTool.ts`

Features:
- Create alerts with conditions
- Trigger alerts based on thresholds
- Resolve alerts
- View alert history
- Multiple severity levels (low, medium, high, critical)

### Usage Example

```typescript
// Create an alert
await alertManager.execute({
  action: 'create',
  name: 'High Error Rate',
  condition: {
    metric: 'error_rate',
    operator: 'gt',
    threshold: 5
  },
  severity: 'high'
});

// Trigger alert
await alertManager.execute({
  action: 'trigger',
  alertId: 'alert-id',
  message: 'Error rate exceeded threshold',
  metadata: { current_rate: 7.5 }
});
```

## 4. Logging Strategy

### Current Implementation

- Morgan HTTP request logging
- Pino structured logging
- Custom tool execution logs

### Log Aggregation Options

#### Option 1: ELK Stack (Elasticsearch, Logstash, Kibana)

```yaml
# docker-compose.monitoring.yml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline
    ports:
      - "5000:5000"
```

#### Option 2: Grafana + Loki

```yaml
# docker-compose.monitoring.yml
services:
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
```

## 5. Health Check Endpoints

### Implementation

```typescript
// api/src/routes/health.ts
import express from 'express';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

router.get('/ready', async (req, res) => {
  // Check database connection
  // Check external services
  try {
    // await mongoose.connection.db.admin().ping();
    res.json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error });
  }
});

export default router;
```

## 6. Automated Recovery

### Docker Restart Policies

```yaml
# docker-compose.production.yml
services:
  api:
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  web:
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Systemd Service (for non-Docker deployments)

```ini
# /etc/systemd/system/infinityx.service
[Unit]
Description=InfinityX API Server
After=network.target

[Service]
Type=simple
User=infinityx
WorkingDirectory=/opt/joe/xelitesolutions
ExecStart=/usr/bin/node /opt/joe/xelitesolutions/api/dist/index.js
Restart=always
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

## 7. Notification Webhooks

### Slack Integration

```typescript
// api/src/monitoring/notifications.ts
export async function sendSlackNotification(message: string, severity: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const color = {
    low: '#36a64f',
    medium: '#ff9900',
    high: '#ff0000',
    critical: '#8b0000'
  }[severity] || '#808080';

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attachments: [{
        color,
        text: message,
        footer: 'InfinityX Monitoring',
        ts: Math.floor(Date.now() / 1000)
      }]
    })
  });
}
```

### Discord Integration

```typescript
export async function sendDiscordNotification(message: string, severity: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `**${severity.toUpperCase()}**: ${message}`,
      username: 'InfinityX Monitor'
    })
  });
}
```

## 8. Metrics Dashboard

### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "InfinityX Metrics",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(http_errors_total[5m])"
          }
        ]
      },
      {
        "title": "Response Time",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, http_request_duration_seconds_bucket)"
          }
        ]
      }
    ]
  }
}
```

## 9. Implementation Checklist

### Fully Implemented ✅
- [x] MonitoringTool with metrics collection
- [x] AlertManagerTool with alert management
- [x] System metrics endpoint
- [x] Error tracking in MonitoringTool
- [x] GitHub Actions for deployment
- [x] Docker restart policies

### Partially Implemented ⚠️
- [~] Sentry integration (tool exists, SDK integration needed)
- [~] Health check endpoints (basic structure, needs enhancement)
- [~] Notification webhooks (structure exists, needs implementation)

### Not Implemented ❌
- [ ] ELK/Grafana stack deployment
- [ ] Prometheus metrics export
- [ ] Real-time alerting to external services
- [ ] Uptime monitoring (e.g., UptimeRobot, Pingdom)

## 10. Environment Variables

Add to `.env`:

```bash
# Monitoring & Alerting
SENTRY_DSN=https://xxx@sentry.io/xxx
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx
GRAFANA_API_KEY=xxx
ELASTICSEARCH_URL=http://elasticsearch:9200

# Monitoring Configuration
ENABLE_METRICS=true
METRICS_INTERVAL=60000
ALERT_CHECK_INTERVAL=30000
```

## Next Steps

1. Install Sentry SDK: `npm install @sentry/node`
2. Create health check routes
3. Set up monitoring dashboard (Grafana or similar)
4. Configure notification webhooks
5. Deploy monitoring stack (ELK or Grafana+Loki)
