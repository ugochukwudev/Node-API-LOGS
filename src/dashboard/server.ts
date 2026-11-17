import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import apiRoutes from '../routes/api';
import authRoutes from '../routes/auth';

// Built by scripts/build-ui.mjs next to the compiled server code (dist/ui).
export const UI_DIR = path.join(__dirname, '../ui');

const VERSION: string = (() => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../../package.json').version;
    } catch {
        return 'dev';
    }
})();

/** `/logs`, `/_logs`, `/admin/logs`: letters, digits, - and _ only. */
export const normalizeBasePath = (input?: string) => {
    const base = ('/' + String(input ?? '/logs').trim().replace(/^\/+|\/+$/g, '')).replace(/\/+/g, '/');
    if (base === '/' || !/^(\/[A-Za-z0-9_-]+)+$/.test(base)) {
        throw new Error(`node-api-logs: dashboardPath must look like "/logs" (got "${input}")`);
    }
    return base;
};

const indexHtml = (base: string) => `<!doctype html>
<html lang="en" data-base="${base}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>API Logs</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563eb'/%3E%3Cpath d='M8 21h4l3-9 3 12 3-7h3' stroke='white' stroke-width='2.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="${base}/assets/app.css?v=${VERSION}">
<script src="${base}/assets/app.js?v=${VERSION}" defer></script>
</head>
<body><div id="app"></div><noscript>The API Logs dashboard needs JavaScript.</noscript></body>
</html>`;

const securityHeaders: express.RequestHandler = (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    // No inline scripts anywhere; charts set inline styles, QR codes are data: images.
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    );
    next();
};

/**
 * The whole dashboard (pages, API, sign-in) as one Express app that only
 * answers under `base`. Any framework can hand it raw Node requests.
 */
export const createDashboard = (base: string) => {
    const router = express.Router();
    router.use(securityHeaders);
    router.use(cookieParser());
    router.use('/api', apiRoutes);
    router.use('/auth', authRoutes);
    router.use('/assets', express.static(UI_DIR, { maxAge: '365d', immutable: true, index: false, fallthrough: false }));

    const html = indexHtml(base);
    const builtUi = fs.existsSync(path.join(UI_DIR, 'app.js'));
    // Every other GET is a dashboard page; the browser app does the routing.
    router.get('*', (req, res) => {
        if (!builtUi) {
            return res.status(500).type('text').send('node-api-logs: dashboard files are missing. Run `npm run build` in the package.');
        }
        res.setHeader('Cache-Control', 'no-cache');
        res.type('html').send(html);
    });
    router.all('*', (req, res) => res.status(404).json({ message: 'Not found' }));

    const app = express();
    app.disable('x-powered-by');
    app.use(base, router);
    return app;
};

/** True when a URL belongs to the dashboard mounted at `base`. */
export const isDashboardUrl = (url: string, base: string) => {
    const pathOnly = url.split('?')[0];
    return pathOnly === base || pathOnly.startsWith(`${base}/`);
};
