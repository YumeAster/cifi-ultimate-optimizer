import reference from "./reference.json" with { type: "json" };
import source from "./recommendation-data.json" with { type: "json" };

export type ModContentEffect = { kind: "unlock" | "feature" | "unknown"; ko: string; en: string };
const content = new Map<string, ModContentEffect>([
  // Names explicitly identify the unlocked content. APK sprite/metadata
  // evidence agrees; no numerical effect is present in these source rows.
  ["A02", { kind: "unlock", ko: "일일 보상", en: "Daily Rewards" }],
  ["A03", { kind: "unlock", ko: "아케이드", en: "The Arcade" }],
  // A neutral score row does not mean an unlock. These are upgrades to
  // existing systems; do not invent their unrecorded quantities.
  ["G05", { kind: "feature", ko: "로봇 채굴기 제작 MK1", en: "Robotic Miner Fabrication MK1" }],
  ["G07", { kind: "feature", ko: "로봇 채굴기 제작 MK2", en: "Robotic Miner Fabrication MK2" }],
  ["I25", { kind: "feature", ko: "Jerreh · 숙련도 보조", en: "Jerreh, The Mastery Assistant" }],
  ["I27", { kind: "feature", ko: "Tokenium-553 일일 획득 한도", en: "Tokenium-553 Daily Capacity" }],
]);
const ships = ["Cradle", "Auxesia", "Zagreus", "Hephaestus", "Demeter", "Koios", "Zeus"];
ships.forEach((ship, i) => {
  content.set(`EA${i + 1}`, { kind: "feature", ko: `${ship} 고급 자동화`, en: `Advanced ${ship} Automation` });
  content.set(`EB${i + 1}`, { kind: "feature", ko: `${ship} 일괄 자동화`, en: `Bulk ${ship} Automation` });
});
const neutralCodes = new Set(source.nodes.filter(node => node.effects.every((effect, i) => effect === (i < 14 || i === 22 ? 1 : 0))).map(node => node.code));

export function modContentEffect(code: string): ModContentEffect | undefined {
  const known = content.get(code);
  if (known) return known;
  if (!neutralCodes.has(code)) return undefined;
  const name = reference.nodes.find(node => node.code === code)?.name;
  return name ? { kind: "unknown", ko: name, en: name } : undefined;
}
