import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";
import authRoutes from "../../src/routes/auth";
import apiRoutes from "../../src/routes/api";
import User from "../../src/models/user.model";
import Invite from "../../src/models/invite.model";
import { createInvite, bootstrapAdmins } from "../../src/core/accounts";
import { decryptSecret, getJwtSecret, setAdmins } from "../../src/core/config";
import { currentStep, totpAt } from "../../src/core/totp";
import { createExpressLogger } from "../../src/adapters/express";
import { run as runCli } from "../../src/cli";

const ADMIN = "cto@company.com";
const DEV = "dev@company.com";
const PASSWORD = "correct-horse";

const makeApp = () => {
	const app = express();
	app.use(cookieParser());
	app.use("/logs/api", apiRoutes);
	app.use("/logs/auth", authRoutes);
	return app;
};

const tokenFromPath = (path: string) => path.split("/").pop()!;

const secretOf = async (email: string) => {
	const user = await User.findOne({ email });
	return decryptSecret(user!.totpSecret!);
};

/** Accept an invite and finish enrollment; returns the agent (signed in) and backup codes. */
const enroll = async (app: express.Express, email: string) => {
	const invite = await createInvite(email);
	const agent = request.agent(app);
	await agent.post(`/logs/auth/invites/${tokenFromPath(invite.path)}/accept`).send({ password: PASSWORD }).expect(200);
	const setup = await agent.get("/logs/auth/2fa/setup").expect(200);
	expect(setup.body.qr).toMatch(/^data:image\/png;base64,/);
	const enabled = await agent
		.post("/logs/auth/2fa/enable")
		.send({ code: totpAt(setup.body.secret, currentStep()) })
		.expect(200);
	return { agent, backupCodes: enabled.body.backupCodes as string[], secret: setup.body.secret as string };
};

/** Password step only; returns the agent holding the pending cookie and the next step. */
const passwordStep = async (app: express.Express, email: string, password = PASSWORD) => {
	const agent = request.agent(app);
	const res = await agent.post("/logs/auth/login").send({ email, password });
	return { agent, res };
};

describe("dashboard sign-in with 2FA", () => {
	let app: express.Express;

	beforeEach(() => {
		setAdmins([ADMIN]);
		app = makeApp();
	});

	it("enrolls through an invite link and signs in with the admin role from config", async () => {
		const { agent, backupCodes } = await enroll(app, ADMIN);
		expect(backupCodes).toHaveLength(10);
		const me = await agent.get("/logs/auth/me").expect(200);
		expect(me.body).toMatchObject({ email: ADMIN, role: "admin", backupCodesLeft: 10 });

		const stored = await User.findOne({ email: ADMIN }).lean();
		// Secrets are encrypted and backup codes hashed
		expect(stored!.totpSecret).not.toContain((await secretOf(ADMIN)).slice(0, 8));
		expect(stored!.backupCodes).not.toContain(backupCodes[0]);
	});

	it("needs the authenticator code after the password; the password alone opens nothing", async () => {
		const { secret } = await enroll(app, ADMIN);
		const { agent, res } = await passwordStep(app, ADMIN);
		expect(res.status).toBe(200);
		expect(res.body.next).toBe("2fa");

		await agent.get("/logs/api/logs").expect(401);
		await agent.get("/logs/auth/me").expect(401);

		// The enrollment code's step was used up; the next step's code works once.
		const code = totpAt(secret, currentStep() + 1);
		await agent.post("/logs/auth/2fa/verify").send({ code }).expect(200);
		await agent.get("/logs/api/logs").expect(200);

		const replay = await passwordStep(app, ADMIN);
		await replay.agent.post("/logs/auth/2fa/verify").send({ code }).expect(400);
	});

	it("accepts each backup code exactly once", async () => {
		const { backupCodes } = await enroll(app, ADMIN);
		const first = await passwordStep(app, ADMIN);
		await first.agent.post("/logs/auth/2fa/verify").send({ backupCode: backupCodes[0].toLowerCase() }).expect(200);
		const second = await passwordStep(app, ADMIN);
		await second.agent.post("/logs/auth/2fa/verify").send({ backupCode: backupCodes[0] }).expect(400);
	});

	it("locks the account for 15 minutes after 5 failures", async () => {
		await enroll(app, ADMIN);
		for (let i = 0; i < 5; i++) {
			const { res } = await passwordStep(app, ADMIN, "wrong-password");
			expect(res.status).toBe(400);
		}
		const { res } = await passwordStep(app, ADMIN);
		expect(res.status).toBe(429);
		expect(res.body.message).toMatch(/Try again in 15 minutes/);
	});

	it("gives the same error for an unknown email and a wrong password", async () => {
		await enroll(app, ADMIN);
		const unknown = await passwordStep(app, "nobody@company.com");
		const wrong = await passwordStep(app, ADMIN, "wrong-password");
		expect(unknown.res.body.message).toBe(wrong.res.body.message);
	});

	it("rejects pre-v3 session tokens", async () => {
		const user = await User.create({ email: ADMIN, password: "x", role: "admin" });
		const legacy = jwt.sign({ id: String(user._id), role: "admin" }, getJwtSecret(), { expiresIn: "1h" });
		await request(app).get("/logs/api/logs").set("Cookie", `token=${legacy}`).expect(401);
	});

	it("lets an admin invite a dev with a single-use link; devs can't manage users", async () => {
		const { agent: admin } = await enroll(app, ADMIN);
		const created = await admin.post("/logs/auth/invites").send({ email: DEV }).expect(200);
		const token = tokenFromPath(created.body.path);

		await request(app).get(`/logs/auth/invites/${token}`).expect(200);
		const devAgent = request.agent(app);
		await devAgent.post(`/logs/auth/invites/${token}/accept`).send({ password: PASSWORD }).expect(200);
		await request(app).post(`/logs/auth/invites/${token}/accept`).send({ password: PASSWORD }).expect(404);

		const setup = await devAgent.get("/logs/auth/2fa/setup").expect(200);
		await devAgent.post("/logs/auth/2fa/enable").send({ code: totpAt(setup.body.secret, currentStep()) }).expect(200);
		expect((await devAgent.get("/logs/auth/me")).body.role).toBe("dev");
		await devAgent.get("/logs/auth/users").expect(403);
		await devAgent.post("/logs/auth/invites").send({ email: "x@company.com" }).expect(403);
	});

	it("rejects short passwords and refuses to re-invite someone who already has an account", async () => {
		const invite = await createInvite(DEV);
		await request(app)
			.post(`/logs/auth/invites/${tokenFromPath(invite.path)}/accept`)
			.send({ password: "short" })
			.expect(400);

		const { agent: admin } = await enroll(app, ADMIN);
		await enroll(app, DEV);
		await admin.post("/logs/auth/invites").send({ email: DEV }).expect(400);
	});

	it("lets an admin reset a dev's 2FA, after which the dev enrolls again", async () => {
		const { agent: admin } = await enroll(app, ADMIN);
		await enroll(app, DEV);
		const dev = await User.findOne({ email: DEV });
		await admin.post(`/logs/auth/users/${dev!._id}/reset-2fa`).expect(200);
		const { res } = await passwordStep(app, DEV);
		expect(res.body.next).toBe("enroll");
	});

	it("does not let an admin remove themselves or a configured admin", async () => {
		const { agent: admin } = await enroll(app, ADMIN);
		setAdmins([ADMIN, "other-admin@company.com"]);
		await createInvite("other-admin@company.com");
		const me = await admin.get("/logs/auth/me");
		const other = await User.findOne({ email: "other-admin@company.com" });
		await admin.delete(`/logs/auth/users/${me.body.id}`).expect(400);
		await admin.delete(`/logs/auth/users/${other!._id}`).expect(400);
	});

	it("prints a setup link for configured admins who can't sign in yet", async () => {
		const lines: string[] = [];
		await bootstrapAdmins((l) => lines.push(l));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain(ADMIN);
		expect(lines[0]).toMatch(/\/logs\/invite\/\S+$/);

		await enroll(app, ADMIN);
		const again: string[] = [];
		await bootstrapAdmins((l) => again.push(l));
		expect(again).toHaveLength(0);
	});
});

describe("recovery CLI", () => {
	beforeEach(() => setAdmins([ADMIN]));

	it("invite prints a working single-use link and invalidates older ones", async () => {
		const out: string[] = [];
		expect(await runCli(["invite", ADMIN, "--url", "https://api.company.com"], (l) => out.push(l))).toBe(0);
		expect(out.join("\n")).toMatch(/https:\/\/api\.company\.com\/logs\/invite\/\S+/);
		await runCli(["invite", ADMIN], () => {});
		expect(await Invite.countDocuments({ email: ADMIN, usedAt: null })).toBe(1);
	});

	it("reset-2fa clears the authenticator", async () => {
		const app = makeApp();
		await enroll(app, ADMIN);
		expect(await runCli(["reset-2fa", ADMIN], () => {})).toBe(0);
		expect((await User.findOne({ email: ADMIN }))!.totpSecret).toBeNull();
	});

	it("prints usage for unknown commands", async () => {
		const out: string[] = [];
		expect(await runCli(["wat"], (l) => out.push(l))).toBe(1);
		expect(out.join("\n")).toContain("Usage:");
	});
});

describe("createExpressLogger config", () => {
	it("refuses to start without admins", () => {
		expect(() =>
			createExpressLogger({ app: express(), mongoUri: "mongodb://unused", jwtSecret: "s", admins: [] })
		).toThrow(/no admins configured/);
	});
});
