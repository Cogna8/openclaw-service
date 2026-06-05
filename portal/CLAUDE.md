# Cogna8 OpenClaw Portal - Claude Code Instructions

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
pnpm test         # vitest
```

## Repo Structure

- `app/` - Next.js App Router (pages and API routes)
- `src/lib/` - Shared utilities (auth, DB clients, IDs)
- `src/services/` - Business logic (user provisioning)
- `src/components/` - React components (shadcn/ui style)
- `tests/` - Vitest test files
- `prisma/` - Portal schema and migrations

## Two-Database Architecture

This app connects to two separate Neon PostgreSQL databases:

- **Portal DB** (`CG8_PORTAL_DATABASE_URL`): Prisma-managed. Stores portal users, roles, and onboarding state. Client in `src/lib/portal-db.ts`.
- **OpenClaw Service DB** (`CG8_OPENCLAW_DATABASE_URL`): Raw SQL only. Used for one operation: provisioning an `accounts` row on first sign-in. Client in `src/lib/openclaw-db.ts`.

Do not add a second Prisma schema. Keep service DB access narrow and isolated.

## Design System

- Dark-mode-first with Cogna8 Mist-style surfaces
- Primary accent: orange `#C65A20`
- Geist Sans + Geist Mono fonts
- shadcn/ui new-york style components
- Tailwind CSS with CSS variable tokens

## Super-Admin Rule

`admin@cogna8.io` must always be `role = super_admin`. This is enforced on every sign-in. The super-admin cannot be blocked or downgraded by any code path.

## Key Constraints

- JWT sessions only (no session table)
- Never commit secrets or .env files
- Env vars use `CG8_` prefix where applicable
- Do not modify `openclaw-service`
- Framework preset on Vercel is Next.js
