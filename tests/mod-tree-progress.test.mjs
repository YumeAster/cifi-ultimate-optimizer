import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { blankModState, evaluateMods, rankMods, simulateMods, modMaximumLevel } from "../lib/cifi/mod-tree/recommendations.ts";
import { nodeProgress, nodeUnaffordable, nodeLevelText } from "../lib/cifi/mod-tree/presentation.ts";

test("recorded levels and prerequisite locks drive distinct map states, not MP shortage", () => {
  const find = (levels, code, budget = "0") => evaluateMods({ ...blankModState(), levels, budget }, {}).find(row => row.code === code);
  assert.equal(nodeProgress(), "unknown");
  assert.equal(nodeProgress(find({}, "A04")), "locked");
  assert.equal(nodeProgress(find({}, "A01")), "unpurchased");
  assert.equal(nodeProgress(find({ A01: 1 }, "A01")), "purchased");
  assert.equal(nodeProgress(find({ A01: 5 }, "A01")), "maxed");
  const inconsistent = find({ A04: 4 }, "A04", "1e50");
  assert.equal(inconsistent.level, 4); // Never erase a manually recorded purchase.
  assert.equal(nodeProgress(inconsistent), "locked");
  assert.equal(nodeLevelText(inconsistent.level, inconsistent.maxLevel), "4/4");
});

test("MP shortage overlays unlocked purchasable levels without changing recorded progress", () => {
  const find = (levels, code, budget = "0") => evaluateMods({ ...blankModState(), levels, budget }, {}).find(row => row.code === code);
  assert.equal(nodeUnaffordable(), false);
  for (const level of [0, 1]) {
    const expectedProgress = level ? "purchased" : "unpurchased";
    for (const [budget, expectedShortage] of [["0", true], ["1000", false], ["0", true]]) {
      const row = find({ A01: level }, "A01", budget);
      assert.equal(nodeUnaffordable(row, modMaximumLevel("A01")), expectedShortage);
      assert.equal(nodeProgress(row), expectedProgress);
      assert.equal(row.level, level);
    }
  }
  assert.equal(nodeUnaffordable(find({}, "A01", "1")), false, "exactly enough MP is not a shortage");
  assert.equal(nodeUnaffordable(find({}, "A04")), false, "locked nodes retain their lock state");
  assert.equal(nodeUnaffordable(find({ A01: 5 }, "A01")), false, "maxed evaluation starts affordable=false");
  const capped = find({ D8g: 1, DU1: 99_999 }, "DU1");
  assert.equal(nodeProgress(capped, modMaximumLevel("DU1")), "capped");
  assert.equal(nodeUnaffordable(capped, modMaximumLevel("DU1")), false);
});

test("unaffordable overlay excludes missing costs, formula errors and both level limits", () => {
  const row = { unlocked: true, level: 1, maxed: false, affordable: false, cost: "2", error: null };
  assert.equal(nodeUnaffordable(row, 5), true);
  assert.equal(nodeUnaffordable({ ...row, error: "Calculation failed" }, 5), false);
  assert.equal(nodeUnaffordable({ ...row, cost: null }, 5), false);
  assert.equal(nodeUnaffordable({ ...row, cost: "" }, 5), false);
  assert.equal(nodeUnaffordable({ ...row, level: 5 }, 5), false, "finite game maximum is not MP shortage");
  assert.equal(nodeUnaffordable({ ...row, level: 99_999 }, Infinity), false, "web input cap is not MP shortage");
  assert.equal(nodeUnaffordable({ ...row, level: 99_998 }, Infinity), true);
});

test("locked nodes never rank and plans unlock prerequisites before suggesting a child", () => {
  const initial = { ...blankModState(), budget: "1000", ignored: ["G22"] };
  const rows = evaluateMods(initial, {});
  const locked = new Set(rows.filter(row => nodeProgress(row) === "locked").map(row => row.code));
  assert.ok(rankMods(rows).every(row => !locked.has(row.code)));
  const plan = simulateMods(initial, {}, 10);
  const levels = { ...initial.levels };
  for (const step of plan.steps) {
    const before = evaluateMods({ ...initial, levels }, {}).find(row => row.code === step.code);
    assert.equal(before.unlocked, true, step.code);
    levels[step.code] = step.to;
  }
});

test("finite maxima and unlimited-node input caps are not confused", () => {
  assert.equal(nodeLevelText(3, 200), "3/200");
  assert.equal(nodeLevelText(999, 999), "999/999");
  assert.equal(nodeLevelText(99_999, modMaximumLevel("DU1")), "99999/∞");
  const row = evaluateMods({ ...blankModState(), levels: { D8g: 1, DU1: 99_999 } }, {}).find(row => row.code === "DU1");
  assert.equal(nodeProgress(row, modMaximumLevel("DU1")), "capped");
});

test("map states use the same evaluation as recommendations and the wider panel stays responsive", async () => {
  const view = await readFile(new URL("../features/mod-tree/ModTree.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../features/mod-tree/mod-tree.css", import.meta.url), "utf8");
  const panel = await readFile(new URL("../features/mod-tree/ModRecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(view, /recommendations\.evaluations\.map/);
  assert.match(view, /nodeProgress\(evaluation, node\.maxLevel\)/);
  assert.match(view, /nodeUnaffordable\(evaluation, node\.maxLevel\)/);
  assert.match(view, /data-progress=\{progress\}/);
  assert.match(view, /data-unaffordable=\{unaffordable\}/);
  assert.match(view, /unaffordable \? "is-unaffordable" : ""/);
  assert.doesNotMatch(view, /tone-\$\{node\.state\}/);
  assert.match(panel, /t\.states\[nodeProgress\(selected, modMaximumLevel/);
  // Unpurchased/available is the base palette; progress and shortage override
  // all three tokens instead of requiring a redundant progress-unpurchased rule.
  const baseRule = css.match(/\.mod-tree-v2 \.mod-tree-node \{([^}]+)\}/)?.[1] ?? "";
  for (const token of ["--node-line:var(--mod-available-line)", "--node-fill:var(--mod-available-bg)", "--mod-node-icon-ink:var(--mod-available-icon)"]) assert.ok(baseRule.includes(token), token);
  for (const [state, palette] of [["progress-unknown", "locked"], ["progress-locked", "locked"], ["progress-purchased", "owned"], ["progress-capped", "owned"], ["progress-maxed", "maxed"], ["is-unaffordable", "unaffordable"]]) {
    const rule = css.match(new RegExp(`\\.mod-tree-v2 \\.mod-tree-node\\.${state}[^{}]*\\{([^}]+)\\}`))?.[1] ?? "";
    for (const [token, suffix] of [["--node-line", "line"], ["--node-fill", "bg"], ["--mod-node-icon-ink", "icon"]]) assert.ok(rule.includes(`${token}:var(--mod-${palette}-${suffix})`), `${state}: ${token}`);
  }
  assert.match(css, /\.mod-tree-v2 \.mod-tree-node-frame \{[^}]*fill:var\(--node-fill\); stroke:var\(--node-line\);/);
  assert.match(css, /grid-template-columns:260px minmax\(0,1fr\) 420px/);
  assert.match(css, /@media \(max-width:1200px\)[\s\S]*?\.mod-tree-map-layout\.is-overview-collapsed \{ display:grid; grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.mod-tree-canvas-frame \{ grid-column:1; grid-row:1;/);
  assert.match(css, /\.mod-tree-side-panel \{ grid-column:1; grid-row:2;/);
  assert.match(css, /\.mod-tree-overview \{ grid-column:1; grid-row:3;/);
});

test("all scrollbar surfaces follow the active theme, including portal menus and forced colors", async () => {
  const css = await readFile(new URL("../app/scrollbars.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /import "\.\/scrollbars\.css"/);
  for (const theme of ["orbit", "nebula", "solar", "pearl", "red"]) assert.ok(css.includes(`:root:has(.dashboard-shell.theme-${theme})`), theme);
  assert.match(css, /\* \{ scrollbar-width:thin; scrollbar-color:var\(--scrollbar-thumb\) var\(--scrollbar-track\)/);
  assert.match(css, /::-webkit-scrollbar-thumb:hover/);
  assert.match(css, /::-webkit-scrollbar-corner/);
  assert.match(css, /--rc-virtual-list-scrollbar-bg:var\(--scrollbar-thumb\)/);
  assert.match(css, /forced-colors:active/);
});
