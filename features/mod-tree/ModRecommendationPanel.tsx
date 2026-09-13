import { useEffect, useMemo, useRef, useState } from "react";
import { decimalToNumber, parseCifiDecimal } from "../../lib/cifi/upgrades/decimal";
import { canPurchaseMod, formatLog, modLevelLimit, modMaximumLevel } from "../../lib/cifi/mod-tree/recommendations";
import { formatModBudget, normalizeModBudgetInput } from "../../lib/cifi/mod-tree/budget";
import type { useModRecommendations } from "./useModRecommendations";
import { recommendationCopy } from "./recommendationCopy";
import { nodeLevelText, nodeProgress } from "../../lib/cifi/mod-tree/presentation";
import { compareModEffects } from "../../lib/cifi/mod-tree/effectComparison";
import type { PlayerProfile } from "../../lib/cifi/mod-tree/recommendations";
import ModTreeTools from "./ModTreeTools";
import ModEffectCards from "./ModEffectCards";
import { UPGRADE_RESOURCE_PRESENTATION } from "../upgrade-optimizer/resourcePresentation";

type Props = { language: "ko" | "en"; selectedCode: string; recommendationCount: number; profile: PlayerProfile; onSelect: (code: string) => void; onPurchase: (code: string) => void; onValidityChange: (valid: boolean) => void; model: ReturnType<typeof useModRecommendations> };
export default function ModRecommendationPanel({ language, selectedCode, recommendationCount, profile, onSelect, onPurchase, onValidityChange, model }: Props) {
  const t = recommendationCopy[language];
  const { state, ready, ranked, evaluations } = model;
  const [budget, setBudget] = useState(() => formatModBudget(state.budget));
  const [budgetDirty, setBudgetDirty] = useState(false);
  const budgetDirtyRef = useRef(false);
  const [level, setLevel] = useState(String(state.levels[selectedCode] ?? 0));
  useEffect(() => { setBudget(formatModBudget(state.budget)); budgetDirtyRef.current = false; setBudgetDirty(false); }, [state.budget]);
  useEffect(() => { setLevel(String(state.levels[selectedCode] ?? 0)); }, [selectedCode, state.levels]);
  let budgetError = false, levelError = false;
  // Keep incomplete typed input separate until Enter/blur. Stored balances,
  // including restored saves and purchase remainders, are already rounded.
  if (budgetDirty) try { normalizeModBudgetInput(budget); } catch { budgetError = true; }
  const readLevel = (code: string, raw: string) => {
    if (raw.length > 64) throw new Error("Level input too long");
    const n = decimalToNumber(parseCifiDecimal(raw));
    if (!modLevelLimit(code) || !Number.isSafeInteger(n) || n < 0 || n > modLevelLimit(code)) throw new Error("Invalid level");
    return n;
  };
  try { readLevel(selectedCode, level); } catch { levelError = true; }
  const paused = !ready || budgetDirty || levelError;
  useEffect(() => { onValidityChange(!paused); }, [paused, onValidityChange]);
  const selected = evaluations.find(row => row.code === selectedCode);
  const effectPairs = useMemo(() => compareModEffects(selectedCode, state, profile), [selectedCode, state.levels, profile]);
  const commitBudget = () => {
    if (!ready || !budgetDirtyRef.current) return;
    try {
      const rounded = normalizeModBudgetInput(budget);
      budgetDirtyRef.current = false; setBudgetDirty(false); setBudget(rounded);
      model.commit({ ...state, budget: rounded });
    } catch { /* Invalid draft stays visible; the saved balance is unchanged. */ }
  };
  return <div className="mod-recommendation-panel">
    <div className="mod-rec-controls">
    <h3>{t.title}</h3>
    {(!ready || model.storageFailed) && <p role="status" className={model.storageFailed ? "mod-rec-error" : "mod-rec-help"}>{!ready ? t.loading : t.storageFailed}</p>}
    <div className="mod-rec-budget-controls"><label className="mod-rec-field"><span>{t.budget}</span><input aria-label={t.budget} aria-invalid={budgetError} title={t.budgetHelp} value={budget} disabled={!ready} onBlur={commitBudget} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitBudget(); } }} onChange={event => {
      const value = event.target.value; setBudget(value); model.invalidate();
      budgetDirtyRef.current = value !== formatModBudget(state.budget); setBudgetDirty(budgetDirtyRef.current);
    }} /></label>
    <label className="mod-rec-field"><span title={t.costHelp}>{t.costImportance} <b>{state.costImportance}%</b></span><input type="range" aria-label={t.costImportance} min="0" max="100" step="5" value={state.costImportance} disabled={!ready || budgetDirty} onChange={event => { model.commit({ ...state, costImportance: Number(event.target.value) }); }} /></label></div>
    {budgetError && <p role="alert" className="mod-rec-error">{t.invalidBudget}</p>}
    {budgetDirty && !budgetError && <p role="status" className="mod-rec-help">{t.pendingBudget}</p>}
    </div>
    <section className="mod-rec-section mod-rec-recommendations"><h4>{t.next} <small>{Math.min(ranked.length, recommendationCount)} / {recommendationCount}</small></h4>
      <div className="mod-rec-scroll" tabIndex={0} role="region" aria-label={t.next}>
      {paused ? <p className="mod-rec-help">{!ready ? t.loading : budgetDirty && !budgetError ? t.pendingBudget : t.invalid}</p> : ranked.length ? <ol className="mod-rec-list">{ranked.slice(0, recommendationCount).map((row, index) => <li key={row.code}><button type="button" onClick={() => onSelect(row.code)} className={`${row.code === selectedCode ? "is-current" : ""} ${index === 0 ? "is-top" : ""}`}><span className="mod-rec-rank">{index === 0 ? t.first : `#${index + 1}`}</span><span><code className="mod-tree-code-token">{row.code}</code> {row.name}</span><small>{row.priority ? t.priority : `${t.score} ${row.score.toPrecision(5)}`} · {formatLog(row.costLog)} MP</small></button></li>)}</ol> : <p className="mod-rec-help">{t.empty}</p>}
      {evaluations.some(row => row.error && row.unlocked && !row.maxed) && <p className="mod-rec-error" role="status">{t.calculationsFailed}</p>}
      </div>
    </section>
    <section className="mod-rec-node-pane" aria-label={t.nodeInfo}>
    <h4 className="mod-rec-pane-heading">{t.nodeInfo}</h4>
    <div className="mod-rec-node-content">
    {selected && <section className="mod-rec-section mod-rec-selected" aria-label={selectedCode}>
      <h4><code className="mod-tree-code-token">{selected.code}</code> {selected.name}</h4>
      <ModEffectCards effects={effectPairs} code={selectedCode} language={language} level={selected.level} nextLevel={effectPairs[0]?.nextLevel ?? Math.min(selected.level + 1, selected.maxLevel)} />
      <div className="mod-rec-level-stats"><label className="mod-rec-field"><span>{t.level}</span><span className="mod-rec-level-control"><input aria-label={`${selectedCode} ${t.level}`} inputMode="numeric" aria-invalid={levelError} value={level} disabled={!ready} onChange={event => {
        const value = event.target.value; setLevel(value); model.invalidate();
        try { const parsed = readLevel(selectedCode, value); model.commit({ ...state, levels: { ...state.levels, [selectedCode]: parsed } }); } catch { /* Invalid input must not become level zero. */ }
      }} /><span className="mod-rec-level-limit">/ {nodeLevelText(0, modMaximumLevel(selectedCode)).split("/")[1]}</span></span></label>
      <div className="mod-rec-power-column"><div className="mod-rec-field mod-rec-power"><span>{t.power}</span><output aria-label={t.power}>{selected.error || selected.maxed ? "—" : selected.powerLog.toPrecision(6)}</output></div></div></div>
      {levelError && <p role="alert" className="mod-rec-error">{t.invalidLevel}</p>}
      <label className="mod-rec-check"><input type="checkbox" checked={selected.ignored} disabled={!ready} onChange={event => { model.commit({ ...state, ignored: event.target.checked ? [...state.ignored, selectedCode] : state.ignored.filter(c => c !== selectedCode) }); }} />{t.ignored}</label>
      {selected.unlocked && (selected.maxed || !selected.affordable) && <p className="mod-rec-help">{selected.maxed ? t.states[nodeProgress(selected, modMaximumLevel(selectedCode))] : t.short}</p>}
      {!selected.unlocked && <section className="mod-rec-unlock-conditions"><h5>{t.unlockConditions}</h5><div>{selected.missing.map(code => <button type="button" className="mod-rec-code" title={evaluations.find(row => row.code === code)?.name} onClick={() => onSelect(code)} key={code}>{code}</button>)}</div></section>}
      {selected.error && <p className="mod-rec-error" role="status">{t.unavailable}: {selected.error}</p>}
    </section>}
    </div>
    <div className="mod-rec-purchase-bar"><button type="button" className="mod-rec-action mod-rec-purchase" title={t.purchaseHelp} disabled={paused || !canPurchaseMod(selected)} onClick={() => onPurchase(selectedCode)}><b>{t.applyOne}</b><span>{t.price} : {selected?.cost ? formatLog(selected.costLog) : "—"}<img src={UPGRADE_RESOURCE_PRESENTATION.modPoints.icon} alt="MP" /></span></button></div>
    </section>
    <ModTreeTools language={language} paused={paused} onSelect={onSelect} model={model} />
  </div>;
}
