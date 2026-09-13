import { useId } from "react";
import type { ModTreeNode } from "../../lib/cifi/mod-tree/graph";
import textData from "../../lib/cifi/mod-tree/icon-text.json";

const iconText: Record<string, { text: string; x: number; y: number; fontSize: number; outlineWidth: number; shadowOffset: number }> = textData;

/** Render the same original Sprite layers as Unity; no generated replacements. */
export default function ModTreeIcon({ node }: { node: ModTreeNode }) {
  const overlay = iconText[node.key];
  const tintId = `mod-icon-${useId().replace(/:/g, "")}`;
  return <svg viewBox="0 0 100 100" width="100%" height="100%" overflow="visible" aria-hidden="true" focusable="false">
    <defs><filter id={tintId} filterUnits="objectBoundingBox" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      {/* Multiply the original luminance by the theme ink, retaining shading and alpha. */}
      <feColorMatrix type="saturate" values="0" result="luminance" />
      <feFlood className="mod-tree-icon-tint" result="tint" />
      <feComposite in="luminance" in2="tint" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" />
    </filter></defs>
    <g filter={`url(#${tintId})`}>{node.iconLayers.map((layer, index) => <image key={`${layer.pathId}-${index}`} href={layer.src}
      x={layer.x} y={layer.y} width={layer.width} height={layer.height}
      opacity={layer.opacity} preserveAspectRatio="xMidYMid meet" />)}</g>
    {overlay && <g fontSize={overlay.fontSize} fontWeight="bold" fontFamily="Arial, sans-serif" textAnchor="middle" dominantBaseline="central">
      <text className="mod-tree-icon-text-shadow" x={overlay.x + overlay.shadowOffset} y={overlay.y + overlay.shadowOffset} opacity=".5">{overlay.text}</text>
      <text className="mod-tree-icon-text" x={overlay.x} y={overlay.y} strokeWidth={overlay.outlineWidth} paintOrder="stroke" strokeLinejoin="round">{overlay.text}</text>
    </g>}
  </svg>;
}
