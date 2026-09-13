import rawMap from "../../../docs/cifi-apk-static-0.7.3.61/loop-mod-map.json" with { type: "json" };
import reference from "./reference.json" with { type: "json" };
import iconData from "./icons.json" with { type: "json" };
import nativeFrameSizes from "./frame-sizes.json" with { type: "json" };
import { apkObjectByCode, captureGridByCode } from "./layout.ts";

export type ModTreeNodeState = "verified" | "variant" | "infinite" | "placeholder";
export type ModTreeNode = {
  key: string;
  numericId: number | null;
  label: string;
  name: string;
  block: string;
  maxLevel: number;
  prerequisites: string[];
  sourceRow: number;
  objectName: string;
  variant: string | null;
  group: "main" | "ouroboros" | "temporal4_skeleton";
  state: ModTreeNodeState;
  layoutSource: "apk" | "apk-child";
  iconLayers: readonly ModTreeIconLayer[];
  x: number;
  y: number;
  size: number;
};
export type ModTreePoint = { x: number; y: number };
export type ModTreeIconLayer = {
  src: string; x: number; y: number; width: number; height: number; opacity: number;
  sprite: string; pathId: number; sha256: string;
};
export type ModTreeEdge = {
  from: string;
  to: string;
  objectName: string;
  points: ModTreePoint[];
  evidence: "capture-and-reference";
};
export type ModTreeGroup = {
  id: string; label: string; x: number; y: number; width: number; height: number; count: number;
};

const rawByObject = new Map(rawMap.nodes.map(node => [node.object_name, node]));
const coordinateScale = 4;
const canvasPadding = 60;
const icons: Record<string, { objectName: string; position: ModTreePoint; layers: ModTreeIconLayer[] }> = iconData.nodes;
const frameSizes: Record<string, number[]> = nativeFrameSizes;

/** Fail closed: a missing/duplicate mapping must not silently hide a node. */
function positionFor(code: string): ModTreePoint {
  const objectName = apkObjectByCode[code];
  if (objectName) {
    const raw = rawByObject.get(objectName);
    if (!raw || raw.group !== "main" || raw.id === 999) throw new Error(`Invalid pre-Ouroboros node: ${code}`);
    return raw.anchored_position;
  }
  const supplement = captureGridByCode[code];
  if (!supplement) throw new Error(`Missing Mod Tree position: ${code}`);
  // The screenshot-grid match led to the previously omitted named child in
  // the full scene. Prefer its newly extracted exact coordinate.
  if (!icons[code]) throw new Error(`Missing exact APK child position: ${code}`);
  return icons[code].position;
}

const positions = reference.nodes.map(row => positionFor(row.code));
const minX = Math.min(...positions.map(point => point.x));
const maxY = Math.max(...positions.map(point => point.y));
if (new Set(reference.nodes.map(row => row.code)).size !== reference.nodes.length) throw new Error("Duplicate Mod Tree codes");

/** Explicit pre-Ouroboros catalogue. Raw extraction remains immutable in docs. */
export const preOuroborosModTreeNodesRebased: ModTreeNode[] = reference.nodes.map((row, index) => {
  const raw = rawByObject.get(apkObjectByCode[row.code]);
  const point = positions[index];
  return {
    key: row.code, label: row.code, name: row.name, block: row.code[0],
    maxLevel: row.maxLevel, prerequisites: row.prerequisites, sourceRow: row.sourceRow,
    numericId: raw?.id ?? null, objectName: raw?.object_name ?? icons[row.code].objectName,
    variant: raw?.variant ?? null, group: "main",
    state: raw?.infinite_loop_mod ? "infinite" : raw?.variant ? "variant" : "verified",
    layoutSource: raw ? "apk" : "apk-child",
    iconLayers: icons[row.code].layers,
    x: (point.x - minX) / coordinateScale + canvasPadding,
    y: (maxY - point.y) / coordinateScale + canvasPadding,
    // Preserve Unity's actual special/normal frame ratio, not a state-based guess.
    size: 28 * frameSizes[row.code][0] / 110,
  };
});

const nodeByCode = new Map(preOuroborosModTreeNodesRebased.map(node => [node.key, node]));
export const preOuroborosModTreeNodeKeys = new Set(nodeByCode.keys());

/**
 * Visible wiring and unlock rules are separate. The photos show catalogues
 * branching from IU4; the sheet lists IU2 as an unlock requirement.
 * G22's secret unlock has no prerequisite cell, but its UI stem is visible.
 * SkeletonLM234 in the APK connects GU1 to G12, unlike the sheet unlock G13.
 */
const visualParents: Readonly<Record<string, readonly string[]>> = {
  G22: ["G21"], GU1: ["G12"], H08: ["H06", "H07"], IC1: ["IU4"], IC4: ["IU4"],
};

export const preOuroborosModTreeEdges: ModTreeEdge[] = reference.nodes.flatMap(row => {
  const parents = visualParents[row.code] ?? row.prerequisites;
  return parents.map(parent => {
    const from = nodeByCode.get(parent);
    const to = nodeByCode.get(row.code);
    if (!from || !to || from === to) throw new Error(`Invalid Mod Tree edge: ${parent} -> ${row.code}`);
    const points: ModTreePoint[] = [{ x: from.x, y: from.y }];
    // Game stems follow rows/columns, not diagonal nearest-neighbour guesses.
    // Small (<2px) offsets in the extracted Unity layout are retained.
    if (Math.abs(from.x - to.x) > 2 && Math.abs(from.y - to.y) > 2) {
      points.push({ x: to.x, y: from.y });
    }
    points.push({ x: to.x, y: to.y });
    return { from: from.key, to: to.key, objectName: `${from.key}--${to.key}`, points, evidence: "capture-and-reference" as const };
  });
});

export const preOuroborosModTreeGroups: ModTreeGroup[] = [..."ABCDEFGHI"].map(block => {
  const nodes = preOuroborosModTreeNodesRebased.filter(node => node.block === block);
  const left = Math.min(...nodes.map(node => node.x)) - 32;
  const top = Math.min(...nodes.map(node => node.y)) - 32;
  return {
    id: block, label: block, x: left, y: top,
    width: Math.max(...nodes.map(node => node.x)) - left + 32,
    height: Math.max(...nodes.map(node => node.y)) - top + 32, count: nodes.length,
  };
});

export const preOuroborosModTreeCanvas = {
  width: Math.ceil(Math.max(...preOuroborosModTreeNodesRebased.map(node => node.x)) + canvasPadding),
  height: Math.ceil(Math.max(...preOuroborosModTreeNodesRebased.map(node => node.y)) + canvasPadding),
};
export const preOuroborosModTreeNodes = preOuroborosModTreeNodesRebased;
export const modTreeNodes = preOuroborosModTreeNodesRebased;
export const modTreeEdges = preOuroborosModTreeEdges;
export const modTreeGroups = preOuroborosModTreeGroups;
export const modTreeCanvas = preOuroborosModTreeCanvas;

const usedRawObjects = new Set(Object.values(apkObjectByCode));
export const modTreeEvidence = {
  nodeObjectCount: rawMap.node_object_count,
  preOuroborosNodeCount: modTreeNodes.length,
  apkMappedNodeCount: Object.keys(apkObjectByCode).length,
  supplementedNodeCount: Object.keys(captureGridByCode).length,
  hiddenOuroborosNodeCount: rawMap.nodes.filter(node => node.group === "ouroboros").length,
  excludedOtherRawNodeCount: rawMap.nodes.filter(node => node.group !== "ouroboros" && !usedRawObjects.has(node.object_name)).length,
  lineCount: modTreeEdges.length,
  referenceCaptureCount: 6,
  omittedUnclearLinks: [],
  interpretationLimit: "Map labels and maximum levels use the cited sheet snapshot, not live game state. Solid lines are display wiring, not purchase logic.",
};
