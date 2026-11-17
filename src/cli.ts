#!/usr/bin/env node
import mongoose from 'mongoose';
import User from './models/user.model';
import { createInvite, invitePath, resetTwoFactor } from './core/accounts';
import { normalizeBasePath } from './dashboard/server';
import { normalizeEmail } from './core/config';
import { maskStoredLogs } from './core/migrate';
import { cleanupOrphanBlobs } from './core/blobs';
import { createRedactor } from './core/redact';

const USAGE = `node-api-logs: server-side maintenance

Usage:
  npx node-api-logs invite <email>     Print a single-use setup link (24h). Works for new
                                       people and for anyone locked out: they choose a new
                                       password and set up their authenticator again.
  npx node-api-logs reset-2fa <email>  Clear someone's authenticator; they set it up again
                                       at their next sign-in (password unchanged).
  npx node-api-logs mask-old-logs      Mask passwords, tokens and auth headers in logs saved
                                       before v3, and move their bodies to store-once storage.
                                       Use --add bvn,nin / --remove pin to match your config.
  npx node-api-logs cleanup-bodies     Delete stored bodies that no log uses any more.

Options:
  --mongo-uri <uri>   Logs database (or set MONGODB_URI / node_api_logger_mongoUri)
  --url <base>        Your app's address, to print a full link (e.g. https://api.company.com)
  --path <path>       Dashboard path if you changed dashboardPath (default /logs)`;

const argValue = (args: string[], flag: string) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
};

export const run = async (argv: string[], print: (line: string) => void = console.log): Promise<number> => {
    const [command, rawEmail] = argv;
    const email = normalizeEmail(rawEmail);
    const needsEmail = ['invite', 'reset-2fa'].includes(command);
    const known = needsEmail || ['mask-old-logs', 'cleanup-bodies'].includes(command);
    if (!command || command === '--help' || command === '-h' || !known || (needsEmail && !email)) {
        print(USAGE);
        return command === '--help' || command === '-h' ? 0 : 1;
    }

    const base = (argValue(argv, '--url') || '').replace(/\/$/, '');

    // Reuse an existing connection when run programmatically.
    const ownConnection = mongoose.connection.readyState !== 1;
    if (ownConnection) {
        const mongoUri = argValue(argv, '--mongo-uri') || process.env.MONGODB_URI || process.env.node_api_logger_mongoUri;
        if (!mongoUri) {
            print('No database given. Pass --mongo-uri or set MONGODB_URI.');
            return 1;
        }
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    }
    try {
        if (command === 'mask-old-logs') {
            const list = (flag: string) => (argValue(argv, flag) || '').split(',').map(v => v.trim()).filter(Boolean);
            const redactor = createRedactor({ add: list('--add'), remove: list('--remove') });
            const count = await maskStoredLogs(redactor, done => print(`  ${done} logs processed...`));
            print(`Done. ${count} log(s) from before v3 were masked.`);
            return 0;
        }
        if (command === 'cleanup-bodies') {
            const deleted = await cleanupOrphanBlobs();
            print(`Done. ${deleted} unused stored bod${deleted === 1 ? 'y was' : 'ies were'} deleted.`);
            return 0;
        }
        if (command === 'invite') {
            const invite = await createInvite(email);
            const dashboardPath = argValue(argv, '--path');
            if (dashboardPath) invite.path = invitePath(invite.token, normalizeBasePath(dashboardPath));
            print(`Setup link for ${email} (valid 24h, single use):`);
            print(`${base}${invite.path}`);
            if (!base) print('Open it on your app\'s address, e.g. https://your-app.com' + invite.path);
            return 0;
        }

        const user = await User.findOne({ email });
        if (!user) {
            print(`No account for ${email}. Use "invite" to create one.`);
            return 1;
        }
        await resetTwoFactor(email);
        print(`${email} will set up their authenticator again at next sign-in.`);
        return 0;
    } finally {
        if (ownConnection) await mongoose.disconnect();
    }
};

if (require.main === module) {
    run(process.argv.slice(2))
        .then(code => process.exit(code))
        .catch(err => {
            console.error(err?.message || err);
            process.exit(1);
        });
}
