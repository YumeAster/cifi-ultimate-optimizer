import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { INSTALLS, INSTALL_ROWS, SHIPS, getShipInstalls } from "../lib/cifi/ship-install/catalog.ts";

const auditUrl = new URL("../public/assets/ship-install/provenance.json", import.meta.url);
const audit = existsSync(auditUrl) ? JSON.parse(readFileSync(auditUrl, "utf8")) : null;

test("the seven ordinary ships have 77 distinct stable install positions", () => {
  assert.equal(SHIPS.length, 7);
  assert.equal(INSTALLS.length, 77);
  assert.equal(new Set(INSTALLS.map(node => node.id)).size, 77);
  assert.deepEqual(INSTALL_ROWS, [[8, 4, 6, 9], [2, 1, 3], [10, 7, 5, 11]]);
  for (const ship of SHIPS) {
    assert.deepEqual(getShipInstalls(ship.id).map(node => node.position), Array.from({ length: 11 }, (_, i) => i + 1));
    assert.ok(getShipInstalls(ship.id).every(node => node.effects.length > 0));
  }
});

test("all 231 cap, coefficient and unlock fields match independently extracted native data", {
  skip: !audit && "The local audit manifest is intentionally excluded from the public release",
}, () => {
  assert.equal(Object.keys(audit.nativeFields).length, 231);
  for (const node of INSTALLS) {
    const key = node.provenance.nativeField;
    assert.equal(node.maxLevel, audit.nativeFields[`${key}MaxLevel`], node.id);
    assert.equal(node.unlockAt, audit.nativeFields[`${key}Requirement`], node.id);
    const nativePercent = audit.nativeFields[`${key}BaseBonus`] * (node.effects[0].kind === "additive" ? 1 : 100);
    for (const effect of node.effects) {
      assert.ok(Math.abs(effect.coefficientPercent - nativePercent) < Math.max(1e-10, Math.abs(nativePercent) * 1e-6), node.id);
    }
    const nativeTitle = audit.texts.find(item => item.path.endsWith(`${node.provenance.tooltipPath}/Title`));
    assert.equal(nativeTitle?.text, node.name.toUpperCase(), node.id);
  }
});

test("77 icons, seven ship images and four UI glyphs are present and valid PNGs", () => {
  const files = [...INSTALLS.map(node => node.icon), ...SHIPS.map(ship => ship.image),
    ...["rank", "crew", "installs", "evolution-star"].map(name => `/assets/ship-install/${name}.png`)];
  assert.equal(new Set(files).size, 88);
  for (const file of files) {
    const bytes = readFileSync(new URL(`../public${file}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, file);
  }
});

test("local audit ties all scene icons to their original positions", {
  skip: !audit && "The local audit manifest is intentionally excluded from the public release",
}, () => {
  assert.equal(audit.records.length, 88);
  assert.equal(audit.sceneIcons.length, 77);
  for (const node of INSTALLS) {
    const item = audit.records.find(record => record.file === node.icon.split("/").at(-1));
    assert.equal(item.nativePosition, node.provenance.nativePosition, node.id);
    assert.ok(audit.sceneIcons.some(icon => icon.path.includes(`UpgradePanel-The${node.ship}/`)
      && icon.path.endsWith(`/RankUpgrade${item.nativePosition}/Icon`)
      && icon.sprite.startsWith(item.texture)), node.id);
  }
});

test("Zeus corner ordering differs from the other ships and does not exchange Shards/RP", () => {
  const corners = getShipInstalls("Zeus").filter(node => node.position >= 9);
  assert.deepEqual(corners.map(node => node.provenance.nativePosition), [11, 9, 10]);
  assert.deepEqual(corners.map(node => node.effects[0].resource), ["cells", "shards", "research"]);
  assert.deepEqual(getShipInstalls("Cradle").filter(node => node.position >= 9).map(node => node.provenance.nativePosition), [11, 10, 9]);
});

test("compound effects and unresolved display-text conflicts are explicit", () => {
  assert.deepEqual(INSTALLS.find(node => node.id === "zagreus-7").effects.map(effect => effect.resource), ["mk5"]);
  assert.deepEqual(INSTALLS.find(node => node.id === "zagreus-8").effects.map(effect => [effect.resource, effect.dependency]), [["allGenerators", "LM"]]);
  assert.deepEqual(INSTALLS.find(node => node.id === "zeus-7").effects.map(effect => effect.resource), ["academyPoints", "allGenerators"]);
  assert.equal(INSTALLS.find(node => node.id === "demeter-1").effects[0].kind, "additive");
  const conflict = INSTALLS.find(node => node.id === "hephaestus-8");
  assert.equal(conflict.verification, "native-calculation-tooltip-conflict");
  assert.equal(conflict.effects[0].coefficientPercent, 1);
  assert.ok(conflict.notes.some(note => note.includes("0.01%")));
  assert.ok(INSTALLS.every(node => node.provenance.runtimeVerified === false));
});
