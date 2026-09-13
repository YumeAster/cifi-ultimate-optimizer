/** Shared SVG geometry keeps the compact code badge clear of adjacent nodes. */
const reducedIconCodes = new Set(["IU2", "IU3", "IU4", "DU2", "DU3", "EU1", "FU2", "FU4"]);
// Scale these icons to 80% of their previous 90% display scale.
const reducedIconScale = .9 * .8;

export type NodeProgress = "unknown" | "locked" | "unpurchased" | "purchased" | "maxed" | "capped";
export function nodeProgress(evaluation?: { unlocked: boolean; level: number; maxed: boolean }, maximum = 99_999): NodeProgress {
  if (!evaluation) return "unknown";
  if (!evaluation.unlocked) return "locked";
  if (evaluation.maxed) return maximum > 99_999 ? "capped" : "maxed";
  return evaluation.level > 0 ? "purchased" : "unpurchased";
}

/** MP shortage is a visual overlay, not a replacement for recorded progress.
 * Maxed/capped nodes and unavailable calculations must keep their own states. */
export function nodeUnaffordable(evaluation?: { unlocked: boolean; level: number; maxed: boolean; affordable: boolean; cost: string | null; error: string | null }, maximum = 99_999): boolean {
  return Boolean(evaluation && evaluation.unlocked && !evaluation.maxed
    && evaluation.level < Math.min(maximum, 99_999)
    && !evaluation.error && evaluation.cost && !evaluation.affordable);
}

export function nodeLevelText(level: number, maxLevel: number): string {
  return `${level}/${maxLevel > 99_999 ? "∞" : maxLevel}`;
}

export function nodePresentation(node: { key: string; size: number; label: string }) {
  return {
    radius: node.size / 2,
    iconSize: node.size * .8 * (node.key === "DU1" ? .8 : reducedIconCodes.has(node.key) ? reducedIconScale : 1),
    labelY: node.size / 2 + 6,
    labelWidth: Math.max(18, node.label.length * 4.1 + 4),
    labelHeight: 8,
    fontSize: 6.5,
  };
}

/** Overlay a compact code badge on the unchanged icon; plain levels sit below. */
export function nodeContentLayout(node: { key: string; size: number; label: string }, levelText: string) {
  const base = nodePresentation(node), r = base.radius;
  const codeFontSize = Math.min(5, node.size * .15);
  const levelWidth = Math.min(node.size + 2, Math.max(22, levelText.length * 3.2 + 4));
  return {
    iconSize: base.iconSize, iconX: -base.iconSize / 2, iconY: -base.iconSize / 2,
    codeY: r * .6, codeFontSize, codeWidth: Math.max(14, node.label.length * codeFontSize * .62 + 4), codeHeight: codeFontSize + 2,
    levelY: base.labelY, levelWidth, levelHeight: base.labelHeight,
    levelFontSize: Math.min(5.2, (levelWidth - 4) / (levelText.length * .62)),
  };
}

export function nodeFramePath(radius: number): string {
  // Keep the original octagon bounds, rounding each corner with a tangent curve.
  const vertices = [
    [-.72, -1], [.72, -1], [1, -.6], [1, .6],
    [.72, 1], [-.72, 1], [-1, .6], [-1, -.6],
  ];
  const point = (x: number, y: number) => `${+(x * radius).toFixed(5)} ${+(y * radius).toFixed(5)}`;
  return vertices.map(([x, y], index) => {
    const previous = vertices[(index + vertices.length - 1) % vertices.length];
    const next = vertices[(index + 1) % vertices.length];
    const before = .16 / Math.hypot(previous[0] - x, previous[1] - y);
    const after = .16 / Math.hypot(next[0] - x, next[1] - y);
    return `${index === 0 ? "M" : "L"}${point(x + (previous[0] - x) * before, y + (previous[1] - y) * before)} Q${point(x, y)} ${point(x + (next[0] - x) * after, y + (next[1] - y) * after)}`;
  }).join(" ") + " Z";
}
