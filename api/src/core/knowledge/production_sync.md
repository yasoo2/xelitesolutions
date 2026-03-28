# Production & Localhost Synchronization Guide

This document outlines the protocol for maintaining feature parity between the JOE development environment (localhost) and the production deployment.

## Goal
To ensure that all enterprise-grade tools, branding assets, and "Smart Reflex" responses are consistent across both environments.

## Core Discrepancies & Fixes

### 1. Tool Selection Cap
- **Localhost**: Often uses OpenAI models which support 128k+ contexts and large tool sets.
- **Production**: Primarily uses Gemini 1.5 Flash.
- **Protocol**: The tool selection slice for Gemini must be set to at least **100** (up from the default 10) to ensure high-tier tools (Elite/Enterprise) are not truncated.

### 2. Priority Tools
To maintain a high level of "God Mode" capability, the following tool categories must be in the `PRIORITY_TOOL_NAMES` list:
- **Elite Suite**: `dependency_graph`, `chaos_testing`, `multi_agent_debate`.
- **Infrastucture**: `terraform_ops`, `kubernetes_ops`.
- **Quality**: `sonar_analysis`, `security_scan_repo`.

### 3. Smart Reflexes (Free Intelligence Optimizer)
- Responses should always reference the unified **JOE** brand.
- The reported tool count should reflect the full capabilities (over 200 virtual and real tools).
- The `.smart_reflex_cache.json` should be synchronized during deployment to ensure learning persistence.

## Deployment Checklist
- [ ] Verify `NODE_ENV=production`
- [ ] Ensure `OPENAI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` is present.
- [ ] Check `MAX_PROVIDER_TOOLS` environment variable (Recommended: 256).
- [ ] Verify frontend branding points to `/joe`.
