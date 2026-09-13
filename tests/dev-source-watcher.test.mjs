import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import config, { projectSourceDirectories } from "../vite.pages.config.ts";

test("Pages development watches app/features/lib directories for new imports", () => {
  assert.equal(config.root, "pages");
  assert.deepEqual(projectSourceDirectories.map(path => basename(resolve(path))), ["app", "features", "lib"]);
  assert.ok(projectSourceDirectories.every(path => existsSync(path)));
  const watched = [];
  const plugin = config.plugins.find(plugin => plugin?.name === "watch-project-sources");
  assert.ok(plugin);
  plugin.configureServer({ watcher: { add(paths) { watched.push(...paths); } } });
  assert.deepEqual(watched, projectSourceDirectories);
  assert.equal(watched.length, 3, "do not broadly watch memory, node_modules, or user attachments");
});
