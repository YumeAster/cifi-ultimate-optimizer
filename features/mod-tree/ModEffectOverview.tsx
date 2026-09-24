import { useMemo, type CSSProperties, type ReactNode } from "react";
import { summarizeModEffects } from "../../lib/cifi/mod-tree/effectSummary";
import type { ModState, PlayerProfile } from "../../lib/cifi/mod-tree/recommendations";
import { ModEffectIcon } from "./ModEffectCards";
import { modEffectPresentation } from "./effectPresentation";
import { recommendationCopy } from "./recommendationCopy";

export default function ModEffectOverview({ state, profile, language, ready, children, collapsed, onToggle, contentId }: { state: ModState; profile: PlayerProfile; language: "ko" | "en"; ready: boolean; children: ReactNode; collapsed: boolean; onToggle: () => void; contentId: string }) {
  const t = recommendationCopy[language];
  const summary = useMemo(() => summarizeModEffects(state, profile), [state.levels, profile]);
  const toggleLabel = collapsed
    ? language === "ko" ? "총합 펼치기" : "Expand totals"
    : language === "ko" ? "총합 접기" : "Collapse totals";
  const toggleText = collapsed
    ? language === "ko" ? "펼치기" : "Expand"
    : language === "ko" ? "접기" : "Collapse";
  return <aside className={`mod-tree-overview${collapsed ? " is-collapsed" : ""}`} aria-label={t.overview}>
    <div className="mod-tree-overview-heading"><h3 title={t.overviewHelp}>{t.overview}</h3><button type="button" className="mod-tree-overview-toggle" aria-expanded={!collapsed} aria-controls={contentId} aria-label={toggleLabel} onClick={onToggle}><span aria-hidden="true" className="mod-tree-overview-toggle-symbol">{collapsed ? "›" : "‹"}</span><span className="mod-tree-overview-toggle-mobile" aria-hidden="true">{toggleText}</span></button></div>
    <div id={contentId} className="mod-tree-overview-scroll" tabIndex={collapsed ? -1 : 0} role="region" aria-label={t.overview} hidden={collapsed}>
      {!ready ? <p>{t.loading}</p> : !summary.effects.length ? <p className="mod-rec-help">{t.overviewEmpty}</p> : <div className="mod-tree-overview-effects">{summary.effects.map(effect => {
        const palette = modEffectPresentation(effect.label, effect.iconCategory);
        return <div key={effect.target} className="upgrade-multiplier-chip mod-rec-effect-chip" style={{ "--chip-accent": palette.accent, "--chip-rgb": palette.rgb } as CSSProperties}>
          <span className="upgrade-chip-label" title={language === "ko" ? effect.labelKo : effect.label}><ModEffectIcon palette={palette} /><span className="mod-overview-effect-name">{language === "ko" ? effect.labelKo : effect.label}</span></span><strong title={effect.partial ? t.overviewPartial : undefined}><b>{effect.value}</b>{effect.partial && <small className="mod-rec-effect-uncertain">*</small>}</strong>
        </div>;
      })}</div>}
      {ready && summary.uncertain.length > 0 && <div className="mod-tree-overview-warning"><p>{t.overviewPartial}</p><ul>{summary.uncertain.map(item => <li key={item}>{item}</li>)}</ul></div>}
    </div>
    <section className="mod-tree-overview-help" aria-label={t.controls} hidden={collapsed}>{children}</section>
  </aside>;
}
