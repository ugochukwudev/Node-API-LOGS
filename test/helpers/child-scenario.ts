import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import mongoose from "mongoose";

// Some libraries (Agenda 6, pg-boss 12, NestJS 12) are ESM-only, which Jest's
// CommonJS loader can't import. Those scenarios run in a child Node process
// against the compiled package, writing to the same test database.
const ROOT = path.resolve(__dirname, "../..");
let distDir: string | null = null;

const buildDist = () => {
	if (distDir) return distDir;
	// Inside the project so the compiled files resolve its node_modules.
	distDir = fs.mkdtempSync(path.join(ROOT, ".test-dist-"));
	const tsc = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", ROOT, "--outDir", distDir], { encoding: "utf8" });
	if (tsc.status !== 0) throw new Error(tsc.stdout + tsc.stderr);
	return distDir;
};

export const cleanupScenarios = () => {
	if (distDir) fs.rmSync(distDir, { recursive: true, force: true });
	distDir = null;
};

/** Run ESM code with `dist` (compiled package path), `mongoose` (connected) and `waitFor` in scope. */
export const runScenario = (body: string) => {
	const dist = buildDist();
	const file = path.join(dist, `scenario-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
	const { host, port, name } = mongoose.connection;
	fs.writeFileSync(
		file,
		`import { createRequire } from "module";
const require = createRequire(${JSON.stringify(path.join(ROOT, "package.json"))});
const dist = ${JSON.stringify(dist)};
const mongoose = require("mongoose");
await mongoose.connect(${JSON.stringify(`mongodb://${host}:${port}/${name}`)});
const waitFor = async (check) => { for (let i = 0; i < 150; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error("timed out"); };
try {
${body}
} finally {
  await mongoose.disconnect();
}
process.exit(0);
`
	);
	const result = spawnSync(process.execPath, [file], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
	if (result.status !== 0) throw new Error(result.stdout + result.stderr);
	return result.stdout;
};
