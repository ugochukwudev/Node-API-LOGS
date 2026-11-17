import { Types } from "mongoose";
import User from "../../src/models/user.model";
import { AlertRule, AlertState, EmailSettings } from "../../src/models/alerts.model";
import { setCustomSender } from "../../src/alerts/email";
import {
	evaluateLogs,
	invalidateAlertCache,
	ruleMatches,
	sendDailyDigests,
	sendFollowUps,
	WrittenLog,
} from "../../src/alerts/engine";
import { writeLogs } from "../helpers/write-logs";

let sent: { to: string; subject: string; text: string }[];

const log = (overrides: Partial<WrittenLog> = {}): WrittenLog => ({
	_id: new Types.ObjectId(),
	method: "POST",
	endpoint: "/api/payments",
	status: 500,
	responseTime: 120,
	date: new Date(),
	...overrides,
});

const makeUser = (email: string) => User.create({ email, password: "hash", role: "dev" });

describe("alert engine", () => {
	let owner: any;

	beforeEach(async () => {
		sent = [];
		setCustomSender(async (m) => {
			sent.push(m);
		});
		await EmailSettings.updateOne({ _id: "email" }, { dashboardUrl: "https://api.company.com" }, { upsert: true });
		owner = await makeUser("owner@company.com");
		invalidateAlertCache();
	});

	afterAll(() => setCustomSender(undefined));

	const rule = (overrides: Record<string, unknown> = {}) =>
		AlertRule.create({ name: "Payments down", ownerId: owner._id, statuses: "5xx", ...overrides }).then((r) => {
			invalidateAlertCache();
			return r;
		});

	it("matches statuses, endpoint text and slow requests", () => {
		const base = { statuses: "", endpoint: "", minMs: null };
		expect(ruleMatches({ ...base, statuses: "5xx" }, log())).toBe(true);
		expect(ruleMatches({ ...base, statuses: "401,403" }, log())).toBe(false);
		expect(ruleMatches({ ...base, endpoint: "PAYMENTS" }, log())).toBe(true);
		expect(ruleMatches({ ...base, minMs: 1000 }, log())).toBe(false);
	});

	it("emails the owner at once, with a link to the log", async () => {
		await rule();
		const l = log();
		await evaluateLogs([l]);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe("owner@company.com");
		expect(sent[0].subject).toBe("[API Logs] 500 on POST /api/payments");
		expect(sent[0].text).toContain(`https://api.company.com/logs/requests/${l._id}`);
	});

	it("holds repeats during the cooldown, then sends one 'N more' follow-up", async () => {
		const r = await rule({ cooldownMin: 15 });
		await evaluateLogs([log()]);
		await evaluateLogs([log(), log()]);
		await evaluateLogs([log()]);
		expect(sent).toHaveLength(1);

		// Not yet: still cooling down
		await sendFollowUps();
		expect(sent).toHaveLength(1);

		// Cooldown over
		await AlertState.updateMany({ ruleId: r._id }, { lastSentAt: new Date(Date.now() - 16 * 60 * 1000) });
		await sendFollowUps();
		expect(sent).toHaveLength(2);
		expect(sent[1].subject).toBe("[API Logs] 3 more: 500 on POST /api/payments");
		await sendFollowUps();
		expect(sent).toHaveLength(2);
	});

	it("reports held matches in the next immediate email after the cooldown", async () => {
		const r = await rule({ cooldownMin: 15 });
		await evaluateLogs([log()]);
		await evaluateLogs([log(), log()]);
		await AlertState.updateMany({ ruleId: r._id }, { lastSentAt: new Date(Date.now() - 16 * 60 * 1000) });
		await evaluateLogs([log()]);
		expect(sent).toHaveLength(2);
		expect(sent[1].text).toContain("Plus 2 more since the previous email.");
	});

	it("keeps separate cooldowns per endpoint and status", async () => {
		await rule();
		await evaluateLogs([log(), log({ status: 502 }), log({ endpoint: "/api/orders" })]);
		expect(sent).toHaveLength(3);
	});

	it("only fires a spike rule once the count is reached", async () => {
		await rule({ spikeCount: 3, spikeWindowMin: 5 });
		await writeLogs([{ method: "POST", endpoint: "/api/payments", status: 500 }]);
		await evaluateLogs([log()]);
		expect(sent).toHaveLength(0);
		await writeLogs([
			{ method: "POST", endpoint: "/api/payments", status: 500 },
			{ method: "POST", endpoint: "/api/payments", status: 503 },
		]);
		await evaluateLogs([log()]);
		expect(sent).toHaveLength(1);
		expect(sent[0].subject).toBe("[API Logs] 3 matching errors in 5 min (Payments down)");
	});

	it("sends team rules to everyone with an account, not to pending invites", async () => {
		await makeUser("dev@company.com");
		await User.create({ email: "invited@company.com", role: "dev" });
		await rule({ scope: "team" });
		await evaluateLogs([log()]);
		expect(sent.map((s) => s.to).sort()).toEqual(["dev@company.com", "owner@company.com"]);
	});

	it("ignores disabled rules and non-matching logs", async () => {
		await rule({ enabled: false });
		await rule({ name: "Auth", statuses: "401" });
		await evaluateLogs([log()]);
		expect(sent).toHaveLength(0);
	});

	it("sends the daily summary once per day, only to people who turned it on", async () => {
		await User.updateOne({ _id: owner._id }, { dailyDigest: true });
		await makeUser("quiet@company.com");
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		yesterday.setHours(12, 0, 0, 0);
		await writeLogs([
			{ endpoint: "/api/a", status: 200, responseTime: 100, date: yesterday },
			{ endpoint: "/api/b", status: 500, responseTime: 900, date: yesterday },
		]);

		const nine = new Date();
		nine.setHours(9, 0, 0, 0);
		const early = new Date(nine);
		early.setHours(6);
		expect(await sendDailyDigests(early)).toBe(false);
		expect(await sendDailyDigests(nine)).toBe(true);
		expect(await sendDailyDigests(nine)).toBe(false);

		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe("owner@company.com");
		expect(sent[0].text).toContain("Requests: 2");
		expect(sent[0].text).toContain("Server errors (5xx): 1");
		expect(sent[0].text).toContain("/api/b");
	});
});
