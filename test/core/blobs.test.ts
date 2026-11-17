import ApiLog from "../../src/models/apilogs.model";
import ApiLogBlob from "../../src/models/apilogblob.model";
import {
	cleanupOrphanBlobs,
	hydrateLog,
	prepareBlob,
	stableStringify,
	storeBlobs,
} from "../../src/core/blobs";

const baseLog = {
	method: "GET",
	endpoint: "/api/x",
	status: 200,
	responseTime: 5,
	ip: "127.0.0.1",
	date: new Date(),
};

describe("blobs", () => {
	it("hashes the same content the same way regardless of key order", () => {
		expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
			stableStringify({ a: { c: 3, d: 2 }, b: 1 })
		);
		expect(prepareBlob({ b: 1, a: 2 })!.hash).toBe(prepareBlob({ a: 2, b: 1 })!.hash);
		expect(prepareBlob({ a: 1 })!.hash).not.toBe(prepareBlob({ a: 2 })!.hash);
	});

	it("gives missing values no blob", () => {
		expect(prepareBlob(undefined)).toBeNull();
		expect(prepareBlob(null)).toBeNull();
	});

	it("stores identical content only once", async () => {
		const a = prepareBlob({ items: [1, 2, 3] })!;
		const b = prepareBlob({ items: [1, 2, 3] })!;
		await storeBlobs([a]);
		await storeBlobs([b]);
		expect(await ApiLogBlob.countDocuments({})).toBe(1);
	});

	it("hydrates v3 logs from blobs and leaves v2 inline logs as they are", async () => {
		const body = prepareBlob({ hello: "world" })!;
		await storeBlobs([body]);
		const v3 = await hydrateLog({ ...baseLog, responseBodyRef: body.hash, requestBodyRef: null, headersRef: null });
		expect(v3.responseBody).toEqual({ hello: "world" });
		expect(v3.requestBody).toEqual({});
		expect((v3 as any).responseBodyRef).toBeUndefined();

		const v2 = await hydrateLog({ ...baseLog, responseBody: { inline: true } });
		expect(v2.responseBody).toEqual({ inline: true });
	});

	it("deletes only blobs that no log references", async () => {
		const used = prepareBlob({ used: true })!;
		const orphan = prepareBlob({ orphan: true })!;
		await storeBlobs([used, orphan]);
		// Age both past the grace window
		await ApiLogBlob.updateMany({}, { lastSeenAt: new Date(Date.now() - 60 * 60 * 1000) });
		await ApiLog.create({ ...baseLog, responseBodyRef: used.hash });

		expect(await cleanupOrphanBlobs([used.hash, orphan.hash])).toBe(1);
		expect(await ApiLogBlob.exists({ _id: used.hash })).toBeTruthy();
		expect(await ApiLogBlob.exists({ _id: orphan.hash })).toBeNull();
	});

	it("never deletes a blob reused within the grace window", async () => {
		const fresh = prepareBlob({ fresh: true })!;
		await storeBlobs([fresh]);
		expect(await cleanupOrphanBlobs()).toBe(0);
		expect(await ApiLogBlob.exists({ _id: fresh.hash })).toBeTruthy();
	});
});
