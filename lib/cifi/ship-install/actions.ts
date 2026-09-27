import { evaluateInstall, validateInstallSequence } from "./engine.ts";
import { getShipInstalls } from "./catalog.ts";
import { setShipInstallLevels, updateShipInstallInput, type ShipInstallPersistentState } from "./persistence.ts";
import type { InstallSequence, ShipInstallContext } from "./types.ts";

function currentContext(state: ShipInstallPersistentState, context: ShipInstallContext): ShipInstallContext {
  const workspace = state.ships[context.ship];
  return { ...context, levels: workspace.levels, totalPoints: workspace.totalPoints,
    mode: workspace.mode, excluded: workspace.excluded, capExpanded: workspace.capExpanded };
}

/** Manual purchases use game unlock/cap/budget rules, not recommendation preferences. */
export function buyShipInstallLevel(state: ShipInstallPersistentState, context: ShipInstallContext, position: number): ShipInstallPersistentState | null {
  const row = evaluateInstall(currentContext(state, context), position);
  if (!row.unlocked || !row.affordable || row.maxed || row.error) return null;
  return updateShipInstallInput(state, context.ship, position, String(row.level + 1));
}

/** Apply only a fresh, replayable recommendation; one state update covers every step. */
export function applyShipInstallRecommendation(state: ShipInstallPersistentState, context: ShipInstallContext, plan: Pick<InstallSequence, "baselineLevels" | "targetLevels" | "steps"> & { errors?: readonly string[] }): ShipInstallPersistentState {
  const current = currentContext(state, context);
  const positions = getShipInstalls(context.ship).map(node => node.position);
  if (!plan.steps.length || plan.errors?.length || positions.some(position => (plan.baselineLevels[position] ?? 0) !== (current.levels[position] ?? 0)))
    throw new Error("Ship Install recommendation is no longer current");
  const errors = validateInstallSequence(current, plan.steps);
  if (errors.length) throw new Error(errors.join(" "));
  const replay: Record<number, number> = Object.fromEntries(positions.map(position => [position, current.levels[position] ?? 0]));
  for (const step of plan.steps) replay[step.position] = step.to;
  if (positions.some(position => replay[position] !== plan.targetLevels[position])) throw new Error("Ship Install recommendation target does not match its steps");
  return setShipInstallLevels(state, context.ship, replay);
}
