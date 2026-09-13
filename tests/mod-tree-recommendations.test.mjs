import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import reference from "../lib/cifi/mod-tree/reference.json" with { type: "json" };
import data from "../lib/cifi/mod-tree/recommendation-data.json" with { type: "json" };
import fixture from "./fixtures/mod-tree-sheet-zero.json" with { type: "json" };
import { blankModState, createModContext, evaluateMods, modNextCost, modPower, parseModBudget, rankMods, restoreModState, simulateMods } from "../lib/cifi/mod-tree/recommendations.ts";
import { evaluateFormula, wideLog, wideNumber } from "../lib/cifi/mod-tree/formula.ts";
import { addCifiDecimals, compareCifiDecimals, parseCifiDecimal } from "../lib/cifi/upgrades/decimal.ts";

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const zero = blankModState();

test("every pre-Ouroboros node has source-traceable costs and 40 effects", () => {
  assert.equal(data.nodes.length, 274);
  assert.deepEqual(data.nodes.map(x => x.code), reference.nodes.map(x => x.code));
  assert.equal(data.nodes.reduce((sum, row) => sum + row.effects.filter(v => typeof v === "string").length, 0), 261);
  assert.equal(data.sha256, fixture.sourceSha256);
  for (const row of data.nodes) { assert.equal(row.effects.length, 40); assert.equal(row.sourceRow, reference.nodes.find(n => n.code === row.code).sourceRow); }
});

test("all 274 zero-profile log powers match independently cached workbook results", () => {
  for (const row of evaluateMods(zero, {})) { assert.equal(row.error, null, row.code); close(row.powerLog, fixture.powerLog[row.code]); }
  // Mods E30 reads AQ (log power), not AP. MP 10, CI 50, A01 cost 1.
  const first = evaluateMods({ ...zero, budget: "10" }, {})[0];
  close(first.score, 4.085103326150273, 1e-12);
});

test("costs floor the complete exact decimal product and normalize source noise", () => {
  assert.equal(modNextCost("A04", 0).exact, "40");
  assert.equal(modNextCost("A04", 1).exact, "105"); // floor((40 + 8) * (2.1 + .1))
  assert.equal(modNextCost("A01", 0).exact, "1");
  assert.equal(modNextCost("A01", 1).exact, "2");
  assert.equal(modNextCost("A01", 2).exact, "6");
  assert.equal(modNextCost("IC4", 0).exact, "1e+4000");
  for (const invalid of [-1, .5, NaN, Infinity]) assert.throws(() => modNextCost("A01", invalid));
});

test("dynamic cost bases and IU3 extra exponents respect every threshold", () => {
  const baseAt = (code, level) => {
    const row = data.nodes.find(r => r.code === code);
    return wideNumber(evaluateFormula(row.startBase, createModContext({ ...zero, levels: { [code]: level } }, {})));
  };
  close(baseAt("DU1", 499), 10); close(baseAt("DU1", 500), 10.1);
  close(baseAt("FU1", 499), 2.62); close(baseAt("FU1", 500), 2.8); close(baseAt("FU1", 1000), 2.88);
  close(baseAt("F04", 4), 1e12); close(baseAt("F04", 5), 1.5e39);
  for (const [n, expected] of [[9, 1e10], [10, 1e15], [19, 1e15], [20, 1e30], [49, 1e30], [50, 2e30], [59, 2e30], [60, 3e30]]) close(baseAt("I27", n), expected);
  const rule = data.nodes.find(r => r.code === "IU3");
  for (const [n, offset] of [[9, 0], [10, 11], [12, 33], [13, 55], [14, 77], [15, 99], [16, 132], [17, 165], [18, 209], [19, 253], [20, 0]]) {
    const base = baseAt("IU3", n), growth = wideNumber(evaluateFormula(rule.baseGrowth, createModContext({ ...zero, levels: { IU3: n } }, {})));
    const expected = Math.log10(Number(rule.startCost) + n * Number(rule.costGrowth)) + n * Math.log10(base + n * growth) + offset;
    close(modNextCost("IU3", n).log, expected);
  }
});

test("unlock checks require both parents and never use map-only connector substitutions", () => {
  const levels = { A01: 1, IU4: 1, G12: 1 };
  let rows = evaluateMods({ ...zero, levels, budget: "1e5000" }, {});
  assert.equal(rows.find(r => r.code === "IC1").unlocked, false);
  assert.equal(rows.find(r => r.code === "GU1").unlocked, false);
  const twoParents = reference.nodes.find(n => n.prerequisites.length === 2);
  assert.ok(twoParents);
  rows = evaluateMods({ ...zero, budget: "1e5000", levels: { [twoParents.prerequisites[0]]: 1 } }, {});
  assert.equal(rows.find(r => r.code === twoParents.code).unlocked, false);
  rows = evaluateMods({ ...zero, budget: "1e5000", levels: Object.fromEntries(twoParents.prerequisites.map(c => [c, 1])) }, {});
  assert.equal(rows.find(r => r.code === twoParents.code).unlocked, true);
});

test("ranking excludes ignored/maxed/locked/unaffordable/invalid nodes and honors priority unlocks", () => {
  const state = { ...zero, budget: "1000", levels: { A01: 1 }, ignored: ["G22"] };
  let ranked = rankMods(evaluateMods(state, {}));
  assert.equal(ranked[0].code, "A02");
  assert.equal(ranked[1].code, "A03");
  assert.ok(ranked.every(r => r.unlocked && r.affordable && !r.ignored && !r.maxed && !r.error));
  ranked = rankMods(evaluateMods({ ...state, levels: { A01: 5, A02: 1, A03: 1 } }, {}));
  assert.ok(ranked.every(r => !["A01", "A02", "A03", "G22"].includes(r.code)));
  assert.deepEqual(rankMods(evaluateMods({ ...zero, budget: "0" }, {})), []);
  const bad = evaluateMods(state, { cells: "NaN" });
  assert.ok(bad.every(r => r.error));
  assert.deepEqual(rankMods(bad), []);
});

test("profile, per-MK Software total, weights and current levels recompute effects", () => {
  const state = { ...zero, levels: { F04: 1, G01: 1 } };
  const ctx = createModContext(state, { softwareTechMk1: "100", softwareTechMk2: "80" });
  assert.equal(ctx.scalar("ModValues_SWTech"), 180);
  const g = modPower("G01", state, { softwareTechMk1: "100", softwareTechMk2: "80", costReduction: "0" });
  close(g.log, Math.log10((1 + .005 * 2 * 180) / (1 + .005 * 180)));
  assert.ok(modPower("F04", state, { manualMk1: "200", level: "99" }).log > modPower("F04", state, { manualMk1: "20", level: "10" }).log);
  assert.ok(modPower("A01", zero, { cells: "5" }).log > modPower("A01", zero, { cells: "1" }).log);
  const all = evaluateMods({ ...zero, budget: "1e4000", levels: Object.fromEntries(reference.nodes.map(n => [n.code, Math.min(10, n.maxLevel - 1)])) }, { level: "99", loopsFilled: "323", manualMk1: "1680", shardTickspeed: ".14" });
  assert.equal(all.filter(r => r.error).length, 0);
});

test("large effect powers retain their ratios without Infinity or a dimensionally wrong fallback", () => {
  const ctx = createModContext(zero, {});
  const result = evaluateFormula("=IFERROR(POW(2,2000)/POW(2,1999),-123)", ctx);
  close(wideNumber(result), 2);
  close(wideLog(evaluateFormula("=POW(10,1000)", ctx)), 1000);
  assert.ok(Number.isFinite(modPower("F04", zero, { manualMk1: "100000000", level: "99" }).log));
  assert.throws(() => evaluateFormula('=IMPORTXML("https://example.com")', ctx));
  assert.throws(() => evaluateFormula('=globalThis.process.exit()', ctx));
  assert.throws(() => evaluateFormula("=1/0", ctx));
});

test("MP affordability/subtraction is exact even beyond Number range and fractional remainders", () => {
  const eq = evaluateMods({ ...zero, budget: "1", ignored: ["G22"] }, {});
  assert.equal(eq.find(r => r.code === "A01").affordable, true);
  assert.equal(evaluateMods({ ...zero, budget: ".999999999999999999" }, {})[0].affordable, false);
  const state = { ...zero, budget: "10.3", ignored: ["G22"] };
  const plan = simulateMods(state, {}, 25);
  assert.ok(plan.next.budget.endsWith(".3"));
  assert.equal(compareCifiDecimals(addCifiDecimals(parseModBudget(plan.next.budget), parseModBudget(plan.spent)), parseModBudget(state.budget)), 0);
  const only = { ...zero, budget: "1.1e4000", levels: { IU2: 1 }, ignored: reference.nodes.filter(n => n.code !== "IC4").map(n => n.code) };
  const huge = simulateMods(only, {}, 1);
  assert.equal(huge.steps[0].code, "IC4");
  assert.equal(huge.next.budget, "1.00e3999");
  assert.equal(compareCifiDecimals(parseCifiDecimal(huge.spent), parseCifiDecimal("1e4000")), 0);
});

test("plans recompute each purchase, preserve inputs, remain bounded and can be reversed from the snapshot", () => {
  const initial = { ...zero, budget: "1000", ignored: ["G22"] };
  const original = structuredClone(initial);
  const plan = simulateMods(initial, {}, 25);
  assert.deepEqual(initial, original);
  assert.equal(plan.steps.length, 25);
  assert.equal(plan.stopped, "limit");
  assert.deepEqual(plan.steps.slice(0, 3).map(r => r.code), ["A01", "A02", "A03"]);
  let replay = structuredClone(initial);
  for (const step of plan.steps) {
    assert.equal(rankMods(evaluateMods(replay, {}))[0].code, step.code);
    replay = simulateMods(replay, {}, 1).next;
  }
  assert.deepEqual(replay, plan.next);
  assert.throws(() => simulateMods(initial, {}, 201));
  assert.throws(() => simulateMods(initial, {}, -1));
});

test("save restoration rejects corrupt versions, budgets, unknown codes and invalid levels atomically", () => {
  assert.deepEqual(restoreModState(JSON.parse(JSON.stringify(zero))), zero);
  for (const input of [null, {}, [], { ...zero, version: 2 }, { ...zero, budget: "-1" }, { ...zero, budget: "1e10000" }, { ...zero, costImportance: Infinity }, { ...zero, levels: { A01: 6 } }, { ...zero, levels: { A01: .5 } }, { ...zero, levels: { Z99: 1 } }, { ...zero, ignored: ["Z99"] }]) assert.throws(() => restoreModState(input));
});

test("map integration uses saved profile and real engine; plans are cancellable/local-only", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const hook = await readFile(new URL("../features/mod-tree/useModRecommendations.ts", import.meta.url), "utf8");
  const panel = await readFile(new URL("../features/mod-tree/ModRecommendationPanel.tsx", import.meta.url), "utf8");
  const tools = await readFile(new URL("../features/mod-tree/ModTreeTools.tsx", import.meta.url), "utf8");
  assert.match(page, /<ModTree language=\{language\} profile=\{saved\}/);
  assert.match(hook, /generation\.current !== current/);
  assert.match(hook, /localStorage\.setItem\(MOD_STORAGE_KEY/);
  assert.match(hook, /simulateMods\(next, profile/);
  assert.match(panel, /aria-invalid=\{budgetError\}/);
  assert.match(tools, /model\.undo/);
  assert.doesNotMatch(hook + panel + tools, /\bfetch\(|XMLHttpRequest|WebSocket/);
});

test("recommended outlines expand/fade in a decoration-only layer and reduced motion keeps a static highlight", async () => {
  const view = await readFile(new URL("../features/mod-tree/ModTree.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../features/mod-tree/mod-tree.css", import.meta.url), "utf8");
  assert.match(view, /mod-tree-recommendation-halos" aria-hidden="true" pointerEvents="none"/);
  assert.ok(view.indexOf('className="mod-tree-recommendation-halos"') < view.indexOf("{nodes.map((node) =>"));
  assert.match(view, /recommendationsVisible \? recommendations\.ranked\.slice\(0, visibleRecommendationCount\)/);
  assert.match(view, /mod-tree-jump-recommendation/);
  assert.match(css, /animation:mod-recommendation-ripple 1\.05s ease-out infinite/);
  assert.doesNotMatch(view + css, /is-delayed|animation-delay:/);
  assert.equal((view.match(/className="mod-tree-recommendation-ripple"/g) ?? []).length, 1);
  assert.doesNotMatch(view + css, /mod-tree-recommendation-aura/);
  assert.match(css, /0%\s*\{\s*transform:scale\(1\.02\);\s*opacity:\.8/);
  assert.match(css, /50%,100%\s*\{\s*transform:scale\(1\.32\);\s*opacity:0/);
  assert.match(css, /\.mod-tree-recommendation-ripple \{[^}]*stroke-width:4;/);
  assert.match(css, /\.mod-tree-recommendation-halo.is-top \.mod-tree-recommendation-ripple \{ stroke-width:5\.6;/);
  assert.match(css, /\.mod-tree-recommendation-halo \{ color:var\(--mod-gold\);/);
  assert.match(css, /\.mod-tree-recommendation-halo.is-top \{ color:var\(--mod-gold-top\);/);
  assert.match(css, /prefers-reduced-motion:reduce\)\s*\{\s*\.mod-tree-v2 \.mod-tree-recommendation-ripple\s*\{\s*animation:none/);
  assert.match(css, /\.is-top-recommendation \.mod-tree-node-frame/);
  assert.doesNotMatch(css, /\.mod-tree-node(?:\s|\.is-recommended)[^{]*\{[^}]*animation:/);
});

test("selection and keyboard focus keep the unselected node frame width", async () => {
  const css = await readFile(new URL("../features/mod-tree/mod-tree.css", import.meta.url), "utf8");
  assert.match(css, /\.mod-tree-node \{ --mod-node-frame-width:2\.08;/);
  assert.match(css, /\.mod-tree-node.is-recommended \{ --mod-node-frame-width:3\.2;/);
  assert.match(css, /\.mod-tree-node.is-top-recommendation \{ --mod-node-frame-width:4;/);
  for (const state of [".is-selected", ":focus-visible"]) {
    const selector = `.mod-tree-v2 .mod-tree-node${state} .mod-tree-node-frame`;
    const rule = css.slice(css.indexOf(selector)).split("}")[0];
    assert.ok(rule.startsWith(selector));
    assert.match(rule, /stroke:var\(--mod-node-selected\); stroke-width:var\(--mod-node-frame-width\);/);
    assert.doesNotMatch(rule, /--mod-node-frame-width:/);
  }
});
