# GitHub Actions Workflows - InfinityX CI/CD

This directory contains all GitHub Actions workflows for the InfinityX (Joe Enterprise) project.

## 📋 Workflows Overview

### 1. **Production Deployment** (`deploy.yml`)
**Status:** ✅ Active and Enforced  
**Trigger:** Push to `main` branch, Manual dispatch  
**Purpose:** Automated deployment to production server

**Features:**
- SSH-based deployment with automatic port detection
- Docker container orchestration
- SSL/TLS certificate management (Let's Encrypt)
- Deployment verification via health check
- Automatic secret injection

**Environment Variables:**
- `SSH_HOST` - Production server hostname
- `SSH_PORT` - SSH port (auto-detected: 22, 2222, 443)
- `SSH_PRIVATE_KEY` - Private key for authentication
- `DEPLOY_PATH` - Deployment directory on server
- `GOOGLE_CLIENT_ID` - OAuth credentials
- `GOOGLE_CLIENT_SECRET` - OAuth credentials

### 2. **CI - Test & Quality** (`ci-test.yml`)
**Status:** ✅ Implemented  
**Trigger:** Push/PR to `main`, `develop`, `copilot/**` branches  
**Purpose:** Continuous integration with quality checks

**Jobs:**
1. **lint** - Code quality check with ESLint
2. **test** - Run unit and integration tests
3. **build** - Compile and verify builds
4. **coverage** - Generate and upload coverage reports

**Artifacts:**
- Build outputs (API + Web dist)
- Coverage reports (uploaded to Codecov)

### 3. **Security Scanning** (`security-scan.yml`)
**Status:** ✅ Implemented  
**Trigger:** Push/PR to `main`, `develop`, Weekly schedule (Monday), Manual  
**Purpose:** Comprehensive security analysis

**Scans:**
1. **CodeQL** - Advanced semantic code analysis
2. **npm audit** - Dependency vulnerability scanning
3. **Snyk** - Third-party security scanning
4. **TruffleHog** - Secret detection in commits
5. **Trivy** - Container image vulnerability scanning
6. **OWASP** - Dependency security analysis

**Security Reports:**
- SARIF files uploaded to GitHub Security tab
- HTML reports as workflow artifacts

### 4. **Auto-Maintenance** (`auto-maintenance.yml`)
**Status:** ✅ Implemented  
**Trigger:** Weekly schedule (Sunday), Manual  
**Purpose:** Automated system maintenance

**Tasks:**
1. **cleanup-artifacts** - Remove artifacts older than 30 days
2. **cleanup-caches** - Clean GitHub Actions caches
3. **cleanup-docker** - Prune Docker resources
4. **health-check** - Verify production endpoint

### 5. **Dependency Updates** (`dependency-update.yml`)
**Status:** ✅ Implemented  
**Trigger:** Daily schedule (02:00 UTC), Manual  
**Purpose:** Automated dependency management

**Features:**
- Check for outdated dependencies
- Create PR with updates automatically
- Labels: `dependencies`, `automated`

## 🔒 Required Secrets

Configure these secrets in GitHub Repository Settings → Secrets and variables → Actions:

### Deployment
```
SSH_HOST          - Production server IP/hostname
SSH_PORT          - SSH port (optional, auto-detected)
SSH_PRIVATE_KEY   - SSH private key for authentication
SSH_KNOWN_HOSTS   - SSH known_hosts entry (optional)
USERNAME          - SSH username (default: root)
DEPLOY_PATH       - Deployment directory (optional, auto-detected)
```

### OAuth & Services
```
GOOGLE_CLIENT_ID        - Google OAuth client ID
GOOGLE_CLIENT_SECRET    - Google OAuth client secret
GOOGLE_API_KEY          - Google API key (Gemini)
```

### Monitoring & Security
```
CODECOV_TOKEN     - Codecov upload token
SNYK_TOKEN        - Snyk API token
SENTRY_DSN        - Sentry error tracking DSN (optional)
```

### Notifications (Optional)
```
SLACK_WEBHOOK_URL    - Slack incoming webhook
DISCORD_WEBHOOK_URL  - Discord webhook
```

## 📊 Branch Protection Rules

**Recommended settings for `main` branch:**

1. **Require pull request reviews**
   - Required approving reviews: 1
   - Dismiss stale reviews: ✅

2. **Require status checks to pass**
   - lint (ci-test)
   - test (ci-test)
   - build (ci-test)
   - CodeQL (security-scan)

3. **Require branches to be up to date**: ✅

4. **Include administrators**: ✅

5. **Require linear history**: ✅

**How to enable:**
1. Go to Repository Settings → Branches
2. Add rule for `main` branch
3. Configure above settings
4. Save changes

## 🔄 Dependabot Configuration

File: `.github/dependabot.yml`

**Monitored ecosystems:**
- npm (root, api, web) - Weekly updates
- GitHub Actions - Weekly updates
- Docker - Weekly updates

**PR Strategy:**
- Development dependencies grouped
- Production dependencies grouped
- Auto-labeling and auto-assignment

## 🚀 Workflow Triggers

### Automatic Triggers
- **deploy.yml**: Every push to `main`
- **ci-test.yml**: Every push/PR to `main`, `develop`, `copilot/**`
- **security-scan.yml**: Push to `main`, PRs to `main`, Weekly Monday
- **auto-maintenance.yml**: Weekly Sunday 00:00 UTC
- **dependency-update.yml**: Daily 02:00 UTC

### Manual Triggers
All workflows support manual dispatch via Actions tab:
1. Go to Actions tab
2. Select workflow
3. Click "Run workflow"
4. Choose branch and parameters

## 📈 Monitoring Workflow Runs

**View workflow runs:**
1. Go to Actions tab
2. Filter by workflow name
3. Click on a run to see details

**Check deployment status:**
- Latest deployment commit displayed in production
- Health check confirms site availability
- Docker container logs available

## 🐛 Troubleshooting

### Deployment Failures

**Issue:** SSH connection timeout
```bash
# Check SSH accessibility
ssh -p 22 user@host
ssh -p 2222 user@host
ssh -p 443 user@host
```

**Issue:** Docker build fails
```bash
# Check disk space on server
df -h
docker system df

# Clean up if needed
docker system prune -a --volumes -f
```

**Issue:** SSL certificate problems
```bash
# Check certificate status
sudo certbot certificates

# Renew manually if needed
sudo certbot renew
```

### CI Test Failures

**Issue:** Lint errors
```bash
# Run locally
npm --prefix api run lint
npm --prefix web run lint

# Auto-fix
npm --prefix api run lint -- --fix
```

**Issue:** Build failures
```bash
# Install dependencies
npm ci
npm --prefix api ci
npm --prefix web ci

# Build locally
npm run build
```

### Security Scan Issues

**Issue:** CodeQL fails
- Ensure code compiles successfully
- Check for syntax errors
- Review CodeQL logs in workflow

**Issue:** Secret detected
- Remove from code immediately
- Rotate the compromised secret
- Update in GitHub Secrets

## 📝 Adding New Workflows

1. Create `.github/workflows/your-workflow.yml`
2. Define trigger, jobs, and steps
3. Test with manual dispatch first
4. Add required secrets if needed
5. Update this documentation

**Example template:**
```yaml
name: Your Workflow

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  your-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Your step
        run: echo "Hello"
```

## 🔗 Related Documentation

- [INFRASTRUCTURE_ANALYSIS.md](../docs/INFRASTRUCTURE_ANALYSIS.md) - Complete infrastructure analysis
- [MONITORING.md](../docs/MONITORING.md) - Monitoring and alerting setup
- [README.md](../README.md) - Project overview

## 📞 Support

For workflow issues:
1. Check workflow logs in Actions tab
2. Review this documentation
3. Check related documentation
4. Open an issue with workflow run link

---

**Last Updated:** 2026-02-13  
**Version:** 1.0  
**Maintainer:** InfinityX Team
