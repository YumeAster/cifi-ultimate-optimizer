import { SHIP_INSTALL_STORAGE_KEY, restoreShipInstallState } from "./ship-install/persistence.ts";

/** Only this app's known local data belongs in a portable backup. */
export const DATA_TRANSFER_KEYS = [
  "cifi-orbit.mtc-inputs.v1",
  "cifi-orbit.mtc-weight-presets.v1",
  "cifi-orbit.ui-language.v1",
  "cifi-ultimate.ui-theme.v1",
  "cifi-ultimate.mod-tree.recommendation-count.v1",
  "cifi-ultimate.upgrade-optimizer.v1",
  "cifi-ultimate.mod-tree.v1",
  "cifi-mod-game-display-anchors-v1",
  SHIP_INSTALL_STORAGE_KEY,
] as const;
export const DATA_TRANSFER_FORMAT = "cifi-ultimate-optimizer-data";
export const DATA_TRANSFER_VERSION = 1;
export const MAX_DATA_TRANSFER_LENGTH = 20_000_000;
export type TransferStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type TransferBackup = {
  format: typeof DATA_TRANSFER_FORMAT;
  version: typeof DATA_TRANSFER_VERSION;
  exportedAt: string;
  data: Record<(typeof DATA_TRANSFER_KEYS)[number], string | null>;
};

export function createDataTransferBackup(storage: Pick<TransferStorage, "getItem">): TransferBackup {
  const data = Object.fromEntries(DATA_TRANSFER_KEYS.map(key => [key, storage.getItem(key)])) as TransferBackup["data"];
  const backup: TransferBackup = { format: DATA_TRANSFER_FORMAT, version: DATA_TRANSFER_VERSION, exportedAt: new Date().toISOString(), data };
  if (JSON.stringify(backup).length > MAX_DATA_TRANSFER_LENGTH) throw new Error("Data backup is too large");
  return backup;
}

export function parseDataTransferBackup(raw: string): TransferBackup {
  if (typeof raw !== "string" || raw.length > MAX_DATA_TRANSFER_LENGTH) throw new Error("Backup file is too large");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Backup is not valid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid backup");
  const backup = value as Record<string, unknown>;
  if (backup.format !== DATA_TRANSFER_FORMAT || backup.version !== DATA_TRANSFER_VERSION || typeof backup.exportedAt !== "string" || !Number.isFinite(Date.parse(backup.exportedAt))) throw new Error("Unsupported backup format");
  if (!backup.data || typeof backup.data !== "object" || Array.isArray(backup.data)) throw new Error("Invalid backup data");
  const data = backup.data as Record<string, unknown>;
  if (Object.keys(data).length !== DATA_TRANSFER_KEYS.length || DATA_TRANSFER_KEYS.some(key => !Object.hasOwn(data, key) || (data[key] !== null && typeof data[key] !== "string"))) throw new Error("Backup data keys do not match this app");
  for (const key of DATA_TRANSFER_KEYS) {
    const item = data[key];
    if (typeof item !== "string") continue;
    if (key === "cifi-orbit.ui-language.v1") { if (item !== "ko" && item !== "en") throw new Error("Invalid language value"); continue; }
    if (key === "cifi-ultimate.ui-theme.v1") { if (!["orbit", "solar", "nebula", "pearl", "red"].includes(item)) throw new Error("Invalid theme value"); continue; }
    if (key === "cifi-ultimate.mod-tree.recommendation-count.v1") { if (!/^\d+$/.test(item)) throw new Error("Invalid recommendation count"); continue; }
    let parsed: unknown;
    try { parsed = JSON.parse(item); } catch { throw new Error(`Invalid saved JSON: ${key}`); }
    if (!parsed || typeof parsed !== "object") throw new Error(`Invalid saved data: ${key}`);
    if (key === SHIP_INSTALL_STORAGE_KEY && restoreShipInstallState(item).status === "failed") throw new Error("Invalid Ship Install data");
  }
  return backup as TransferBackup;
}

/** Replace only allowlisted app keys. Roll back if a storage write fails. */
export function importDataTransferBackup(storage: TransferStorage, backup: TransferBackup): void {
  const validated = parseDataTransferBackup(JSON.stringify(backup));
  const previous = createDataTransferBackup(storage);
  try {
    for (const key of DATA_TRANSFER_KEYS) {
      const value = validated.data[key];
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const key of DATA_TRANSFER_KEYS) {
      try {
        const value = previous.data[key];
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch { rollbackFailed = true; }
    }
    if (rollbackFailed) throw new Error("Import failed and automatic rollback was incomplete. Keep the downloaded backup file.");
    throw error;
  }
}
