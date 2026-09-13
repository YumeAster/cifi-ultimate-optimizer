// Mechanical compiler for the five independently reviewed native audit tables.
// Prints one requested artifact; the owning agent applies it with apply_patch.
// Original APKs, native code and packaged UI text remain in ignored work/.
import { readFileSync } from "node:fs";
const read = path => JSON.parse(readFileSync(path, "utf8"));
const temp = "C:/Users/USER/AppData/Local/Temp";
const before = read("lib/cifi/mod-tree/game-effects.json");
const reference = read("lib/cifi/mod-tree/reference.json");
const abc = read(`${temp}/cifi-abc-native-audit-20260913.json`);
const def = ["d", "e", "f"].map(block => read(`${temp}/cifi-native-${block}-audit-0.7.3.63.json`));
const ghi = read(`${temp}/cifi-ghi-native-facts-0.7.3.63.json`);
const proof = {};
const withoutExpression = effect => Object.fromEntries(Object.entries(effect).filter(([key]) => key !== "expression"));
const nodeRules = { ...abc.nodes };
for (const [code, facts] of Object.entries(abc.proof)) proof[code] = facts;
const targets = { ...before.targets, ...abc.targets, ...Object.assign({}, ...def.map(table => table.newTargets)), ...ghi.newTargets };
targets.minerShards = { ...targets.minerShards, aggregate: "product", summaryTargets: ["shards"] };
targets.allGenerators = { ...targets.allGenerators, summaryTargets: Array.from({ length: 8 }, (_, index) => `mk${index + 1}Output`) };
for (const table of def) for (const [code, facts] of Object.entries(table.nodes)) {
  if (nodeRules[code]) throw new Error(`Duplicate native record ${code}`);
  nodeRules[code] = { maxLevel: facts.baseMaxLevel, effects: facts.effects };
  proof[code] = { ...facts, effects: facts.effects.map(withoutExpression) };
}
for (const facts of ghi.nodes) {
  if (nodeRules[facts.code]) throw new Error(`Duplicate native record ${facts.code}`);
  nodeRules[facts.code] = { maxLevel: facts.displayMaxLevel, effects: facts.desiredEffects };
  proof[facts.code] = { ...facts, desiredEffects: facts.desiredEffects.map(withoutExpression) };
}
const aliases = { gameLoopsFilled: "currentLoopsDone", gameLoopResets: "finalLoopResetsThisConstruction" };
const inputs = new Set();
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalize(child)]));
  if (result.kind === "constant") result.value = result.value.replace(/^([+-]?)\./, "$10.");
  if (result.kind === "profile") { result.key = aliases[result.key] ?? result.key; inputs.add(result.key); }
  return result;
}
const nodes = {};
for (const ref of reference.nodes) {
  const rule = nodeRules[ref.code];
  if (!rule || !proof[ref.code]) throw new Error(`Unreviewed ${ref.code}`);
  const previous = before.nodes[ref.code];
  nodes[ref.code] = {
    maxLevel: rule.maxLevel || null,
    observedLevel: previous?.observedLevel ?? null,
    sourceKind: "native",
    basis: "native-display-function-and-serialized-coefficients",
    evidence: `docs/mod-tree-audit/native-game-effects-0.7.3.63.json#${ref.code}`,
    observed: previous?.observedLevel !== null && previous?.observedLevel !== undefined ? previous.observed : [ref.name],
    effects: rule.effects.map(effect => {
      if (!targets[effect.target]) throw new Error(`Unknown target ${ref.code}/${effect.target}`);
      const expression = effect.expression ?? (targets[effect.target].operation === "unlock" ? { kind: "level" } : undefined);
      if (!expression) throw new Error(`Unmodeled native effect ${ref.code}/${effect.target}`);
      return { target: effect.target, expression: normalize(expression) };
    }),
  };
}
if (Object.keys(nodeRules).length !== 274 || Object.keys(nodes).length !== 274) throw new Error("Expected all 274 current-map nodes");
const usedTargets = new Set(Object.values(nodes).flatMap(node => node.effects.map(effect => effect.target)));
const catalog = {
  schemaVersion: 1, gameVersion: "Ouroboros v0.7.3.63 Early Access", observedAt: "2026-09-13",
  evidence: "docs/mod-tree-audit/native-game-effects-0.7.3.63.json",
  verificationBoundary: "All 274 current-map effect formulas, resource targets and serialized coefficients statically reviewed against installed 0.7.3.63 code. Twenty live node observations, no purchases. Runtime float32 boundaries are explicit; BigDouble/formatter implementation is not bit-for-bit emulated. Dynamic maximum-level modifiers, costs, recommendation scoring and all-game resource stacking are separate from this effect audit. Current-run and external-system inputs are explicit; absent inputs are never fabricated.",
  targets: Object.fromEntries([...usedTargets].map(key => [key, targets[key]])), nodes,
};
const labels = {
  totalSoftwareLevelsMK1To12: ["Software levels (MK1–12)", "Software Tech 합계 (MK1–12)", "현재 MK1~MK12 Software Tech 레벨의 합계. 최고 기록이 아닌 현재 값."],
  operationsThisRun: ["Operations this run", "이번 Run의 유효 Operation 수", "현재 Run의 Operation 수에 게임의 추가 Operation 보너스를 포함한 값."],
  currentLoopsDone: ["Current effective loops", "현재 유효 Loops Filled", "현재 Cell Loop + Tick Loop + 무료 Loops Filled. 과거 최고 기록과 구분."],
  finalLoopResetsThisConstruction: ["Effective resets this Construction", "이번 Construction의 유효 Reset 수", "이번 Construction의 Loop Reset 수 + Temporal 1/4 무료 Reset 보너스."],
  fullyCompletedResearches: ["Current completed researches", "현재 완료 Research 수", "현재 게임의 최종 Fully Completed Researches 값."],
  currentTotalResearchLevels: ["Current research levels", "현재 Research 레벨 합계", "현재 Research 레벨의 합계. 과거 구매량이나 최고 기록과 구분."],
  studiesThisLoop: ["Studies this Loop", "이번 Loop의 Study 수", "이번 Loop에 완료한 Study 수. 누적·최고 기록과 구분."],
  extraJerrehLevels: ["Additional Jerreh levels", "추가 Jerreh 레벨 (LM235)", "현재 지도 밖 LM235의 레벨. 미구매 상태는 0을 입력."],
  extraModLevels: ["Mod levels outside this map", "지도 밖 Mod 레벨 합계", "현재 지도에 없는 Ouroboros 등의 Mod 레벨 합계. 없다면 0을 입력."],
};
for (const ship of ["Cradle", "Auxesia", "Zagreus", "Hephaestus", "Demeter", "Koios", "Zeus"]) {
  for (const [stat, ko] of [["Rank", "랭크"], ["Crew", "승무원"]]) labels[`game${ship}${stat}`] = [`Current ${ship} ${stat}`, `현재 ${ship} ${ko}`, `무료 ${ko} 보너스까지 포함한 현재 게임의 ${ship} 최종 ${stat} 값.`];
}
// Native dependency metadata, not a list of extra form controls. The form
// reuses 20 shared keys through gameDisplayInputs.ts and adds only 3 inputs.
const additionalInputs = [...inputs].filter(key => key !== "level" && !/^manualMk[1-8]$/.test(key)).sort().map(key => {
  if (!labels[key]) throw new Error(`Input UI definition required: ${key}`);
  const [label, koLabel, helpKo] = labels[key];
  return { key, label, koLabel, helpKo, helpEn: `Use the current effective in-game value, including free bonuses. ${label}. Enter 0 explicitly if none. Do not use a best-run record.` };
});
const evidence = {
  schemaVersion: 1, reviewedAt: "2026-09-13", version: "0.7.3.63", versionCode: 3020,
  scope: "274 nodes present in the web Mod Tree", method: "native-static-plus-live-samples", fullPurchaseVerification: false,
  counts: { verifiedFormulas: 274, pendingNodes: 0, effectRows: Object.values(nodes).reduce((sum, node) => sum + node.effects.length, 0), liveObservedNodes: Object.values(nodes).filter(node => node.observedLevel !== null).length },
  sourceHashes: {
    "base.apk": "f8d7eb41ab4b34382f0d2c559e47b16108eb37c090a5d80072bbef54ed29d476",
    "split_config.x86_64.apk": "a6dabf95125965f277af2979e3ffd99846f5d75a305c387ca837e1f8b0f2b031",
    "libil2cpp.so": "a9c6a74e8a3c90c17793b4d66e11a0005fb92fd230e50d3bfefe9bfc153a40a7",
    "global-metadata.dat": "a6a45677b660ab6bbdd7a9f25afbd6e45f93ea4eca9f543ce0ac894f363773af",
  },
  tools: { Cpp2IL: "2022.1.0-pre-release.21", UnityPy: "1.25.3", Unity: "6000.3.22f1", metadataVersion: 39 },
  sceneObjects: { LoopModifiers: { id: 427113, bytes: 48396 }, TextHandlerLoopMods: { id: 297133, bytes: 22184 }, LoopModsAssist: { id: 279759, bytes: 16432 } },
  boundary: catalog.verificationBoundary, additionalInputs, nodes: proof,
};
const artifacts = { catalog, inputs: additionalInputs, evidence };
const mode = process.argv[2];
if (!Object.hasOwn(artifacts, mode)) throw new Error("Choose catalog, inputs or evidence");
console.log(JSON.stringify(artifacts[mode]));
