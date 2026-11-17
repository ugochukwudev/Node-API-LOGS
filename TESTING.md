# Testing

```bash
npm test               # everything
npm run test:watch
npm run test:coverage
npm run build          # server (tsc) + dashboard bundle (esbuild); also type-checks the UI
```

Tests use Jest with an in-memory MongoDB (`mongodb-memory-server`), started in `test/setup.ts` and wiped after each test.

| Folder | Covers |
| --- | --- |
| `test/core` | masking, route filters, store-once bodies, search, export (CSV/XLSX/SQLite/JSON Lines), deleting with summaries, TOTP and encryption |
| `test/adapters` | Express, Fastify and NestJS (Express and Fastify platforms) end to end |
| `test/auth` | sign-in with 2FA, invites, lockout, backup codes, recovery CLI |
| `test/alerts` | every email provider's request, SMTP, rules, flood control, daily summary |
| `test/jobs` | job tracking, and real Bull, BullMQ, Agenda and pg-boss |
| `test/routes`, `test/controllers` | dashboard API permissions and responses |
| `test/dashboard` | dashboard shell, security headers, mount path |

Some libraries are ESM-only (Agenda 6, pg-boss 12, NestJS 12). Their tests run in a child Node process against a compiled copy of the package (`test/helpers/child-scenario.ts`).

The Redis tests (Bull, BullMQ) run when `redis-server` is installed, and the Postgres test (pg-boss) runs when `initdb` and `pg_ctl` are installed on Node 22.12+. Otherwise they're skipped, as on CI. The NestJS tests need Node 20+.
