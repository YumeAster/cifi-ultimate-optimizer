import type { GeneratorId, UpgradeRule, WeightKey } from "../../lib/cifi/upgrades/types";

export type UpgradeVisualResource =
  | "generator"
  | WeightKey
  | "adTokens"
  | "diamond"
  | "token"
  | "arcadePoints"
  | "levelPoints"
  | "tick"
  | "operations"
  | "loopMods"
  | "costReduction"
  | "rankPoints"
  | "technology";

export type UpgradeResourcePresentation = Readonly<{
  label: string;
  accent: string;
  rgb: string;
  icon: string;
}>;

export const UPGRADE_RESOURCE_PRESENTATION: Readonly<Record<UpgradeVisualResource, UpgradeResourcePresentation>> = Object.freeze({
  generator: { label: "Generator", accent: "#36d9d0", rgb: "54,217,208", icon: "./assets/resources/generator.png" },
  cells: { label: "Cells", accent: "#52e4aa", rgb: "82,228,170", icon: "./assets/resources/cells.png" },
  modPoints: { label: "Mod Points", accent: "#ff6267", rgb: "255,98,103", icon: "./assets/resources/mod-points.png" },
  shards: { label: "Shards", accent: "#4baef0", rgb: "75,174,240", icon: "./assets/resources/shards.png" },
  research: { label: "Research Points", accent: "#ffb35d", rgb: "255,179,93", icon: "./assets/resources/research-points.png" },
  academyPoints: { label: "Academy Points", accent: "#4e4cff", rgb: "78,76,255", icon: "./assets/resources/academy-points.png" },
  materials: { label: "Materials", accent: "#a96f5e", rgb: "169,111,94", icon: "./assets/resources/materials.png" },
  adTokens: { label: "AD Tokens", accent: "#ffc75d", rgb: "255,199,93", icon: "./assets/resources/ad-tokens.png" },
  diamond: { label: "Diamonds", accent: "#eb67ef", rgb: "235,103,239", icon: "./assets/resources/diamonds.png" },
  token: { label: "AD Tokens", accent: "#ffc75d", rgb: "255,199,93", icon: "./assets/resources/ad-tokens.png" },
  arcadePoints: { label: "Arcade Points", accent: "#ffc62b", rgb: "255,198,43", icon: "./assets/resources/arcade-points.png" },
  levelPoints: { label: "Level Points", accent: "#9a55f0", rgb: "154,85,240", icon: "./assets/resources/level-points.png" },
  tick: { label: "Tick", accent: "#df923e", rgb: "223,146,62", icon: "./assets/resources/tick.png" },
  operations: { label: "Operations", accent: "#ffd40a", rgb: "255,212,10", icon: "./assets/resources/operations.png" },
  loopMods: { label: "Loop Mods", accent: "#d90f2d", rgb: "217,15,45", icon: "./assets/resources/loop-mods.png" },
  costReduction: { label: "Cost Reduction", accent: "#9faab8", rgb: "159,170,184", icon: "./assets/resources/cost-reduction.png" },
  rankPoints: { label: "Rank Points", accent: "#ffffff", rgb: "255,255,255", icon: "./assets/resources/rank-points.png" },
  technology: { label: "Technology", accent: "#ff9a31", rgb: "255,154,49", icon: "./assets/resources/technology.png" },
});

const generatorPresentation: Readonly<Record<GeneratorId, Readonly<{ label: string; accent: string; rgb: string }>>> = Object.freeze({
  MK1: { label: "MK1 Generator", accent: "#2ce3c8", rgb: "44,227,200" },
  MK2: { label: "MK2 Generator", accent: "#37c8f2", rgb: "55,200,242" },
  MK3: { label: "MK3 Generator", accent: "#4a85ff", rgb: "74,133,255" },
  MK4: { label: "MK4 Generator", accent: "#626af7", rgb: "98,106,247" },
  MK5: { label: "MK5 Generator", accent: "#8569f2", rgb: "133,105,242" },
  MK6: { label: "MK6 Generator", accent: "#ae67ed", rgb: "174,103,237" },
  MK7: { label: "MK7 Generator", accent: "#d85edc", rgb: "216,94,220" },
  MK8: { label: "MK8 Generator", accent: "#ee68af", rgb: "238,104,175" },
});

export function getGeneratorPresentation(id: GeneratorId) {
  return generatorPresentation[id];
}

const explicitResources: Readonly<Partial<Record<string, readonly UpgradeVisualResource[]>>> = Object.freeze({
  Tokens: ["token"],
  Token: ["token"],
  Token2: ["token"],
  Token3: ["token"],
  Daily: ["token"],
  Daily2: ["token"],
  Diamond: ["diamond"],
  Cells: ["cells"],
  Mods: ["modPoints"],
  Shards: ["shards"],
  Research: ["research"],
  Academy: ["academyPoints"],
  Mats: ["materials"],
  AllGens: ["generator"],
  MPSH: ["modPoints", "shards"],
  GMPRP: ["generator", "modPoints", "research"],
  GSHAP: ["generator", "shards", "academyPoints"],
});

const effectResource: Readonly<Record<WeightKey, UpgradeVisualResource>> = Object.freeze({
  // Workbook `cells` arrays also carry Generator multipliers. Direct Cells boosts
  // are handled above so card-style inference does not paint MK upgrades green.
  cells: "generator",
  modPoints: "modPoints",
  shards: "shards",
  research: "research",
  academyPoints: "academyPoints",
  materials: "materials",
});

const effectKeys = Object.freeze(Object.keys(effectResource) as WeightKey[]);

export function getUpgradeVisualResources(rule: UpgradeRule): readonly UpgradeVisualResource[] {
  const explicit = explicitResources[rule.id];
  if (explicit) return explicit;

  if (rule.category === "generator" || /^MK[1-8](?:MK[1-8])?$/.test(rule.id)) {
    return ["generator"];
  }

  const inferred = effectKeys
    .filter((key) => rule.effects[key].length > 0)
    .map((key) => effectResource[key]);
  const unique = [...new Set(inferred)];

  return unique.length ? unique : [rule.currency];
}
