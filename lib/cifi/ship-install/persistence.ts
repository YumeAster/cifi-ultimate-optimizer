import type { ShipId } from "../upgrades/types.ts";
import { SHIP_MAX_EVOLUTION } from "./catalog.ts";

/** Separate from both the shared player-input document and weight presets. */
export const SHIP_INSTALL_STORAGE_KEY = "cifi-ultimate.ship-install.v1";
export const SHIP_INSTALL_SCHEMA_VERSION = 1 as const;
export const SHIP_INSTALL_SHIPS: readonly ShipId[] = ["Cradle", "Auxesia", "Zagreus", "Hephaestus", "Demeter", "Koios", "Zeus"];
export const SHIP_INSTALL_SLOTS = [1, 2, 3] as const;
export const MAX_SAVED_SHIP_STEPS = 2_000;
export const MAX_SHIP_INSTALL_STORAGE_LENGTH = 8_000_000;
export const MAX_SHIP_INSTALL_LEVEL = 1_000_000;
export const MAX_SHIP_INSTALL_POINTS = 1_000_000_000;
const MAX_RAW_INPUT_LENGTH = 128;
const MODES = ["mp", "shards-research", "shards", "research", "weights"] as const;
const REASONS = ["target", "auxiliary", "prerequisite", "weighted"] as const;
const POSITIONS = Array.from({ length: 11 }, (_, index) => index + 1);

export type ShipInstallSlot = typeof SHIP_INSTALL_SLOTS[number];
export type SavedShipRecommendationMode = typeof MODES[number];
export type SavedShipLevels = Readonly<Record<number, number>>;
export interface SavedShipPurchase {
  readonly index: number;
  readonly position: number;
  readonly from: number;
  readonly to: number;
  readonly reason: typeof REASONS[number];
  readonly score: number;
}
export interface SavedShipLoadout {
  readonly baselineLevels: SavedShipLevels;
  readonly targetLevels: SavedShipLevels;
  readonly steps: readonly SavedShipPurchase[];
  readonly mode: SavedShipRecommendationMode;
  readonly totalPoints: number;
  readonly evolution: number;
  readonly capExpanded: boolean;
  readonly contextFingerprint: string;
  readonly savedAt: string;
}
export interface ShipInstallWorkspace {
  readonly levels: SavedShipLevels;
  /** Keep incomplete edits durable without feeding them into the optimizer. */
  readonly draftLevels: Readonly<Record<number, string>>;
  readonly totalPoints: number;
  readonly draftTotalPoints: string;
  readonly evolution: number;
  readonly draftEvolution: string;
  readonly capExpanded: boolean;
  readonly excluded: readonly number[];
  readonly mode: SavedShipRecommendationMode;
  readonly selectedSlot: ShipInstallSlot;
  readonly loadouts: Readonly<Record<ShipInstallSlot, SavedShipLoadout | null>>;
}
export interface ShipInstallPersistentState {
  readonly version: typeof SHIP_INSTALL_SCHEMA_VERSION;
  readonly selectedShip: ShipId;
  readonly ships: Readonly<Record<ShipId, ShipInstallWorkspace>>;
}
export interface ShipInstallRestoreResult {
  readonly state: ShipInstallPersistentState;
  readonly status: "empty" | "restored" | "repaired" | "failed";
  readonly issues: readonly string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function own(value: unknown, key: string | number): unknown {
  return record(value) && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
}
function safeInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}
function isShip(value: unknown): value is ShipId {
  return SHIP_INSTALL_SHIPS.includes(value as ShipId);
}
function isSlot(value: unknown): value is ShipInstallSlot {
  return SHIP_INSTALL_SLOTS.includes(value as ShipInstallSlot);
}
function isMode(value: unknown): value is SavedShipRecommendationMode {
  return MODES.includes(value as SavedShipRecommendationMode);
}
function isPosition(value: unknown): value is number {
  return safeInteger(value, 11) && value >= 1;
}
function blankLevels(): Record<number, number> {
  return Object.fromEntries(POSITIONS.map(position => [position, 0]));
}
function levelsDraft(levels: SavedShipLevels): Record<number, string> {
  return Object.fromEntries(POSITIONS.map(position => [position, String(levels[position])]));
}
function defaultWorkspace(): ShipInstallWorkspace {
  const levels = blankLevels();
  return { levels, draftLevels: levelsDraft(levels), totalPoints: 0, draftTotalPoints: "0", evolution: 0, draftEvolution: "0", capExpanded: false, excluded: [], mode: "weights", selectedSlot: 1, loadouts: { 1: null, 2: null, 3: null } };
}
export function createDefaultShipInstallState(): ShipInstallPersistentState {
  return { version: SHIP_INSTALL_SCHEMA_VERSION, selectedShip: "Cradle", ships: Object.fromEntries(SHIP_INSTALL_SHIPS.map(ship => [ship, defaultWorkspace()])) as Record<ShipId, ShipInstallWorkspace> };
}

/** This is a structural safety bound; game-specific caps are enforced by the engine. */
export function parseShipInstallInteger(raw: string, maximum = MAX_SHIP_INSTALL_LEVEL): number | null {
  if (typeof raw !== "string" || raw.length > MAX_RAW_INPUT_LENGTH) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return safeInteger(value, maximum) ? value : null;
}
function restoreLevels(raw: unknown, strict = false): Record<number, number> | null {
  if (!record(raw)) return strict ? null : blankLevels();
  const result = blankLevels();
  for (const position of POSITIONS) {
    const value = own(raw, position);
    if (!safeInteger(value, MAX_SHIP_INSTALL_LEVEL)) {
      if (strict) return null;
    } else result[position] = value;
  }
  return result;
}
function rawInput(raw: unknown, fallback: number): string {
  return typeof raw === "string" && raw.length <= MAX_RAW_INPUT_LENGTH ? raw : String(fallback);
}
function sumLevels(levels: SavedShipLevels): number {
  return POSITIONS.reduce((sum, position) => sum + levels[position], 0);
}

/** Never restore a partial/forged queue whose replay differs from its target. */
function restoreLoadout(raw: unknown, ship: ShipId): SavedShipLoadout | null {
  if (!record(raw)) return null;
  const baselineLevels = restoreLevels(own(raw, "baselineLevels"), true);
  const targetLevels = restoreLevels(own(raw, "targetLevels"), true);
  const rawSteps = own(raw, "steps");
  const mode = own(raw, "mode");
  const totalPoints = own(raw, "totalPoints");
  const evolution = own(raw, "evolution");
  const capExpanded = own(raw, "capExpanded");
  const contextFingerprint = own(raw, "contextFingerprint");
  const savedAt = own(raw, "savedAt");
  if (!baselineLevels || !targetLevels || !Array.isArray(rawSteps) || rawSteps.length > MAX_SAVED_SHIP_STEPS || !isMode(mode)
    || !safeInteger(totalPoints, MAX_SHIP_INSTALL_POINTS) || !safeInteger(evolution, SHIP_MAX_EVOLUTION[ship]) || typeof capExpanded !== "boolean"
    || typeof contextFingerprint !== "string" || !contextFingerprint.length || contextFingerprint.length > 2_048
    || typeof savedAt !== "string" || savedAt.length > 40 || !Number.isFinite(Date.parse(savedAt))) return null;
  const replay = { ...baselineLevels };
  const steps: SavedShipPurchase[] = [];
  for (let index = 0; index < rawSteps.length; index += 1) {
    const row: unknown = rawSteps[index];
    const position = own(row, "position");
    const from = own(row, "from");
    const to = own(row, "to");
    const score = own(row, "score");
    const reason = own(row, "reason");
    if (own(row, "index") !== index + 1 || !isPosition(position) || !safeInteger(from, MAX_SHIP_INSTALL_LEVEL)
      || !safeInteger(to, MAX_SHIP_INSTALL_LEVEL) || replay[position] !== from || to !== from + 1
      || typeof score !== "number" || !Number.isFinite(score) || !REASONS.includes(reason as typeof REASONS[number])) return null;
    replay[position] = to;
    steps.push({ index: index + 1, position, from, to, score, reason: reason as typeof REASONS[number] });
  }
  if (POSITIONS.some(position => replay[position] !== targetLevels[position]) || sumLevels(targetLevels) > totalPoints) return null;
  return { baselineLevels, targetLevels, steps, mode, totalPoints, evolution, capExpanded, contextFingerprint, savedAt };
}
function restoreWorkspace(raw: unknown, ship: ShipId, issues: string[]): ShipInstallWorkspace {
  const defaults = defaultWorkspace();
  if (!record(raw)) {
    if (raw !== undefined) issues.push(`${ship}: invalid workspace`);
    return defaults;
  }
  const levels = restoreLevels(own(raw, "levels"))!;
  const storedLevels = own(raw, "levels");
  if (!record(storedLevels) || POSITIONS.some(position => !safeInteger(own(storedLevels, position), MAX_SHIP_INSTALL_LEVEL))) issues.push(`${ship}: invalid levels repaired`);
  const draftLevels: Record<number, string> = {};
  for (const position of POSITIONS) {
    const draft = own(own(raw, "draftLevels"), position);
    draftLevels[position] = rawInput(draft, levels[position]);
    if (draft !== undefined && draft !== draftLevels[position]) issues.push(`${ship}: invalid input repaired`);
    const valid = parseShipInstallInteger(draftLevels[position]);
    if (valid !== null) levels[position] = valid;
  }
  const rawTotal = own(raw, "totalPoints");
  const rawEvolution = own(raw, "evolution");
  let totalPoints = safeInteger(rawTotal, MAX_SHIP_INSTALL_POINTS) ? rawTotal : 0;
  const maxEvolution = SHIP_MAX_EVOLUTION[ship];
  let evolution = safeInteger(rawEvolution, 7) ? Math.min(rawEvolution, maxEvolution) : 0;
  if (!safeInteger(rawTotal, MAX_SHIP_INSTALL_POINTS) || !safeInteger(rawEvolution, maxEvolution)) issues.push(`${ship}: invalid progress repaired`);
  const rawDraftTotal = own(raw, "draftTotalPoints");
  const rawDraftEvolution = own(raw, "draftEvolution");
  const draftTotalPoints = rawInput(rawDraftTotal, totalPoints);
  let draftEvolution = rawInput(rawDraftEvolution, evolution);
  // Older versions offered 0–7 for every ship. Preserve progress while
  // repairing those impossible values to the ship's real maximum.
  const oldDraftValue = parseShipInstallInteger(draftEvolution, 7);
  if (oldDraftValue !== null && oldDraftValue > maxEvolution) {
    draftEvolution = String(maxEvolution);
    issues.push(`${ship}: evolution above ship maximum repaired`);
  }
  if ((rawDraftTotal !== undefined && rawDraftTotal !== draftTotalPoints) || (rawDraftEvolution !== undefined && rawDraftEvolution !== draftEvolution)) issues.push(`${ship}: invalid progress input repaired`);
  totalPoints = parseShipInstallInteger(draftTotalPoints, MAX_SHIP_INSTALL_POINTS) ?? totalPoints;
  evolution = parseShipInstallInteger(draftEvolution, maxEvolution) ?? evolution;
  const rawExcluded = own(raw, "excluded");
  const excluded = Array.isArray(rawExcluded) ? [...new Set(rawExcluded.slice(0, 100).filter(isPosition))].sort((a, b) => a - b) : [];
  if (!Array.isArray(rawExcluded) || rawExcluded.length !== excluded.length) issues.push(`${ship}: invalid exclusions repaired`);
  const mode = own(raw, "mode");
  const selectedSlot = own(raw, "selectedSlot");
  const capExpanded = own(raw, "capExpanded");
  if (!isMode(mode) || !isSlot(selectedSlot) || typeof capExpanded !== "boolean") issues.push(`${ship}: invalid options repaired`);
  const loadouts = { ...defaults.loadouts };
  for (const slot of SHIP_INSTALL_SLOTS) {
    const candidate = own(own(raw, "loadouts"), slot);
    loadouts[slot] = restoreLoadout(candidate, ship);
    if (candidate !== null && candidate !== undefined && loadouts[slot] === null) issues.push(`${ship}: invalid Loadout ${slot} omitted`);
  }
  return { levels, draftLevels, totalPoints, draftTotalPoints, evolution, draftEvolution, excluded, mode: isMode(mode) ? mode : "weights", selectedSlot: isSlot(selectedSlot) ? selectedSlot : 1, capExpanded: typeof capExpanded === "boolean" ? capExpanded : false, loadouts };
}

export function restoreShipInstallState(raw: unknown): ShipInstallRestoreResult {
  const defaults = createDefaultShipInstallState();
  if (raw === null || raw === undefined || raw === "") return { state: defaults, status: "empty", issues: [] };
  let decoded: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > MAX_SHIP_INSTALL_STORAGE_LENGTH) return { state: defaults, status: "failed", issues: ["Ship Install storage is too large"] };
    try { decoded = JSON.parse(raw); } catch { return { state: defaults, status: "failed", issues: ["Ship Install storage is not valid JSON"] }; }
  }
  if (!record(decoded) || own(decoded, "version") !== SHIP_INSTALL_SCHEMA_VERSION || !record(own(decoded, "ships"))) {
    return { state: defaults, status: "failed", issues: ["Unsupported or invalid Ship Install storage version"] };
  }
  const issues: string[] = [];
  const selectedShip = own(decoded, "selectedShip");
  if (!isShip(selectedShip)) issues.push("Invalid selected ship repaired");
  const ships = Object.fromEntries(SHIP_INSTALL_SHIPS.map(ship => [ship, restoreWorkspace(own(own(decoded, "ships"), ship), ship, issues)])) as Record<ShipId, ShipInstallWorkspace>;
  return { state: { version: SHIP_INSTALL_SCHEMA_VERSION, selectedShip: isShip(selectedShip) ? selectedShip : "Cradle", ships }, status: issues.length ? "repaired" : "restored", issues };
}

/** Unsupported/corrupt storage is reported; callers must not call it successfully saved. */
export function readShipInstallState(read: (key: string) => string | null): ShipInstallRestoreResult {
  try { return restoreShipInstallState(read(SHIP_INSTALL_STORAGE_KEY)); }
  catch { return { state: createDefaultShipInstallState(), status: "failed", issues: ["Ship Install storage could not be read"] }; }
}
export function serializeShipInstallState(state: ShipInstallPersistentState): string {
  const validated = restoreShipInstallState(state);
  if (validated.status !== "restored") throw new Error("Invalid Ship Install state cannot be saved");
  const serialized = JSON.stringify(validated.state);
  if (serialized.length > MAX_SHIP_INSTALL_STORAGE_LENGTH) throw new Error("Ship Install storage is too large");
  return serialized;
}
/** The write must succeed before a caller shows a saved indicator. */
export function commitShipInstallState(state: ShipInstallPersistentState, write: (serialized: string) => void): ShipInstallPersistentState {
  const serialized = serializeShipInstallState(state);
  write(serialized);
  return state;
}
function withWorkspace(state: ShipInstallPersistentState, ship: ShipId, workspace: ShipInstallWorkspace): ShipInstallPersistentState {
  if (!isShip(ship)) throw new Error("Unknown Ship Install ship");
  return { ...state, ships: { ...state.ships, [ship]: workspace } };
}
export function selectShipInstallShip(state: ShipInstallPersistentState, ship: ShipId): ShipInstallPersistentState {
  if (!isShip(ship)) throw new Error("Unknown Ship Install ship");
  return { ...state, selectedShip: ship };
}
export function selectShipInstallLoadout(state: ShipInstallPersistentState, ship: ShipId, slot: ShipInstallSlot): ShipInstallPersistentState {
  if (!isShip(ship) || !isSlot(slot)) throw new Error("Unknown Ship Install slot");
  return withWorkspace(state, ship, { ...state.ships[ship], selectedSlot: slot });
}
export function updateShipInstallInput(state: ShipInstallPersistentState, ship: ShipId, field: number | "totalPoints" | "evolution", raw: string): ShipInstallPersistentState {
  if (!isShip(ship) || typeof raw !== "string" || raw.length > MAX_RAW_INPUT_LENGTH) throw new Error("Invalid Ship Install input");
  const previous = state.ships[ship];
  if (typeof field === "number") {
    if (!isPosition(field)) throw new Error("Unknown Install position");
    const parsed = parseShipInstallInteger(raw);
    return withWorkspace(state, ship, { ...previous, draftLevels: { ...previous.draftLevels, [field]: raw }, levels: { ...previous.levels, [field]: parsed ?? previous.levels[field] } });
  }
  if (field !== "totalPoints" && field !== "evolution") throw new Error("Unknown Ship Install input");
  const parsed = parseShipInstallInteger(raw, field === "evolution" ? SHIP_MAX_EVOLUTION[ship] : MAX_SHIP_INSTALL_POINTS);
  return withWorkspace(state, ship, field === "totalPoints" ? { ...previous, draftTotalPoints: raw, totalPoints: parsed ?? previous.totalPoints } : { ...previous, draftEvolution: raw, evolution: parsed ?? previous.evolution });
}
export function updateShipInstallWorkspace(state: ShipInstallPersistentState, ship: ShipId, patch: { mode?: SavedShipRecommendationMode; excluded?: readonly number[]; capExpanded?: boolean }): ShipInstallPersistentState {
  if (!isShip(ship)) throw new Error("Unknown Ship Install ship");
  if (patch.mode !== undefined && !isMode(patch.mode)) throw new Error("Unknown Ship Install recommendation mode");
  if (patch.capExpanded !== undefined && typeof patch.capExpanded !== "boolean") throw new Error("Invalid Install cap setting");
  if (patch.excluded !== undefined && (!Array.isArray(patch.excluded) || patch.excluded.some(position => !isPosition(position)))) throw new Error("Invalid Install exclusions");
  const previous = state.ships[ship];
  return withWorkspace(state, ship, { ...previous, mode: patch.mode ?? previous.mode, capExpanded: patch.capExpanded ?? previous.capExpanded, excluded: patch.excluded === undefined ? previous.excluded : [...new Set(patch.excluded)].sort((a, b) => a - b) });
}
export function setShipInstallLevels(state: ShipInstallPersistentState, ship: ShipId, levels: SavedShipLevels): ShipInstallPersistentState {
  if (!isShip(ship)) throw new Error("Unknown Ship Install ship");
  const safe = restoreLevels(levels, true);
  if (!safe) throw new Error("Invalid Ship Install levels");
  return withWorkspace(state, ship, { ...state.ships[ship], levels: safe, draftLevels: levelsDraft(safe) });
}
export function saveShipInstallLoadout(state: ShipInstallPersistentState, ship: ShipId, slot: ShipInstallSlot, plan: SavedShipLoadout): ShipInstallPersistentState {
  if (!isShip(ship) || !isSlot(slot)) throw new Error("Unknown Ship Install slot");
  const validated = restoreLoadout(plan, ship);
  if (!validated) throw new Error("Invalid or oversized Ship Install purchase plan");
  const previous = state.ships[ship];
  return withWorkspace(state, ship, { ...previous, selectedSlot: slot, loadouts: { ...previous.loadouts, [slot]: validated } });
}
export function isShipLoadoutStale(plan: SavedShipLoadout | null, contextFingerprint: string): boolean {
  return plan !== null && plan.contextFingerprint !== contextFingerprint;
}

/** A deterministic change detector, not a cryptographic or authentication hash. */
export function fingerprintShipInstallContext(value: unknown): string {
  const ancestors = new Set<object>();
  let visited = 0;
  function canonical(item: unknown, depth: number): string {
    visited += 1;
    if (visited > 20_000 || depth > 32) throw new Error("Ship Install context is too complex");
    if (item === null || item === undefined) return "null";
    if (typeof item === "string") {
      if (item.length > 100_000) throw new Error("Ship Install context string is too large");
      return JSON.stringify(item);
    }
    if (typeof item === "boolean") return item ? "true" : "false";
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new Error("Ship Install context must contain finite numbers");
      return JSON.stringify(item);
    }
    if (typeof item !== "object") throw new Error("Ship Install context must contain JSON values");
    if (ancestors.has(item)) throw new Error("Ship Install context cannot contain cycles");
    ancestors.add(item);
    let result: string;
    if (Array.isArray(item)) {
      if (item.length > 20_000) throw new Error("Ship Install context is too complex");
      result = `[${item.map(child => canonical(child, depth + 1)).join(",")}]`;
    } else {
      const entries = Object.keys(item).sort();
      if (entries.length > 20_000) throw new Error("Ship Install context is too complex");
      result = `{${entries.filter(key => own(item, key) !== undefined).map(key => `${JSON.stringify(key)}:${canonical(own(item, key), depth + 1)}`).join(",")}}`;
    }
    ancestors.delete(item);
    if (result.length > 2_000_000) throw new Error("Ship Install context is too large");
    return result;
  }
  const serialized = canonical(value, 0);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `ship-v1:${hash.toString(16).padStart(16, "0")}`;
}
