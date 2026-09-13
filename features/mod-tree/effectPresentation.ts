import { getGeneratorPresentation, UPGRADE_RESOURCE_PRESENTATION, type UpgradeResourcePresentation, type UpgradeVisualResource } from "../upgrade-optimizer/resourcePresentation.ts";
import type { GeneratorId } from "../../lib/cifi/upgrades/types.ts";

export type ModEffectPresentation = UpgradeResourcePresentation & { generator?: GeneratorId; glyph?: "rank" | "cost"; nodeIcon?: boolean };
const direct: Record<string, UpgradeVisualResource> = {
  Cells: "cells", MP: "modPoints", "Mod Points": "modPoints", Shards: "shards", Research: "research",
  AP: "academyPoints", Materials: "materials", LP: "levelPoints",
  "Tick speed": "tick", "Tick/Loop req.": "tick", "Loop Reset req.": "loopMods",
  "Robotic Miners": "loopMods",
};

/** Same resource art and palette as the Diamond/Token cards. */
export function modEffectPresentation(label: string, iconCategory?: string): ModEffectPresentation {
  if (iconCategory === "rank") return { label, accent: "#ffc85c", rgb: "255,200,92", icon: "", glyph: "rank" };
  if (iconCategory === "cost") return { label, accent: "#6fc5f3", rgb: "111,197,243", icon: "", glyph: "cost" };
  if (label === "Robotic Miners" || iconCategory === "roboticMiners") {
    return { label, accent: "#42e7ef", rgb: "66,231,239", icon: "./assets/mod-tree/sprite-2974.png", nodeIcon: true };
  }
  const nodeResources: Record<string, [string, string, string]> = {
    bioScientists: ["3529", "#ffb35d", "255,179,93"],
    equipment: ["4248", "#ffb35d", "255,179,93"],
    missionExperience: ["4024", "#b8a1ff", "184,161,255"],
    missionRetention: ["2923", "#b8a1ff", "184,161,255"],
    mastery: ["2923", "#b8a1ff", "184,161,255"],
  };
  const nodeResource = iconCategory && nodeResources[iconCategory];
  if (nodeResource) return { label, accent: nodeResource[1], rgb: nodeResource[2], icon: `./assets/mod-tree/sprite-${nodeResource[0]}.png`, nodeIcon: true };
  if (iconCategory && iconCategory in UPGRADE_RESOURCE_PRESENTATION && iconCategory !== "generator") return { ...UPGRADE_RESOURCE_PRESENTATION[iconCategory as UpgradeVisualResource], label };
  const resource = direct[label];
  if (resource) return { ...UPGRADE_RESOURCE_PRESENTATION[resource], label };
  const generator = label.match(/^(MK[1-8]) (Output|CR|Production cost|Manual purchase count|Generator)$/);
  if (generator) return { ...UPGRADE_RESOURCE_PRESENTATION.generator, ...getGeneratorPresentation(generator[1] as GeneratorId), label, generator: generator[1] as GeneratorId };
  if (label.endsWith(" RP") || label.endsWith(" SP")) return { label, accent: "#ffc85c", rgb: "255,200,92", icon: "", glyph: "rank" };
  if (label.endsWith(" CR")) return { label, accent: "#6fc5f3", rgb: "111,197,243", icon: "", glyph: "cost" };
  return { ...UPGRADE_RESOURCE_PRESENTATION.loopMods, label };
}
