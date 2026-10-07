# Chat Platform — Architecture

See the project root plan (the original specification) for the full design.
Phase 1 delivers:

- Monorepo (pnpm workspaces)
- Fastify API skeleton
- MySQL + Redis connectivity
- Health endpoints
- Structured logging (Pino)
- Centralized error handling
- Graceful shutdown
- Widget bootstrap stub

Runbook:
1. `pnpm install`
2. `cp apps/api/.env.example apps/api/.env`
3. Start MySQL + Redis (Docker or local)
4. `pnpm migrate`
5. `pnpm dev:api`
6. `curl http://localhost:3000/api/v1/health`
7. `curl http://localhost:3000/api/v1/health/ready`
