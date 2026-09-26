import { ArrowRightOutlined, UnlockOutlined, ToolOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import type { CSSProperties } from "react";
import type { ModEffectComparison } from "../../lib/cifi/mod-tree/effectComparison";
import { modEffectPresentation, type ModEffectPresentation } from "./effectPresentation";
import { recommendationCopy } from "./recommendationCopy";
import { modContentEffect } from "../../lib/cifi/mod-tree/contentEffects";
import { getInputFieldLabel } from "../../app/content/inputCopy";
import ResourceIcon from "../upgrade-optimizer/ResourceIcon";

export function ModEffectIcon({ palette }: { palette: ModEffectPresentation }) {
  return <ResourceIcon className={palette.generator || palette.nodeIcon ? "generator-source-icon" : ""} icon={palette.icon} color={palette.accent} />;
}

export default function ModEffectCards({ code, effects, language, level, nextLevel }: { code: string; effects: ModEffectComparison[]; language: "ko" | "en"; level: number; nextLevel: number }) {
  const t = recommendationCopy[language];
  const content = effects.some(effect => effect.target !== "unverified") ? undefined : modContentEffect(code);
  const visible = content ? [] : effects;
  return <section className="mod-rec-next-effects" aria-label={t.effects}>
    <h5>{t.effects}</h5>
    <p className="mod-rec-effect-levels">Lv.{level} <ArrowRightOutlined aria-hidden="true" /> Lv.{nextLevel}</p>
    {effects.length || content ? <div className="upgrade-multiplier-grid mod-rec-effect-grid">{visible.map(effect => {
      const palette = modEffectPresentation(effect.label, effect.iconCategory);
      const needed = effect.missingInput ? getInputFieldLabel(effect.missingInput, language) : undefined;
      return <div className="upgrade-multiplier-chip mod-rec-effect-chip" key={effect.target} style={{ "--chip-accent": palette.accent, "--chip-rgb": palette.rgb } as CSSProperties}>
        <span className="upgrade-chip-label">
          <ModEffectIcon palette={palette} />
          {effect.operation === "unlock" ? t.contentUnlock : language === "ko" ? effect.labelKo : effect.label}
        </span>
        {effect.operation === "unlock" ? <strong>{language === "ko" ? effect.labelKo : effect.label}</strong> : effect.target.startsWith("unmodeled") ? <span className="mod-rec-game-description">{effect.source?.observed.join(" · ")}</span> : <strong title={effect.uncertain ? t.effectUncertain : t.effectValueHelp}><span>{effect.current}</span> <ArrowRightOutlined aria-hidden="true" /> <b>{effect.next}</b></strong>}
        {effect.uncertain && <small className="mod-rec-effect-uncertain">{effect.missingInput ? `${t.inputNeeded}: ${needed}` : t.needsCheck}</small>}
        {effect.source?.basis.startsWith("wiki") && <small className="mod-rec-effect-uncertain"><a href={effect.source.evidence} target="_blank" rel="noreferrer">Wiki</a></small>}
      </div>;
    })}{content && <div className="upgrade-multiplier-chip mod-rec-effect-chip mod-rec-content-effect" style={{ "--chip-accent": "#ffc85c", "--chip-rgb": "255,200,92" } as CSSProperties}>
      <span className="upgrade-chip-label">{content.kind === "unlock" ? <UnlockOutlined aria-hidden="true" /> : content.kind === "feature" ? <ToolOutlined aria-hidden="true" /> : <QuestionCircleOutlined aria-hidden="true" />}{content.kind === "unlock" ? t.contentUnlock : content.kind === "feature" ? t.featureUpgrade : t.needsCheck}</span>
      <strong>{content[language]}</strong>
    </div>}</div> : <p className="mod-rec-help">{t.noEffects}</p>}
  </section>;
}
