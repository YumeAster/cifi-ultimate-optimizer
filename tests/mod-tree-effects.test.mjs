import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { compareModEffects } from "../lib/cifi/mod-tree/effectComparison.ts";
import { summarizeModEffects } from "../lib/cifi/mod-tree/effectSummary.ts";
import { blankModState } from "../lib/cifi/mod-tree/recommendations.ts";
import { modContentEffect } from "../lib/cifi/mod-tree/contentEffects.ts";
import { GAME_EFFECT_CATALOG, gameEffectCoverage, compareGameEffects } from "../lib/cifi/mod-tree/gameEffects.ts";

const state = levels => ({ ...blankModState(), levels });
const effect = (code, levels, target, profile = {}) => compareModEffects(code, state(levels), profile).find(row => row.target === target);

test("the current-game observations override spreadsheet heuristics and ambiguous wiki percentages", () => {
  for (const [code, level, target, expected] of [
    ["A01", 5, "cells", "×7.59"], ["A04", 4, "cells", "×9.38"],
    ["A05", 3, "cells", "×15.63"], ["A06", 2, "cells", "×16.00"],
    ["A07", 9, "modPoints", "×7.45"], ["G03", 4, "cells", "×625.00"],
    ["G03", 4, "baseRoboticMiners", "400"], ["G05", 5, "extraRoboticMiners", "+5"],
    ["G07", 4, "extraRoboticMiners", "+4"], ["G06", 1, "minerMultiplier", "×2.00"],
    ["B01", 20, "tickDuration", "−2.00 s"], ["H12", 19, "bioScientistsCost", "/1.00e95"],
    ["H15", 2, "equipmentCoefficient", "+0.08x"],
  ]) assert.equal(effect(code, { [code]: level }, target).current, expected, code);
  assert.equal(effect("G03", { G03: 4 }, "cells").next, "×3125.00");
  assert.equal(effect("G06", { G06: 1 }, "minerMultiplier").next, "×4.00");
  assert.equal(effect("A01", { A01: 1 }, "ticksPerLoop").currentExact, "-40");
});

test("G04 purchase description depends on both fabrication nodes and the total multiplier", () => {
  for (const [levels, expected] of [
    [{ G04: 402 }, "1"],
    [{ G04: 402, G05: 5 }, "6"],
    [{ G04: 402, G07: 4 }, "5"],
    [{ G04: 402, G05: 5, G07: 4 }, "10"],
    [{ G03: 4, G04: 402, G05: 5, G07: 4, G06: 1 }, "20"],
  ]) {
    const before = structuredClone(levels);
    assert.equal(effect("G04", levels, "minerPurchase").current, expected);
    assert.deepEqual(levels, before);
  }
  const miners = effect("G04", { G03: 4, G04: 402, G05: 5, G06: 1, G07: 4 }, "roboticMiners");
  assert.equal(miners.currentExact, "16880");
  assert.equal(miners.nextExact, "16920");
  assert.equal(miners.uncertain, false); // Native LM41Bonus applies LM51 both inside and outside the sum.
  assert.deepEqual(compareModEffects("G04", state({ G04: 1 }), {}).map(row => row.target), ["roboticMiners", "minerPurchase"]);
});

test("costs retain exact powers and not a rounded scoring logarithm", () => {
  assert.equal(effect("C1c", { C1c: 10 }, "mk1Cost").currentExact, "5.76650390625e31");
  assert.equal(effect("C4c", { C4c: 10 }, "mk4Cost").currentExact, "1.048576e86");
  assert.equal(effect("H12", { H12: 19 }, "bioScientistsCost").nextExact, "1e100");
  assert.deepEqual(compareModEffects("A08", state({ A08: 2 }), {}).map(row => row.target).sort(),
    ["modPoints", "shards", "mk1Output", "mk2Output", "mk4Output", "ticksPerLoop", "loopsForReset"].sort());
});

test("shared miner counters contribute shards once, without invented MP multipliers", () => {
  const summary = summarizeModEffects(state({ G03: 4, G04: 402, G05: 5, G06: 1, G07: 4 }), {});
  assert.equal(summary.effects.find(row => row.target === "cells").value, "×625.00");
  assert.ok(!summary.effects.some(row => /miner|modPoints/i.test(row.target)));
  assert.equal(summary.effects.find(row => row.target === "shards").value, "×176.55");
  assert.deepEqual(summary.uncertain, []);
  const total = summarizeModEffects(state({ A01: 2, A04: 1 }), {});
  assert.equal(total.effects.find(row => row.target === "cells").exact, "3.9375");
  assert.equal(total.effects.find(row => row.target === "ticksPerLoop").exact, "-130");
});

test("invalid levels and missing rules never fall back to sheet scoring", () => {
  assert.equal(gameEffectCoverage().length, 274);
  for (const level of [-1, 0.5, NaN, Infinity, 6]) {
    assert.ok(compareModEffects("A01", state({ A01: level }), {}).every(row => row.status === "invalid"));
  }
  const reward = effect("G27", {}, "freeAotcLevels");
  assert.equal(reward.currentExact, "0");
  assert.equal(reward.nextExact, "1");
  const rulesWithoutA01 = structuredClone(GAME_EFFECT_CATALOG);
  delete rulesWithoutA01.nodes.A01;
  assert.ok(compareGameEffects("A01", state({}), {}, rulesWithoutA01).every(row => row.status === "pending" && row.currentExact === null));
  const rules = structuredClone(GAME_EFFECT_CATALOG);
  rules.nodes.A01.maxLevel = null;
  assert.ok(compareGameEffects("A01", state({ A01: 8 }), {}, rules).every(row => row.status !== "invalid"));
});

test("Robotic Miner effects use G04's icon and the cyan game resource color", async () => {
  const { modEffectPresentation } = await import("../features/mod-tree/effectPresentation.ts");
  for (const label of ["Robotic Miners", "Extra miners on purchase", "Total Robotic Miners"]) {
    const palette = modEffectPresentation(label, "roboticMiners");
    assert.equal(palette.icon, "./assets/mod-tree/sprite-2974.png");
    assert.equal(palette.accent, "#42e7ef");
  }
});

test("all nodes have an explicit provenance and no wiki conflicts masquerade as current game values", () => {
  for (const row of gameEffectCoverage()) {
    for (const level of [0, Math.min(2, GAME_EFFECT_CATALOG.nodes[row.code]?.maxLevel ?? 1)]) {
      for (const result of compareModEffects(row.code, state({ [row.code]: level }), {})) {
        assert.doesNotMatch(result.current + result.next, /NaN|Infinity/);
        assert.notEqual(result.status, "invalid", `${row.code} level ${level}: ${result.reason}`);
        if (result.source?.basis.startsWith("wiki")) {
          assert.equal(result.verified, false);
          assert.equal(result.source.observedLevel, null);
        }
      }
    }
  }
  for (const [code, target] of [["C2c", "mk2Cost"], ["C4cb", "mk4Cost"], ["D8v", "modPoints"], ["H22", "cells"], ["H27", "cells"]]) {
    assert.equal(effect(code, { [code]: 1 }, target).status, "verified", code);
  }
  const cells = effect("H01", { H01: 1 }, "cells");
  assert.equal(cells.current, "×1.05");
  assert.equal(cells.status, "verified");
});

test("bulk construction and all Ultima duration effects have native display rules", () => {
  for (let mk = 1; mk <= 8; mk++) {
    const bulk = effect(`C${mk}b`, {}, `mk${mk}ManualPurchaseCount`);
    assert.equal(bulk.current, "×1.00");
    assert.equal(bulk.next, "×2.00");
    assert.equal(bulk.status, "verified");
  }
  const duration = effect("IU1", { IU1: 100 }, "constructionDuration");
  assert.equal(duration.current, "/2.00");
  assert.equal(duration.status, "verified");
  assert.match(duration.sourceVersion, /0\.7\.3\.63/);
  assert.equal(gameEffectCoverage().find(row => row.code === "IU1").status, "verified");
});

test("three visible columns keep the map centered, help pinned left, and level maximum inline", async () => {
  const read = name => readFile(new URL(`../${name}`, import.meta.url), "utf8");
  const [map, overview, panel, css] = await Promise.all(["features/mod-tree/ModTree.tsx", "features/mod-tree/ModEffectOverview.tsx", "features/mod-tree/ModRecommendationPanel.tsx", "features/mod-tree/mod-tree.css"].map(read));
  const left = map.indexOf("<ModEffectOverview"), help = map.indexOf('className="mod-tree-map-help"'), canvas = map.indexOf('<div className="mod-tree-canvas-frame"'), right = map.indexOf('<aside className="mod-tree-side-panel"');
  assert.ok(left >= 0 && left < help && help < canvas && canvas < right);
  assert.equal((map.match(/id=\{helpId\}/g) ?? []).length, 1);
  assert.match(css, /grid-template-columns:260px minmax\(0,1fr\) 420px; grid-template-rows:minmax\(min-content,1fr\)/);
  assert.match(css, /\.mod-tree-overview-scroll \{[^}]*flex:1 1 0;[^}]*overflow-y:auto/);
  assert.match(css, /\.mod-tree-overview-help \{ flex:0 0 auto;/);
  assert.ok(overview.indexOf('className="mod-tree-overview-scroll"') < overview.indexOf('className="mod-tree-overview-help"'));
  assert.match(panel, /className="mod-rec-level-control"><input/);
  assert.match(panel, /<span className="mod-rec-level-limit">\/ /);
  assert.match(css, /\.mod-rec-level-limit \{ flex:0 0 auto;/);
});

test("compact summary rows, right-aligned level, code badges and centered tools follow the screenshot corrections", async () => {
  const read = name => readFile(new URL(`../${name}`, import.meta.url), "utf8");
  const [overview, panel, tools, copy, css] = await Promise.all(["features/mod-tree/ModEffectOverview.tsx", "features/mod-tree/ModRecommendationPanel.tsx", "features/mod-tree/ModTreeTools.tsx", "features/mod-tree/recommendationCopy.ts", "features/mod-tree/mod-tree.css"].map(read));
  assert.match(css, /\.mod-tree-overview-effects \.mod-rec-effect-chip\.upgrade-multiplier-chip \{ display:flex; flex-direction:row;/);
  assert.match(css, /\.mod-rec-level-control input \{[^}]*width:110px; text-align:right;/);
  assert.match(css, /\.mod-rec-level-limit \{[^}]*color:var\(--content-ink\); font-weight:700/);
  assert.match(css, /\.mod-rec-level-stats \{ display:grid; grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(panel, /<output aria-label=\{t.power\}>/);
  assert.match(css, /\.mod-rec-power-column \{[^}]*border-left:1px solid var\(--surface-line\);/);
  assert.match(css, /\.mod-rec-power.mod-rec-field \{[^}]*border:1px solid #fff;/);
  assert.match(css, /\.mod-rec-power output \{[^}]*border:0; background:none;/);
  assert.doesNotMatch(panel, /<dt>\{t.power\}<\/dt>/);
  assert.match(panel, /<code className="mod-tree-code-token">\{selected.code\}<\/code>/);
  assert.match(css, /\.mod-tree-code-token,\.mod-recommendation-panel \.mod-rec-code \{[^}]*background:#171608; color:#f3e761;/);
  assert.match(css, /\.mod-rec-effect-levels \{[^}]*font-size:16px; font-weight:750;/);
  assert.match(copy, /effects: "다음 레벨 효과"/);
  assert.doesNotMatch(panel, /\{t.nextCost\}/);
  assert.match(tools, /<Modal open=\{active !== null\} centered/);
  assert.doesNotMatch(overview, /log₁₀/);
});

test("normal UI drops redundant explanatory paragraphs but retains errors and the fixed map controls", async () => {
  const read = name => readFile(new URL(`../${name}`, import.meta.url), "utf8");
  const [overview, panel, cards, map] = await Promise.all(["features/mod-tree/ModEffectOverview.tsx", "features/mod-tree/ModRecommendationPanel.tsx", "features/mod-tree/ModEffectCards.tsx", "features/mod-tree/ModTree.tsx"].map(read));
  assert.doesNotMatch(overview, /<p[^>]*>\{t.overviewHelp\}/);
  assert.doesNotMatch(panel, /\{t.moreOptions\}|\{t.saved\}/);
  assert.doesNotMatch(cards, /className="mod-rec-effect-note"/);
  assert.match(panel, /!ready \|\| model.storageFailed/);
  assert.match(panel, /selected.unlocked && \(selected.maxed \|\| !selected.affordable\)/);
  assert.match(map, /className="mod-tree-map-help"/);
});

test("content cards distinguish explicit unlocks, existing feature upgrades and unknown targets", async () => {
  assert.deepEqual(modContentEffect("A02"), { kind: "unlock", ko: "일일 보상", en: "Daily Rewards" });
  assert.equal(modContentEffect("A03").en, "The Arcade");
  for (const code of ["EA1", "EA7", "EB1", "EB7", "G05", "G07", "I25", "I27"]) assert.equal(modContentEffect(code).kind, "feature", code);
  assert.equal(modContentEffect("G22").kind, "unknown");
  assert.equal(modContentEffect("A01"), undefined);
  const cards = await readFile(new URL("../features/mod-tree/ModEffectCards.tsx", import.meta.url), "utf8");
  assert.match(cards, /effects.length \|\| content/);
  assert.match(cards, /mod-rec-content-effect/);
  assert.match(cards, /t.contentUnlock/);
});

test("locked nodes show a separated unlock section with required codes but no level threshold", async () => {
  const panel = await readFile(new URL("../features/mod-tree/ModRecommendationPanel.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../features/mod-tree/mod-tree.css", import.meta.url), "utf8");
  assert.match(panel, /!selected.unlocked && <section className="mod-rec-unlock-conditions"><h5>\{t.unlockConditions\}/);
  assert.match(panel, /selected.missing.map\(code => <button/);
  assert.doesNotMatch(panel, /≥ 1|\{t.prerequisites\}/);
  assert.match(css, /\.mod-rec-unlock-conditions \{[^}]*border-top:1px solid var\(--surface-line\)/);
});
