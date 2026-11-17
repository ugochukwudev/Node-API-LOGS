import { createRedactor, MASK } from "../../src/core/redact";

describe("createRedactor", () => {
	const r = createRedactor();

	it("masks passwords but keeps emails", () => {
		expect(r.body({ email: "ada@company.com", password: "hunter2" })).toEqual({
			email: "ada@company.com",
			password: MASK,
		});
	});

	it("leaves empty and null values as they were", () => {
		expect(r.body({ password: "", otp: null, pin: undefined })).toEqual({
			password: "",
			otp: null,
			pin: undefined,
		});
	});

	it("uses a fixed-length mask that does not reveal the secret's length", () => {
		const short = r.body({ password: "a" }) as any;
		const long = r.body({ password: "a".repeat(40) }) as any;
		expect(short.password).toBe(long.password);
	});

	it("matches regardless of case, snake_case or kebab-case", () => {
		expect(
			r.body({ Access_Token: "x", "refresh-token": "y", APIKEY: "z", cardNumber: "4111" })
		).toEqual({ Access_Token: MASK, "refresh-token": MASK, APIKEY: MASK, cardNumber: MASK });
	});

	it("masks nested fields and fields inside arrays", () => {
		expect(
			r.body({
				user: { credentials: { password: "p" } },
				cards: [{ cvv: "123", last4: "4242" }],
			})
		).toEqual({
			user: { credentials: { password: MASK } },
			cards: [{ cvv: MASK, last4: "4242" }],
		});
	});

	it("masks a sensitive field whose value is an object", () => {
		expect(r.body({ token: { value: "abc" } })).toEqual({ token: MASK });
	});

	it("passes through non-object bodies", () => {
		expect(r.body("plain text")).toBe("plain text");
		expect(r.body(42)).toBe(42);
	});

	it("does not mutate the original object", () => {
		const input = { password: "p" };
		r.body(input);
		expect(input.password).toBe("p");
	});

	it("supports adding and removing fields", () => {
		const custom = createRedactor({ add: ["bvn"], remove: ["pin"] });
		expect(custom.body({ bvn: "222", pin: "1234", password: "p" })).toEqual({
			bvn: MASK,
			pin: "1234",
			password: MASK,
		});
	});

	it("masks sensitive headers", () => {
		expect(
			r.headers({
				Authorization: "Bearer abc",
				cookie: "sid=1",
				"set-cookie": ["a=1", "b=2"],
				"x-api-key": "k",
				"content-type": "application/json",
			})
		).toEqual({
			Authorization: MASK,
			cookie: MASK,
			"set-cookie": MASK,
			"x-api-key": MASK,
			"content-type": "application/json",
		});
	});

	it("masks sensitive query string parameters and keeps the rest untouched", () => {
		expect(r.url("/reset?token=abc123&email=ada%40x.com&page=2")).toBe(
			`/reset?token=${MASK}&email=ada%40x.com&page=2`
		);
		expect(r.url("/reset?token=&x=1")).toBe("/reset?token=&x=1");
		expect(r.url("/plain")).toBe("/plain");
	});
});
