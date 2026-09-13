import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const testsRoot = resolve(projectRoot, "tests");
const files = (await readdir(testsRoot, { recursive: true }))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => resolve(testsRoot, name));

if (files.length === 0) throw new Error("No .test.mjs files found under tests/");

// Resolve file names ourselves: shell wildcard expansion differs on Windows.
// Each test runs in Node's isolated test process; rendered tests use the last
// production build. npm test builds first, while test:all reuses that build.
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], {
  cwd: projectRoot,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
