import { LogWriter, RawLogEntry } from "../../src/core/writer";
import { createRedactor } from "../../src/core/redact";

/** Write logs through the real pipeline (masking, store-once bodies). */
export const writeLogs = async (entries: Partial<RawLogEntry>[]) => {
	const writer = new LogWriter({ redactor: createRedactor(), isConnected: () => true, maxBatch: 100000 });
	for (const e of entries) {
		writer.enqueue({
			method: "GET",
			endpoint: "/api/test",
			status: 200,
			responseTime: 10,
			requestBody: {},
			responseBody: {},
			headers: { "content-type": "application/json" },
			ip: "127.0.0.1",
			date: new Date(),
			sessionLogs: [],
			...e,
		});
	}
	await writer.flush();
	writer.stop();
};
