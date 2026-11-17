import { createRouteFilter } from "../../src/core/filter";

describe("createRouteFilter", () => {
	it("skips the logger's own routes but not look-alike paths", () => {
		const shouldLog = createRouteFilter({ internalPrefixes: ["/logs"] });
		expect(shouldLog("/logs")).toBe(false);
		expect(shouldLog("/logs/api/metrics")).toBe(false);
		expect(shouldLog("/logs?x=1")).toBe(false);
		expect(shouldLog("/logsomething")).toBe(true);
		expect(shouldLog("/api/logs")).toBe(true);
	});

	it("only logs paths under beginswith prefixes", () => {
		const shouldLog = createRouteFilter({ beginswith: ["/api"] });
		expect(shouldLog("/api/users")).toBe(true);
		expect(shouldLog("/health")).toBe(false);
	});

	it("matches specifics on the path, ignoring the query string", () => {
		const shouldLog = createRouteFilter({ specifics: ["/api/auth"] });
		expect(shouldLog("/api/auth")).toBe(false);
		expect(shouldLog("/api/auth?redirect=/home")).toBe(false);
		expect(shouldLog("/api/auth/")).toBe(false);
		expect(shouldLog("/api/authors")).toBe(true);
	});

	it("supports wildcard and RegExp specifics", () => {
		const shouldLog = createRouteFilter({ specifics: ["/internal/*", /^\/v\d+\/ping$/] });
		expect(shouldLog("/internal/metrics")).toBe(false);
		expect(shouldLog("/v2/ping")).toBe(false);
		expect(shouldLog("/v2/pong")).toBe(true);
	});
});
