import { base32Decode, base32Encode, currentStep, totpAt, verifyTotp } from "../../src/core/totp";
import { decryptSecret, encryptSecret } from "../../src/core/config";

// RFC 6238 test secret "12345678901234567890" (ASCII), base32-encoded
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
	it("round-trips base32", () => {
		const buf = Buffer.from("12345678901234567890");
		expect(base32Encode(buf)).toBe(RFC_SECRET);
		expect(base32Decode(RFC_SECRET).equals(buf)).toBe(true);
	});

	it("matches the RFC 6238 reference values (last 6 digits)", () => {
		expect(totpAt(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
		expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
		expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
	});

	it("accepts codes one step either side of now, and no further", () => {
		const now = Date.now();
		const step = currentStep(now);
		expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), -1, now)).toBe(step);
		expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), -1, now)).toBe(step - 1);
		expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), -1, now)).toBe(step + 1);
		expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 3), -1, now)).toBeNull();
	});

	it("rejects a code at or before the last used step", () => {
		const now = Date.now();
		const step = currentStep(now);
		expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), step, now)).toBeNull();
	});

	it("rejects malformed codes", () => {
		expect(verifyTotp(RFC_SECRET, "12345")).toBeNull();
		expect(verifyTotp(RFC_SECRET, "abcdef")).toBeNull();
		expect(verifyTotp(RFC_SECRET, "")).toBeNull();
	});
});

describe("secret encryption", () => {
	it("round-trips and never stores the plain text", () => {
		const stored = encryptSecret("JBSWY3DPEHPK3PXP");
		expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
		expect(decryptSecret(stored)).toBe("JBSWY3DPEHPK3PXP");
		// Random IV: same input, different ciphertext
		expect(encryptSecret("JBSWY3DPEHPK3PXP")).not.toBe(stored);
	});

	it("refuses tampered ciphertext", () => {
		const [iv, tag, data] = encryptSecret("secret").split(".");
		const flipped = Buffer.from(data, "base64");
		flipped[0] ^= 1;
		expect(() => decryptSecret([iv, tag, flipped.toString("base64")].join("."))).toThrow();
	});
});
