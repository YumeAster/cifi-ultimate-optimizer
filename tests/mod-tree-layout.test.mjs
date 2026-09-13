import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  modTreeEvidence, preOuroborosModTreeNodesRebased as nodes,
  preOuroborosModTreeEdges as edges, preOuroborosModTreeCanvas as canvas,
} from "../lib/cifi/mod-tree/graph.ts";

const byCode = new Map(nodes.map(node => [node.label, node]));
const hasEdge = (a, b) => edges.some(edge => edge.from === a && edge.to === b);

test("all 274 sheet codes have unique positions and stable code identities", () => {
  assert.equal(nodes.length, 274);
  assert.equal(byCode.size, 274);
  assert.equal(new Set(nodes.map(node => node.key)).size, 274);
  assert.equal(new Set(nodes.map(node => `${Math.round(node.x)},${Math.round(node.y)}`)).size, 274);
  for (const node of nodes) {
    assert.match(node.label, /^[A-I](?:\d{2}|\d(?:[bcuogvL]|cb|ob)|[ABU]\d|C\d|G[CS])$/);
    assert.equal(node.key, node.label);
    assert.ok(node.name && node.sourceRow >= 2 && node.sourceRow <= 275);
    assert.ok(node.x > 0 && node.x < canvas.width && node.y > 0 && node.y < canvas.height);
  }
  assert.equal(byCode.get("A01").objectName, "LM0");
  assert.equal(byCode.get("C5u").objectName, "LM5");
  assert.match(byCode.get("F03").name, /MK4 Trinity/);
  assert.equal(byCode.get("IC4").name, "Sekhur Mission Catalogue");
});

test("restore child icons missing from the LM-only extraction", () => {
  assert.equal(modTreeEvidence.apkMappedNodeCount, 242);
  assert.equal(modTreeEvidence.supplementedNodeCount, 32);
  for (const code of ["A07","A10","C1c","C4o","C8c","D1L","D3L","E02","G05","G07","G15","G16","G17","G19","G20","G22","G23","IC1","IC2","IC3","IC4"]) {
    assert.equal(byCode.get(code).layoutSource, "apk-child", code);
    assert.equal(byCode.get(code).numericId, null, "do not invent APK IDs for child icons");
  }
  // Real Unity coordinates are not an exact lattice (up to 0.27px offset).
  assert.ok(Math.abs(byCode.get("G15").y - byCode.get("G14").y - 42.5) < .3);
  assert.ok(Math.abs(byCode.get("G17").y - byCode.get("G14").y - 127.5) < .3);
  assert.ok(Math.abs(byCode.get("C5c").x - byCode.get("C5u").x - 42.5) < .3);
  assert.ok(Math.abs(byCode.get("IC4").x - byCode.get("IU4").x + 42.5) < .3);
});

test("pre-Ouroboros scope excludes expansion, skeleton and unused raw objects everywhere", () => {
  assert.equal(modTreeEvidence.hiddenOuroborosNodeCount, 88);
  assert.equal(modTreeEvidence.excludedOtherRawNodeCount, 20);
  assert.ok(nodes.every(node => node.group === "main" && node.state !== "placeholder"));
  const forbidden = ["LM264", "LM279", "LM280", "LM281", "LM282", "LM283", "LM285", "LM286", "LM289", "LM290", "LM291", "LM292", "LM293", "LM613", "LM999"];
  assert.ok(nodes.every(node => !forbidden.includes(node.objectName)));
  for (const edge of edges) assert.ok(byCode.has(edge.from) && byCode.has(edge.to));
});

test("game wiring includes missing stems and removes nearest-neighbour lattice guesses", () => {
  for (const [a,b] of [
    ["A01","B01"], ["A01","C1o"], ["A01","C4u"], ["A01","A02"], ["A01","A03"],
    ["B03","F01"], ["F01","F02"], ["F02","F03"],
    ["C3o","G01"], ["G01","G03"], ["C5u","C5o"], ["C5u","C5c"],
    ["D1v","D1L"], ["D1L","D1c"], ["D1c","D1g"],
    ["E01","E02"], ["E02","E03"], ["E26","E30"], ["E30","E31"],
    ["G14","G15"], ["G15","G16"], ["G16","G17"], ["G17","G24"],
    ["G21","G22"], ["G22","G26"], ["H07","H08"], ["IU4","IC1"], ["IC1","IC2"], ["IC2","IC3"], ["IU4","IC4"],
  ]) assert.ok(hasEdge(a,b), `missing ${a} -> ${b}`);
  for (const [a,b] of [
    ["A02","A03"], ["E01","E03"], ["D1g","D2g"], ["D1c","D2c"],
    ["C1cb","C2cb"], ["EA1","EA2"], ["E03","E07"], ["G14","G24"],
    ["H04","H09"], ["H01","H08"], ["I13","I18"], ["F04","DGC"], ["F02","D1c"],
  ]) assert.ok(!hasEdge(a,b) && !hasEdge(b,a), `old speculative link ${a} - ${b}`);
  assert.ok(hasEdge("G12", "GU1"), "APK SkeletonLM234 connects G12 to GU1");
  assert.ok(!hasEdge("G13", "GU1"), "unlock condition is not the displayed line");
  assert.deepEqual(byCode.get("IC1").prerequisites, ["IU2"], "unlock rules remain separate from visual wiring");
});

test("solid paths have valid endpoints and do not create diagonal shortcut branches", () => {
  assert.equal(new Set(edges.map(edge => edge.objectName)).size, edges.length);
  for (const edge of edges) {
    assert.notEqual(edge.from, edge.to);
    assert.deepEqual(edge.points[0], { x: byCode.get(edge.from).x, y: byCode.get(edge.from).y });
    assert.deepEqual(edge.points.at(-1), { x: byCode.get(edge.to).x, y: byCode.get(edge.to).y });
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1], b = edge.points[i];
      assert.ok(Math.abs(a.x - b.x) <= 2 || Math.abs(a.y - b.y) <= 2, edge.objectName);
    }
  }
});

test("code-based component never advertises unperformed complete capture verification", async () => {
  const view = await readFile(new URL("../features/mod-tree/ModTree.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(view, /VERIFIED LAYOUT|capture-checked|six verified/);
  assert.match(view, /node\.label/);
  assert.match(view, /edge\.points/);
});

test("map removes intro and block controls and fills only its own dashboard content", async () => {
  const view = await readFile(new URL("../features/mod-tree/ModTree.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../features/mod-tree/mod-tree.css", import.meta.url), "utf8");
  assert.doesNotMatch(view, /mod-tree-intro|mod-tree-evidence-strip|mod-tree-group-nav|activeBlock|selectBlock/);
  assert.match(view, /mod-tree-search/);
  assert.match(view, /mod-tree-zoom/);
  assert.match(page, /isModTreeTab \? " is-mod-tree" : ""/);
  assert.match(css, /\.dashboard-content\.is-mod-tree\s*\{[^}]*display:flex[^}]*overflow-x:hidden; overflow-y:auto/);
  assert.match(css, /\.mod-tree-canvas\s*\{[^}]*flex:1 1 0[^}]*height:0[^}]*min-height:0/);
  assert.doesNotMatch(css, /height:clamp\(|height:58vh|min-height:360px|max-height:600px/);
});
