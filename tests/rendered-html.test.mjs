import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://orbit.example/", {
      headers: { accept: "text/html", host: "orbit.example", "x-forwarded-proto": "https" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Mod Tree input manager", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /CIFI ULTIMATE/);
  assert.match(html, /v0\.3/);
  assert.match(html, /page-[A-Za-z0-9_-]+\.js/);
  assert.match(html, /https:\/\/orbit\.example\/og-cifi-ultimate\.png/);
  assert.match(html, /summary_large_image/);
});

test("renders the active workspace title and description once inside the dashboard header", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  const header = html.match(/<header\b[^>]*class="[^"]*dashboard-header[^"]*"[^>]*>([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header, "The dashboard header must be rendered");
  assert.match(header, /<h1\b[^>]*class="[^"]*dashboard-page-title[^"]*"[^>]*>입력값 관리<\/h1>/);
  assert.match(header, /dashboard-header-description/);
  assert.match(header, /입력값은 변경 즉시 자동 저장됩니다\./);
  assert.match(html, /가중치 저장/);
  assert.match(html, /플레이어 진행도 입력/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /class="workspace-intro"/);
});

test("removes starter preview assets and keeps the social card", async () => {
  const [page, styles, packageJson, inputCopy] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/content/inputCopy.ts", import.meta.url), "utf8"),
  ]);

  assert.match(inputCopy, /입력값 관리/);
  assert.match(inputCopy, /Player Progress/);
  assert.match(inputCopy, /Ship Progress/);
  assert.match(inputCopy, /플레이어 진행도/);
  assert.match(inputCopy, /함선 진행도/);
  assert.match(inputCopy, /업그레이드 옵티마이저/);
  assert.match(page, /diamonds/);
  assert.match(page, /tokens/);
  assert.match(page, /UpgradeOptimizer/);
  assert.match(page, /optimizer-menu-diamond/);
  assert.match(page, /optimizer-menu-token/);
  assert.match(inputCopy, /추천 계산과 효과 표시에서 함께 사용/);
  assert.match(page, /localizedText/);
  assert.match(page, /languageStorageKey/);
  assert.match(inputCopy, /가중치와 플레이어 진행도/);
  assert.match(inputCopy, /Manual mk 진행도/);
  assert.match(inputCopy, /MK별 Hardware Tech와 Software Tech/);
  assert.match(page, /hardwareTechMk/);
  assert.match(page, /generator-tech-matrix/);
  assert.match(page, /generator-matrix/);
  assert.match(page, /generator-matrix-desktop/);
  assert.match(page, /generator-tech-desktop/);
  assert.match(page, /generator-tech-mobile/);
  assert.match(page, /softwareTechMk/);
  assert.match(page, /ship-card-grid/);
  assert.match(page, /ship-input-card/);
  assert.match(page, /ship-progress-section/);
  assert.match(page, /type ActiveTab = "inputs"/);
  assert.doesNotMatch(page, /key: "ship"/);
  assert.doesNotMatch(page, /\["weights", "player", "ship"/);
  assert.match(page, /player-card-grid/);
  assert.match(page, /weight-card-grid/);
  assert.match(page, /weightPalette/);
  assert.match(page, /#ff5f66/);
  assert.match(page, /rankPoints: \{ accent: "#ffffff"/);
  assert.match(page, /playerResourceSections/);
  assert.match(page, /filledCount/);
  assert.match(page, /getInputFieldHelp/);
  assert.match(page, /inputFieldLabels/);
  assert.match(inputCopy, /Loop Filled/);
  assert.match(inputCopy, /Loop Resets Done/);
  assert.match(inputCopy, /현재 Cell Loop \+ Tick Loop \+ 무료 Loops Filled/);
  assert.match(inputCopy, /이번 Construction의 Loop Reset/);
  assert.match(page, /hardwareTechMk/);
  assert.match(page, /Tooltip/);
  assert.match(page, /player-input-count/);
  assert.match(page, /field-panel-copy/);
  assert.match(page, /themeStorageKey/);
  assert.match(page, /themeOptions/);
  assert.match(page, /theme-\$\{theme\}/);
  assert.match(page, /Orbital Navy/);
  assert.match(page, /Solar Frost/);
  assert.match(page, /Nebula Core/);
  assert.match(page, /Pearl Moon/);
  assert.match(styles, /theme-orbit/);
  assert.match(styles, /theme-solar/);
  assert.match(styles, /theme-nebula/);
  assert.match(styles, /theme-pearl/);
  assert.match(styles, /solar-frost-orbit-v2\.png/);
  assert.match(styles, /pearl-moon-orbit-v2\.png/);
  assert.match(styles, /backdrop-filter:blur\(28px\)/);
  assert.match(styles, /theme-select\.ant-select/);
  assert.match(styles, /ant-select-content/);
  assert.match(styles, /player-field \.ant-input-affix-wrapper/);
  assert.match(styles, /generator-tech-grid/);
  assert.match(styles, /section-technology/);
  assert.match(styles, /color:#8a1822/);
  assert.match(styles, /ant-btn:disabled:not\(\.ant-btn-primary\)/);
  assert.match(styles, /height:100dvh/);
  assert.match(styles, /overflow-y:auto/);
  assert.match(styles, /upgrade-optimizer/);
  assert.match(styles, /optimizer-upgrade-grid/);
  assert.match(styles, /\.optimizer-upgrade-grid \{ display:grid; grid-template-columns:repeat\(4,minmax\(0,1fr\)\); gap:12px; \}/);
  assert.match(styles, /optimizer-menu-diamond/);
  assert.match(styles, /--optimizer-accent:#ff4fc3/);
  assert.match(styles, /--upgrade-accent/);
  assert.match(styles, /optimizer-upgrade-card \.ant-input-number-addon/);
  assert.doesNotMatch(page, /Command Deck/);
  assert.doesNotMatch(styles, /theme-command/);
  assert.match(page, /Generator/);
  assert.match(inputCopy, /아카데미/);
  assert.match(page, /shipPalette/);
  assert.match(page, /TrophyOutlined/);
  assert.match(page, /TeamOutlined/);
  assert.doesNotMatch(page, /짧은 단위 표기 지원/);
  assert.match(inputCopy, /가중치 프리셋/);
  assert.match(page, /deleteSelectedPreset/);
  assert.match(page, /sidebar-menu/);
  assert.match(page, /dashboard-sider/);
  assert.match(page, /text.inputManager/);
  assert.match(page, /EditOutlined/);
  assert.doesNotMatch(page, /RocketOutlined/);
  assert.doesNotMatch(page, /tabItems/);
  assert.doesNotMatch(page, /<Tabs/);
  assert.match(page, /presetStorageKey/);
  assert.match(page, /localStorage/);
  assert.doesNotMatch(page, /Google Sheets/);
  assert.doesNotMatch(page, /ModValues/);
  assert.match(page, /ConfigProvider/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og-cifi-ultimate.png", import.meta.url));
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)));
});
