import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { PassThrough } from "stream";
import { exportLogs, ExportFormat, loadSqlite } from "../../src/core/export";
import { crc32, XLSX_MAX_CELL_CHARS } from "../../src/core/xlsx";
import { writeLogs } from "../helpers/write-logs";

const collect = async (format: ExportFormat, filter: Record<string, unknown> = {}) => {
	const out = new PassThrough();
	const chunks: Buffer[] = [];
	out.on("data", (c) => chunks.push(Buffer.from(c)));
	await exportLogs(format, filter, out);
	out.end();
	return Buffer.concat(chunks);
};

/** Read the entries of a zip produced by our writer. */
const unzip = (buf: Buffer) => {
	const files: Record<string, string> = {};
	let p = 0;
	while (buf.readUInt32LE(p) === 0x04034b50) {
		const crc = buf.readUInt32LE(p + 14);
		const size = buf.readUInt32LE(p + 18);
		const nameLen = buf.readUInt16LE(p + 26);
		const extraLen = buf.readUInt16LE(p + 28);
		const name = buf.subarray(p + 30, p + 30 + nameLen).toString();
		const start = p + 30 + nameLen + extraLen;
		const data = zlib.inflateRawSync(buf.subarray(start, start + size));
		expect(crc32(data)).toBe(crc);
		files[name] = data.toString("utf8");
		p = start + size;
	}
	return files;
};

describe("export", () => {
	beforeEach(async () => {
		await writeLogs([
			{
				method: "POST",
				endpoint: "/webhooks/partner-x",
				status: 200,
				requestBody: { event: "order.paid", note: "=HYPERLINK(\"http://evil\")" },
				responseBody: { ok: true },
				sessionLogs: ["[STDOUT] handled"],
				date: new Date("2026-03-01T10:00:00Z"),
			},
			{
				endpoint: "/api/users",
				status: 404,
				requestBody: { password: "hunter2" },
				date: new Date("2026-03-02T10:00:00Z"),
			},
		]);
	});

	it("JSON Lines keeps every field, newest first, with secrets masked", async () => {
		const lines = (await collect("jsonl")).toString().trim().split("\n").map((l) => JSON.parse(l));
		expect(lines.map((l) => l.endpoint)).toEqual(["/api/users", "/webhooks/partner-x"]);
		expect(lines[1].requestBody.event).toBe("order.paid");
		expect(lines[1].sessionLogs).toEqual(["[STDOUT] handled"]);
		expect(lines[0].requestBody.password).toBe("********");
	});

	it("CSV has a BOM, one column per top-level body field, and defuses formulas", async () => {
		const text = (await collect("csv")).toString("utf8");
		expect(text.charCodeAt(0)).toBe(0xfeff);
		const [header, ...rows] = text.slice(1).trim().split("\r\n");
		expect(header.split(",")).toEqual(
			expect.arrayContaining(["request.event", "request.note", "request.password", "response.ok", "request_body", "console_logs"])
		);
		expect(rows).toHaveLength(2);
		expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`);
	});

	it("XLSX is a valid workbook with the same columns", async () => {
		const files = unzip(await collect("xlsx"));
		expect(Object.keys(files)).toEqual(
			expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"])
		);
		const sheet = files["xl/worksheets/sheet1.xml"];
		expect(sheet).toContain("request.event");
		expect(sheet).toContain("order.paid");
		expect(sheet).toContain("<v>404</v>");
		// Inline strings aren't formulas, so they stay as written
		expect(sheet).toContain("=HYPERLINK(&quot;http://evil&quot;)");
	});

	it("XLSX truncates cells over Excel's limit and marks them", async () => {
		await writeLogs([{ endpoint: "/api/big", responseBody: { blob: "x".repeat(40000) }, date: new Date("2026-03-03T00:00:00Z") }]);
		const sheet = unzip(await collect("xlsx", { endpoint: "/api/big" }))["xl/worksheets/sheet1.xml"];
		expect(sheet).toContain("[TRUNCATED]");
		const unescape = (t: string) => t.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
		const longest = Math.max(
			...Array.from(sheet.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)).map((m) => unescape(m[1]).length)
		);
		expect(longest).toBeLessThanOrEqual(XLSX_MAX_CELL_CHARS);
	});

	(loadSqlite() ? it : it.skip)("SQLite is a queryable database file", async () => {
		const file = path.join(os.tmpdir(), `export-test-${process.pid}.sqlite`);
		fs.writeFileSync(file, await collect("sqlite"));
		const { DatabaseSync } = loadSqlite();
		const db = new DatabaseSync(file);
		try {
			const rows = db.prepare("SELECT endpoint, status, request_body FROM logs WHERE endpoint LIKE '/webhooks/%'").all();
			expect(rows).toHaveLength(1);
			expect(JSON.parse(rows[0].request_body).event).toBe("order.paid");
		} finally {
			db.close();
			fs.rmSync(file, { force: true });
		}
	});
});
