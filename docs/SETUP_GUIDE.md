# Quick Setup Guide - Enabling Optional Features

This guide shows how to enable the optional features identified in the infrastructure analysis.

## 🎯 Priority 1: GitHub Branch Protection (5 minutes)

**Why:** Enforce quality checks before merging to main

**Steps:**
1. Go to: https://github.com/yasoo2/xelitesolutions/settings/branches
2. Click "Add rule" or "Add branch protection rule"
3. Branch name pattern: `main`
4. Check these boxes:
   - ✅ Require a pull request before merging
     - Required approvals: 1
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
     - ✅ Require branches to be up to date before merging
     - Search and select these checks:
       - `lint` (from ci-test.yml)
       - `test` (from ci-test.yml)
       - `build` (from ci-test.yml)
       - `CodeQL` (from security-scan.yml)
   - ✅ Require conversation resolution before merging
   - ✅ Include administrators
5. Click "Create" or "Save changes"

**Result:** Main branch now protected with quality gates ✅

---

## 🧪 Priority 2: Add Test Framework (1-2 hours)

**Why:** Enable automated testing with coverage

### Option A: Jest (Recommended for Node.js)

```bash
# Install Jest
cd api
npm install --save-dev jest @types/jest ts-jest

# Create config
npx ts-jest config:init

# Add to package.json
```

Edit `api/package.json`:
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "roots": ["<rootDir>/src"],
    "testMatch": ["**/__tests__/**/*.test.ts"],
    "collectCoverageFrom": [
      "src/**/*.ts",
      "!src/**/*.d.ts",
      "!src/__tests__/**"
    ],
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 70,
        "lines": 70,
        "statements": 70
      }
    }
  }
}
```

Create sample test `api/src/__tests__/health.test.ts`:
```typescript
import request from 'supertest';
import express from 'express';
import healthRouter from '../routes/health';

const app = express();
app.use('/api', healthRouter);

describe('Health Endpoints', () => {
  it('should return healthy status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });

  it('should return liveness status', async () => {
    const response = await request(app).get('/api/live');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('alive');
  });
});
```

```bash
# Install supertest for testing
npm install --save-dev supertest @types/supertest

# Run tests
npm test

# Check coverage
npm run test:coverage
```

### Option B: Vitest (Recommended for modern projects)

```bash
cd api
npm install --save-dev vitest @vitest/ui

# Create vitest.config.ts
```

Create `api/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70
      }
    }
  }
});
```

Edit `api/package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Result:** Tests can now run in CI pipeline ✅

---

## 📊 Priority 3: Sentry Error Tracking (30 minutes)

**Why:** Real-time error monitoring in production

### Step 1: Install Sentry SDK

```bash
cd api
npm install @sentry/node @sentry/profiling-node
```

### Step 2: Initialize Sentry

Create `api/src/monitoring/sentry.ts`:
```typescript
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export function initializeSentry() {
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.warn('SENTRY_DSN not set, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new ProfilingIntegration(),
    ],
  });

  console.log('✅ Sentry initialized for error tracking');
}

export { Sentry };
```

### Step 3: Add to Main App

Edit `api/src/index.ts` (add at the top):
```typescript
import { initializeSentry, Sentry } from './monitoring/sentry';

// Initialize Sentry FIRST (before other imports)
initializeSentry();

// ... rest of your imports

// Add error handler LAST
app.use(Sentry.Handlers.errorHandler());
```

### Step 4: Add GitHub Secret

1. Go to: https://github.com/yasoo2/xelitesolutions/settings/secrets/actions
2. Click "New repository secret"
3. Name: `SENTRY_DSN`
4. Value: Your Sentry DSN from https://sentry.io/settings/projects/
5. Click "Add secret"

### Step 5: Update deploy workflow

The secret is already configured to be passed to the server in `deploy.yml`.
Just ensure `.env` on the server contains:
```bash
SENTRY_DSN=https://xxx@sentry.io/xxx
```

**Result:** Errors automatically tracked in Sentry dashboard ✅

---

## 🐳 Priority 4: Docker Health Checks (15 minutes)

**Why:** Enable Docker to automatically restart unhealthy containers

Edit `docker-compose.production.yml`:

```yaml
services:
  api:
    # ... existing config
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  web:
    # ... existing config
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

  mongo:
    # ... existing config
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

**Result:** Containers auto-restart when health checks fail ✅

---

## 🔔 Priority 5: Notification Webhooks (10 minutes)

**Why:** Get instant alerts for errors and deployments

### Slack Setup

1. Go to: https://api.slack.com/apps
2. Create a new app → "From scratch"
3. Enable "Incoming Webhooks"
4. Add webhook to workspace
5. Copy webhook URL
6. Add to GitHub Secrets:
   - Name: `SLACK_WEBHOOK_URL`
   - Value: `https://hooks.slack.com/services/XXX/YYY/ZZZ`

### Discord Setup

1. Open Discord server → Server Settings → Integrations
2. Create Webhook
3. Copy webhook URL
4. Add to GitHub Secrets:
   - Name: `DISCORD_WEBHOOK_URL`
   - Value: `https://discord.com/api/webhooks/XXX/YYY`

### Update Environment

Add to `.env`:
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/XXX/YYY
```

### Test Notifications

```typescript
import { sendNotification } from './services/notifications';

// Test
await sendNotification({
  severity: 'info',
  title: 'Deployment Successful',
  message: 'InfinityX deployed to production',
  metadata: { commit: 'abc123', time: new Date().toISOString() }
});
```

**Result:** Instant notifications for errors and events ✅

---

## 📈 Priority 6: Codecov Integration (5 minutes)

**Why:** Visualize test coverage trends

1. Go to: https://codecov.io/
2. Sign in with GitHub
3. Add repository `yasoo2/xelitesolutions`
4. Copy upload token
5. Add to GitHub Secrets:
   - Name: `CODECOV_TOKEN`
   - Value: Your token

The CI workflow already includes Codecov upload!

**Result:** Coverage reports visible at https://codecov.io/gh/yasoo2/xelitesolutions ✅

---

## 🔒 Priority 7: Snyk Security Scanning (5 minutes)

**Why:** Advanced dependency vulnerability scanning

1. Go to: https://snyk.io/
2. Sign in with GitHub
3. Add repository
4. Go to Settings → Service Accounts
5. Create token
6. Add to GitHub Secrets:
   - Name: `SNYK_TOKEN`
   - Value: Your token

The security workflow already includes Snyk!

**Result:** Advanced security scanning in CI ✅

---

## ✅ Verification Checklist

After completing above steps, verify:

- [ ] Branch protection enabled on `main`
- [ ] Tests run successfully: `npm test`
- [ ] Coverage meets thresholds
- [ ] Sentry captures test error
- [ ] Docker health checks working: `docker ps` (shows healthy)
- [ ] Notifications received in Slack/Discord
- [ ] Codecov shows coverage report
- [ ] Snyk scan completes in CI

---

## 🆘 Troubleshooting

### Tests fail to run
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm test
```

### Sentry not capturing errors
- Check SENTRY_DSN is set
- Verify initialization happens before app code
- Test with: `Sentry.captureMessage('test')`

### Health checks fail
- Ensure ports are correct (3001 for API, 80 for web)
- Check containers can access themselves: `docker exec <container> curl localhost:3001/api/health`

### Notifications not working
- Verify webhook URLs are correct
- Test webhooks with curl
- Check environment variables are loaded

---

## 📞 Support

For issues:
1. Check this guide
2. Review [INFRASTRUCTURE_ANALYSIS.md](INFRASTRUCTURE_ANALYSIS.md)
3. Check workflow logs in GitHub Actions
4. Open an issue with error details

---

**Last Updated:** 2026-02-13  
**Version:** 1.0
