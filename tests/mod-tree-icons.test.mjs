import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import icons from "../lib/cifi/mod-tree/icons.json" with { type: "json" };
import textOverlays from "../lib/cifi/mod-tree/icon-text.json" with { type: "json" };
import nativeFrameSizes from "../lib/cifi/mod-tree/frame-sizes.json" with { type: "json" };
import wiring from "../docs/cifi-apk-static-0.7.3.61/mod-tree-connector-evidence.json" with { type: "json" };
import { modTreeNodes as nodes, modTreeEdges as edges } from "../lib/cifi/mod-tree/graph.ts";
import { nodePresentation, nodeFramePath, nodeContentLayout, nodeLevelText } from "../lib/cifi/mod-tree/presentation.ts";

test("all 274 nodes render mapped original APK Sprite layers with finite geometry", () => {
  assert.equal(Object.keys(icons.nodes).length, 274);
  assert.match(icons.apkSha256, /^[a-f0-9]{64}$/);
  for (const node of nodes) {
    assert.equal(node.objectName, icons.nodes[node.key].objectName, node.key);
    assert.equal(node.iconLayers, icons.nodes[node.key].layers);
    assert.ok(node.iconLayers.length >= 1 && node.iconLayers.length <= 2);
    for (const layer of node.iconLayers) {
      assert.match(layer.src, /^\.\/assets\/mod-tree\/sprite-\d+\.png$/);
      for (const key of ["x", "y", "width", "height", "opacity"]) assert.ok(Number.isFinite(layer[key]), `${node.key}.${key}`);
      assert.ok(layer.width > 0 && layer.height > 0);
      assert.ok(layer.opacity > 0 && layer.opacity <= 1);
    }
  }
});

test("97 served sprite files are byte-identical to the extracted original PNGs", async () => {
  const layers = new Map(nodes.flatMap(node => node.iconLayers.map(layer => [layer.src, layer])));
  assert.equal(layers.size, 97);
  const folder = new URL("../public/assets/mod-tree/", import.meta.url);
  assert.equal((await readdir(folder)).filter(name => name.endsWith(".png")).length, 97);
  for (const layer of layers.values()) {
    const png = await readFile(new URL(layer.src.replace("./assets/mod-tree/", ""), folder));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", layer.src);
    assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
    assert.equal(createHash("sha256").update(png).digest("hex"), layer.sha256, layer.src);
  }
});

test("all 14 EA/EB automation icons retain both original Unity layers", () => {
  const combined = nodes.filter(node => /^E[AB][1-7]$/.test(node.key));
  assert.equal(combined.length, 14);
  assert.equal(nodes.filter(node => node.iconLayers.length === 2).length, 14);
  for (const node of combined) {
    assert.equal(node.iconLayers.length, 2, node.key);
    assert.match(node.iconLayers[1].sprite, /Automation/i);
    assert.notEqual(node.iconLayers[0].pathId, node.iconLayers[1].pathId);
  }
});

test("planet catalogue badges keep the exact P1-P4 strings read from the scene", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(textOverlays).map(([code, value]) => [code, value.text])),
    { IC1: "P1", IC2: "P2", IC3: "P3", IC4: "P4" });
  for (const overlay of Object.values(textOverlays)) {
    assert.ok(overlay.x > 50 && overlay.x < 100 && overlay.y > 50 && overlay.y < 100);
  }
});

test("special nodes retain the actual 173.4036 to 110 native frame ratio", () => {
  assert.deepEqual(Object.entries(nativeFrameSizes).filter(([, size]) => size[0] !== 110).map(([code]) => code).sort(),
    ["DU1", "EU2", "FU1", "IU1"]);
  assert.equal(Object.keys(nativeFrameSizes).length, 274);
  for (const node of nodes) {
    const native = nativeFrameSizes[node.key];
    assert.equal(native[0], native[1], "this renderer expects the source square frame");
    assert.equal(node.size, 28 * native[0] / 110, node.key);
  }
  assert.ok(nodes.find(node => node.key === "IU1").size / nodes.find(node => node.key === "A01").size > 1.57);
});

test("icon scales retain the eight prior adjustments and shrink DU1 to 80 percent without changing frames", () => {
  const reducedCodes = ["IU2", "IU3", "IU4", "DU2", "DU3", "EU1", "FU2", "FU4"];
  for (const code of reducedCodes) assert.ok(nodes.some(node => node.key === code), code);
  for (const node of nodes) {
    const isReduced = reducedCodes.includes(node.key);
    const previousIconSize = node.size * .8 * (isReduced ? .9 : 1);
    const actual = nodePresentation(node);
    assert.ok(Math.abs(actual.iconSize - previousIconSize * (isReduced || node.key === "DU1" ? .8 : 1)) < 1e-12, node.key);
    const expected = {
      radius: node.size / 2,
      iconSize: node.size * .8 * (node.key === "DU1" ? .8 : isReduced ? .9 * .8 : 1),
      labelY: node.size / 2 + 6,
      labelWidth: Math.max(18, node.label.length * 4.1 + 4),
      labelHeight: 8,
      fontSize: 6.5,
    };
    assert.deepEqual(actual, expected, node.key);
  }
});

test("graph contains every direct connection independently recovered from the Unity scene", () => {
  const key = pair => [...pair].sort().join("--");
  const displayed = new Set(edges.map(edge => key([edge.from, edge.to])));
  assert.equal(wiring.sceneConnectorCount, 295);
  assert.equal(wiring.directMatches.length, 270);
  for (const line of wiring.directMatches) assert.ok(displayed.has(key(line.pair)), line.objectName);
  assert.ok(wiring.directMatches.some(line => line.objectName === "SkeletonLM234" && key(line.pair) === key(["GU1", "G12"])));
  assert.ok(!displayed.has(key(["H01", "H08"])), "unlock prerequisite is not a physical wire");
});

test("node frames round all eight corners inside the original bounds with thinner state outlines", async () => {
  for (const node of nodes) {
    const radius = nodePresentation(node).radius;
    const path = nodeFramePath(radius);
    assert.equal((path.match(/Q/g) ?? []).length, 8, node.key);
    assert.match(path, /^M.* Z$/);
    assert.doesNotMatch(path, /NaN|Infinity/);
    const coordinates = path.match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.ok(coordinates.every(value => Math.abs(value) <= radius + .00001), node.key);
    assert.ok(coordinates.some(value => Math.abs(value - radius) < .00001), node.key);
    assert.ok(coordinates.some(value => Math.abs(value + radius) < .00001), node.key);
  }
  const css = await readFile(new URL("../features/mod-tree/mod-tree.css", import.meta.url), "utf8");
  assert.match(css, /\.mod-tree-v2 \.mod-tree-node-frame \{[^}]*stroke-width:var\(--mod-node-frame-width\);[^}]*stroke-linejoin:round/);
  assert.match(css, /\.mod-tree-node \{ --mod-node-frame-width:2\.08;/);
  assert.match(css, /\.is-recommended \{ --mod-node-frame-width:3\.2;/);
  assert.match(css, /\.is-selected \.mod-tree-node-frame \{[^}]*stroke-width:var\(--mod-node-frame-width\);/);
  assert.match(css, /\.is-top-recommendation \{ --mod-node-frame-width:4;/);
});

test("maximum-length level text stays clear of other node frames and labels", () => {
  const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const geometry = nodes.map(node => {
    const p = nodeContentLayout(node, nodeLevelText(Math.min(99_999, node.maxLevel), node.maxLevel));
    const { radius } = nodePresentation(node);
    const outerRadius = radius + 2; // Includes the widest 4px top-recommendation frame.
    return { key: node.key,
      frame: { left: node.x - outerRadius, right: node.x + outerRadius, top: node.y - outerRadius, bottom: node.y + outerRadius },
      badge: { left: node.x - p.levelWidth / 2 - .325, right: node.x + p.levelWidth / 2 + .325,
        top: node.y + p.levelY - p.levelHeight / 2 - .325, bottom: node.y + p.levelY + p.levelHeight / 2 + .325 } };
  });
  for (const a of geometry) for (const b of geometry) {
    if (a === b) continue;
    assert.ok(!intersects(a.frame, b.frame), `${a.key} frame overlaps ${b.key} frame`);
    assert.ok(!intersects(a.badge, b.frame), `${a.key} label overlaps ${b.key} frame`);
    assert.ok(!intersects(a.badge, b.badge), `${a.key} label overlaps ${b.key} label`);
  }
});

test("small code badges overlay unchanged icons and current/max levels sit below without a box", async () => {
  const view = await readFile(new URL("../features/mod-tree/ModTree.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(view, /mod-tree-node-core/);
  assert.match(view, /ModTreeIcon node=\{node\}/);
  assert.match(view, /nodePresentation\(node\)/);
  assert.match(view, /<rect className="mod-tree-code-badge"/);
  assert.doesNotMatch(view, /mod-tree-level-badge/);
  assert.match(view, /width=\{codeWidth\} height=\{codeHeight\}/);
  assert.ok(view.indexOf('className="mod-tree-node-icon"') < view.indexOf('<text className="mod-tree-node-code"'));
  assert.match(view, /x=\{iconX\} y=\{iconY\} width=\{iconSize\} height=\{iconSize\}/);
  assert.match(view, /className="mod-tree-node-code"[^>]*y=\{codeY\}/);
  assert.match(view, /className="mod-tree-node-level"[^>]*y=\{levelY\}/);
  for (const node of nodes) {
    const base = nodePresentation(node);
    const layout = nodeContentLayout(node, nodeLevelText(0, node.maxLevel));
    assert.equal(layout.iconSize, base.iconSize, node.key);
    assert.equal(layout.iconX, -base.iconSize / 2, node.key);
    assert.equal(layout.iconY, -base.iconSize / 2, node.key);
    assert.ok(layout.codeFontSize < base.fontSize, node.key);
    assert.ok(Math.abs(layout.codeY) + layout.codeFontSize / 2 < base.radius, node.key);
    assert.ok(Math.abs(layout.codeY) + layout.codeHeight / 2 < base.radius - 2, node.key);
    assert.ok(layout.levelY > base.radius, node.key);
  }
});
