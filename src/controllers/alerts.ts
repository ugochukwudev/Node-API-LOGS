import { Request, Response } from "express";
import { Types } from "mongoose";
import { AlertRule, EMAIL_PROVIDERS, EmailSettings } from "../models/alerts.model";
import User from "../models/user.model";
import { encryptSecret } from "../core/config";
import { handleError } from "../utils/error-handlers";
import { invalidateAlertCache } from "../alerts/engine";
import { emailConfigured, getEmailSettings, hasCustomSender, sendEmail } from "../alerts/email";

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Email settings without secrets. */
export const getAlertSettings = async (req: Request, res: Response) => {
	try {
		const s = await getEmailSettings();
		res.json({
			provider: s?.provider || null,
			fromEmail: s?.fromEmail || "",
			fromName: s?.fromName ?? "API Logs",
			hasApiKey: !!s?.apiKeyEnc,
			mailgunDomain: s?.mailgunDomain || "",
			mailgunRegion: s?.mailgunRegion || "us",
			smtpHost: s?.smtpHost || "",
			smtpPort: s?.smtpPort || 587,
			smtpSecure: !!s?.smtpSecure,
			smtpUser: s?.smtpUser || "",
			hasSmtpPassword: !!s?.smtpPassEnc,
			dashboardUrl: s?.dashboardUrl || "",
			lastError: s?.lastError || null,
			lastErrorAt: s?.lastErrorAt || null,
			lastSentAt: s?.lastSentAt || null,
			customSender: hasCustomSender(),
			providers: EMAIL_PROVIDERS,
		});
	} catch (error) {
		handleError(error, res, "getAlertSettings");
	}
};

/** Whether alerts can send, for everyone (no settings detail). */
export const getAlertStatus = async (req: Request, res: Response) => {
	try {
		res.json({ configured: await emailConfigured() });
	} catch (error) {
		handleError(error, res, "getAlertStatus");
	}
};

export const saveAlertSettings = async (req: Request, res: Response) => {
	const b = req.body || {};
	const provider = b.provider === null || b.provider === "" ? null : str(b.provider);
	if (provider && !(EMAIL_PROVIDERS as readonly string[]).includes(provider)) {
		return res.status(400).json({ message: `Provider must be one of: ${EMAIL_PROVIDERS.join(", ")}` });
	}
	const fromEmail = str(b.fromEmail, 200);
	if (provider && !fromEmail.includes("@")) return res.status(400).json({ message: "Enter the email address alerts are sent from" });
	const dashboardUrl = str(b.dashboardUrl, 300).replace(/\/$/, "");
	if (dashboardUrl && !/^https?:\/\//i.test(dashboardUrl)) {
		return res.status(400).json({ message: "Dashboard URL must start with http:// or https://" });
	}

	try {
		const update: Record<string, unknown> = {
			provider,
			fromEmail,
			fromName: str(b.fromName, 100),
			mailgunDomain: str(b.mailgunDomain, 200),
			mailgunRegion: b.mailgunRegion === "eu" ? "eu" : "us",
			smtpHost: str(b.smtpHost, 200),
			smtpPort: Number(b.smtpPort) > 0 ? Number(b.smtpPort) : 587,
			smtpSecure: b.smtpSecure === true,
			smtpUser: str(b.smtpUser, 200),
			dashboardUrl,
			updatedAt: new Date(),
		};
		// Secrets: a new value replaces the stored one; leaving the field empty keeps it.
		if (str(b.apiKey, 1000)) update.apiKeyEnc = encryptSecret(str(b.apiKey, 1000));
		if (str(b.smtpPassword, 1000)) update.smtpPassEnc = encryptSecret(str(b.smtpPassword, 1000));
		if (b.clearSecrets === true) {
			update.apiKeyEnc = null;
			update.smtpPassEnc = null;
		}
		await EmailSettings.updateOne({ _id: "email" }, { $set: update }, { upsert: true });
		invalidateAlertCache();
		await getAlertSettings(req, res);
	} catch (error) {
		handleError(error, res, "saveAlertSettings");
	}
};

/** Send a test email to the signed-in admin. */
export const sendTestEmail = async (req: Request, res: Response) => {
	try {
		const me = await User.findById(req.user!.id, { email: 1 }).lean();
		if (!me) return res.status(401).json({ message: "Unauthorized" });
		await sendEmail({
			to: me.email,
			subject: "[API Logs] Test email",
			text: "Alerts from API Logs will arrive like this.",
			html: "<p>Alerts from API Logs will arrive like this.</p>",
		});
		res.json({ message: `Test email sent to ${me.email}` });
	} catch (error) {
		res.status(400).json({ message: (error as Error).message });
	}
};

const ruleFields = (b: any) => {
	const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
	const rule = {
		name: str(b.name, 100),
		enabled: b.enabled !== false,
		statuses: str(b.statuses, 100),
		endpoint: str(b.endpoint, 300),
		minMs: num(b.minMs),
		spikeCount: num(b.spikeCount),
		spikeWindowMin: num(b.spikeWindowMin) ?? 5,
		cooldownMin: num(b.cooldownMin) ?? 15,
	};
	if (!rule.name) return { error: "Give the alert a name" };
	if (!rule.statuses && !rule.endpoint && !rule.minMs) return { error: "Choose at least one condition: status, endpoint or slow requests" };
	if (rule.statuses && !/^\s*([1-5]xx|\d{3})(\s*,\s*([1-5]xx|\d{3}))*\s*$/i.test(rule.statuses)) {
		return { error: "Statuses look like 500, 5xx or 401,403" };
	}
	if (rule.minMs !== null && !(rule.minMs > 0)) return { error: "Slow requests threshold must be a positive number of ms" };
	if (rule.spikeCount !== null && !(rule.spikeCount >= 2)) return { error: "An error spike needs at least 2 matches" };
	if (!(rule.spikeWindowMin >= 1 && rule.spikeWindowMin <= 1440)) return { error: "Spike window must be 1–1440 minutes" };
	if (!(rule.cooldownMin >= 1 && rule.cooldownMin <= 1440)) return { error: "Cooldown must be 1–1440 minutes" };
	return { rule };
};

const canEdit = (rule: { scope: string; ownerId: unknown }, user: { id: string; role: string }) =>
	rule.scope === "team" ? user.role === "admin" : String(rule.ownerId) === user.id;

/** My personal rules plus all team rules. */
export const listRules = async (req: Request, res: Response) => {
	try {
		const me = req.user!;
		const rules = await AlertRule.find({ $or: [{ ownerId: new Types.ObjectId(me.id), scope: "personal" }, { scope: "team" }] })
			.sort({ createdAt: 1 })
			.lean();
		res.json({ rules: rules.map((r) => ({ ...r, canEdit: canEdit(r, me) })) });
	} catch (error) {
		handleError(error, res, "listRules");
	}
};

export const createRule = async (req: Request, res: Response) => {
	const scope = req.body?.scope === "team" ? "team" : "personal";
	if (scope === "team" && req.user!.role !== "admin") return res.status(403).json({ message: "Only admins can create team alerts" });
	const parsed = ruleFields(req.body || {});
	if ("error" in parsed) return res.status(400).json({ message: parsed.error });
	try {
		const rule = await AlertRule.create({ ...parsed.rule, scope, ownerId: new Types.ObjectId(req.user!.id) });
		invalidateAlertCache();
		res.json({ rule });
	} catch (error) {
		handleError(error, res, "createRule");
	}
};

const findEditableRule = async (req: Request, res: Response) => {
	if (!Types.ObjectId.isValid(req.params.id)) {
		res.status(404).json({ message: "Alert not found" });
		return null;
	}
	const rule = await AlertRule.findById(req.params.id);
	if (!rule || (rule.scope === "personal" && String(rule.ownerId) !== req.user!.id)) {
		res.status(404).json({ message: "Alert not found" });
		return null;
	}
	if (!canEdit(rule, req.user!)) {
		res.status(403).json({ message: "Only admins can change team alerts" });
		return null;
	}
	return rule;
};

export const updateRule = async (req: Request, res: Response) => {
	try {
		const rule = await findEditableRule(req, res);
		if (!rule) return;
		const parsed = ruleFields({ ...rule.toObject(), ...(req.body || {}) });
		if ("error" in parsed) return res.status(400).json({ message: parsed.error });
		rule.set(parsed.rule);
		await rule.save();
		invalidateAlertCache();
		res.json({ rule });
	} catch (error) {
		handleError(error, res, "updateRule");
	}
};

export const deleteRule = async (req: Request, res: Response) => {
	try {
		const rule = await findEditableRule(req, res);
		if (!rule) return;
		await rule.deleteOne();
		invalidateAlertCache();
		res.json({ message: "Alert deleted" });
	} catch (error) {
		handleError(error, res, "deleteRule");
	}
};

export const getDigest = async (req: Request, res: Response) => {
	try {
		const me = await User.findById(req.user!.id, { dailyDigest: 1 }).lean();
		res.json({ enabled: !!me?.dailyDigest });
	} catch (error) {
		handleError(error, res, "getDigest");
	}
};

export const setDigest = async (req: Request, res: Response) => {
	try {
		await User.updateOne({ _id: req.user!.id }, { dailyDigest: req.body?.enabled === true });
		res.json({ enabled: req.body?.enabled === true });
	} catch (error) {
		handleError(error, res, "setDigest");
	}
};
