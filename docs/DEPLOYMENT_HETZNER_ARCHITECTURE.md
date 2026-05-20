# Joe Enterprise - Hetzner Server Architecture

## Server Details
- **Hostname**: joe-server-1
- **IP**: 46.224.187.142
- **OS**: Ubuntu 24.04.4 LTS
- **Project Path**: `/root/xelitesolutions`

## Core Services Architecture

### 1. API (Backend)
- **Execution**: Runs directly on the **Host OS** as a `systemd` service.
- **Service Name**: `joe-api.service`
- **Working Directory**: `/root/xelitesolutions/api`
- **Listening On**: `0.0.0.0:8080` (Host)
- **Management Commands**:
  - `systemctl status joe-api.service`
  - `systemctl restart joe-api.service`
  - `journalctl -u joe-api.service -n 200 --no-pager`

### 2. Frontend & Proxy (Docker)
- **Web**: `joe_web` (Container) - Serves the React frontend.
- **Nginx**: `joe_nginx` (Container) - Acts as the entry point and reverse proxy.
  - Proxies `/api/*` requests to `host.docker.internal:8080`.
- **Database**: `joe_mongo` (Container) - MongoDB database.
- **Worker**: `joe_browser_worker` (Container) - Playwright/Browser execution environment.

## Deployment & Health Monitoring

### Health Checks
- **API Health**: Always use `https://[IP]/api/health`.
- **Host Check**: `curl -k http://localhost:8080/api/health` (from host).
- **Note**: Do not use `/health` without the `/api` prefix, as it might return the frontend's `index.html`.

### Other Systemd Services
- `webhook.service`: Handles GitHub webhooks.
- `sentinel-agent.service`: System monitoring and self-healing agent.

## Secrets Management
- Currently, sensitive values are stored in `/root/start_api.sh`.
- **TODO**: Move these to a secure `.env` file (e.g., `/root/xelitesolutions/api/.env`) and rotate them.

## Important Constraints
- **Docker**: Do not look for a `joe_api` container; it does not exist.
- **PM2**: PM2 is installed but empty. It must **not** be used for managing the API.
- **Firewall**: Do not close ports or modify UFW rules without explicit instructions.
