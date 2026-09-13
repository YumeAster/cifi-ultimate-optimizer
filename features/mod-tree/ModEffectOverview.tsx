import { useMemo, type CSSProperties, type ReactNode } from "react";
import { summarizeModEffects } from "../../lib/cifi/mod-tree/effectSummary";
import type { ModState, PlayerProfile } from "../../lib/cifi/mod-tree/recommendations";
import { ModEffectIcon } from "./ModEffectCards";
import { modEffectPresentation } from "./effectPresentation";
import { recommendationCopy } from "./recommendationCopy";

export default function ModEffectOverview({ state, profile, language, ready, children }: { state: ModState; profile: PlayerProfile; language: "ko" | "en"; ready: boolean; children: ReactNode }) {
  const t = recommendationCopy[language];
  const summary = useMemo(() => summarizeModEffects(state, profile), [state.levels, profile]);
  return <aside className="mod-tree-overview" aria-label={t.overview}>
    <h3 title={t.overviewHelp}>{t.overview}</h3>
    <div className="mod-tree-overview-scroll" tabIndex={0} role="region" aria-label={t.overview}>
      {!ready ? <p>{t.loading}</p> : !summary.effects.length ? <p className="mod-rec-help">{t.overviewEmpty}</p> : <div className="mod-tree-overview-effects">{summary.effects.map(effect => {
        const palette = modEffectPresentation(effect.label, effect.iconCategory);
        return <div key={effect.target} className="upgrade-multiplier-chip mod-rec-effect-chip" style={{ "--chip-accent": palette.accent, "--chip-rgb": palette.rgb } as CSSProperties}>
          <span className="upgrade-chip-label" title={language === "ko" ? effect.labelKo : effect.label}><ModEffectIcon palette={palette} /><span className="mod-overview-effect-name">{language === "ko" ? effect.labelKo : effect.label}</span></span><strong title={effect.partial ? t.overviewPartial : undefined}><b>{effect.value}</b>{effect.partial && <small className="mod-rec-effect-uncertain">*</small>}</strong>
        </div>;
      })}</div>}
      {ready && summary.uncertain.length > 0 && <div className="mod-tree-overview-warning"><p>{t.overviewPartial}</p><ul>{summary.uncertain.map(item => <li key={item}>{item}</li>)}</ul></div>}
    </div>
    <section className="mod-tree-overview-help" aria-label={t.controls}>{children}</section>
  </aside>;
}
