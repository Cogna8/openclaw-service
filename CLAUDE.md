# Cogna8 OpenClaw Eval Service - Claude Code Instructions

## Git Policy (MANDATORY)

Push directly to main. Do not create feature branches. Do not create pull requests. Do not force-push or rewrite git history. Ensure build and tests pass before pushing.

## Build

```
pnpm install
pnpm build        # prisma generate && next build
pnpm test         # vitest (schema.test.ts needs DATABASE_URL)
```

## Repo Structure

- `app/` - Next.js App Router (API route handlers only, no pages)
- `src/lib/` - Shared utilities (DB, errors, IDs, route handler)
- `src/middleware/` - Auth, validation, normalization, rate limiting
- `src/services/` - Business logic (evaluate, rules, agents, usage)
- `tests/` - Vitest test files
- `prisma/` - Schema and migrations

## Key Constraints

- API-only service, no UI
- Prisma 7 with Neon HTTP adapter (no direct PrismaClient import from @prisma/client)
- Never select `rules.spec` in the evaluate hot path
- Never commit secrets or .env files
- All API keys and env vars use CG8_ prefix
- Framework preset on Vercel is Next.js (already configured)
