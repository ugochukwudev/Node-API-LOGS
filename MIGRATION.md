# Upgrading from v2 to v3

v3 keeps your existing logs and users, but sign-in and configuration change. Plan about 10 minutes.

## 1. Update the config

```diff
 createExpressLogger({
-  app: app as any,
+  app,
   mongoUri: process.env.MONGODB_URI,
+  jwtSecret: process.env.LOGS_JWT_SECRET,   // now required (or node_api_logger_jwtSecret)
+  admins: ['cto@company.com'],              // now required
   beginswith: ['/api'],
   specifics: ['/auth'],
 });
```

- **`jwtSecret` is required.** v2 fell back to a hard-coded secret, which let anyone forge a session. If you already set `node_api_logger_jwtSecret`, nothing changes.
- **`admins` is required.** v2 made whoever signed in first an admin. Roles now follow this list.
- **Node.js 18+** is required.
- `specifics` now matches the path and ignores the query string. `'/internal/*'` and regular expressions work.
- `app as any` is no longer needed for TypeScript.

## 2. Everyone sets up two-step sign-in

Existing sessions end when you deploy v3. Each person:

1. Signs in at `/logs` with their v2 email and password.
2. Scans a QR code with an authenticator app and saves their backup codes.

Admins without a password get a setup link printed in the server console at startup. Someone locked out? Run `npx node-api-logs invite them@company.com` on the server.

Adding people: v2's "add user with a password" is replaced by **invite links** in Settings → Team.

## 3. Dashboard URLs

| v2 | v3 |
| --- | --- |
| `/logs/home` | `/logs` (Overview) |
| `/logs` | `/logs/requests` |
| `/logs/<id>` | `/logs/requests/<id>` |
| `/js/*`, `/styles/*` at your app's root | removed; everything is under `/logs` |

Old links redirect. You can move the dashboard with `dashboardPath: '/_logs'`.

## 4. Optional: mask secrets in old logs

v2 stored passwords, tokens and auth headers as sent. To mask them in logs you already have, and move their bodies to the new store-once format:

```bash
MONGODB_URI=… npx node-api-logs mask-old-logs            # add --add bvn,nin to match your redact config
```

It only touches v2 logs and is safe to run more than once.

## 5. Optional: new features

- Queue tracking: `trackBullQueue`, `trackBullMQQueue`, `trackAgenda`, `trackPgBoss`, `trackJob` (see README).
- Email alerts: Settings → Email for alerts, then the Alerts page.
- Fastify and NestJS: `fastifyLogger`, `setupNestLogger`.

## Removed

- `CreateNextLogger` (it did nothing).
- `POST /logs/auth/add-user` (use invites).
- The repository's `cleanup-indexes.js` and `test-performance.js` scripts.
