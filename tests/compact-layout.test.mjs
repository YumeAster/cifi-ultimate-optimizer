import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("compact tabs remove duplicate padding and use a responsive Tech matrix without clipping controls", async () => {
  const [allStyles, globalStyles] = await Promise.all([
    readFile(new URL("../app/site-audit.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const marker = "/* Compact surrounding space;";
  assert.ok(allStyles.includes(marker));
  const css = allStyles.slice(allStyles.indexOf(marker));
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /import "\.\/site-audit\.css"/);
  assert.doesNotMatch(page, /import "\.\/compact-layout\.css"/);
  assert.doesNotMatch(page, /workspace-intro/);
  assert.match(css, /dashboard-content:not\(\.is-mod-tree\)/);
  assert.match(css, /\.input-card > \.ant-card-body\s*\{ padding:0;/);
  assert.match(css, /\.weight-input-card,\.ship-input-card,\.player-input-card\)\s*\{ min-height:0;/);
  assert.match(css, /grid-template-areas:"input preset"/);
  assert.match(css, /grid-template-areas:"input" "preset"/);
  assert.match(css, /container-name:technology-panel/);
  assert.match(css, /grid-template-columns:54px repeat\(8,minmax\(0,1fr\)\)/);
  assert.match(css, /container-name:player-panel/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(globalStyles, /\.weight-card-grid \{ display:grid; grid-template-columns:repeat\(8,minmax\(0,1fr\)\); gap:12px; \}/);
  assert.match(globalStyles, /@media \(max-width:1560px\) \{ \.weight-card-grid \{ grid-template-columns:repeat\(4,minmax\(0,1fr\)\); \} \}/);
  assert.match(css, /"level loop shards research academy"/);
  assert.match(css, /container-name:generator-panel/);
  assert.match(css, /generator-matrix, \.generator-tech-matrix \{ display:grid; grid-template-columns:54px repeat\(8,minmax\(0,1fr\)\)/);
  assert.match(css, /generator-matrix-heading, \.generator-tech-matrix-heading \{ min-width:0; box-sizing:border-box; padding-inline:10px;/);
  assert.match(css, /section-research \.player-field-grid \{ grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
  assert.match(css, /ship-card-grid \{ grid-template-columns:repeat\(7,minmax\(0,1fr\)\);/);
  assert.match(css, /ship-progress-section/);
  assert.match(css, /min-height:28px/);
  assert.doesNotMatch(css, /transform:|zoom:|overflow:hidden/);
  // Static builds can emit globals after page CSS: scoped specificity must win.
  assert.doesNotMatch(css, /\.dashboard-shell (?!\.dashboard-content:not\(\.is-mod-tree\))/);
});
