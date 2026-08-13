# Testing Joe IDE - Neural Interaction & Worklog

## Overview
The Joe IDE is the main interface at `/joe` route. It contains the CommandComposer (chat interface), NeuralThinkingIndicator (AI thinking visualization), TaskTracker (worklog), and TodosPanel.

## Environment Setup

### Running the Frontend
```bash
cd web
npx vite --host 0.0.0.0 --port 5173
```
- Vite dev server includes an **API shim** that provides mock responses when the backend is unavailable at port 5001
- The shim serves fake JWT tokens, empty session lists, and basic health checks
- WebSocket connections will fail without backend, but the UI still loads

### Auth Bypass (Dev Mode)
- Navigate to `/joe?auth_bypass=true` to skip login in development
- The `RequireAuth` component in `main.tsx` generates a dev JWT token when `auth_bypass=true` query param is present
- Only works in Vite dev mode (`import.meta.env.DEV`)

### Running the Backend
```bash
cd api
npm run dev  # Starts on port 5001
```
- Requires environment variables (API keys for LLM providers, MongoDB connection, etc.)
- Without backend, you can still test frontend UI components via console simulation

## Testing Without Backend (Console Simulation)

When no backend is running, you can test the neural interaction and worklog UI by temporarily exposing SocketService to window. Add this temporarily to `web/src/services/socket.ts`:

```typescript
// Add before `export const SocketService = {`
(window as any).__socketInternals = {
  getListeners: () => listeners,
  pushThinkingDetail: (d: string) => { thinkingDetails.push(d); thinkingDetailsListeners.forEach(cb => { try { cb([...thinkingDetails]); } catch {} }); },
  setTaskTrackerData: (d: any[]) => { taskTrackerData = d; taskTrackerListeners.forEach(cb => { try { cb(d); } catch {} }); },
};

// Add after the SocketService export block
(window as any).__SocketService = SocketService;
(window as any).__dispatchFakeSocketMsg = (msg: any) => {
  listeners.forEach(l => { try { l(msg); } catch {} });
};
```

### Simulating a Full Agent Run

1. **Trigger thinking state** (sets CommandComposer status to 'thinking'):
```js
window.__SocketService.setThinkingPhase('analyzing');
window.__dispatchFakeSocketMsg({ type: 'step_started', data: { name: 'analyze_code' }, id: 'step_1', ts: Date.now() });
```

2. **Cycle through phases**:
```js
window.__SocketService.setThinkingPhase('synthesizing'); // Green dots, "Joe يخطط..."
window.__SocketService.setThinkingPhase('executing');    // Gold dots, "Joe ينفذ..."
```

3. **Add thinking details** (matrix-style log lines):
```js
window.__socketInternals.pushThinkingDetail('> Analyzing project structure...');
window.__socketInternals.pushThinkingDetail('> Found 15 TypeScript files');
```

4. **Show TaskTracker** (worklog):
```js
window.__socketInternals.setTaskTrackerData([
  { id: '1', label: 'Task name', status: 'completed' },
  { id: '2', label: 'Current task', status: 'in_progress' },
  { id: '3', label: 'Future task', status: 'pending' }
]);
```

5. **Reset to idle**:
```js
window.__SocketService.setThinkingPhase('idle');
window.__dispatchFakeSocketMsg({ type: 'run_finished', id: 'rf_1', ts: Date.now() });
window.__socketInternals.setTaskTrackerData([]);
```

## Key Architecture Notes

### State Flow
- `SocketService` (socket.ts) manages WebSocket connection and internal state (thinking phase, details, task tracker data)
- Components subscribe to SocketService via `subscribeThinkingPhase()`, `subscribeThinkingDetails()`, `subscribeTaskTracker()`
- `CommandComposer.tsx` has a local `status` state ('idle' | 'thinking' | 'answering') that controls NeuralThinkingIndicator visibility
- `status` is set to 'thinking' by `showTool()` (triggered by step_started/tool_start events) or by `run()` when user sends a message
- `run()` resets status to 'idle' on API error, so you can't test by sending messages without a backend

### Event Deduplication
- `socket.ts` deduplicates incoming messages by `id` field
- `ws.ts` (backend) must generate unique IDs for each thinking_phase/thinking_detail event using a sequence counter
- Without unique IDs, only the first thinking event of each type would be processed

### Neural Thinking Phases
- `analyzing` (cyan, "Joe يفكر...")
- `synthesizing` (green, "Joe يخطط...")
- `executing` (gold, "Joe ينفذ...")
- `idle` (hidden when no details)

### Common Issues
- **Neural indicator not showing**: Check if `quietMode` is blocking it in CommandComposer, or if the `visible` prop early-return is too aggressive in NeuralThinkingIndicator
- **Events being dropped**: Check the dedup logic in socket.ts `onmessage` - events need unique `id` fields
- **TaskTracker not appearing**: Ensure `task_tracker` or `todo_update` events include properly structured task arrays with `label` (or `content`) and `status` fields

## Devin Secrets Needed
No secrets are required for frontend-only testing with auth bypass.
For full backend testing, the following would be needed:
- LLM API keys (OpenAI, Anthropic, etc.)
- MongoDB connection string
- Any other backend environment variables from `.env.example`
