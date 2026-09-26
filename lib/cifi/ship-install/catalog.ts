import type { ShipId } from "../upgrades/types.ts";
import type { InstallDefinition, InstallDependency, InstallEffectRule, InstallResource } from "./types.ts";

/** Stable sheet positions; native Unity corner suffixes are NOT these IDs. */
export const INSTALL_ROWS = [[8, 4, 6, 9], [2, 1, 3], [10, 7, 5, 11]] as const;

/** Ship-specific stage counts: https://cifi.game-vault.net/wiki/The_Cradle (and each ship page). */
export const SHIP_MAX_EVOLUTION: Readonly<Record<ShipId, number>> = Object.freeze({
  Cradle: 7, Auxesia: 4, Zagreus: 4, Hephaestus: 5, Demeter: 3, Koios: 4, Zeus: 6,
});

export const SHIPS: readonly Readonly<{ id: ShipId; name: string; image: string; maxEvolution: number }>[] =
  (["Cradle", "Auxesia", "Zagreus", "Hephaestus", "Demeter", "Koios", "Zeus"] as const)
    .map(id => ({ id, name: id, image: `/assets/ship-install/${id.toLowerCase()}.png`, maxEvolution: SHIP_MAX_EVOLUTION[id] }));

type Row = readonly [name: string, maxLevel: number, unlockAt: number, coefficientPercent: number,
  resources: readonly InstallResource[], dependency?: InstallDependency];

/**
 * Direct effects only, not resource-weighted scoring approximations.
 * Source: supplied 0.7.3.63 serialized FleetManager values + scene tooltips.
 * Numeric caps/coefficient/unlock constants also match Pre-Ouro v1.10.30.
 * Runtime gear/badge/evolution modifiers remain the effect engine's concern.
 */
const rows: Readonly<Record<ShipId, readonly Row[]>> = {
  Cradle: [
    ["Mitosis Enhancements", 250, 0, 10, ["cells"]],
    ["Improved Timing Belts", 25, 5, 5, ["mk1"]],
    ["Improved Printing Engines", 25, 5, 5, ["mk2"]],
    ["Printer Tweaks", 20, 25, 0.5, ["mk1"], "G2"],
    ["Improved Capacitors", 20, 25, 3, ["mk3"]],
    ["Improved Cooling Systems", 10, 40, 3, ["mk4"]],
    ["Printer Modulization", 15, 40, 0.4, ["mk2"], "G3"],
    ["Molecule Infusing Tech", 100, 100, 0.005, ["allGenerators"], "G"],
    ["Improved Generator Equipment", 50, 100, 0.027, ["cells"], "G"],
    ["On-Site Mining Printers", 30, 100, 0.006, ["shards"], "G"],
    ["Brain Capacity Genetics", 40, 100, 0.007, ["research"], "G"],
  ],
  Auxesia: [
    ["Improved Tech Software", 250, 0, 1, ["software"]],
    ["Improved Tech Hardware", 15, 5, 1, ["hardware"]],
    ["Precise Calculations", 15, 5, 0.1, ["cells"], "T"],
    ["Optimized Chipsets", 20, 25, 0.1, ["mk1"], "T"],
    ["Optimized Power Supplies", 20, 25, 0.1, ["mk2"], "T"],
    ["Optimized Hard Drives", 15, 50, 0.05, ["mk3"], "T"],
    ["Optimized Cell Vacuum", 15, 50, 0.05, ["mk4"], "T"],
    ["Modified Cell Turbines", 25, 100, 0.04, ["allGenerators"], "TH"],
    ["Bio-Mech Cell Coating", 30, 100, 1.32, ["cells"], "TS"],
    ["Shard-Based Cooling Towers", 10, 100, 0.03, ["shards"], "TH"],
    ["Robo-Engineer Assistants", 30, 100, 0.08, ["research"], "TS"],
  ],
  Zagreus: [
    ["Accumulation Theory", 250, 0, 0.5, ["cells"], "LM"],
    ["Feedback Theory", 10, 5, 0.1, ["mk1", "mk2", "mk3"], "LF"],
    ["Deja Vu Theory", 10, 5, 0.1, ["modPoints"], "LR"],
    ["Data Theory", 20, 20, 0.05, ["mk2"], "LM"],
    ["Flashback Theory", 20, 20, 0.05, ["mk3"], "LM"],
    ["Observation Theory", 20, 40, 0.01, ["mk4"], "LM"],
    ["Reflection Theory", 20, 40, 0.01, ["mk5"], "LM"],
    ["Loop Throttle Integrations", 30, 100, 0.01, ["allGenerators"], "LM"],
    ["C.E.L.L. Mainframe Integration", 10, 100, 10, ["cells"], "LF"],
    ["Mining Data Block System", 25, 100, 0.04, ["shards"], "LM"],
    ["Databyte Integrations", 20, 100, 0.05, ["research"], "LF"],
  ],
  Hephaestus: [
    ["Production Line Connections", 250, 0, 4, ["mk1", "mk2", "mk3", "mk4"], "A"],
    ["Delivery Drones", 5, 5, 0.0003, ["hardware", "software"], "ticks"],
    ["Modifications Connection", 5, 5, 0.2, ["modPoints"], "A"],
    ["Heavy Duty Grabbies", 15, 20, 5, ["cells"], "A"],
    ["Manual Overkill", 15, 20, 0.1, ["cells"], "G"],
    ["Accumulation Modification", 5, 60, 0.001, ["modPoints"], "G"],
    ["Fiver Connection", 20, 60, 2, ["mk5"], "A"],
    ["Faster Transportation", 40, 100, 1, ["allGenerators"]],
    ["Factory Maintainer Drone", 85, 100, 0.001, ["cells"], "ticks"],
    ["Auto-Mining Machina", 85, 100, 0.0001, ["shards"], "ticks"],
    ["Improved Blueprints", 85, 100, 0.0002, ["research"], "ticks"],
  ],
  Demeter: [
    ["Ahead of the Curve", 5, 0, 1, ["operations"]],
    ["Better Mineral Extraction", 250, 0, 1, ["shards"]],
    ["Rare Organism Detection", 25, 0, 0.2, ["cells"], "O"],
    ["Canned Mineral Water", 25, 10, 0.02, ["mk1", "mk4"], "O"],
    ["Bi-Product Goo", 25, 10, 0.02, ["mk2", "mk5"], "O"],
    ["The Hexagonal Advantage", 5, 25, 0.001, ["modPoints"], "O"],
    ["Shardlytics", 10, 25, 0.1, ["mk3", "mk6"], "O"],
    ["Liquid Extraction Tech", 5, 100, 2.5, ["allGenerators"]],
    ["On-Site Printing Vehicles", 25, 100, 3, ["cells"], "O"],
    ["On-Site GPR Hotspot Scanners", 125, 100, 0.08, ["shards"], "O"],
    ["Phylogenetic Analysis", 55, 100, 0.04, ["research"], "O"],
  ],
  Koios: [
    ["The Venn Hypothesis", 250, 0, 0.25, ["cells"], "S+O"],
    ["Unobtanium Drills", 5, 5, 0.003, ["shards"], "S"],
    ["Modification Thesis", 5, 5, 2.5, ["modPoints"], "RC"],
    ["The Study of Threesium", 5, 10, 0.5, ["mk3", "mk6"], "RL"],
    ["The Big Brainium Thesis", 5, 10, 0.001, ["research"], "S"],
    ["The Connectivity Thesis", 10, 30, 1, ["modPoints", "shards"]],
    ["The Overclocking Thesis", 10, 30, 0.1, ["mk1", "mk2", "mk3", "mk4", "mk5", "mk6"], "S"],
    ["Modified Portable Arcade", 60, 100, 3, ["allGenerators"]],
    ["Improved MK1 Printing Fuel", 30, 100, 1, ["cells"], "S"],
    ["Shard Scanning Breakthrough", 40, 100, 0.01, ["shards"], "S"],
    ["Robo-Research Assistants", 150, 100, 0.02, ["research"], "S"],
  ],
  Zeus: [
    ["Academy Janitor Bots", 250, 0, 50, ["cells"], "M"],
    ["Perfect Student Blueprint", 1, 0, 10, ["academyPoints"]],
    ["Material Scavenger Vehicles", 1, 0, 25, ["materials"]],
    ["Academy Mining Bots", 15, 2, 0.5, ["cells", "shards"], "M"],
    ["Database Brain-Link Integration", 20, 2, 0.5, ["cells", "research"], "M"],
    ["Academy Auto-Scrappers", 15, 50, 10, ["materials", "modPoints"]],
    ["On-Site Auto Construction", 50, 50, 1, ["academyPoints", "allGenerators"]],
    ["Remote Printing Facilities", 50, 100, 1, ["allGenerators"], "M"],
    ["Academy Flight-Kicks", 50, 100, 5, ["cells"], "M"],
    ["Orbital Hotspot Scanner", 50, 100, 1, ["shards"], "M"],
    ["Cluster Scans", 50, 100, 1, ["research"], "M"],
  ],
};

const nativePrefixes: Readonly<Record<ShipId, string>> = {
  Cradle: "Gen", Auxesia: "Tech", Zagreus: "Loop", Hephaestus: "Auto",
  Demeter: "Shard", Koios: "Research", Zeus: "Academy",
};

export const INSTALLS: readonly InstallDefinition[] = SHIPS.flatMap(({ id: ship }) =>
  rows[ship].map(([name, maxLevel, unlockAt, coefficientPercent, resources, dependency], index) => {
    const position = index + 1;
    const nativePosition = position < 9 ? position : ship === "Zeus"
      ? ({ 9: 11, 10: 9, 11: 10 } as Record<number, number>)[position]
      : ({ 9: 11, 10: 10, 11: 9 } as Record<number, number>)[position];
    const conflict = ship === "Hephaestus" && position === 8;
    const effects: readonly InstallEffectRule[] = resources.map(resource => ({
      resource, coefficientPercent, ...(dependency ? { dependency } : {}),
      kind: resource === "operations" ? "additive" : "multiplier",
      ...(ship === "Cradle" && (position === 4 || position === 7)
        ? { dependencyZeroPolicy: "as-entered" as const } : {}),
    }));
    return {
      id: `${ship.toLowerCase()}-${position}`, ship, position, name, maxLevel, unlockAt,
      icon: `/assets/ship-install/${ship.toLowerCase()}-${String(position).padStart(2, "0")}.png`,
      effects,
      verification: conflict ? "native-calculation-tooltip-conflict" : "native-base-and-tooltip",
      notes: conflict ? ["게임 계산식은 1%, 설명문은 0.01%로 서로 다릅니다. 계산식의 1%를 사용하며 전체 보정 적용값은 실측 확인이 필요합니다."]
        : ship === "Demeter" && position === 1
          ? ["다음 Run 시작 시 완료 Operation을 추가합니다. 즉시 Shards를 지급하지 않습니다."] : [],
      provenance: { gameVersion: "0.7.3.63", nativePosition,
        nativeField: `RU${nativePosition}${nativePrefixes[ship]}`,
        tooltipPath: `UpgradePanel-The${ship}/Tooltips/Tooltip${nativePosition}`,
        source: "supplied-game-static-data", runtimeVerified: false },
    } satisfies InstallDefinition;
  }));

export function getShipInstalls(ship: ShipId): readonly InstallDefinition[] {
  return INSTALLS.filter(node => node.ship === ship);
}
