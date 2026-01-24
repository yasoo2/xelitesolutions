# System Architecture: The Anatomy of Xelite Solutions

## 1. Core Stack
- **Backend (API)**: Node.js with Express. Written in TypeScript for maximum safety.
- **Frontend (Mission Control)**: React 18 with Vite. Uses TailwindCSS for styling and Framer Motion for Floor 5 aesthetics.
- **Database**: MongoDB (Mongoose) for long-term session and memory persistence.
- **Real-time**: WebSockets (WS) handles the heartbeat and live tool execution events.

## 2. Intelligence Layer
- **Free Intelligence Optimizer**: The 'Fast Lane' (RAG). Intercepts requests in `run.ts` to provide instant answers from the 6 Floors.
- **Planner (Genesis)**: If the Optimizer passes (Action required), the GPT-4o level Planner creates a detailed DAG (Directed Acyclic Graph) of steps.
- **Execution Engine**: `TaskExecutor` runs the tools sequentially or in parallel based on the plan.

## 3. Communication Protocols
- **SSE (Streaming)**: Responses are streamed back via NDJSON for that 'typing' effect.
- **RTL Support**: Full Arabic support is built into the frontend's CSS layers (`rtl-overrides.css`).

## 4. Deployment Pipeline
- **GitHub Actions**: Automated builds and deployments via `.github/workflows/deploy.yml`.
- **Docker**: Containerized environment for consistent scaling across dev/prod.
