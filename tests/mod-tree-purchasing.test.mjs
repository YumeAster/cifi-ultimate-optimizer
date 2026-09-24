import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeModBudgetInput } from "../lib/cifi/mod-tree/budget.ts";
import { blankModState, evaluateMods, purchaseMod, rankMods, restoreModState, simulateMods } from "../lib/cifi/mod-tree/recommendations.ts";
import { DEFAULT_RECOMMENDATION_COUNT, RECOMMENDATION_COUNTS, restoreRecommendationCount } from "../lib/cifi/mod-tree/preferences.ts";
import { doubleClickedNode } from "../lib/cifi/mod-tree/interaction.ts";
import { modEffectPresentation } from "../features/mod-tree/effectPresentation.ts";
import { UPGRADE_RESOURCE_PRESENTATION, getGeneratorPresentation } from "../features/upgrade-optimizer/resourcePresentation.ts";

const read = name => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("recommendation count defaults to 3 and restores only integers 1 through 10", () => {
  assert.equal(DEFAULT_RECOMMENDATION_COUNT, 3);
  assert.deepEqual(RECOMMENDATION_COUNTS, [1,2,3,4,5,6,7,8,9,10]);
  for (const value of RECOMMENDATION_COUNTS) {
    assert.equal(restoreRecommendationCount(value), value);
    assert.equal(restoreRecommendationCount(String(value)), value);
  }
  for (const value of [null, undefined, 0, 11, -2, 2.5, NaN, "", "2.5", "1e1", {}, true]) assert.equal(restoreRecommendationCount(value), 3);
});

test("MP uses exact decimal half-up rounding for input, ties, exponent carry and small amounts", () => {
  const cases = {
    "1.3425e50": "1.34e50", "1.345e50": "1.35e50", "9.995e50": "1.00e51",
    "1.005": "1.01", "100.999": "101", "0": "0", "3.30": "3.3",
    "1.23456e4000": "1.23e4000", "1.245e-90": "1.25e-90", "12.345e50": "1.23e51",
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(normalizeModBudgetInput(input), expected, input);
    assert.equal(normalizeModBudgetInput(expected), expected, `${input}: idempotent`);
  }
  for (const bad of ["-0.001", "NaN", "Infinity", "1e", "9.995e9999", "1e10000"]) assert.throws(() => normalizeModBudgetInput(bad));
});

test("saved/imported MP and every single purchase discard hidden precision", () => {
  const raw = { ...blankModState(), budget: "1.3425e50" };
  assert.equal(restoreModState(raw).budget, "1.34e50");
  assert.equal(raw.budget, "1.3425e50");
  const first = purchaseMod(raw, {}, "A01");
  assert.equal(first.levels.A01, 1);
  assert.equal(first.budget, "1.34e50"); // A tiny cost rounds away by explicit request.
  const second = purchaseMod(first, {}, "A01");
  assert.equal(second.levels.A01, 2);
  assert.equal(second.budget, "1.34e50");
  assert.equal(restoreModState(JSON.parse(JSON.stringify(second))).budget, "1.34e50");
});

test("manual purchase checks current cost, lock, maximum and budget but ignores recommendation display/exclusion", () => {
  const initial = { ...blankModState(), budget: "3", ignored: ["A01"] };
  assert.ok(!rankMods(evaluateMods(initial, {})).some(row => row.code === "A01"));
  const first = purchaseMod(initial, {}, "A01");
  assert.equal(first.budget, "2");
  assert.equal(first.levels.A01, 1);
  const second = purchaseMod(first, {}, "A01");
  assert.equal(second.budget, "0"); // Level 1 costs 2, not the initial 1.
  assert.equal(second.levels.A01, 2);
  assert.equal(purchaseMod(second, {}, "A01"), null);
  assert.equal(purchaseMod({ ...initial, budget: "1e50" }, {}, "A04"), null);
  assert.equal(purchaseMod({ ...initial, levels: { A01: 5 } }, {}, "A01"), null);
  assert.equal(purchaseMod(initial, { cells: "NaN" }, "A01"), null);
  assert.equal(purchaseMod(initial, {}, "bad"), null);
  assert.deepEqual(initial.levels, {});
});

test("plans round after every step, match manual replay and report costs separately from balance difference", () => {
  const initial = { ...blankModState(), budget: "1.3425e50" };
  const plan = simulateMods(initial, {}, 10);
  let replay = restoreModState(initial);
  for (const step of plan.steps) {
    replay = purchaseMod(replay, {}, step.code);
    assert.ok(replay);
    assert.equal(replay.budget, normalizeModBudgetInput(replay.budget));
  }
  assert.deepEqual(replay, plan.next);
  assert.equal(plan.next.budget, "1.34e50");
  assert.notEqual(plan.spent, "0");
  const batch1 = simulateMods(initial, {}, 5);
  const batch2 = simulateMods(batch1.next, {}, 5);
  assert.deepEqual(batch2.next, plan.next);
});

test("double-click pairing requires the same node, no pan-sized movement and a bounded click interval", () => {
  const click = { code: "A01", x: 20, y: 40, at: 1000 };
  assert.equal(doubleClickedNode(null, click), null);
  assert.equal(doubleClickedNode(click, { ...click, at: 1200 }), "A01");
  assert.equal(doubleClickedNode(click, { ...click, code: "A02", at: 1200 }), null);
  assert.equal(doubleClickedNode(click, { ...click, x: 40, at: 1200 }), null);
  assert.equal(doubleClickedNode(click, { ...click, at: 2100 }), null);
  assert.equal(doubleClickedNode(click, { ...click, at: 999 }), null);
});

test("count, latest-state purchase, asynchronous import guard and all rounded balance boundaries are wired", async () => {
  const [page, map, panel, tools, hook] = await Promise.all([
    "app/page.tsx", "features/mod-tree/ModTree.tsx", "features/mod-tree/ModRecommendationPanel.tsx", "features/mod-tree/ModTreeTools.tsx", "features/mod-tree/useModRecommendations.ts",
  ].map(read));
  assert.match(page, /localStorage\.setItem\(MOD_RECOMMENDATION_COUNT_KEY/);
  assert.match(page, /recommendationCount=\{modRecommendationCount\}/);
  assert.match(panel, /ranked\.slice\(0, recommendationCount\)/);
  assert.match(map, /ranked\.slice\(0, visibleRecommendationCount\)/);
  assert.match(map, /onDoubleClick=/);
  assert.match(map, /event\.detail >= 2/);
  assert.match(map, /!cancelled && !drag\.moved && drag\.nodeKey/);
  assert.match(map, /if \(!recommendationsVisible\) return/);
  assert.match(hook, /purchaseMod\(stateRef\.current/);
  assert.match(hook, /let next = stateRef\.current/);
  assert.ok(hook.indexOf("stateRef.current = validated") < hook.indexOf("setState(validated)"));
  assert.match(hook, /setUndo\(keepUndo \? stateRef\.current/);
  assert.match(hook, /spent = addCifiDecimals\(spent, parseCifiDecimal\(part\.spent\)\)/);
  assert.match(tools, /model\.getRevision\(\) !== revision/);
  assert.match(panel, /onBlur=\{commitBudget\}/);
  assert.match(panel, /!budgetDirtyRef\.current/);
});

test("only recommendations scroll inside the panel, tools stay separate, and the canvas has no focus rectangle", async () => {
  const [panel, tools, css, map] = await Promise.all([
    "features/mod-tree/ModRecommendationPanel.tsx", "features/mod-tree/ModTreeTools.tsx", "features/mod-tree/mod-tree.css", "features/mod-tree/ModTree.tsx",
  ].map(read));
  const nodePane = panel.slice(panel.indexOf('<section className="mod-rec-node-pane"'), panel.indexOf("<ModTreeTools"));
  assert.doesNotMatch(nodePane, /t\.planTitle|t\.bulk|t\.backup|t\.source/);
  for (const tool of ["plan", "bulk", "backup", "source"]) assert.ok(tools.includes(`active === "${tool}"`));
  assert.match(tools, /<Modal open=\{active !== null\}/);
  assert.match(css, /grid-template-rows:auto minmax\(100px,1fr\) auto auto/);
  assert.doesNotMatch(css, /\.mod-rec-node-pane[^{}]*\{[^}]*max-height:/);
  assert.doesNotMatch(nodePane, /mod-rec-scroll|nodeScroll|tabIndex/);
  assert.match(css, /\.mod-rec-node-content \{ flex:0 0 auto;/);
  assert.doesNotMatch(css, /\.mod-rec-node-(?:pane|content)[^{}]*\{[^}]*overflow/);
  assert.equal((panel.match(/className="mod-rec-scroll"/g) ?? []).length, 1);
  assert.match(css, /\.dashboard-content.is-mod-tree \{[^}]*overflow-y:auto/);
  assert.match(css, /\.mod-tree-side-panel \{[^}]*min-height:min-content/);
  assert.match(css, /\.mod-tree-map-layout[^{}]*\{[^}]*grid-template-rows:minmax\(min-content,1fr\)/);
  assert.match(css, /grid-template-rows:minmax\(330px,48dvh\) auto auto/);
  assert.match(css, /\.mod-rec-next-effects \{[^}]*border-top:1px solid var\(--surface-line\); border-bottom:1px solid var\(--surface-line\);/);
  assert.match(css, /\.mod-rec-scroll \{[^}]*overflow-y:auto/);
  assert.match(panel, /mod-rec-purchase-bar/);
  assert.match(css, /\.mod-rec-purchase \{[^}]*background:#087e64/);
  assert.match(css, /\.mod-rec-purchase \{ display:flex; flex-direction:column; align-items:center; justify-content:center;/);
  assert.match(panel, /<b>\{t.applyOne\}<\/b><span>\{t.price\} : /);
  assert.match(panel, /<img src=\{UPGRADE_RESOURCE_PRESENTATION.modPoints.icon\} alt="MP"/);
  assert.doesNotMatch(panel, /<small>\{t.purchaseHelp\}<\/small>/);
  assert.match(css, /\.mod-tree-canvas:focus \{ outline:none; box-shadow:none; \}/);
  assert.doesNotMatch(css, /\.mod-tree-canvas:focus-visible \{[^}]*outline:/);
  assert.match(css, /:has\(\.mod-tree-canvas:focus-visible\) \.mod-tree-map-help/);
  assert.match(map, /onKeyDown=\{onMapKeyDown\} tabIndex=\{0\}/);
});

test("Mod effect cards reuse each resource icon/color and keep generator and ship effects distinct", () => {
  for (const [label, resource] of Object.entries({ Cells: "cells", MP: "modPoints", Shards: "shards", Research: "research", AP: "academyPoints", Materials: "materials", LP: "levelPoints", "Tick speed": "tick", "Tick/Loop req.": "tick", "Loop Reset req.": "loopMods" })) {
    const actual = modEffectPresentation(label), shared = UPGRADE_RESOURCE_PRESENTATION[resource];
    assert.equal(actual.icon, shared.icon, label);
    assert.equal(actual.accent, shared.accent, label);
  }
  for (let index = 1; index <= 8; index++) for (const type of ["Output", "CR"]) {
    const actual = modEffectPresentation(`MK${index} ${type}`);
    assert.equal(actual.accent, getGeneratorPresentation(`MK${index}`).accent);
    assert.equal(actual.generator, `MK${index}`);
    assert.equal(actual.icon, UPGRADE_RESOURCE_PRESENTATION.generator.icon);
  }
  for (const ship of ["cradle", "auxesia", "zagreus", "hephaestus", "demeter", "koios", "zeus"]) {
    assert.equal(modEffectPresentation(`${ship} RP`).glyph, "rank");
    assert.equal(modEffectPresentation(`${ship} CR`).glyph, "cost");
  }
});

test("current-to-next effect cards are always shown before level inputs and wrap horizontally", async () => {
  const [panel, cards, css] = await Promise.all(["features/mod-tree/ModRecommendationPanel.tsx", "features/mod-tree/ModEffectCards.tsx", "features/mod-tree/mod-tree.css"].map(read));
  assert.match(panel, /<ModEffectCards effects=\{effectPairs\}/);
  assert.ok(panel.indexOf("<ModEffectCards") < panel.indexOf("{t.level}"));
  assert.doesNotMatch(panel, /<summary>\{t\.effects\}/);
  assert.match(cards, /<span>\{effect\.current\}<\/span>/);
  assert.match(cards, /<b>\{effect\.next\}<\/b>/);
  assert.match(cards, /palette\.icon/);
  assert.match(css, /\.mod-rec-effect-grid\.upgrade-multiplier-grid \{ display:flex; flex-wrap:wrap/);
});
