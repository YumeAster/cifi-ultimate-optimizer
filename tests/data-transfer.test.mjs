import assert from "node:assert/strict";
import { test } from "node:test";
import { createDataTransferBackup, DATA_TRANSFER_KEYS, importDataTransferBackup, parseDataTransferBackup } from "../lib/cifi/data-transfer.ts";
import { createDefaultShipInstallState, serializeShipInstallState } from "../lib/cifi/ship-install/persistence.ts";

function storage(seed = {}, failAt = null) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (key === failAt) throw new Error("storage full"); values.set(key, value); },
    removeItem: key => { if (key === failAt) throw new Error("storage full"); values.delete(key); },
  };
}

test("all known app keys round-trip without unrelated origin data", () => {
  const input = storage({ "cifi-orbit.mtc-inputs.v1": JSON.stringify({ saved: { cells: "5" } }), "cifi-ultimate.ui-theme.v1": "pearl", "other-app-secret": "stay" });
  const backup = parseDataTransferBackup(JSON.stringify(createDataTransferBackup(input)));
  assert.deepEqual(Object.keys(backup.data), [...DATA_TRANSFER_KEYS]);
  assert.equal(JSON.stringify(backup).includes("other-app-secret"), false);
  const target = storage({ "cifi-ultimate.ui-theme.v1": "red", "cifi-ultimate.mod-tree.v1": "{}", "other-app-secret": "stay" });
  importDataTransferBackup(target, backup);
  assert.equal(target.getItem("cifi-orbit.mtc-inputs.v1"), input.getItem("cifi-orbit.mtc-inputs.v1"));
  assert.equal(target.getItem("cifi-ultimate.ui-theme.v1"), "pearl");
  assert.equal(target.getItem("cifi-ultimate.mod-tree.v1"), null, "absent source data replaces old app data");
  assert.equal(target.getItem("other-app-secret"), "stay");
});

test("Ship Loadouts and all three slot allocations survive export and import", () => {
  const state = createDefaultShipInstallState();
  const input = storage({ "cifi-ultimate.ship-install.v1": serializeShipInstallState(state) });
  const target = storage();
  importDataTransferBackup(target, parseDataTransferBackup(JSON.stringify(createDataTransferBackup(input))));
  assert.equal(target.getItem("cifi-ultimate.ship-install.v1"), input.getItem("cifi-ultimate.ship-install.v1"));
});

test("invalid backups cannot change storage", () => {
  const target = storage({ "cifi-ultimate.ui-theme.v1": "red" });
  const good = createDataTransferBackup(target);
  for (const bad of ["not json", JSON.stringify({ ...good, version: 999 }), JSON.stringify({ ...good, data: { ...good.data, unknown: "value" } }), JSON.stringify({ ...good, data: { ...good.data, "cifi-ultimate.ui-theme.v1": "invalid" } })]) {
    assert.throws(() => parseDataTransferBackup(bad));
    assert.equal(target.getItem("cifi-ultimate.ui-theme.v1"), "red");
  }
});

test("write failure rolls all changed app keys back", () => {
  const before = storage({ "cifi-orbit.mtc-inputs.v1": "{}", "cifi-ultimate.ui-theme.v1": "red" });
  const next = createDataTransferBackup(storage({ "cifi-orbit.mtc-inputs.v1": "{\"different\":true}", "cifi-ultimate.ui-theme.v1": "orbit" }));
  const target = storage(Object.fromEntries(before.values), "cifi-ultimate.ui-theme.v1");
  assert.throws(() => importDataTransferBackup(target, next));
  assert.equal(target.getItem("cifi-orbit.mtc-inputs.v1"), "{}");
  assert.equal(target.getItem("cifi-ultimate.ui-theme.v1"), "red");
});
