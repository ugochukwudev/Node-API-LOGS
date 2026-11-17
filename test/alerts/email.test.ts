import net from "net";
import { EmailSettings } from "../../src/models/alerts.model";
import { encryptSecret } from "../../src/core/config";
import { sendEmail, setCustomSender } from "../../src/alerts/email";

const message = { to: "dev@company.com", subject: "Hi", text: "plain", html: "<p>html</p>" };

const saveSettings = (overrides: Record<string, unknown>) =>
	EmailSettings.updateOne(
		{ _id: "email" },
		{ $set: { fromEmail: "alerts@company.com", fromName: "API Logs", apiKeyEnc: encryptSecret("key-123"), ...overrides } },
		{ upsert: true }
	);

describe("email providers", () => {
	const realFetch = global.fetch;
	let calls: { url: string; init: any }[];

	beforeEach(() => {
		calls = [];
		setCustomSender(undefined);
		global.fetch = (async (url: any, init: any) => {
			calls.push({ url: String(url), init });
			return new Response("{}", { status: 200 });
		}) as any;
	});

	afterAll(() => {
		global.fetch = realFetch;
	});

	it("Brevo", async () => {
		await saveSettings({ provider: "brevo" });
		await sendEmail(message);
		expect(calls[0].url).toBe("https://api.brevo.com/v3/smtp/email");
		expect(calls[0].init.headers["api-key"]).toBe("key-123");
		const body = JSON.parse(calls[0].init.body);
		expect(body).toMatchObject({ sender: { email: "alerts@company.com" }, to: [{ email: "dev@company.com" }], subject: "Hi" });
	});

	it("Resend", async () => {
		await saveSettings({ provider: "resend" });
		await sendEmail(message);
		expect(calls[0].url).toBe("https://api.resend.com/emails");
		expect(calls[0].init.headers.authorization).toBe("Bearer key-123");
		expect(JSON.parse(calls[0].init.body).from).toBe("API Logs <alerts@company.com>");
	});

	it("SendGrid", async () => {
		await saveSettings({ provider: "sendgrid" });
		await sendEmail(message);
		expect(calls[0].url).toBe("https://api.sendgrid.com/v3/mail/send");
		expect(JSON.parse(calls[0].init.body).personalizations[0].to[0].email).toBe("dev@company.com");
	});

	it("Mailgun, including the EU region", async () => {
		await saveSettings({ provider: "mailgun", mailgunDomain: "mg.company.com", mailgunRegion: "eu" });
		await sendEmail(message);
		expect(calls[0].url).toBe("https://api.eu.mailgun.net/v3/mg.company.com/messages");
		expect(calls[0].init.headers.authorization).toBe(`Basic ${Buffer.from("api:key-123").toString("base64")}`);
		expect((calls[0].init.body as URLSearchParams).get("to")).toBe("dev@company.com");
	});

	it("Postmark", async () => {
		await saveSettings({ provider: "postmark" });
		await sendEmail(message);
		expect(calls[0].url).toBe("https://api.postmarkapp.com/email");
		expect(calls[0].init.headers["x-postmark-server-token"]).toBe("key-123");
	});

	it("records a provider rejection so Settings can show it", async () => {
		await saveSettings({ provider: "brevo" });
		global.fetch = (async () => new Response('{"message":"Key not found"}', { status: 401 })) as any;
		await expect(sendEmail(message)).rejects.toThrow(/Brevo rejected the email \(HTTP 401\)/);
		const s = await EmailSettings.findById("email").lean();
		expect(s!.lastError).toContain("Key not found");
	});

	it("uses a custom sendEmail function when configured", async () => {
		const sent: any[] = [];
		setCustomSender(async (m) => {
			sent.push(m);
		});
		await sendEmail(message);
		expect(sent[0]).toMatchObject({ to: "dev@company.com", subject: "Hi" });
		expect(calls).toHaveLength(0);
		setCustomSender(undefined);
	});

	it("SMTP through nodemailer", async () => {
		// Just enough of an SMTP server to accept one message.
		let received = "";
		const server = net.createServer((socket) => {
			let inData = false;
			socket.write("220 test ESMTP\r\n");
			socket.on("data", (chunk) => {
				for (const line of chunk.toString().split("\r\n").filter(Boolean)) {
					if (inData) {
						received += line + "\n";
						if (line === ".") {
							inData = false;
							socket.write("250 OK queued\r\n");
						}
					} else if (/^(EHLO|HELO)/i.test(line)) socket.write("250 test\r\n");
					else if (/^DATA/i.test(line)) {
						inData = true;
						socket.write("354 go ahead\r\n");
					} else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
					else socket.write("250 OK\r\n");
				}
			});
		});
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
		const { port } = server.address() as net.AddressInfo;
		try {
			await saveSettings({ provider: "smtp", smtpHost: "127.0.0.1", smtpPort: port, smtpSecure: false, smtpUser: "" });
			await sendEmail(message);
			expect(received).toContain("Subject: Hi");
			expect(received).toContain("To: dev@company.com");
		} finally {
			server.close();
		}
	});
});
