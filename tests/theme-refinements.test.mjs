import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("red is a persistent fifth theme without changing existing theme keys or aliases", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /type DashboardTheme = "orbit" \| "solar" \| "nebula" \| "pearl" \| "red"/);
  assert.match(page, /value: "red", label: "모드 레드"/);
  assert.match(page, /value: "red", label: "Mod Red"/);
  assert.match(page, /storedTheme === "red"/);
  assert.match(page, /cifi-ultimate.ui-theme.v1/);
  assert.match(page, /storedTheme === "abyss"/);
  assert.match(page, /storedTheme === "command"/);
  assert.match(page, /import "\.\/theme-refinements.css"/);
});

test("each node palette covers artwork, maxed and MP-shortage states without recoloring source assets", async () => {
  const css = await read("app/theme-refinements.css");
  const mapCss = await read("features/mod-tree/mod-tree.css");
  const icon = await read("features/mod-tree/ModTreeIcon.tsx");
  const view = await read("features/mod-tree/ModTree.tsx");
  for (const state of ["available", "locked", "owned", "maxed", "unaffordable"]) {
    for (const part of ["line", "bg", "icon"]) {
      const key = `--mod-${state}-${part}`;
      assert.ok((css.match(new RegExp(`${key}:`, "g")) ?? []).length >= 5, `${key} needs five palettes`);
      assert.ok(mapCss.includes(`var(${key})`), `${key} must be consumed`);
    }
  }
  assert.match(icon, /<feColorMatrix type="saturate" values="0"/);
  assert.match(icon, /<feFlood className="mod-tree-icon-tint"/);
  assert.match(icon, /operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/);
  assert.match(icon, /href=\{layer.src\}/);
  assert.match(icon, /useId\(\)/);
  assert.doesNotMatch(mapCss, /filter:grayscale/);
  assert.match(view, /nodeUnaffordable\(evaluation, node.maxLevel\)/);
  assert.match(view, /data-unaffordable=\{unaffordable\}/);
  assert.match(view, /mod-tree-node-state-mark/);
  assert.match(view, /mod-tree-legend-item/);
  assert.doesNotMatch(view, /recommendationCopy\[language\]\.stateLegend/);
});

test("map and portal palettes cover all themes while original resource icons stay separate from text contrast", async () => {
  const css = await read("app/theme-refinements.css");
  const mapCss = await read("features/mod-tree/mod-tree.css");
  const view = await read("features/mod-tree/ModTree.tsx");
  for (const theme of ["orbit", "solar", "nebula", "pearl", "red"]) assert.ok(css.includes(`:root:has(.theme-${theme})`), theme);
  for (const key of ["--mod-map-bg", "--mod-panel-bg", "--mod-grid", "--mod-edge", "--mod-focus", "--mod-level-ink", "--mod-gold-ink", "--mod-buy-bg"]) assert.ok((css + mapCss).includes(`var(${key})`), key);
  assert.match(view, /className="mod-tree-grid-line"/);
  assert.doesNotMatch(view, /stroke="rgba\(222,42,47/);
  assert.match(css, /--chip-ink:color-mix\(in srgb,var\(--chip-accent\) 35%,var\(--content-ink\)\)/);
  assert.match(css, /\.dashboard-shell\.ant-layout-has-sider > \.dashboard-main\.ant-layout \{ width:100%;/);
  assert.match(css, /\.mod-rec-purchase:disabled \{ opacity:1;/);
  assert.match(css, /\.mod-tree-side-panel \{ grid-column:1; grid-row:2;/);
  assert.match(css, /\.mod-overview-effect-name \{[^}]*text-overflow:ellipsis/);
});

test("each theme keeps purchasable, unaffordable, completed, and recommendation states visually distinct", async () => {
  const [css, view, copy] = await Promise.all([
    read("app/theme-refinements.css"),
    read("features/mod-tree/ModTree.tsx"),
    read("features/mod-tree/recommendationCopy.ts"),
  ]);
  const palettes = {
    orbit: ["--mod-available-line:#39d98a", "--mod-unaffordable-line:#e7bd58", "--mod-maxed-line:#4f88bd", "--mod-gold:#67bde9", "--mod-gold-top:#b8e7ff"],
    solar: ["--mod-available-line:#5fbb89", "--mod-unaffordable-line:#d5ac45", "--mod-maxed-line:#d36f80", "--mod-gold:#4faad3", "--mod-gold-top:#8dcee9"],
    nebula: ["--mod-available-line:#519fe7", "--mod-unaffordable-line:#e4b957", "--mod-maxed-line:#7553a6", "--mod-gold:#aa7fe4", "--mod-gold-top:#e0c7ff"],
    pearl: ["--mod-available-line:#61b98b", "--mod-unaffordable-line:#d9b451", "--mod-maxed-line:#d36f80", "--mod-gold:#704ba8", "--mod-gold-top:#ad8edc"],
    red: ["--mod-unaffordable-line:#c5a05c", "--mod-maxed-line:#a94352", "--mod-gold:#6fb9df", "--mod-gold-top:#a9def2"],
  };
  for (const [theme, tokens] of Object.entries(palettes)) for (const token of tokens) assert.ok(css.includes(token), `${theme}: ${token}`);
  for (const theme of ["solar", "pearl"]) {
    const rules = css.match(new RegExp(`\\.dashboard-shell\\.theme-${theme} \\{[^}]+\\}`, "g")) ?? [];
    const palette = rules.find(rule => rule.includes("--mod-available-line:")) ?? "";
    const recommendationRule = rules.find(rule => rule.includes("--mod-gold:")) ?? "";
    for (const state of ["available", "locked", "owned", "maxed", "unaffordable"]) {
      const line = palette.match(new RegExp(`--mod-${state}-line:(#[0-9a-f]{6})`))?.[1];
      const icon = palette.match(new RegExp(`--mod-${state}-icon:(#[0-9a-f]{6})`))?.[1];
      assert.equal(icon, line, `${theme} ${state} icon must match its node border`);
    }
    const recommendation = recommendationRule.match(/--mod-gold:(#[0-9a-f]{6})/)?.[1];
    const recommendationIcon = palette.match(/--mod-recommended-icon:(#[0-9a-f]{6})/)?.[1];
    const topBorder = palette.match(/--mod-top-border:(#[0-9a-f]{6})/)?.[1];
    const topIcon = palette.match(/--mod-top-icon:(#[0-9a-f]{6})/)?.[1];
    assert.equal(recommendationIcon, recommendation, `${theme} recommendation icon must match its node border`);
    assert.equal(topIcon, topBorder, `${theme} top recommendation icon must match its node border`);
  }
  assert.ok((css.match(/--mod-gold:/g) ?? []).length >= 5, "every theme needs a recommendation accent");
  assert.match(css, /\.dashboard-shell \.mod-rec-list button\.is-top \{ border-color:var\(--mod-top-border\); box-shadow:inset 4px 0 var\(--mod-top-border\); \}/);
  assert.match(copy, /밝은 테마색 파동: 추천 노드 · 대비색: 1순위/);
  assert.match(copy, /Bright theme ripple: recommended · Contrast color: top pick/);
  assert.doesNotMatch(view, /\bAPK\b/);
});
