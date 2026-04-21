# openclaw-service

Cogna8 OpenClaw evaluation service - deterministic rule enforcement for AI agents.

## Pack 1: Database Layer

### Setup

```bash
pnpm install
cp .env.example .env
# Edit .env with your Neon Postgres DATABASE_URL
```

### Run Migration

```bash
pnpm db:migrate
```

### Generate Prisma Client

```bash
pnpm db:generate
```

### Run Tests

```bash
# Unit tests (no database required)
pnpm test:unit

# Database integration tests (requires DATABASE_URL)
pnpm test:db

# All tests
pnpm test
```

### Schema

8 tables: `accounts`, `api_keys`, `agents`, `agent_tools`, `rules`, `rule_audit_events`, `usage_periods`, `evaluation_events`.

All enums, check constraints, partial indexes, and unique constraints are defined in the raw SQL migration at `prisma/migrations/20260408000000_pack1_init/migration.sql`.

### Utilities

- `src/lib/ids.ts` - Public ID generation (nanoid, prefixed)
- `src/lib/api-key-utils.ts` - API key generation and SHA-256 hashing
- `src/lib/rule-normalization.ts` - Rule field normalization and fingerprint construction
- `src/lib/rule-status.ts` - Rule status transition helpers with invariant validation
- `src/lib/prisma.ts` - PrismaClient factory with pg adapter

### Notes

- Prisma 7 requires `@prisma/adapter-pg` for direct database connections. The `prisma.config.ts` handles migration URL resolution.
- The migration is a single raw SQL file that creates all enums, tables, constraints, and indexes.
- Hot-path evaluation queries use normalized columns only (`toolMatch`, `targetKind`, `targetValueNormalized`, `thresholdMax`, `thresholdPeriod`), never `spec`.
- `lookupHash` and `secretHash` use the same SHA-256 algorithm in V1. Dual columns exist for future bcrypt/argon2 upgrade on `secretHash`.

