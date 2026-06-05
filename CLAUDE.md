# Cogna8 OpenClaw Eval Service - Claude Code Instructions

## Git Policy (MANDATORY)

Push directly to main. Do not create feature branches. Do not create pull requests. Do not force-push or rewrite git history. Ensure build and tests pass before pushing. Deploys are production-only: the Vercel Ignored Build Step is configured to skip non-production builds, so nothing deploys to preview.

Before any commit, set the repo-local identity:

```bash
git config user.email "admin@cogna8.io"
git config user.name "Cogna8"
```

The production submission email is admin@cogna8.io and only admin@cogna8.io. Never rely on a global or default git identity; Vercel Author Protection blocks deploys from any other author.

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
