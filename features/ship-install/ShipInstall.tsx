"use client";

/* Native ship PNGs are shared by the static Vite and server entry points. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { SHIPS, SHIP_MAX_EVOLUTION, INSTALL_ROWS, getShipInstalls } from "../../lib/cifi/ship-install/catalog";
import { evaluateInstall, rankInstalls, generateSequence, aggregateEffects, previewInstallSequenceEffects, usesUnitWeightFallback, validateInstallSequence } from "../../lib/cifi/ship-install/engine";
import { applyShipInstallRecommendation, buyShipInstallLevel } from "../../lib/cifi/ship-install/actions";
import { SHIP_INSTALL_EXTRA_FIELDS, combineModLevels } from "../../lib/cifi/ship-install/profile";
import type { InstallEvaluation, InstallSequence, RecommendationMode, ShipInstallContext } from "../../lib/cifi/ship-install/types";
import {
  SHIP_INSTALL_STORAGE_KEY, SHIP_INSTALL_SLOTS, createDefaultShipInstallState, readShipInstallState,
  commitShipInstallState, selectShipInstallShip, selectShipInstallLoadout, updateShipInstallInput,
  updateShipInstallWorkspace, saveShipInstallLoadout, fingerprintShipInstallContext,
  type ShipInstallPersistentState, type SavedShipLoadout,
} from "../../lib/cifi/ship-install/persistence";
import { MOD_STORAGE_KEY, restoreModState } from "../../lib/cifi/mod-tree/recommendations";
import { publicAssetUrl } from "../../lib/cifi/publicAssetUrl";
import "./ship-install.css";

type Props = {
  language: "ko" | "en"; ready: boolean;
  profile: Record<string, string>; draft: Record<string, string>; errors: Record<string, string>;
  onInput: (key: string, value: string) => void;
};
// CSS mask URLs resolve from the bundled stylesheet, not the document URL.
// An absolute, deployment-base-aware URL keeps Pages from requesting assets/assets/.
const asset = (path: string) => publicAssetUrl(path, typeof document === "undefined" ? "/" : new URL(".", document.baseURI).pathname);
const glyph = (name: string) => `/assets/ship-install/${name}.png`;
const modes: Record<RecommendationMode, [string, string]> = {
  mp: ["MP 위주", "MP first"], "shards-research": ["Shard / RP 위주", "Shard / RP first"],
  shards: ["Shard 위주", "Shard first"], research: ["RP 위주", "RP first"], weights: ["가중치 프리셋 사용", "Use current weights"],
};
function Icon({ src, className = "" }: { src: string; className?: string }) {
  return <span aria-hidden="true" className={`si-icon ${className}`} style={{ "--si-icon": `url("${asset(src)}")` } as CSSProperties} />;
}
function Code({ position }: { position: number }) { return <span className="si-code">{String(position).padStart(2, "0")}</span>; }
function stateClass(row: InstallEvaluation, rank: number) {
  if (row.maxed) return "is-maxed";
  if (!row.unlocked) return "is-locked";
  if (!row.affordable) return "is-unaffordable";
  if (rank === 0) return "is-top";
  if (rank > 0) return "is-recommended";
  return "is-available";
}

function missingInputLabel(key: string, language: "ko" | "en"): string {
  const ko = language === "ko";
  if (key === "modLevelsTotal") return ko ? "Mod Tree 레벨 합계 · 지도 밖 Mod 레벨" : "Mod Tree levels · off-map Mod levels";
  if (key === "extraModLevels") return ko ? "지도 밖 Mod 레벨 (입력값 관리)" : "Off-map Mod levels (Inputs)";
  const generator = /^(manualMk|hardwareTechMk|softwareTechMk)([1-8])$/.exec(key);
  if (generator) return `${generator[1] === "manualMk" ? "Manual" : generator[1] === "hardwareTechMk" ? "Hardware Tech" : "Software Tech"} MK${generator[2]}`;
  const crew = /^([a-z]+)Crew$/.exec(key);
  if (crew) return `${crew[1][0].toUpperCase()}${crew[1].slice(1)} Crew`;
  return ({ automationsOwned: "Automation", ticksThisRun: ko ? "이번 Run Tick" : "Ticks this Run", missionsDone: ko ? "완료 Mission" : "Completed Missions",
    loopsFilled: "Loop Filled", loopResets: "Loop Resets", operationsDone: ko ? "완료 Operation" : "Operations Done", studiesDone: ko ? "완료 Study" : "Studies Done",
    completedResearches: ko ? "완료 Research" : "Completed Researches", totalResearchLevels: ko ? "전체 Research 레벨" : "Total Research Levels" } as Record<string, string>)[key] ?? key;
}

type QueueView = "detailed" | "normal" | "compact";
function LoadoutQueue({ language, context, plan, stale, onSelect, onCopy }: {
  language: "ko" | "en"; context: ShipInstallContext;
  plan: Pick<InstallSequence, "steps" | "baselineLevels"> | null;
  stale: boolean; onSelect: (position: number) => void; onCopy: () => void;
}) {
  const [view, setView] = useState<QueueView>("normal");
  const nodes = getShipInstalls(context.ship);
  const stepEffects = useMemo(() => view === "detailed" && plan && !stale
    ? previewInstallSequenceEffects({ ...context, levels: plan.baselineLevels }, plan.steps)
    : [], [context, plan, stale, view]);
  const t = (kr: string, en: string) => language === "ko" ? kr : en;
  return <section className="si-queue">
    <header><h3>{t("Loadout 강화 순서", "Loadout purchase order")} <small>{plan?.steps.length ?? 0}</small></h3><button disabled={!plan?.steps.length || stale} onClick={onCopy}>{t("복사", "Copy")}</button></header>
    <div className="si-queue-views" role="group" aria-label={t("강화 순서 보기 방식", "Purchase order view")}>
      {(["detailed", "normal", "compact"] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === "detailed" ? t("자세히", "Detailed") : mode === "normal" ? t("일반", "Normal") : t("컴팩트", "Compact")}</button>)}
    </div>
    {stale && <p className="si-notice">{t("저장 후 입력값이 변경됐어. 다시 생성하면 새 조건으로 계산돼.", "Inputs changed since saving. Regenerate for current conditions.")}</p>}
    <ol className={`${stale ? "is-stale" : ""} is-${view}`}>
      {plan?.steps.map(step => {
        const node = nodes.find(item => item.position === step.position)!;
        const label = `${step.index}. ${node.name} · ${String(step.position).padStart(2, "0")} · Lv.${step.from} → Lv.${step.to}`;
        return <li key={step.index}><button title={label} aria-label={label} onClick={() => onSelect(step.position)}>
          {view === "compact" ? <><span className="si-step-index">{String(step.index).padStart(2, "0")}</span><Icon src={node.icon} /><Code position={step.position} /></>
            : <><span className="si-step-main"><span className="si-step-index">{String(step.index).padStart(2, "0")}</span><Icon src={node.icon} /><Code position={step.position} />{view === "detailed" && <strong className="si-step-name">{node.name}</strong>}<span className="si-step-level">{step.from}<i>→</i><b>{step.to}</b></span></span>
              {view === "detailed" && !stale && <span className="si-step-effects">{stepEffects[step.index - 1]?.map((effect, index) => <span key={`${effect.resource}-${index}`}><span className="si-step-effect-label">{effect.label}</span><span className="si-step-effect-values">{effect.currentDisplay}<i>→</i><b>{effect.nextDisplay}</b></span></span>)}{!stepEffects[step.index - 1]?.length && <span>{t("표시할 효과 없음", "No effect to display")}</span>}</span>}
              {step.reason === "prerequisite" && <small>{t("해금", "Unlock")}</small>}</>}
        </button></li>;
      })}
    </ol>
    {!plan?.steps.length && <p className="si-empty">{t("포인트와 현재 레벨을 입력한 뒤 추천 순서를 생성해줘.", "Enter points and current levels, then generate an order.")}</p>}
    <footer>{t("한 단계 = 1 Install · 현재 레벨부터 추천", "One step = one Install · starts at current levels")}</footer>
  </section>;
}

export default function ShipInstall({ language, profile, draft, errors, ready, onInput }: Props) {
  const ko = language === "ko";
  const t = (kr: string, en: string) => ko ? kr : en;
  const [state, setState] = useState<ShipInstallPersistentState>(createDefaultShipInstallState);
  const stateRef = useRef(state);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "failed" | "repaired">("saved");
  const [selected, setSelected] = useState(1);
  const [tab, setTab] = useState<"installs" | "effects">("installs");
  const [pending, setPending] = useState<{ plan: InstallSequence; fingerprint: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // A fresh Mod Tree has zero purchases; a corrupt/unreadable save remains unknown.
  const [mappedModLevels, setMappedModLevels] = useState<string | undefined>("0");
  const modLevelsTotal = useMemo(() => combineModLevels(mappedModLevels, profile), [mappedModLevels, profile]);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
    if (!active) return;
    const restored = readShipInstallState(key => window.localStorage.getItem(key));
    stateRef.current = restored.state; setState(restored.state);
    setSaveStatus(restored.status === "failed" ? "failed" : restored.status === "repaired" ? "repaired" : "saved");
    try {
      const raw = localStorage.getItem(MOD_STORAGE_KEY);
      if (raw) setMappedModLevels(String(Object.values(restoreModState(JSON.parse(raw)).levels).reduce((a, b) => a + b, 0)));
    } catch { setMappedModLevels(undefined); }
    setLoaded(true);
    });
    return () => { active = false; };
  }, []);
  const ship = state.selectedShip;
  const maxEvolution = SHIP_MAX_EVOLUTION[ship];
  const workspace = state.ships[ship];
  const slot = workspace.selectedSlot;
  const nodes = getShipInstalls(ship);
  const context = useMemo<ShipInstallContext>(() => ({ ship, levels: workspace.levels, totalPoints: workspace.totalPoints,
    profile, mode: workspace.mode, excluded: workspace.excluded, capExpanded: workspace.capExpanded, modLevelsTotal }), [ship, workspace, profile, modLevelsTotal]);
  const fingerprint = useMemo(() => fingerprintShipInstallContext({ model: "ship-install-base-v1", ...context, evolution: workspace.evolution }), [context, workspace.evolution]);
  const evaluations = useMemo(() => nodes.map(node => evaluateInstall(context, node.position)), [nodes, context]);
  const ranked = useMemo(() => rankInstalls(context), [context]);
  const unitFallback = useMemo(() => usesUnitWeightFallback(context), [context]);
  const detail = evaluations.find(row => row.position === selected) ?? evaluations[0];
  const savedPlan = workspace.loadouts[slot];
  const freshPending = pending?.fingerprint === fingerprint ? pending : null;
  const plan: Pick<SavedShipLoadout, "steps" | "targetLevels" | "baselineLevels"> | null = freshPending?.plan ?? savedPlan;
  const savedPlanInvalid = useMemo(() => Boolean(savedPlan && (savedPlan.contextFingerprint !== fingerprint || validateInstallSequence(context, savedPlan.steps).length)), [savedPlan, fingerprint, context]);
  const stale = !freshPending && savedPlanInvalid;
  const allocated = Object.values(workspace.levels).reduce((a, b) => a + b, 0);
  const remaining = workspace.totalPoints - allocated;
  const currentEffects = useMemo(() => aggregateEffects(context), [context]);
  const targetEffects = useMemo(() => plan && !stale ? aggregateEffects({ ...context, levels: plan.targetLevels }) : null, [context, plan, stale]);
  const combinedEffects = [...new Set([...currentEffects, ...(targetEffects ?? [])].map(effect => effect.resource))].map(resource => ({
    resource, current: currentEffects.find(effect => effect.resource === resource), target: targetEffects?.find(effect => effect.resource === resource),
  }));
  useEffect(() => { const revision = generation; revision.current++; queueMicrotask(() => setBusy(false)); return () => { revision.current++; }; }, [fingerprint]);
  const enabled = ready && loaded;
  const invalidDraft = Object.entries(workspace.draftLevels).some(([position, value]) => value.trim() !== "" && (!/^\d+$/.test(value.trim()) || Number(value) !== workspace.levels[Number(position)]))
    || (workspace.draftTotalPoints.trim() !== "" && (!/^\d+$/.test(workspace.draftTotalPoints.trim()) || Number(workspace.draftTotalPoints) !== workspace.totalPoints));
  const canApplyPlan = enabled && !busy && !invalidDraft && !stale && Boolean(plan?.steps.length) && !freshPending?.plan.errors.length;
  const commit = (next: ShipInstallPersistentState) => {
    if (!enabled) return false;
    generation.current++; setBusy(false);
    stateRef.current = next; setState(next); setNotice("");
    try { commitShipInstallState(next, value => localStorage.setItem(SHIP_INSTALL_STORAGE_KEY, value)); setSaveStatus("saved"); return true; }
    catch { setSaveStatus("failed"); return false; }
  };
  const edit = (field: number | "totalPoints" | "evolution", raw: string) => commit(updateShipInstallInput(stateRef.current, ship, field, raw));
  const buy = (position: number) => {
    if (!enabled || invalidDraft) return;
    try {
      const next = buyShipInstallLevel(stateRef.current, context, position);
      if (next) commit(next);
    } catch { setNotice(t("Install 구매를 적용하지 못했어. 현재 레벨과 포인트를 확인해줘.", "Could not apply the Install purchase. Check the current levels and points.")); }
  };
  const generate = async () => {
    if (!enabled || invalidDraft) return;
    const revision = ++generation.current; setBusy(true); setNotice("");
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      let result = generateSequence(context, 200);
      while (result.stopped === "limit" && result.steps.length < 2000) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (revision !== generation.current) return;
        const part = generateSequence({ ...context, levels: result.targetLevels }, Math.min(200, 2000 - result.steps.length));
        result = { ...part, baselineLevels: result.baselineLevels, spent: result.spent + part.spent,
          steps: [...result.steps, ...part.steps.map(step => ({ ...step, index: result.steps.length + step.index }))] };
      }
      if (revision !== generation.current) return;
      setPending({ plan: result, fingerprint });
      if (result.errors.length) setNotice(result.errors.join(" · "));
      else if (!result.steps.length) setNotice(t("배분 가능한 대상이 없어. 입력값·남은 포인트·추천 방식을 확인해줘.", "No eligible allocation. Check inputs, remaining points and recommendation mode."));
      else if (result.stopped === "limit") setNotice(t("2,000단계까지 생성했어. 남은 포인트가 있어.", "Generated the first 2,000 steps; points remain."));
    } catch { if (revision === generation.current) setNotice(t("추천 계산에 실패했어. 입력값을 확인해줘.", "Calculation failed. Check your inputs.")); }
    finally { if (revision === generation.current) setBusy(false); }
  };
  const savePlan = () => {
    if (!freshPending || !freshPending.plan.steps.length || freshPending.plan.errors.length) return;
    try {
      const next = saveShipInstallLoadout(stateRef.current, ship, slot, { ...freshPending.plan, mode: workspace.mode,
        totalPoints: workspace.totalPoints, evolution: workspace.evolution, capExpanded: workspace.capExpanded,
        contextFingerprint: fingerprint, savedAt: new Date().toISOString() });
      commit(next); setPending(null);
    } catch { setSaveStatus("failed"); }
  };
  const applyPlan = () => {
    if (!canApplyPlan || !plan) return;
    try {
      const count = plan.steps.length;
      const next = applyShipInstallRecommendation(stateRef.current, context, plan);
      const saved = commit(next);
      setPending(null);
      if (saved) setNotice(t(`${count}단계를 웹의 현재 Install 레벨에 적용했어. 실제 게임은 변경되지 않아.`, `Applied ${count} steps to this site's current Install levels. The game was not changed.`));
    } catch { setNotice(t("추천 순서가 현재 입력값과 달라졌어. 다시 생성해줘.", "The recommendation no longer matches the current inputs. Generate it again.")); }
  };
  const copyPlan = async () => {
    if (!plan || stale) return;
    const text = `${ship} · Loadout ${slot}\n${plan.steps.map(step => `${step.index}. ${String(step.position).padStart(2, "0")} ${nodes.find(node => node.position === step.position)?.name} ${step.from} → ${step.to}`).join("\n")}`;
    try { await navigator.clipboard.writeText(text); setNotice(t("강화 순서를 복사했어. 게임에서 순서대로 설정하면 돼.", "Order copied for manual entry in the game.")); }
    catch { setNotice(t("클립보드에 접근할 수 없어.", "Clipboard is unavailable.")); }
  };
  const sharedInput = (key: string, label: string) => <label className="si-extra-field" key={key}>{label}<input aria-label={label} value={draft[key] ?? ""} onChange={event => onInput(key, event.target.value)} disabled={!enabled} aria-invalid={Boolean(errors[key])} inputMode="decimal" maxLength={128} />{errors[key] && <small className="si-error">{errors[key]}</small>}</label>;

  return <main className="ship-install" aria-label="Ship Install">
    <aside className="si-fleet"><h2>{t("함선", "Fleet")}</h2><div className="si-ships">{SHIPS.map(item => <button key={item.id} className={ship === item.id ? "is-active" : ""} aria-pressed={ship === item.id} disabled={!enabled} onClick={() => { commit(selectShipInstallShip(stateRef.current, item.id)); setSelected(1); setPending(null); }}><img src={asset(item.image)} alt="" /><span>{item.name}</span></button>)}</div>
      <div className="si-slots"><h3>Ship Loadouts</h3>{SHIP_INSTALL_SLOTS.map(number => <button key={number} aria-pressed={slot === number} className={slot === number ? "is-active" : ""} disabled={!enabled} onClick={() => { commit(selectShipInstallLoadout(stateRef.current, ship, number)); setPending(null); }}>Loadout {number}<span>{workspace.loadouts[number] ? "✓" : "—"}</span></button>)}</div>
    </aside>
    <div className="si-workspace">
      <section className="si-information"><div className="si-title"><img src={asset(SHIPS.find(item => item.id === ship)!.image)} alt="" /><h2>{ship === "Cradle" ? "The Cradle" : ship}</h2><span>{t("함선 정보", "Ship information")}</span><span className={`si-save-state ${saveStatus !== "saved" ? "si-error" : ""}`} role="status">{!enabled ? t("불러오는 중", "Loading") : saveStatus === "failed" ? t("저장 실패 · 다시 시도", "Not saved · retry") : saveStatus === "repaired" ? t("저장 데이터 일부 복구", "Stored data repaired") : t("Install 설정 자동 저장", "Install settings saved")}{saveStatus === "failed" && <button onClick={() => commit(stateRef.current)}>{t("재시도", "Retry")}</button>}</span></div>
        <div className="si-info-grid">
          <label className="si-stat">SHIP RANK<Icon src={glyph("rank")} /><input aria-label={`${ship} Rank`} inputMode="numeric" value={draft[`${ship.toLowerCase()}Rank`] ?? ""} onChange={event => onInput(`${ship.toLowerCase()}Rank`, event.target.value)} disabled={!enabled} aria-invalid={Boolean(errors[`${ship.toLowerCase()}Rank`])} placeholder="—" />{errors[`${ship.toLowerCase()}Rank`] && <small className="si-error">{errors[`${ship.toLowerCase()}Rank`]}</small>}</label>
          <label className="si-stat" title={t("배분한 포인트를 포함한 총 Install 포인트. Ship Rank와는 별개야.", "Total Install points, including allocated points. Separate from Ship Rank.")}>CURRENT INSTALLS<Icon src={glyph("installs")} /><input aria-label="Current Installs" inputMode="numeric" value={workspace.draftTotalPoints} onChange={event => edit("totalPoints", event.target.value)} disabled={!enabled} maxLength={10} /></label>
          <label className="si-stat">CREW PRINTED<Icon src={glyph("crew")} /><input aria-label={`${ship} Crew`} inputMode="numeric" value={draft[`${ship.toLowerCase()}Crew`] ?? ""} onChange={event => onInput(`${ship.toLowerCase()}Crew`, event.target.value)} disabled={!enabled} aria-invalid={Boolean(errors[`${ship.toLowerCase()}Crew`])} placeholder="—" />{errors[`${ship.toLowerCase()}Crew`] && <small className="si-error">{errors[`${ship.toLowerCase()}Crew`]}</small>}</label>
          <div className="si-stat si-evolution"><label>EVOLUTION <select aria-label="Evolution" value={workspace.evolution} disabled={!enabled} onChange={event => edit("evolution", event.target.value)}>{Array.from({ length: maxEvolution + 1 }, (_, n) => <option key={n} value={n}>{n} / {maxEvolution}</option>)}</select></label><div className="si-stars">{Array.from({ length: maxEvolution }, (_, n) => <button key={n} aria-label={`Evolution ${n + 1}`} aria-pressed={workspace.evolution > n} disabled={!enabled} onClick={() => edit("evolution", String(workspace.evolution === n + 1 ? n : n + 1))}><span>{workspace.evolution > n ? "★" : ""}</span></button>)}</div></div>
        </div>
        <details className="si-advanced"><summary>{t("추가 계산 입력", "Additional calculation inputs")}</summary><div className="si-extra-grid">{SHIP_INSTALL_EXTRA_FIELDS.map(field => sharedInput(field.key, ko ? field.label : field.enLabel))}<label className="si-check"><input type="checkbox" checked={workspace.capExpanded} disabled={!enabled} onChange={event => commit(updateShipInstallWorkspace(stateRef.current, ship, { capExpanded: event.target.checked }))} />FA1 · {t("최대 레벨 ×5", "Level cap ×5")}</label><small>{t("진화는 진행도 기록용이야. 장비·배지·진화 보정은 아직 자동 반영하지 않아.", "Evolution records progress only. Gear, badge and evolution modifiers are not applied automatically.")}</small></div></details>
      </section>
      <section className="si-toolbar"><strong>Loadout {slot}</strong><span className={remaining < 0 ? "si-error" : ""}>{t("남은 포인트", "Remaining")} <b>{remaining.toLocaleString()}</b></span><div className="si-tools"><label htmlFor="si-mode">{t("추천 방식", "Recommendation mode")}</label><select id="si-mode" value={workspace.mode} disabled={!enabled} onChange={event => commit(updateShipInstallWorkspace(stateRef.current, ship, { mode: event.target.value as RecommendationMode }))}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label[ko ? 0 : 1]}</option>)}</select><button className="si-primary" disabled={!enabled || busy || invalidDraft || remaining <= 0} onClick={generate}>{busy ? t("계산 중…", "Calculating…") : t("추천 순서 생성", "Generate order")}</button><button disabled={!freshPending?.plan.steps.length || Boolean(freshPending?.plan.errors.length)} onClick={savePlan}>{t("저장", "Save")}</button><button className="si-primary" title={t("현재 조건에서 생성하거나 저장한 추천의 모든 레벨을 웹의 현재 Install에 반영해. 실제 게임은 바뀌지 않아.", "Apply every level of the current generated or saved recommendation to this site's Installs; the game is unchanged.")} disabled={!canApplyPlan} onClick={applyPlan}>{t("추천 일괄 적용", "Apply all recommendations")}{canApplyPlan ? ` · ${plan?.steps.length ?? 0}` : ""}</button></div></section>
      {unitFallback && !invalidDraft && <p className="si-fallback-note" role="status">{t("선택한 추천 방식에 맞는 업그레이드가 없어, 나머지 효과를 가중치 1로 계산 중이야.", "No eligible upgrade matches this mode; other effects are compared with weight 1.")}</p>}
      {(notice || invalidDraft || remaining < 0) && <p className="si-notice" role="status">{invalidDraft ? t("Install 입력값을 0 이상의 정수로 확인해줘. 계산은 마지막 유효값을 유지해.", "Use non-negative integer Install values. Calculations retain the last valid value.") : remaining < 0 ? t("현재 Install 레벨 합계가 총 포인트를 초과했어.", "Allocated levels exceed total Install points.") : notice}</p>}
      <div className="si-main-grid">
        <section className="si-map-panel"><div className="si-tabs" role="tablist"><button role="tab" aria-selected={tab === "installs"} onClick={() => setTab("installs")}>Install</button><button role="tab" aria-selected={tab === "effects"} onClick={() => setTab("effects")}>{t("최종 효과", "Final effects")}</button></div>
          {tab === "installs" ? <div className="si-map" role="tabpanel">{INSTALL_ROWS.map((positions, index) => <div className="si-node-row" key={index}>{positions.map(position => { const row = evaluations.find(item => item.position === position)!; const rank = ranked.findIndex(item => item.position === position); const target = !stale ? plan?.targetLevels[position] : undefined; return <button key={position} className={`si-node ${stateClass(row, rank)} ${selected === position ? "is-selected" : ""}`} aria-label={`${position} ${row.node.name}`} aria-pressed={selected === position} title={row.unlocked && row.affordable && !row.maxed && !row.error ? t("더블클릭: 웹에서 1레벨 구매", "Double-click: buy one level on this site") : undefined} onClick={() => setSelected(position)} onDoubleClick={event => { event.preventDefault(); buy(position); }}><span className="si-node-hex"><svg viewBox="0 0 100 110" aria-hidden="true"><path d="M50 3 95 28 95 82 50 107 5 82 5 28Z" /><path className="si-inner-hex" d="M50 9 90 31 90 79 50 101 10 79 10 31Z" /></svg><Icon src={row.node.icon} /><Code position={position} />{rank >= 0 && rank < 3 && <b className="si-rank">{rank + 1}</b>}</span><span className="si-level">{row.level}{target !== undefined && target !== row.level ? ` → ${target}` : ""}<small> / {row.maxLevel}</small></span><small className="si-node-state">{row.maxed ? "✓ MAX" : !row.unlocked ? t("미해금", "Locked") : !row.affordable ? t("포인트 부족", "No points") : workspace.excluded.includes(position) ? t("추천 제외", "Excluded") : target !== undefined && target > row.level ? `${t("목표", "Target")} +${target - row.level}` : t("구매 가능", "Available")}</small></button>; })}</div>)}
             <div className="si-legend">{[["top",t("추천 1순위","Top pick")],["recommended",t("나머지 추천","Recommended")],["available",t("구매 가능","Available")],["unaffordable",t("포인트 부족","No points")],["maxed",t("완료","Maxed")],["locked",t("미해금","Locked")]].map(([style,label]) => <span className={`is-${style}`} key={style}><i />{label}</span>)}</div></div>
            : <div className="si-effects" role="tabpanel"><p>{t("선택 함선의 Install 효과 · 현재 → Loadout 목표", "Selected ship Install effects · Current → Loadout target")}</p>{combinedEffects.map(({ resource, current, target }) => <div className="si-effect-card" key={resource}><strong>{current?.label ?? target?.label}</strong><span>{current?.display ?? (target?.kind === "additive" ? "+0" : "×1")}{targetEffects && <><i>→</i><b>{target?.display ?? current?.display ?? "—"}</b></>}</span></div>)}{!combinedEffects.length && <p>{t("현재 배분된 Install이 없어.", "No Installs allocated yet.")}</p>}</div>}
           <p className="si-model-note">{t("노드 더블클릭: 웹에서 1레벨 구매 · 추천 일괄 적용도 웹 기록만 변경해. 실제 게임은 바뀌지 않아. 기본 효과 예상에는 장비·배지 등 추가 보정이 빠져 있어.", "Double-click a node to buy one level on this site. Apply all also changes only this site's records, never the game. Base-effect estimates exclude gear and badge modifiers.")}</p>
        </section>
        <aside className="si-side"><section className="si-recommendations"><h3>{t("지금 가능한 추천", "Available recommendations")}</h3><div className="si-rec-list">{ranked.slice(0, 11).map((row, index) => <button key={row.position} className={`si-rec ${stateClass(row, index)}`} onClick={() => setSelected(row.position)}><span>{index + 1}</span><Icon src={row.node.icon} /><span><strong>{row.node.name}</strong><small><Code position={row.position} /> {row.effects.map(effect => effect.label).join(" / ")}</small></span><b>›</b></button>)}{!ranked.length && <p className="si-empty">{t("추천 가능한 Install이 없어. Crew·효과 입력값과 포인트를 확인해줘.", "No recommendation. Check Crew, effect inputs and points.")}</p>}</div></section>
           <section className="si-detail"><h3>{t("노드 정보", "Node information")}</h3><div className="si-detail-name"><Icon src={detail.node.icon} /><div><Code position={detail.position} /><h4>{detail.node.name}</h4></div></div><div className="si-detail-effects"><div className="si-subtitle"><span>{t("다음 레벨 효과", "Next-level effects")}</span><strong>Lv.{detail.level} → Lv.{Math.min(detail.level + 1, detail.maxLevel)}</strong></div>{detail.effects.map((effect, index) => <div className="si-effect-card" key={index}><strong>{effect.label}</strong><span>{effect.currentDisplay}<i>→</i><b>{effect.nextDisplay}</b></span></div>)}{detail.missing.length > 0 && <p className="si-error">{t("입력 필요", "Input required")}: {detail.missing.map(key => missingInputLabel(key, language)).join(", ")}</p>}{detail.modelIssues.length > 0 && <p className="si-model-issue">{t("효과 또는 추천 효율 모델의 검증이 더 필요해. 입력값 오류는 아니야.", "The effect or recommendation model needs further verification; this is not an input error.")}</p>}{detail.node.verification?.includes("tooltip-conflict") && <p className="si-error">{t("설명문과 계산식이 달라. 확인한 계산식의 계수를 사용해.", "Tooltip differs from the calculation. Uses the verified calculation coefficient.")}</p>}</div><div className="si-detail-edit"><label>{t("현재 레벨", "Current level")}<input aria-label={t("Install 현재 레벨", "Current Install level")} value={workspace.draftLevels[detail.position]} onChange={event => edit(detail.position, event.target.value)} disabled={!enabled} inputMode="numeric" maxLength={7} /><small>/ {detail.maxLevel}</small></label><label>{t("목표 레벨", "Target level")}<output>{!stale ? plan?.targetLevels[detail.position] ?? "—" : "—"}</output></label></div><label className="si-check"><input type="checkbox" checked={workspace.excluded.includes(detail.position)} disabled={!enabled} onChange={event => commit(updateShipInstallWorkspace(stateRef.current, ship, { excluded: event.target.checked ? [...workspace.excluded, detail.position] : workspace.excluded.filter(position => position !== detail.position) }))} />{t("추천에서 제외", "Exclude from recommendations")}</label>{!detail.unlocked && <div className="si-unlock"><strong>{t("해금 조건", "Unlock condition")}</strong><span>{t("Install 배분", "Allocated Installs")} {detail.allocated} / {detail.node.unlockAt}</span></div>}{detail.error && <p className="si-error">{detail.error}</p>}<button className="si-primary si-buy" disabled={!enabled || invalidDraft || !detail.unlocked || !detail.affordable || detail.maxed || Boolean(detail.error)} onClick={() => buy(detail.position)}>{t("구매", "Buy")} · 1 pt</button></section>
        </aside>
        <LoadoutQueue language={language} context={context} plan={plan} stale={stale} onSelect={setSelected} onCopy={copyPlan} />
      </div>
    </div>
  </main>;
}
