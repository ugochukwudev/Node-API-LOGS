module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/src", "<rootDir>/test"],
	testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
	transform: {
		"^.+\\.ts$": "ts-jest",
	},
	collectCoverageFrom: [
		"src/**/*.ts",
		"!src/**/*.d.ts",
		"!src/index.ts",
		"!src/types/**",
	],
	coverageDirectory: "coverage",
	coverageReporters: ["text", "lcov", "html"],
	moduleFileExtensions: ["ts", "js", "json"],
	setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
	testTimeout: 60000,
	verbose: true,
	globals: {
		"ts-jest": {
			tsconfig: {
				esModuleInterop: true,
			},
		},
	},
};

