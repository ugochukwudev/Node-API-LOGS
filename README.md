# node-api-logs

Request logging, queued-job tracking, email alerts and a secure dashboard for Node.js APIs. Works with **Express**, **Fastify** and **NestJS**, stores everything in **your own MongoDB**, and keeps the full request and response of every call, with passwords and tokens masked before anything is saved.

- **Every request, in full**: method, URL, status, duration, IP, headers, request and response bodies, and whatever your code logged to the console while handling it.
- **Secrets never stored**: passwords, tokens, API keys, cookies and `Authorization` headers become `********`.
- **Small storage footprint**: each unique body is stored once and reused.
- **Search anything**: status (`5xx`, `401,403`), URL text, console output, body text, or a JSON field such as `event = order.paid`.
- **Your data, readable forever**: export to CSV, Excel, SQLite or JSON Lines.
- **Jobs**: Bull, BullMQ, Agenda and pg-boss jobs with payload, result or error, console output, and the request that queued them.
- **Alerts by email**: Brevo, Resend, SendGrid, Mailgun, Postmark, SMTP or your own function, with flood control.
- **Secure dashboard**: email + password + authenticator app (2FA) for everyone, invite links, light and dark themes.

Requires **Node.js 18+** and MongoDB 4.4+.

## Install

```bash
npm install node-api-logs
```

## Quick start

### Express

```js
const express = require('express');
const { createExpressLogger } = require('node-api-logs');

const app = express();
app.use(express.json());

// Add before your routes
createExpressLogger({
  app,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.LOGS_JWT_SECRET, // required: a long random string
  admins: ['cto@company.com'],             // required: who can manage the dashboard
  beginswith: ['/api', '/webhooks'],       // optional: only log these paths
});

app.listen(3000);
```

### Fastify

```js
const Fastify = require('fastify');
const { fastifyLogger } = require('node-api-logs');

const app = Fastify();
await app.register(fastifyLogger, {
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.LOGS_JWT_SECRET,
  admins: ['cto@company.com'],
});
```

### NestJS (Express or Fastify platform)

```ts
import { NestFactory } from '@nestjs/core';
import { setupNestLogger } from 'node-api-logs';

const app = await NestFactory.create(AppModule);
await setupNestLogger(app, {
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.LOGS_JWT_SECRET,
  admins: ['cto@company.com'],
});
await app.listen(3000);
```

The logger **refuses to start** without `jwtSecret` (or the `node_api_logger_jwtSecret` environment variable) and at least one admin.

## First sign-in

1. Start your app. For each admin who hasn't signed in yet, the console prints a one-time setup link:
   ```
   node-api-logs: admin setup link for cto@company.com (valid 24h, single use): /logs/invite/…
   ```
2. Open it on your app's address (e.g. `https://api.company.com/logs/invite/…`), choose a password, and scan the QR code with **Google Authenticator** (or Microsoft Authenticator, Authy, 1Password).
3. Save the 10 backup codes. Each one signs you in once if you lose your phone.

From then on, sign in at `/logs` with email, password and the 6-digit code.

**Adding developers:** in **Settings → Team**, enter their email and copy the invite link. Send it yourself. It works once and expires in 24 hours. They choose their own password and set up their authenticator.

## Options

| Option | Default | |
| --- | --- | --- |
| `mongoUri` | required | MongoDB connection string. If Mongoose is already connected, that connection is used. |
| `admins` | required | Admin emails. Roles follow this list on every sign-in. |
| `jwtSecret` | `node_api_logger_jwtSecret` env | Signs dashboard sessions. Required. |
| `encryptionKey` | `node_api_logger_encryptionKey` env, else derived from `jwtSecret` | Encrypts authenticator secrets and email API keys. Set it if you may rotate `jwtSecret`; otherwise rotating it means everyone sets up 2FA again. |
| `dashboardPath` | `/logs` | Where the dashboard lives, e.g. `/_logs`. |
| `beginswith` | all paths | Only log paths starting with these prefixes. |
| `specifics` | none | Never log these paths: exact (`'/health'`), prefix (`'/internal/*'`) or `RegExp`. The query string is ignored. |
| `redact` | see below | `{ add: ['bvn', 'nin'], remove: ['pin'] }` |
| `maxBodyBytes` | `1048576` (1 MB) | Largest response body kept per request. Longer bodies are cut and marked `[TRUNCATED]`. |
| `alerts.sendEmail` | none | Send alert emails with your own function (see Alerts). |

## What gets masked

Before anything is saved, these are replaced with `********` in request bodies, response bodies, headers and query strings, at any depth and inside arrays. Matching ignores case, `snake_case` and `kebab-case`. Empty values stay empty.

**Fields:** `password`, `passwd`, `pwd`, `secret`, `token`, `accessToken`, `refreshToken`, `apiKey`, `authorization`, `cookie`, `otp`, `pin`, `cvv`, `cardNumber`, `ssn`
**Headers:** `Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`

```js
createExpressLogger({ ..., redact: { add: ['bvn', 'nin'], remove: ['pin'] } });
```

```json
// sent:   { "email": "ada@company.com", "password": "hunter2", "otp": "" }
// stored: { "email": "ada@company.com", "password": "********", "otp": "" }
```

Console output is stored as written; avoid logging secrets yourself.

## Queued jobs

Wrap the queue or scheduler instances you already have. Your job code and data don't change.

```js
const { trackBullQueue, trackBullMQQueue, bullmqProcessor, trackAgenda, trackPgBoss, trackJob } = require('node-api-logs');

// Bull
const emails = trackBullQueue(new Queue('emails'));
emails.process(async job => sendEmail(job.data));

// BullMQ
const queue = trackBullMQQueue(new Queue('emails', { connection }));
new Worker('emails', bullmqProcessor('emails', async job => sendEmail(job.data)), { connection });

// Agenda (call before agenda.define)
trackAgenda(agenda);

// pg-boss (call before boss.work)
trackPgBoss(boss);

// Anything else
await trackJob('send-invoice', { orderId }, () => sendInvoice(orderId));
```

Each run shows its status (waiting, delayed, active, completed, failed), masked payload, result or error, attempts, duration and console output. A job queued while handling a request is linked to it both ways, so you can follow a partner's webhook to the job it started. Using another queue library? [Open an issue](https://github.com/ugochukwudev/Node-API-LOGS/issues).

## Alerts

In **Settings → Email for alerts** (admins), pick a provider and paste its API key. Keys are stored encrypted and never shown again.

| Provider | Sends via |
| --- | --- |
| Brevo, Resend, SendGrid, Mailgun (US/EU), Postmark | HTTPS. Works on hosts that block SMTP, such as Railway. |
| SMTP (Gmail, Zoho, Outlook…) | SMTP. Needs `npm install nodemailer`. |
| Your own function | Anything (Amazon SES, internal services) |

```js
createExpressLogger({ ..., alerts: { sendEmail: async ({ to, from, subject, text, html }) => { /* … */ } } });
```

Set **Dashboard URL** so emails link straight to the request.

In **Alerts**, anyone can create rules for themselves, and admins can create team rules that email everyone. A rule matches on status (`5xx`, `500,502`), URL text, slow requests (over N ms) and, optionally, a spike (N matches within M minutes). The first match emails at once. Repeats of the same endpoint and status during the cooldown (default 15 minutes) are held and sent as one "N more" email, so an outage never floods your inbox. A daily summary email can be turned on per person.

## Your data

- **Export**: on **Requests**, filter, then **Export** as CSV (Excel/Sheets), Excel (.xlsx, up to 100,000 rows), SQLite (one file you can query with SQL; needs Node 22.5+ on the server) or JSON Lines. These are open formats you can read without this package.
- **Delete**: admins filter on **Requests** and choose **Delete matching**. Hourly totals are saved first, so Overview charts keep their history. Nothing is ever deleted automatically.
- **Hourly totals** can be deleted too, in **Settings → Stored data**.

## Server commands

Run on the server, with `MONGODB_URI` set (or `--mongo-uri`):

```bash
npx node-api-logs invite you@company.com --url https://api.company.com   # setup link (new people, lost password)
npx node-api-logs reset-2fa you@company.com                               # set up the authenticator again
npx node-api-logs mask-old-logs --add bvn,nin                             # mask secrets in logs saved before v3
npx node-api-logs cleanup-bodies                                          # delete stored bodies no log uses
```

Use `--path /_logs` with `invite` if you changed `dashboardPath`.

## Performance

Logging adds no database work to your requests. Logs are buffered and written in batches about once a second, after responses are sent. Masking, deduplication and alert checks happen at that point. If MongoDB is slow or down, logs are dropped with one warning a minute, and your app keeps running. The dashboard is about 50 KB gzipped and only loads when someone opens it.

## Security

- Email + password + authenticator code for every user. A password alone opens nothing.
- 5 wrong attempts lock an account for 15 minutes. Each code works once. Backup codes are stored as hashes.
- Admins come from config. Invite and setup links are single-use, expire after 24 hours, and only their hashes are stored.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS, and scoped to the dashboard path. Behind a proxy, enable Express `trust proxy`.
- The dashboard sends a strict Content-Security-Policy and refuses to be framed. Logged values are always rendered as text.

## Upgrading from v2

See [MIGRATION.md](./MIGRATION.md).

## License

MIT
