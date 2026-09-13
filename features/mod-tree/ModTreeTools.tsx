import { Modal } from "antd";
import { useEffect, useRef, useState } from "react";
import { decimalToNumber, parseCifiDecimal } from "../../lib/cifi/upgrades/decimal";
import { formatModBudget } from "../../lib/cifi/mod-tree/budget";
import { MOD_RECOMMENDATION_SOURCE, MOD_RECOMMENDATION_VERSION, modLevelLimit, restoreModState } from "../../lib/cifi/mod-tree/recommendations";
import type { useModRecommendations } from "./useModRecommendations";
import { recommendationCopy } from "./recommendationCopy";

type Tool = "plan" | "bulk" | "backup" | "source";
type Props = { language: "ko" | "en"; paused: boolean; onSelect: (code: string) => void; model: ReturnType<typeof useModRecommendations> };

/** Auxiliary tools live outside the fixed node/recommendation panes. */
export default function ModTreeTools({ language, paused, onSelect, model }: Props) {
  const t = recommendationCopy[language];
  const { state, ready, ranked, plan, busy } = model;
  const [active, setActive] = useState<Tool | null>(null);
  const [steps, setSteps] = useState(25);
  const [bulk, setBulk] = useState("");
  const [notice, setNotice] = useState("");
  const operation = useRef(0);
  const toolbar = useRef<HTMLElement>(null);
  useEffect(() => () => { operation.current++; }, []);
  const titles = { plan: t.planTitle, bulk: t.bulk, backup: t.backupTitle, source: t.source };
  const close = () => { operation.current++; setActive(null); setNotice(""); };
  const exportBackup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "cifi-mod-tree.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <nav className="mod-rec-tools" ref={toolbar} aria-label={t.toolsLabel}>
      {(["plan", "bulk", "backup", "source"] as const).map(tool => <button key={tool} type="button" onClick={() => { setActive(tool); setNotice(""); }}>{titles[tool]}</button>)}
    </nav>
    <Modal open={active !== null} centered title={active ? titles[active] : ""} footer={null} onCancel={close} width={580} className="mod-rec-tools-modal" getContainer={() => toolbar.current?.closest<HTMLElement>(".dashboard-shell") ?? document.body}>
      <div className="mod-recommendation-panel mod-rec-dialog">
        {active === "plan" && <section aria-label={t.planTitle}>
          <div className="mod-rec-plan-actions"><label>{t.steps}<select aria-label={t.steps} value={steps} onChange={event => { setSteps(Number(event.target.value)); model.invalidate(); }}><option>10</option><option>25</option><option>50</option><option>100</option><option>200</option></select></label><button type="button" disabled={paused || busy || !ranked.length} onClick={() => void model.calculate(steps).catch(() => setNotice(t.calculationsFailed))}>{busy ? t.computing : t.buildPlan}</button></div>
          {plan && !paused && <div className="mod-rec-plan"><dl className="mod-rec-stats"><div><dt>{t.spent}</dt><dd>{formatModBudget(plan.spent)} MP</dd></div><div><dt>{t.remaining}</dt><dd>{formatModBudget(plan.next.budget)} MP</dd></div></dl><ol>{plan.steps.map((step, index) => <li key={index}><button type="button" className="mod-rec-code" onClick={() => { onSelect(step.code); close(); }}>{step.code}</button> {step.from} → {step.to} <small>{formatModBudget(step.cost)} MP</small></li>)}</ol><p className="mod-rec-help">{plan.stopped === "limit" ? t.planLimit : t.planEnd}</p><button type="button" className="mod-rec-action" disabled={!plan.steps.length} onClick={() => model.commit(plan.next, true)}>{t.applyPlan}</button></div>}
          <p className="mod-rec-help">{t.roundedPlan}</p>
          <button type="button" className="mod-rec-action" disabled={!model.undo || paused} onClick={() => { if (model.undo) model.commit(model.undo); }}>{t.undo}</button>
          <p className="mod-rec-help">{t.localOnly}</p>
        </section>}
        {active === "bulk" && <section aria-label={t.bulk}>
          <p className="mod-rec-help">{t.bulkHelp}</p><textarea aria-label={t.bulk} placeholder={'A01=5\nB01=20'} value={bulk} onChange={event => setBulk(event.target.value)} />
          <button type="button" disabled={paused || !bulk.trim()} onClick={() => {
            try {
              const levels = { ...state.levels }, seen = new Set<string>();
              for (const line of bulk.trim().split(/\r?\n/)) {
                const match = line.trim().match(/^([A-Za-z0-9]+)\s*=\s*(\S+)$/);
                if (!match || seen.has(match[1]) || match[2].length > 64) throw new Error("Invalid bulk row");
                const level = decimalToNumber(parseCifiDecimal(match[2]));
                if (!modLevelLimit(match[1]) || !Number.isSafeInteger(level) || level < 0 || level > modLevelLimit(match[1])) throw new Error("Invalid level");
                seen.add(match[1]); levels[match[1]] = level;
              }
              model.commit({ ...state, levels }); setBulk(""); setNotice(t.bulkApplied);
            } catch { setNotice(t.bulkInvalid); }
          }}>{t.bulkApply}</button>
        </section>}
        {active === "backup" && <section className="mod-rec-backups" aria-label={t.backupTitle}>
          <button type="button" disabled={!ready} onClick={exportBackup}>{t.backup}</button>
          <label>{t.restore}<input type="file" accept="application/json,.json" disabled={paused} onChange={async event => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            const request = ++operation.current, revision = model.getRevision();
            try {
              if (file.size > 256_000) throw new Error("Backup too large");
              const imported = restoreModState(JSON.parse(await file.text()));
              if (operation.current !== request) return;
              if (model.getRevision() !== revision) { setNotice(t.restoreCancelled); return; }
              model.commit(imported); setNotice(t.restored);
            } catch { if (operation.current === request) setNotice(t.restoreInvalid); }
          }} /></label>
        </section>}
        {active === "source" && <section aria-label={t.source}><p>{MOD_RECOMMENDATION_VERSION}</p><p className="mod-rec-help">{t.method}</p><p className="mod-rec-help">{t.profileHelp}</p><p className="mod-rec-help">{t.effectValueHelp}</p><p className="mod-rec-help">{t.budgetHelp}</p><a href={MOD_RECOMMENDATION_SOURCE} target="_blank" rel="noreferrer">Mod Tree Cultivator · ModCalc Local / ModRef Local</a><p>{language === "ko" ? "효과 표시: 게임 v0.7.3.63 캡처 우선 · Wiki 보조 대조" : "Effect display: game v0.7.3.63 captures first · Wiki cross-check"}</p><a href="https://cifi.fandom.com/wiki/Loop_Modifications" target="_blank" rel="noreferrer">CIFI Wiki · Loop Modifications</a></section>}
        {notice && <p role="status" className="mod-rec-help">{notice}</p>}
      </div>
    </Modal>
  </>;
}
