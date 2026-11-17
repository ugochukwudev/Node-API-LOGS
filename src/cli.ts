#!/usr/bin/env node
import mongoose from 'mongoose';
import User from './models/user.model';
import { createInvite, resetTwoFactor } from './core/accounts';
import { normalizeEmail } from './core/config';

const USAGE = `node-api-logs: server-side account recovery

Usage:
  npx node-api-logs invite <email>     Print a single-use setup link (24h). Works for new
                                       people and for anyone locked out: they choose a new
                                       password and set up their authenticator again.
  npx node-api-logs reset-2fa <email>  Clear someone's authenticator; they set it up again
                                       at their next sign-in (password unchanged).

Options:
  --mongo-uri <uri>   Logs database (or set MONGODB_URI / node_api_logger_mongoUri)
  --url <base>        Your app's address, to print a full link (e.g. https://api.company.com)`;

const argValue = (args: string[], flag: string) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
};

export const run = async (argv: string[], print: (line: string) => void = console.log): Promise<number> => {
    const [command, rawEmail] = argv;
    const email = normalizeEmail(rawEmail);
    if (!command || command === '--help' || command === '-h' || !['invite', 'reset-2fa'].includes(command) || !email) {
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
        if (command === 'invite') {
            const invite = await createInvite(email);
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
