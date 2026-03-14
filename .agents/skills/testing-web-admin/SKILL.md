# Testing XElite Solutions Web Admin

## App Structure
- Frontend: React + Vite (in `web/` directory)
- Backend: Node.js API (in `api/` directory)
- Production URL: https://xelitesolutions.com
- CI/CD: Cloudflare Pages deploys previews for PRs

## Routing
- Landing page: `/`
- Login: `/login`
- Main app (Joe): `/joe` (requires auth via `RequireAuth`)
- Admin panel: `/super-admin` (requires admin via `RequireSuperAdmin`)
- `/admin/deployments` and `/super-admin/deployments` both redirect to `/super-admin`
- The admin panel is rendered by `SystemManagement.tsx` which has tabs: dashboard, deployments, admins
- **Note**: `DeploymentsPage.tsx` exists but is NOT imported by any route. It may be dead code or a future replacement. Check `main.tsx` routes to confirm before testing.

## Auth & Access
- Admin access requires JWT with role `SUPER_ADMIN` or `OWNER`, or specific whitelisted emails
- Vite dev server has auth bypass: add `?auth_bypass=true` query param (only works in dev mode, i.e., `import.meta.env.DEV === true`)
- The auth bypass only works for `RequireAuth` routes, NOT for `RequireSuperAdmin` routes
- To access `/super-admin` locally, you need to set a valid JWT token in localStorage manually
- The Vite dev server has an API shim (`vite.config.ts`) that provides mock responses when the real API is down, including a dev JWT token

## Local Development
- Run frontend: `cd web && npx vite` (defaults to port 5000, falls back to next available)
- The Vite proxy forwards `/api` to `http://127.0.0.1:5001` - make sure the API server port doesn't conflict with Vite's port
- API shim creates a dev JWT with OWNER role when the real API is unavailable
- Type checking: `cd web && npx tsc --noEmit --project tsconfig.json`
- No eslint config exists for ESLint v9 yet (eslint.config.js is missing)

## Testing Cloudflare Preview Deployments
- Cloudflare Pages preview URLs have no backend - API calls will fail
- You can verify the frontend build loads and check browser console for JS errors
- You can download built JS bundles with curl and search for patterns to verify fixes
- If a component is not imported (tree-shaken), its code won't appear in the production bundle

## Key Files
- Routes: `web/src/main.tsx`
- Config (API_URL, WS_URL): `web/src/config.ts`
- Admin panel: `web/src/pages/admin/SystemManagement.tsx`
- Deployments page (orphaned): `web/src/pages/admin/DeploymentsPage.tsx`
- Vite config with API shim: `web/vite.config.ts`

## Devin Secrets Needed
- No secrets currently needed for basic frontend testing
- For full admin testing, you would need login credentials for an OWNER or SUPER_ADMIN account on the production site
