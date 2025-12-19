# Joe Agent Browser

## Local Setup
- Set env in `api`: `BROWSER_WORKER_URL=http://localhost:7070`, `BROWSER_WORKER_KEY=change-me`
- In `services/joe-browser-worker`:
  - `npm install`
  - `npm run install-chromium`
  - `npm run build && npm start`
- In `api`:
  - `npm install`
  - `npm run build && npm start`
- In `web`:
  - `npm install`
  - `npm run build && npm run preview`

## Render Deployment
- Worker build command:
  - `npm install && npm run install-chromium && npm run build`
- Worker runtime:
  - `PORT=7070`, `WORKER_API_KEY=...`, `WORKER_STORAGE_DIR=/opt/render/project/tmp`
  - Chromium args are set by the code (`--no-sandbox`, `--disable-dev-shm-usage`)
- Core API:
  - `BROWSER_WORKER_URL=https://<worker-host>`, `BROWSER_WORKER_KEY=...`
  - Expose `GET /health`

## API (Worker)
- `POST /session/create { viewport, device } -> { sessionId, wsUrl }`
- `POST /session/:id/job/run { actions[] } -> { ok, outputs, artifacts }`
- `POST /session/:id/snapshot -> { dom, a11y, screenshot }`
- `POST /session/:id/extract { schema } -> { json, confidence }`
- `WS /ws/:id?key=...` -> frames `{ type:'frame', jpegBase64, ts, w, h }`

## Tools (Core)
- `browser_open({ url, viewport, device }) -> { sessionId, wsUrl }` + artifact `kind='browser_stream'`
- `browser_run({ sessionId, actions }) -> outputs + artifacts`
- `browser_extract({ sessionId, schema }) -> json + confidence`
- `browser_get_state({ sessionId }) -> dom + a11y + screenshot`

## Security
- API key auth on worker (`x-worker-key`)
- Incognito contexts per session + TTL auto-close
- Redaction for network logs planned; avoid logging secrets
- Domain allowlist/denylist configurable via env (future)

## Demo
Run: “Open xelitesolutions.com → take snapshot → extract page title & top links.”
Use `browser_open` then `browser_extract`.
