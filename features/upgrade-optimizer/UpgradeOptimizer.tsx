"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { App as AntApp, Badge, Button, Input, InputNumber, Popconfirm, Progress, Tag, Tooltip } from "antd";
import { ArrowRightOutlined, CheckCircleFilled, CloseOutlined, DollarCircleOutlined, LockOutlined, ReloadOutlined, SketchOutlined, ThunderboltFilled } from "@ant-design/icons";
import { evaluateUpgrade, parseCifiNumber, rankUpgrades, simulateBudget } from "../../lib/cifi/upgrades/engine";
import { addCifiDecimals, compareCifiDecimals, decimalToString, parseCifiDecimal, subtractCifiDecimals } from "../../lib/cifi/upgrades/decimal";
import { DIAMOND_UPGRADES, TOKEN_UPGRADES, UPGRADE_RULESET_META } from "../../lib/cifi/upgrades/rules";
import type { Currency, GeneratorId, OptimizerState, ShipId, UpgradeCategory, UpgradeRule, UpgradeWeights } from "../../lib/cifi/upgrades/types";
import { getGeneratorPresentation, getUpgradeVisualResources, UPGRADE_RESOURCE_PRESENTATION, type UpgradeVisualResource } from "./resourcePresentation";
import { blankStoredProfile, restoreOptimizerProfile, type StoredOptimizerProfile } from "../../lib/cifi/upgrades/profile";

type Language = "ko" | "en";
type OptimizerTab = "diamonds" | "tokens";
type UpgradeOptimizerProps = {
  currency: OptimizerTab;
  language: Language;
  profile: Record<string, string>;
  onSaveStatusChange?: (status: "loading" | "saved" | "failed") => void;
};

const storageKey = "cifi-ultimate.upgrade-optimizer.v1";
const generatorIds: readonly GeneratorId[] = ["MK1", "MK2", "MK3", "MK4", "MK5", "MK6", "MK7", "MK8"];
const shipIds: readonly ShipId[] = ["Cradle", "Auxesia", "Zagreus", "Hephaestus", "Demeter", "Koios", "Zeus"];

type UpgradeCardStyle = CSSProperties & {
  "--upgrade-accent": string;
  "--upgrade-accent-rgb": string;
  "--upgrade-rail": string;
};

function GeneratorSourceIcon({ generator }: Readonly<{ generator: GeneratorId }>) {
  const palette = getGeneratorPresentation(generator);
  return <img className="generator-source-icon" aria-hidden="true" src={UPGRADE_RESOURCE_PRESENTATION.generator.icon} alt="" style={{
    "--generator-icon-accent": palette.accent,
  } as CSSProperties} />;
}

function upgradeCardStyle(resources: readonly UpgradeVisualResource[], generator?: GeneratorId, oneTimeAccent?: string): UpgradeCardStyle {
  const primary = generator ? getGeneratorPresentation(generator) : UPGRADE_RESOURCE_PRESENTATION[resources[0]];
  const rail = resources.length > 1
    ? `linear-gradient(180deg, ${resources.map((resource) => UPGRADE_RESOURCE_PRESENTATION[resource].accent).join(", ")})`
    : primary.accent;
  return { "--upgrade-accent": oneTimeAccent ?? primary.accent, "--upgrade-accent-rgb": primary.rgb, "--upgrade-rail": oneTimeAccent ?? rail };
}

type EffectChip = Readonly<{
  key: string;
  resource: UpgradeVisualResource;
  label: string;
  kind: "multiplier" | "additive";
  factors?: readonly number[];
  amountPerLevel?: number;
  generator?: GeneratorId;
}>;

const weightKeys = ["cells", "modPoints", "shards", "research", "academyPoints", "materials"] as const;

function product(values: readonly number[]): number {
  return values.reduce((result, value) => result * value, 1);
}

function multiplierAtLevel(factors: readonly number[], level: number): number {
  return product(factors) ** Math.max(0, level);
}

function generatorIdsIn(value: string): GeneratorId[] {
  return [...value.matchAll(/MK([1-8])/g)].map((match) => `MK${match[1]}` as GeneratorId);
}

function getEffectChips(rule: UpgradeRule): readonly EffectChip[] {
  if (rule.chestReward) {
    return [{
      key: `${rule.chestReward.currency}-chest-reward`,
      resource: rule.chestReward.currency,
      label: rule.chestReward.chest,
      kind: "additive",
      amountPerLevel: rule.chestReward.amountPerLevel,
    }];
  }
  const generatorIds = generatorIdsIn(rule.id);
  if (rule.category === "generator" || /^MK[1-8]$/.test(rule.id)) {
    const generator = generatorIds[0] ?? (rule.id as GeneratorId);
    return [{ key: generator, resource: "generator", label: getGeneratorPresentation(generator).label, kind: "multiplier", factors: rule.effects.cells, generator }];
  }
  if (generatorIds.length > 1) {
    return generatorIds.map((generator, index) => ({ key: generator, resource: "generator", label: getGeneratorPresentation(generator).label, kind: "multiplier", factors: [rule.effects.cells[index] ?? 1], generator }));
  }
  if (["AllGens", "GMPRP", "GSHAP", "Token", "Token2", "Token3", "Daily", "Daily2"].includes(rule.id) && rule.effects.cells.length) {
    const nonGenerator = weightKeys
      .filter((key) => key !== "cells" && rule.effects[key].length)
      .map((key) => ({ key, resource: key as UpgradeVisualResource, label: UPGRADE_RESOURCE_PRESENTATION[key].label, kind: "multiplier" as const, factors: rule.effects[key] }));
    return [{ key: "all-generators", resource: "generator", label: "All Generators", kind: "multiplier", factors: [rule.effects.cells[0] ?? 1] }, ...nonGenerator];
  }
  const fromEffects = weightKeys
    .filter((key) => rule.effects[key].length)
    .map((key) => ({ key, resource: key === "cells" ? "cells" : key as UpgradeVisualResource, label: UPGRADE_RESOURCE_PRESENTATION[key].label, kind: "multiplier" as const, factors: rule.effects[key] }));
  if (fromEffects.length) return fromEffects;
  const fallback = getUpgradeVisualResources(rule)[0];
  return [{ key: fallback, resource: fallback, label: UPGRADE_RESOURCE_PRESENTATION[fallback].label, kind: "multiplier", factors: [1] }];
}

function oneTimeAccent(id: string): string {
  const first = id.charCodeAt(0) || 65;
  return `hsl(${(first * 31) % 360} 82% 62%)`;
}

const copy = {
  ko: {
    budget: "보유 재화", time: "일일 플레이 시간", hours: "시간", profileLink: "진행도 연동", profileLinkNote: "플레이어 진행도와 함선 승무원 입력으로 해금을 판정합니다.", generators: "MK", ships: "함선",
    next: "다음 추천", noNext: "현재 예산으로 구매할 수 있는 업그레이드가 없습니다.", enterBudget: "보유 재화를 입력하면 구매 순서를 계산합니다.",
    currentLevel: "현재 레벨", nextCost: "다음 비용", power: "효과 배율", efficiency: "효율 점수", locked: "잠김", maxed: "완료", available: "구매 가능", suggested: "추천",
    plan: "예산 구매 계획", purchases: "회 구매", spent: "사용", remaining: "잔여", applyOne: "추천 1회 반영", applyPlan: "계획 전체 반영", reset: "현재 재화 초기화", resetConfirm: "이 재화의 예산과 모든 업그레이드 레벨을 초기화할까요?",
    planEmpty: "구매 가능한 항목이 없습니다.", planLimited: "계산 한도 5,000회에서 멈췄습니다. 계획을 반영한 뒤 남은 예산을 다시 계산해 주세요.",
    category: { generator: "Generator", special: "특수", oneTimer: "일회성", largeOneTimer: "대형 일회성", tier1: "Tier 1", tier2: "Tier 2", tier3: "Tier 3" },
    unlockGenerator: "진행도 입력에서 {id} 구매 기록이 필요합니다.", unlockShip: "함선 진행도에서 {id} 승무원이 필요합니다.", unlockTier2: "Tier 1 누적 레벨 10,000이 필요합니다.", unlockTier3: "Tier 1·2 누적 레벨 30,000이 필요합니다.", unlockLarge: "24개 일회성 다이아 업그레이드를 모두 구매해야 합니다.",
    invalidBudget: "0 이상의 숫자 또는 과학 표기 형식으로 입력하세요.", saved: "옵티마이저 상태를 이 기기에 저장했습니다.", applied: "구매 결과를 현재 레벨과 잔여 예산에 반영했습니다.",
  },
  en: {
    budget: "Available currency", time: "Daily play time", hours: "hours", profileLink: "Progress link", profileLinkNote: "Unlocks use Player Progress and ship Crew inputs.", generators: "MK", ships: "Ships",
    next: "Next recommendation", noNext: "No upgrade is affordable with the current budget.", enterBudget: "Enter a budget to calculate the purchase order.",
    currentLevel: "Current level", nextCost: "Next cost", power: "Power", efficiency: "Efficiency", locked: "Locked", maxed: "Complete", available: "Available", suggested: "Suggested",
    plan: "Budget purchase plan", purchases: "purchases", spent: "Spent", remaining: "Remaining", applyOne: "Apply one purchase", applyPlan: "Apply full plan", reset: "Reset this currency", resetConfirm: "Reset this currency budget and every upgrade level?",
    planEmpty: "No upgrades can be purchased.", planLimited: "Stopped at the 5,000 purchase calculation limit. Apply the plan, then calculate the remaining budget again.",
    category: { generator: "Generator", special: "Special", oneTimer: "One-Timer", largeOneTimer: "Large One-Timer", tier1: "Tier 1", tier2: "Tier 2", tier3: "Tier 3" },
    unlockGenerator: "Record a {id} purchase in Player Progress.", unlockShip: "Enter Crew for {id} in Ship Progress.", unlockTier2: "Requires 10,000 total Tier 1 levels.", unlockTier3: "Requires 30,000 total Tier 1 and 2 levels.", unlockLarge: "Requires all 24 Diamond One-Timers.",
    invalidBudget: "Enter zero or more using a number or scientific notation.", saved: "Optimizer state saved on this device.", applied: "Applied the purchases to current levels and remaining budget.",
  },
} as const;

function profileNumber(value: string | undefined): number {
  if (!value?.trim()) return 0;
  try { return Math.max(0, parseCifiNumber(value)); } catch { return 0; }
}

function formatNumber(value: number | string): string {
  if (typeof value === "string") {
    const normalized = decimalToString(parseCifiDecimal(value));
    if (normalized.includes("e")) return normalized;
    const [whole, fraction] = normalized.split(".");
    return `${new Intl.NumberFormat("en-US").format(BigInt(whole))}${fraction ? `.${fraction}` : ""}`;
  }
  if (!Number.isFinite(value)) return "∞";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e9 || magnitude < 0.001) return value.toExponential(3).replace("e+", "e");
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: magnitude < 10 ? 4 : 2 }).format(value);
}

function budgetValue(raw: string) {
  if (!raw.trim()) return { value: 0, exact: "0", invalid: false };
  try {
    const exact = parseCifiDecimal(raw);
    const value = parseCifiNumber(raw);
    return { value: value >= 0 ? value : 0, exact: decimalToString(exact), invalid: exact.coefficient < 0n };
  } catch { return { value: 0, exact: "0", invalid: true }; }
}

export default function UpgradeOptimizer({ currency: tab, language, profile, onSaveStatusChange }: UpgradeOptimizerProps) {
  const { message } = AntApp.useApp();
  const currency: Currency = tab === "diamonds" ? "diamond" : "token";
  const rules = currency === "diamond" ? DIAMOND_UPGRADES : TOKEN_UPGRADES;
  const text = copy[language];
  const [stored, setStored] = useState<StoredOptimizerProfile>(blankStoredProfile);
  const storedRef = useRef(stored);
  const [storageFailed, setStorageFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [previewSteps, setPreviewSteps] = useState<Record<string, number | "max">>({});

  useEffect(() => {
    let next = blankStoredProfile();
    let failed = false;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        next = restoreOptimizerProfile(JSON.parse(raw));
      }
    } catch { failed = true; }
    queueMicrotask(() => {
      storedRef.current = next;
      setStored(next);
      setStorageFailed(failed);
      setReady(true);
      onSaveStatusChange?.(failed ? "failed" : "saved");
    });
  }, [onSaveStatusChange]);

  const commit = (updater: (current: StoredOptimizerProfile) => StoredOptimizerProfile, announce = false) => {
    if (!ready) return;
    const next = updater(storedRef.current);
    storedRef.current = next;
    setStored(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageFailed(false);
      onSaveStatusChange?.("saved");
      if (announce) message.success(text.saved);
    } catch {
      setStorageFailed(true);
      onSaveStatusChange?.("failed");
    }
  };

  const weights = useMemo<UpgradeWeights>(() => ({
    cells: profileNumber(profile.cells) || 1,
    modPoints: profileNumber(profile.modPoints) || 1,
    shards: profileNumber(profile.shards) || 1,
    research: profileNumber(profile.research) || 1,
    academyPoints: profileNumber(profile.academyPoints) || 1,
    materials: profileNumber(profile.materials) || 1,
  }), [profile]);

  const optimizerState = useMemo<OptimizerState>(() => ({
    levels: stored.levels,
    generators: Object.fromEntries(generatorIds.map((id, index) => {
      const purchased = profileNumber(profile[`manualMk${index + 1}`]);
      return [id, { unlocked: purchased > 0, purchased }];
    })),
    ships: Object.fromEntries(shipIds.map((id) => {
      const crew = profileNumber(profile[`${id.toLowerCase()}Crew`]);
      return [id, { unlocked: crew > 0, crew }];
    })),
    longRunHours: stored.longRunHours,
  }), [profile, stored.levels, stored.longRunHours]);

  const parsedBudget = useMemo(() => budgetValue(stored.budgets[currency]), [stored.budgets, currency]);
  const ranked = useMemo(() => rankUpgrades(currency, optimizerState, weights), [currency, optimizerState, weights]);
  const suggestion = parsedBudget.invalid ? undefined : ranked.find((evaluation) => compareCifiDecimals(parseCifiDecimal(evaluation.costExact), parseCifiDecimal(parsedBudget.exact)) <= 0);
  const evaluations = useMemo(() => rules.map((rule) => evaluateUpgrade(rule, optimizerState, weights)), [optimizerState, rules, weights]);
  const plan = useMemo(() => {
    if (parsedBudget.invalid || parsedBudget.value <= 0) return undefined;
    return simulateBudget(currency, parsedBudget.exact, optimizerState, weights, { maxSteps: 5_000 });
  }, [currency, optimizerState, parsedBudget, weights]);

  const planSummary = useMemo(() => {
    const byId = new Map<string, { name: string; count: number; cost: string }>();
    for (const purchase of plan?.purchases ?? []) {
      const current = byId.get(purchase.id) ?? { name: purchase.name, count: 0, cost: "0" };
      current.count += 1;
      current.cost = decimalToString(addCifiDecimals(parseCifiDecimal(current.cost), parseCifiDecimal(purchase.cost)));
      byId.set(purchase.id, current);
    }
    return [...byId.entries()].map(([id, summary]) => ({ id, ...summary }));
  }, [plan]);

  const categoryOrder: readonly UpgradeCategory[] = currency === "diamond"
    ? ["generator", "special", "oneTimer", "largeOneTimer"]
    : ["tier1", "tier2", "tier3"];
  const unlockedGenerators = generatorIds.filter((id) => optimizerState.generators[id]?.unlocked).length;
  const unlockedShips = shipIds.filter((id) => optimizerState.ships[id]?.unlocked).length;

  const updateLevel = (id: string, maxLevel: number, value: number | null) => commit((current) => ({
    ...current,
    levels: { ...current.levels, [currency]: { ...current.levels[currency], [id]: Math.min(maxLevel, Math.max(0, Math.floor(value ?? 0))) } },
  }));
  const applySuggestion = () => {
    if (!suggestion) return;
    commit((current) => ({
      ...current,
      budgets: { ...current.budgets, [currency]: decimalToString(subtractCifiDecimals(parseCifiDecimal(parsedBudget.exact), parseCifiDecimal(suggestion.costExact))) },
      levels: { ...current.levels, [currency]: { ...current.levels[currency], [suggestion.rule.id]: suggestion.level + 1 } },
    }));
    message.success(text.applied);
  };
  const applyPlan = () => {
    if (!plan?.purchases.length) return;
    commit((current) => ({
      ...current,
      budgets: { ...current.budgets, [currency]: plan.remainingBudget },
      levels: { ...current.levels, [currency]: { ...plan.finalLevels } },
    }));
    message.success(text.applied);
  };
  const resetCurrency = () => commit((current) => ({
    ...current,
    budgets: { ...current.budgets, [currency]: "0" },
    levels: { ...current.levels, [currency]: {} },
  }), true);

  const getUnlockReason = (evaluation: (typeof evaluations)[number]) => {
    const unlock = evaluation.rule.unlock;
    if (unlock.kind === "generator") return text.unlockGenerator.replace("{id}", unlock.id);
    if (unlock.kind === "ship") return text.unlockShip.replace("{id}", unlock.id);
    if (unlock.kind === "tier") return unlock.tier === 2 ? text.unlockTier2 : text.unlockTier3;
    return text.unlockLarge;
  };

  return <section className={`upgrade-optimizer upgrade-optimizer-${currency}`} aria-busy={!ready}>
    <div className="optimizer-main-column">
      <p className="optimizer-local-notice">{language === "ko" ? "이 화면은 구매 기록과 예상 계획만 편집합니다. 실제 게임의 재화는 사용하지 않습니다. 해금은 저장한 진행도를 기준으로 계산합니다." : "This edits local purchase records and plans only. It never spends in-game currency. Unlocks use saved progress."}</p>
      {storageFailed && <p className="optimizer-storage-warning" role="alert">{language === "ko" ? "브라우저 저장소를 읽거나 저장하지 못했습니다. 현재 변경은 새로고침하면 사라질 수 있습니다." : "Browser storage could not be read or saved. Current changes may be lost on reload."}</p>}
      <div className={`optimizer-control-card ${currency === "token" ? "has-time" : ""}`}>
        <div className="optimizer-currency-mark">{currency === "diamond" ? <SketchOutlined /> : <DollarCircleOutlined />}</div>
        <label className="optimizer-budget-field"><span>{text.budget}</span><Input value={stored.budgets[currency]} status={parsedBudget.invalid ? "error" : undefined} onChange={(event) => commit((current) => ({ ...current, budgets: { ...current.budgets, [currency]: event.target.value } }))} placeholder="0, 12.5k, 2e6" inputMode="text" />{parsedBudget.invalid && <small>{text.invalidBudget}</small>}</label>
        {currency === "token" && <label className="optimizer-time-field"><span>{text.time}</span><InputNumber min={1} max={24} step={0.5} value={stored.longRunHours} addonAfter={text.hours} onChange={(value) => commit((current) => ({ ...current, longRunHours: typeof value === "number" ? value : 24 }))} /></label>}
        <div className="optimizer-profile-link"><span><CheckCircleFilled /> {text.profileLink}</span><strong>{unlockedGenerators} / 8 {text.generators} · {unlockedShips} / 7 {text.ships}</strong><small>{text.profileLinkNote}</small></div>
        <Popconfirm title={text.resetConfirm} okText={text.reset} cancelText={language === "ko" ? "취소" : "Cancel"} okButtonProps={{ danger: true }} onConfirm={resetCurrency}><Button className="optimizer-reset" icon={<ReloadOutlined />}>{text.reset}</Button></Popconfirm>
      </div>

      <div className={`optimizer-suggestion ${suggestion ? "has-suggestion" : ""}`} style={upgradeCardStyle(suggestion ? getUpgradeVisualResources(suggestion.rule) : [currency])}>
        <div className="optimizer-suggestion-icon"><ThunderboltFilled /></div>
        <div className="optimizer-suggestion-copy"><span>{text.next}</span>{suggestion ? <><strong>{suggestion.rule.name}</strong><small>{text.nextCost} {formatNumber(suggestion.costExact)} · {text.efficiency} {formatNumber(suggestion.score)}</small></> : <strong>{compareCifiDecimals(parseCifiDecimal(parsedBudget.exact), parseCifiDecimal("0")) > 0 ? text.noNext : text.enterBudget}</strong>}</div>
        <Button type="primary" disabled={!suggestion} onClick={applySuggestion}>{text.applyOne}</Button>
      </div>

      <div className="optimizer-upgrade-groups">
        {categoryOrder.map((category) => {
          const group = evaluations.filter((evaluation) => evaluation.rule.category === category);
          const complete = group.filter((evaluation) => evaluation.atMax).length;
          return <section className="optimizer-upgrade-group" key={category}>
            <div className="optimizer-group-heading"><div><h3>{text.category[category]}</h3><p>{complete} / {group.length}</p></div><Progress percent={group.length ? Math.round(complete / group.length * 100) : 0} showInfo={false} size="small" /></div>
            <div className="optimizer-upgrade-grid">
              {group.map((evaluation) => {
                const isSuggested = suggestion?.rule.id === evaluation.rule.id;
                const status = evaluation.atMax ? text.maxed : !evaluation.unlocked ? text.locked : isSuggested ? text.suggested : text.available;
                const isOneTime = evaluation.rule.category === "oneTimer" || evaluation.rule.category === "largeOneTimer";
                const chips = getEffectChips(evaluation.rule);
                const visualResources = [...new Set(chips.map((chip) => chip.resource))];
                const primaryGenerator = /^MK[1-8]$/.test(evaluation.rule.id) ? evaluation.rule.id as GeneratorId : undefined;
                const selected = previewSteps[evaluation.rule.id] ?? 1;
                const projectedLevel = selected === "max"
                  ? evaluation.rule.maxLevel
                  : Math.min(evaluation.rule.maxLevel, evaluation.level + selected);
                const nextLevels = Math.max(0, projectedLevel - evaluation.level);
                const resourceLabels = visualResources.map((resource) => UPGRADE_RESOURCE_PRESENTATION[resource].label).join(" · ");
                const headingIcons = visualResources.map((resource) => UPGRADE_RESOURCE_PRESENTATION[resource]);
                return <article className={`optimizer-upgrade-card ${isOneTime ? "is-one-time" : "is-repeatable"} ${isSuggested ? "is-suggested" : ""} ${!evaluation.unlocked ? "is-locked" : ""} ${evaluation.atMax ? "is-maxed" : ""}`} style={upgradeCardStyle(visualResources, primaryGenerator, isOneTime ? oneTimeAccent(evaluation.rule.id) : undefined)} data-upgrade-resources={visualResources.join(" ")} key={evaluation.rule.id}>
                  <div className="optimizer-upgrade-heading">
                    {isOneTime ? <span className="one-time-letter" aria-hidden="true">{evaluation.rule.id.slice(0, 1)}</span> : <span className="upgrade-leading-icon">{primaryGenerator ? <GeneratorSourceIcon generator={primaryGenerator} /> : <img src={UPGRADE_RESOURCE_PRESENTATION[visualResources[0]].icon} alt="" />}</span>}
                    <div className="optimizer-upgrade-title"><div className="optimizer-upgrade-meta"><span>{evaluation.rule.id}</span><span className="optimizer-resource-markers" aria-label={resourceLabels} title={resourceLabels}>{headingIcons.map((palette) => <img src={palette.icon} alt="" key={palette.label} />)}</span></div><h4>{evaluation.rule.name}</h4></div>
                    <Tooltip title={!evaluation.unlocked ? getUnlockReason(evaluation) : undefined}><Tag icon={!evaluation.unlocked ? <LockOutlined /> : evaluation.atMax ? <CheckCircleFilled /> : undefined}>{status}</Tag></Tooltip>
                    {isOneTime && evaluation.atMax && <Button className="one-time-cancel" size="small" type="text" icon={<CloseOutlined />} onClick={() => updateLevel(evaluation.rule.id, evaluation.rule.maxLevel, 0)}>{language === "ko" ? "구매 취소" : "Undo"}</Button>}
                  </div>
                  <div className="upgrade-multiplier-grid" aria-label={text.power}>
                    {chips.map((chip) => {
                      const palette = chip.generator ? getGeneratorPresentation(chip.generator) : UPGRADE_RESOURCE_PRESENTATION[chip.resource];
                      const currentEffect = chip.kind === "additive"
                        ? (chip.amountPerLevel ?? 0) * evaluation.level
                        : multiplierAtLevel(chip.factors ?? [], evaluation.level);
                      const projectedEffect = chip.kind === "additive"
                        ? (chip.amountPerLevel ?? 0) * projectedLevel
                        : multiplierAtLevel(chip.factors ?? [], projectedLevel);
                      return <div className="upgrade-multiplier-chip" key={chip.key} style={{ "--chip-accent": palette.accent, "--chip-rgb": palette.rgb } as CSSProperties}>
                        <span className="upgrade-chip-label">{chip.generator ? <GeneratorSourceIcon generator={chip.generator} /> : <img src={UPGRADE_RESOURCE_PRESENTATION[chip.resource].icon} alt="" />}{chip.label}</span>
                        <strong>{chip.kind === "additive" ? "+" : "x"}{formatNumber(currentEffect)} <ArrowRightOutlined /> <b>{chip.kind === "additive" ? "+" : "x"}{formatNumber(projectedEffect)}</b></strong>
                      </div>;
                    })}
                  </div>
                  <div className="upgrade-summary-row"><span><small>{text.efficiency}</small><strong>{formatNumber(evaluation.score)}</strong></span><span><small>{text.nextCost}</small><strong>{evaluation.atMax ? "MAX" : formatNumber(evaluation.costExact)}</strong></span></div>
                  {isOneTime ? <div className="one-time-action">{evaluation.atMax ? <span><CheckCircleFilled /> {text.maxed}</span> : <Button type="primary" disabled={!evaluation.unlocked} onClick={() => updateLevel(evaluation.rule.id, evaluation.rule.maxLevel, 1)}>{language === "ko" ? "구매" : "Buy"}</Button>}</div> : <>
                    <label className="upgrade-level-field"><span>{text.currentLevel}</span><InputNumber min={0} max={evaluation.rule.maxLevel} value={evaluation.level} onChange={(value) => updateLevel(evaluation.rule.id, evaluation.rule.maxLevel, value)} addonAfter={`/ ${evaluation.rule.maxLevel}`} /></label>
                    <div className="upgrade-preview-actions" aria-label={language === "ko" ? "업그레이드 예상 단계" : "Upgrade preview steps"}>{([1, 5, 10] as const).map((step) => <Button key={step} className={selected === step ? "is-selected" : ""} size="small" onClick={() => setPreviewSteps((current) => ({ ...current, [evaluation.rule.id]: step }))}>+{step}</Button>)}<Button className={selected === "max" ? "is-selected" : ""} size="small" onClick={() => setPreviewSteps((current) => ({ ...current, [evaluation.rule.id]: "max" }))}>MAX</Button><small>{language === "ko" ? `${nextLevels}레벨 적용 예상` : `${nextLevels} levels preview`}</small></div>
                  </>}
                </article>;
              })}
            </div>
          </section>;
        })}
      </div>
    </div>

    <aside className="optimizer-plan-card">
      <div className="optimizer-plan-heading"><div><span>{UPGRADE_RULESET_META.sourceVersion}</span><h3>{text.plan}</h3></div><Badge count={plan?.purchases.length ?? 0} showZero /></div>
      <div className="optimizer-plan-totals"><div><span>{text.spent}</span><strong>{formatNumber(plan?.spent ?? "0")}</strong></div><div><span>{text.remaining}</span><strong>{formatNumber(plan?.remainingBudget ?? parsedBudget.exact)}</strong></div></div>
      {planSummary.length ? <div className="optimizer-plan-list">{planSummary.map((item, index) => <div className="optimizer-plan-item" key={item.id}><span>{index + 1}</span><div><strong>{item.name}</strong><small>{formatNumber(item.cost)}</small></div><b>+{item.count}</b></div>)}</div> : <div className="optimizer-plan-empty">{text.planEmpty}</div>}
      {plan?.stoppedReason === "max-steps" && <p className="optimizer-plan-warning">{text.planLimited}</p>}
      <Button className="optimizer-apply-plan" type="primary" disabled={!plan?.purchases.length} onClick={applyPlan}>{text.applyPlan}</Button>
    </aside>
  </section>;
}
