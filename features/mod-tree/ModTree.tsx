"use client";

import { AimOutlined, MinusOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import {
  preOuroborosModTreeCanvas as canvas,
  preOuroborosModTreeEdges as edges,
  preOuroborosModTreeNodesRebased as nodes,
  type ModTreeNode,
} from "../../lib/cifi/mod-tree/graph";
import { fitViewportToBounds, focusViewport, MAX_TREE_SCALE, MIN_TREE_SCALE, panViewport, zoomViewport, type Point, type Viewport } from "../../lib/cifi/mod-tree/viewport";
import "./mod-tree.css";
import ModTreeIcon from "./ModTreeIcon";
import { nodeContentLayout, nodeFramePath, nodeLevelText, nodePresentation, nodeProgress, nodeUnaffordable } from "../../lib/cifi/mod-tree/presentation";
import { recommendationCopy } from "./recommendationCopy";
import { useModRecommendations } from "./useModRecommendations";
import ModRecommendationPanel from "./ModRecommendationPanel";
import type { PlayerProfile } from "../../lib/cifi/mod-tree/recommendations";
import { DEFAULT_RECOMMENDATION_COUNT, restoreRecommendationCount } from "../../lib/cifi/mod-tree/preferences";
import { doubleClickedNode, type NodeClick } from "../../lib/cifi/mod-tree/interaction";
import ModEffectOverview from "./ModEffectOverview";
import { useGameDisplayProfile } from "./useGameDisplayProfile";

type Language = "ko" | "en";
type DragState = { pointerId: number; client: Point; start: Point; viewport: Viewport; nodeKey?: string; moved: boolean };

function fitNodes(items: ModTreeNode[]): Viewport {
  if (!items.length) return { scale: 1, x: 0, y: 0 };
  const left = Math.min(...items.map((node) => node.x - node.size));
  const top = Math.min(...items.map((node) => node.y - node.size));
  const right = Math.max(...items.map((node) => node.x + node.size));
  const bottom = Math.max(...items.map((node) => node.y + node.size));
  return fitViewportToBounds({ x: left, y: top, width: right - left, height: bottom - top }, canvas);
}

/** getScreenCTM includes preserveAspectRatio letterboxing; rect ratios do not. */
function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}

const emptyProfile: PlayerProfile = {};
const mobileTreeQuery = "(max-width:1200px)";
const subscribeMobileTree = (onChange: () => void) => {
  const media = window.matchMedia(mobileTreeQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const mobileTreeSnapshot = () => window.matchMedia(mobileTreeQuery).matches;
export default function ModTree({ language, profile = emptyProfile, recommendationCount = DEFAULT_RECOMMENDATION_COUNT }: { language: Language; profile?: PlayerProfile; recommendationCount?: number }) {
  const isKorean = language === "ko";
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(nodes[0]?.key ?? "");
  const [viewport, setViewport] = useState<Viewport>(() => fitNodes(nodes));
  const [isDragging, setIsDragging] = useState(false);
  const [recommendationsVisible, setRecommendationsVisible] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState("");
  const [desktopOverviewOpen, setDesktopOverviewOpen] = useState(true);
  const [mobileOverviewOpen, setMobileOverviewOpen] = useState(false);
  const mobileTree = useSyncExternalStore(subscribeMobileTree, mobileTreeSnapshot, () => false);
  const overviewOpen = mobileTree ? mobileOverviewOpen : desktopOverviewOpen;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const lastNodeClick = useRef<NodeClick | null>(null);
  const pendingDoubleClick = useRef<string | null>(null);
  const viewportRef = useRef(viewport);
  const instanceId = useId().replace(/:/g, "");
  const helpId = `${instanceId}-help`;
  const overviewContentId = `${instanceId}-overview-content`;
  const queryText = query.trim().toLowerCase();
  const nodeLookup = useMemo(() => new Map(nodes.map((node) => [node.key, node])), []);
  const matches = useMemo(() => nodes.filter((node) => !queryText || `${node.label} ${node.name}`.toLowerCase().includes(queryText)), [queryText]);
  const matchingIds = useMemo(() => new Set(matches.map((node) => node.key)), [matches]);
  const recommendations = useModRecommendations(profile);
  const gameDisplay = useGameDisplayProfile(profile, recommendations.state, recommendations.ready);
  const evaluatedByCode = useMemo(() => new Map(recommendations.evaluations.map(row => [row.code, row])), [recommendations.evaluations]);
  const visibleRecommendationCount = restoreRecommendationCount(recommendationCount);
  const recommendedCodes = new Set(recommendationsVisible ? recommendations.ranked.slice(0, visibleRecommendationCount).map(row => row.code) : []);
  const topRecommendation = recommendationsVisible ? recommendations.ranked[0]?.code : undefined;
  const filtered = Boolean(queryText);

  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (dragRef.current) return; // Keep the drag-start scale until this gesture ends.
      const anchor = svgPoint(svg, event.clientX, event.clientY);
      if (!anchor) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1);
      const factor = Math.exp(-Math.max(-180, Math.min(180, delta)) * .0025);
      setViewport((current) => zoomViewport(current, current.scale * factor, anchor));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
      const drag = dragRef.current;
      if (drag && svg.hasPointerCapture(drag.pointerId)) svg.releasePointerCapture(drag.pointerId);
      dragRef.current = null;
    };
  }, []);

  const updateScale = (factor: number) => setViewport((current) => zoomViewport(current, current.scale * factor, { x: canvas.width / 2, y: canvas.height / 2 }));
  const selectNode = (node: ModTreeNode, focus = false) => {
    setSelectedId(node.key);
    if (focus) setViewport((current) => focusViewport(node, Math.max(current.scale, 3), canvas));
  };
  const purchaseNode = (code: string) => {
    if (!recommendationsVisible) return;
    if (recommendations.applyOne(code)) setPurchaseNotice(`${recommendationCopy[language].purchaseDone}: ${code}`);
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !event.isPrimary || dragRef.current) return;
    pendingDoubleClick.current = null;
    const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) return;
    const target = event.target instanceof Element ? event.target.closest("[data-node-key]") : null;
    dragRef.current = { pointerId: event.pointerId, client: { x: event.clientX, y: event.clientY }, start: point, viewport: viewportRef.current, nodeKey: target?.getAttribute("data-node-key") ?? undefined, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.client.x, event.clientY - drag.client.y) < 5) return;
    drag.moved = true;
    setIsDragging(true);
    setViewport(panViewport(drag.viewport, drag.start, point));
  };
  const endDrag = (event: PointerEvent<SVGSVGElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && !drag.moved && drag.nodeKey) {
      const node = nodeLookup.get(drag.nodeKey);
      if (node) {
        const click = { code: node.key, x: event.clientX, y: event.clientY, at: event.timeStamp };
        pendingDoubleClick.current = doubleClickedNode(lastNodeClick.current, click);
        lastNodeClick.current = click;
        selectNode(node);
      }
    } else { lastNodeClick.current = null; pendingDoubleClick.current = null; }
  };
  const onMapKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const movement: Record<string, Point> = { ArrowLeft: { x: 70, y: 0 }, ArrowRight: { x: -70, y: 0 }, ArrowUp: { x: 0, y: 70 }, ArrowDown: { x: 0, y: -70 } };
    if (movement[event.key]) {
      event.preventDefault();
      setViewport((current) => panViewport(current, { x: 0, y: 0 }, movement[event.key]));
    } else if (event.key === "+" || event.key === "=") { event.preventDefault(); updateScale(1.25); }
    else if (event.key === "-") { event.preventDefault(); updateScale(.8); }
    else if (event.key === "Home" || event.key === "0") { event.preventDefault(); setViewport(fitNodes(nodes)); }
  };

  return <main className="mod-tree-workspace mod-tree-v2">
    <section className="mod-tree-surface" aria-label={isKorean ? "Mod Tree 그래프" : "Mod Tree graph"}>
      <header className="mod-tree-toolbar">
        <label className="mod-tree-search"><SearchOutlined /><span className="mod-tree-visually-hidden">{isKorean ? "맵 코드 또는 업그레이드 이름 검색" : "Search map code or upgrade name"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) { event.preventDefault(); selectNode(matches[0], true); } }} placeholder={isKorean ? "코드·이름 검색 (A01, C5u…)" : "Code or name (A01, C5u…)"} /></label>
        <div className="mod-tree-zoom" aria-label={isKorean ? "확대 축소" : "Zoom controls"}>
          <button type="button" className="mod-tree-jump-recommendation" disabled={!topRecommendation} onClick={() => { const node = topRecommendation && nodeLookup.get(topRecommendation); if (node) { setQuery(""); selectNode(node, true); } }}><AimOutlined />{recommendationCopy[language].jumpTop}{topRecommendation && <b>{topRecommendation}</b>}</button>
          <button type="button" onClick={() => updateScale(.8)} disabled={viewport.scale <= MIN_TREE_SCALE} aria-label={isKorean ? "축소" : "Zoom out"}><MinusOutlined /></button><span>{Math.round(viewport.scale * 100)}%</span><button type="button" onClick={() => updateScale(1.25)} disabled={viewport.scale >= MAX_TREE_SCALE} aria-label={isKorean ? "확대" : "Zoom in"}><PlusOutlined /></button><button type="button" className="mod-tree-fit" onClick={() => setViewport(fitNodes(nodes))} aria-label={isKorean ? "전체 보기" : "Fit tree"} title={isKorean ? "전체 보기 (Home)" : "Fit tree (Home)"}><AimOutlined /></button>
        </div>
      </header>
      <div className={`mod-tree-map-layout${overviewOpen ? "" : " is-overview-collapsed"}`}>
        <ModEffectOverview state={recommendations.state} profile={gameDisplay.displayProfile} language={language} ready={recommendations.ready} collapsed={!overviewOpen} contentId={overviewContentId} onToggle={() => mobileTree ? setMobileOverviewOpen(open => !open) : setDesktopOverviewOpen(open => !open)}>
          <div id={helpId} className="mod-tree-map-help">{isKorean ? "드래그로 이동 · 휠로 확대 · 키보드 방향키 / + − / Home" : "Drag to move · Scroll to zoom · Arrow keys / + − / Home"}<span>{recommendationCopy[language].doubleClickHelp}</span>
            <div className="mod-tree-state-legend" aria-label={isKorean ? "노드 상태" : "Node states"}>{[
              ["locked", isKorean ? "잠김" : "Locked"], ["available", isKorean ? "미구매" : "Unpurchased"],
              ["owned", isKorean ? "구매함" : "Purchased"], ["unaffordable", isKorean ? "MP 부족 −" : "Insufficient MP −"],
              ["maxed", isKorean ? "최대 레벨 ✓" : "Max level ✓"],
            ].map(([state, label]) => <span key={state} className={`mod-tree-legend-item state-${state}`}><i aria-hidden="true" />{label}</span>)}</div>
            <span>{recommendationCopy[language].levelLegend}</span><span className="mod-tree-recommendation-legend">{recommendationCopy[language].legend}</span><span role="status" className="mod-tree-purchase-notice">{purchaseNotice || "\u00a0"}</span></div>
        </ModEffectOverview>
        <div className="mod-tree-canvas-frame">
          <svg ref={svgRef} className={`mod-tree-canvas ${isDragging ? "is-dragging" : ""}`} viewBox={`0 0 ${canvas.width} ${canvas.height}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={(event) => endDrag(event, true)} onLostPointerCapture={(event) => endDrag(event, true)} onDoubleClick={event => { event.preventDefault(); const code = pendingDoubleClick.current; pendingDoubleClick.current = null; lastNodeClick.current = null; if (code && event.detail >= 2) purchaseNode(code); }} onKeyDown={onMapKeyDown} tabIndex={0} role="group" aria-label={isKorean ? "이동 및 확대 가능한 Mod Tree 지도" : "Pannable and zoomable Mod Tree map"} aria-describedby={helpId}>
            <defs><pattern id={`${instanceId}-grid`} width="30" height="30" patternUnits="userSpaceOnUse"><path className="mod-tree-grid-line" d="M 30 0 L 0 0 0 30" fill="none" strokeWidth="1" /></pattern></defs>
            <rect width={canvas.width} height={canvas.height} className="mod-tree-backdrop" /><rect width={canvas.width} height={canvas.height} fill={`url(#${instanceId}-grid)`} />
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
              {edges.map((edge) => {
                const from = nodeLookup.get(edge.from);
                const to = nodeLookup.get(edge.to);
                if (!from || !to) return null;
                const points = (edge.points?.length ? edge.points : [from, to]).map((point) => `${point.x},${point.y}`).join(" ");
                return <g key={edge.objectName} className={filtered && !matchingIds.has(from.key) && !matchingIds.has(to.key) ? "mod-tree-link is-muted" : "mod-tree-link"}><polyline points={points} className="mod-tree-edge-shadow" /><polyline points={points} className="mod-tree-edge" /></g>;
              })}
              <g className="mod-tree-recommendation-halos" aria-hidden="true" pointerEvents="none">
                {nodes.filter(node => recommendedCodes.has(node.key)).map(node => {
                  const path = nodeFramePath(nodePresentation(node).radius);
                  return <g key={node.key} data-recommended-code={node.key} transform={`translate(${node.x} ${node.y})`} className={`mod-tree-recommendation-halo ${node.key === topRecommendation ? "is-top" : ""} ${filtered && !matchingIds.has(node.key) ? "is-muted" : ""}`}>
                    <path d={path} className="mod-tree-recommendation-ripple" />
                  </g>;
                })}
              </g>
              {nodes.map((node) => {
                const isSelected = node.key === selectedId;
                const evaluation = recommendations.ready ? evaluatedByCode.get(node.key) : undefined;
                const progress = nodeProgress(evaluation, node.maxLevel);
                const unaffordable = nodeUnaffordable(evaluation, node.maxLevel);
                const levelText = evaluation ? nodeLevelText(evaluation.level, node.maxLevel) : "—/—";
                const { radius } = nodePresentation(node);
                const { iconSize, iconX, iconY, codeY, codeFontSize, codeWidth, codeHeight, levelY, levelFontSize } = nodeContentLayout(node, levelText);
                const description = `${node.label}: ${node.name} · ${recommendationCopy[language].states[progress]}${unaffordable ? ` · ${recommendationCopy[language].short}` : ""} · ${levelText}${node.key === topRecommendation ? ` · ${recommendationCopy[language].first}` : ""}`;
                return <g key={node.key} data-node-key={node.key} data-progress={progress} data-unaffordable={unaffordable} transform={`translate(${node.x} ${node.y})`} className={`mod-tree-node progress-${progress} ${unaffordable ? "is-unaffordable" : ""} ${isSelected ? "is-selected" : ""} ${recommendedCodes.has(node.key) ? "is-recommended" : ""} ${node.key === topRecommendation ? "is-top-recommendation" : ""} ${filtered && !matchingIds.has(node.key) ? "is-muted" : ""}`} role="button" tabIndex={isSelected ? 0 : -1} aria-label={description} aria-pressed={isSelected} onClick={(event) => { if (event.detail === 0) selectNode(node); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); selectNode(node); } }}>
                  <title>{description}</title>
                  <path d={nodeFramePath(radius)} className="mod-tree-node-frame" />
                  <svg className="mod-tree-node-icon" x={iconX} y={iconY} width={iconSize} height={iconSize} overflow="visible" aria-hidden="true"><ModTreeIcon node={node} /></svg>
                  <rect className="mod-tree-code-badge" x={-codeWidth / 2} y={codeY - codeHeight / 2} width={codeWidth} height={codeHeight} rx=".8" aria-hidden="true" />
                  <text className="mod-tree-node-code" textAnchor="middle" y={codeY} dominantBaseline="central" style={{ fontSize: codeFontSize }}>{node.label}</text>
                  <text className="mod-tree-node-level" textAnchor="middle" y={levelY} dominantBaseline="central" style={{ fontSize: levelFontSize }}>{levelText}</text>
                  {(progress === "maxed" || unaffordable) && <g className="mod-tree-node-state-mark" transform={`translate(${radius * .76} ${-radius * .76})`} aria-hidden="true" pointerEvents="none"><circle r="3.4" /><path d={progress === "maxed" ? "M -1.6 0 L -.4 1.2 L 1.8 -1.3" : "M -1.5 0 H 1.5"} /></g>}
                </g>;
              })}
            </g>
          </svg>
        </div>
        <aside className="mod-tree-side-panel">
          {gameDisplay.storageFailed && <p role="status" className="mod-rec-error">{isKorean ? "효과 표시 기준 저장 실패 · 새로고침 전 진행도를 확인해 주세요." : "Effect snapshot could not be saved. Check progress before reloading."}</p>}
          <ModRecommendationPanel language={language} selectedCode={selectedId} recommendationCount={visibleRecommendationCount} profile={gameDisplay.displayProfile} model={recommendations} onPurchase={purchaseNode} onValidityChange={setRecommendationsVisible} onSelect={code => { const node = nodeLookup.get(code); if (node) { setQuery(""); selectNode(node, true); } }} />
          {filtered && <section className="mod-tree-search-results" aria-label={isKorean ? "검색 결과" : "Search results"}><h3 role="status">{isKorean ? `검색 결과 ${matches.length}개` : `${matches.length} results`}</h3>{matches.length ? <ul>{matches.map((node) => <li key={node.key}><button type="button" className={selectedId === node.key ? "is-current" : ""} onClick={() => selectNode(node, true)}><b className="mod-tree-code-token">{node.label}</b><span>{node.name}</span></button></li>)}</ul> : <p>{isKorean ? "일치하는 노드가 없어. 다른 코드나 이름으로 찾아봐." : "No matching nodes. Try another code or name."}</p>}</section>}
        </aside>
      </div>
      <p className="mod-tree-source-note">{isKorean ? "코드와 위치는 시트·제공한 지도·캡처를 기준으로 구성했어. 미확인 연결과 잠금 이후 확장 영역은 표시하지 않아." : "Codes and positions follow the sheet and supplied map captures. Unconfirmed connections and post-unlock expansion areas are not shown."}</p>
    </section>
  </main>;
}
