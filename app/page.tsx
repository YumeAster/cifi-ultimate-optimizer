"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { App as AntApp, Badge, Button, Card, ConfigProvider, Input, Layout, Menu, Popconfirm, Select, Space, Tag, Tooltip, Typography } from "antd";
import koKR from "antd/locale/ko_KR";
import { AppstoreOutlined, CheckCircleFilled, DatabaseOutlined, DeleteOutlined, DollarCircleOutlined, EditOutlined, RocketOutlined, SaveOutlined, SettingOutlined, SketchOutlined, TrophyOutlined, WarningFilled } from "@ant-design/icons";
import ModTree from "../features/mod-tree/ModTree";
import { GAME_DISPLAY_EXTRA_INPUTS as gameDisplayInputs, migrateGameDisplayInputs } from "../lib/cifi/mod-tree/gameDisplayInputs";
import { recommendationCopy } from "../features/mod-tree/recommendationCopy";
import { DEFAULT_RECOMMENDATION_COUNT, MOD_RECOMMENDATION_COUNT_KEY, RECOMMENDATION_COUNTS, restoreRecommendationCount } from "../lib/cifi/mod-tree/preferences";
import UpgradeOptimizer from "../features/upgrade-optimizer/UpgradeOptimizer";
import ShipInstall from "../features/ship-install/ShipInstall";
import { SHIP_INSTALL_EXTRA_FIELDS } from "../lib/cifi/ship-install/profile";
import { getInputFieldHelp, inputFieldLabels, inputSectionCopy, localizedText } from "./content/inputCopy";
import { isRecord, researchCountExceedsTotal, restoreWeightPresets, validateInput, type FieldKind, type WeightPreset } from "./content/profileValidation";
import { DEFAULT_WEIGHT_PRESET_ID, DEFAULT_WEIGHT_VALUES, commitWeightPreset, matchingWeightPreset, storeWeightPreset } from "./content/weightPresets";
import { calculationProfile, commitInputEdit, inputProfileSave, restoreCalculationProfile } from "./content/inputProfile";
import "./site-audit.css";
import "./scrollbars.css";
import "./theme-refinements.css";

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const APP_VERSION = "v0.4.1";

type FieldGroup = "weights" | "player" | "ship";
type OptimizerTab = "diamonds" | "tokens";
type ActiveTab = "inputs" | OptimizerTab | "modTree" | "shipInstall" | "settings";
type Language = "ko" | "en";
type DashboardTheme = "orbit" | "solar" | "nebula" | "pearl" | "red";
type FieldDefinition = { key: string; label: string; koLabel?: string; kind: FieldKind; group: FieldGroup; recommended?: string; suffix?: string; generator?: number; tech?: "hardware" | "software" };
type FieldSection = { title: string; description: string; keys: string[] };
type ResourcePalette = { accent: string; ink: string; surface: string; border: string; glow: string };
type PlayerResourceSection = FieldSection & { key: string; enTitle: string; enDescription: string; palette: ResourcePalette; wide?: boolean };

const weightFields: FieldDefinition[] = [
  { key: "cells", ...inputFieldLabels.cells, kind: "positive", group: "weights", recommended: "1" },
  { key: "modPoints", ...inputFieldLabels.modPoints, kind: "positive", group: "weights", recommended: "12" },
  { key: "shards", ...inputFieldLabels.shards, kind: "positive", group: "weights", recommended: "10" },
  { key: "research", ...inputFieldLabels.research, kind: "positive", group: "weights", recommended: "8" },
  { key: "academyPoints", ...inputFieldLabels.academyPoints, kind: "positive", group: "weights", recommended: "24" },
  { key: "materials", ...inputFieldLabels.materials, kind: "positive", group: "weights", recommended: "72" },
  { key: "costReduction", ...inputFieldLabels.costReduction, kind: "positive", group: "weights", recommended: "6" },
  { key: "rankPoints", ...inputFieldLabels.rankPoints, kind: "positive", group: "weights", recommended: "1" },
];

const generatorFields: FieldDefinition[] = Array.from({ length: 8 }, (_, index) => {
  const generator = index + 1;
  return { key: `manualMk${generator}`, label: `Manual mk${generator}`, kind: "short" as const, group: "player" as const, generator };
});
const generatorTechnologyFields: FieldDefinition[] = Array.from({ length: 8 }, (_, index) => {
  const generator = index + 1;
  return [
    { key: `hardwareTechMk${generator}`, label: "Hardware Tech", kind: "short" as const, group: "player" as const, generator, tech: "hardware" as const },
    { key: `softwareTechMk${generator}`, label: "Software Tech", kind: "short" as const, group: "player" as const, generator, tech: "software" as const },
  ];
}).flat();

const playerFields: FieldDefinition[] = [
  { key: "level", ...inputFieldLabels.level, kind: "integer", group: "player" },
  { key: "loopsFilled", ...inputFieldLabels.loopsFilled, kind: "integer", group: "player" },
  { key: "loopResets", ...inputFieldLabels.loopResets, kind: "integer", group: "player" },
  { key: "operationsDone", ...inputFieldLabels.operationsDone, kind: "short", group: "player" },
  { key: "studiesDone", ...inputFieldLabels.studiesDone, kind: "short", group: "player" },
  ...generatorFields,
  ...generatorTechnologyFields,
  { key: "lpDoublerBarFill", ...inputFieldLabels.lpDoublerBarFill, kind: "bar", group: "player", suffix: "/ 10" },
  { key: "shardTickspeed", ...inputFieldLabels.shardTickspeed, kind: "decimal", group: "player", suffix: "sec" },
  { key: "equipmentBought", ...inputFieldLabels.equipmentBought, kind: "integer", group: "player" },
  { key: "totalResearchLevels", ...inputFieldLabels.totalResearchLevels, kind: "integer", group: "player" },
  { key: "completedResearches", ...inputFieldLabels.completedResearches, kind: "integer", group: "player" },
  ...gameDisplayInputs.map(field => ({ key: field.key, label: field.label, koLabel: field.koLabel, kind: "short" as const, group: "player" as const })),
];

const shipNames = ["Cradle", "Auxesia", "Zagreus", "Hephaestus", "Demeter", "Koios", "Zeus"];
const shipPalette: Record<string, ResourcePalette> = {
  Cradle: { accent: "#8d969f", ink: "#5d6872", surface: "#f3f5f7", border: "#c5cdd3", glow: "rgba(112, 124, 134, .16)" },
  Auxesia: { accent: "#ff9a31", ink: "#c76c16", surface: "#fff7e9", border: "#ffca7a", glow: "rgba(255, 154, 49, .17)" },
  Zagreus: { accent: "#ed4949", ink: "#bb3030", surface: "#fff1f1", border: "#f2a0a0", glow: "rgba(237, 73, 73, .16)" },
  Hephaestus: { accent: "#a8ca3d", ink: "#6f8e15", surface: "#f7fbe9", border: "#c9e47f", glow: "rgba(168, 202, 61, .18)" },
  Demeter: { accent: "#35bdd8", ink: "#0a829a", surface: "#effcff", border: "#8cdeeb", glow: "rgba(53, 189, 216, .16)" },
  Koios: { accent: "#b5a158", ink: "#796919", surface: "#fbf8e9", border: "#d9cf99", glow: "rgba(181, 161, 88, .17)" },
  Zeus: { accent: "#6f78ed", ink: "#4d56bd", surface: "#f1f2ff", border: "#aeb4f5", glow: "rgba(111, 120, 237, .16)" },
};
const playerPalette: Record<"level" | "generator" | "technology" | "loop" | "shards" | "research" | "academy", ResourcePalette> = {
  level: { accent: "#9a70e8", ink: "#6d43bd", surface: "#f7f2ff", border: "#d9c6f5", glow: "rgba(154, 112, 232, .16)" },
  generator: shipPalette.Cradle,
  technology: shipPalette.Auxesia,
  loop: shipPalette.Zagreus,
  shards: shipPalette.Demeter,
  research: shipPalette.Koios,
  academy: shipPalette.Zeus,
};
const playerResourceSections: PlayerResourceSection[] = [
  { key: "generator", ...inputSectionCopy.generator, keys: generatorFields.map((field) => field.key), palette: playerPalette.generator, wide: true },
  { key: "level", ...inputSectionCopy.level, keys: ["level", "lpDoublerBarFill"], palette: playerPalette.level },
  { key: "technology", ...inputSectionCopy.technology, keys: generatorTechnologyFields.map((field) => field.key), palette: playerPalette.technology, wide: true },
  { key: "loop", ...inputSectionCopy.loop, keys: ["loopsFilled", "loopResets"], palette: playerPalette.loop },
  { key: "shards", ...inputSectionCopy.shards, keys: ["operationsDone", "shardTickspeed"], palette: playerPalette.shards },
  { key: "research", ...inputSectionCopy.research, keys: ["equipmentBought", "totalResearchLevels", "completedResearches"], palette: playerPalette.research },
  { key: "academy", ...inputSectionCopy.academy, keys: ["studiesDone"], palette: playerPalette.academy },
  { key: "gameDisplay", title: "추가 진행도", enTitle: "Additional progress", description: "기존 입력에 없는 항목만 입력하세요. 해당 사항이 없으면 0.", enDescription: "Only values not covered above. Enter 0 where not applicable.", keys: gameDisplayInputs.map(field => field.key), palette: playerPalette.loop, wide: true },
];
const weightPalette: Record<string, ResourcePalette> = {
  cells: { accent: "#37c979", ink: "#1f854d", surface: "#e9fbf1", border: "#a9e9c7", glow: "rgba(55, 201, 121, .15)" },
  modPoints: { accent: "#ff5f66", ink: "#c63a43", surface: "#fff0f0", border: "#ffc0c3", glow: "rgba(255, 95, 102, .16)" },
  shards: { accent: "#25b9e7", ink: "#087da4", surface: "#e9f9fe", border: "#a9e6f7", glow: "rgba(37, 185, 231, .16)" },
  research: { accent: "#9c9156", ink: "#6f6531", surface: "#f7f4e7", border: "#d8d0a2", glow: "rgba(156, 145, 86, .16)" },
  academyPoints: { accent: "#777ee8", ink: "#4f57bd", surface: "#f0f1ff", border: "#b9bef8", glow: "rgba(119, 126, 232, .16)" },
  materials: { accent: "#f4a93a", ink: "#b76e10", surface: "#fff6e6", border: "#ffd49c", glow: "rgba(244, 169, 58, .16)" },
  costReduction: shipPalette.Cradle,
  rankPoints: { accent: "#ffffff", ink: "#536171", surface: "#ffffff", border: "#d9dee6", glow: "rgba(114, 125, 142, .16)" },
};
const shipFields: FieldDefinition[] = shipNames.flatMap((ship) => [
  { key: `${ship.toLowerCase()}Rank`, label: `${ship} Rank`, kind: "integer", group: "ship" },
  { key: `${ship.toLowerCase()}Crew`, label: `${ship} Crew`, kind: "integer", group: "ship" },
]);

const shipExtraFields: FieldDefinition[] = SHIP_INSTALL_EXTRA_FIELDS.map(field => ({ key: field.key, label: field.enLabel, koLabel: field.label, kind: "short", group: "ship" }));
const allFields = [...weightFields, ...playerFields, ...shipFields, ...shipExtraFields];
const inputStorageKey = "cifi-orbit.mtc-inputs.v1";
const presetStorageKey = "cifi-orbit.mtc-weight-presets.v1";
const languageStorageKey = "cifi-orbit.ui-language.v1";
const themeStorageKey = "cifi-ultimate.ui-theme.v1";
const defaultPresetId = DEFAULT_WEIGHT_PRESET_ID;
const recommendedWeights = DEFAULT_WEIGHT_VALUES;
const themeOptions: Record<Language, { value: DashboardTheme; label: string }[]> = {
  ko: [
    { value: "orbit", label: "오비탈 네이비" },
    { value: "solar", label: "솔라 프로스트" },
    { value: "nebula", label: "네뷸라 코어" },
    { value: "pearl", label: "펄 문" },
    { value: "red", label: "모드 레드" },
  ],
  en: [
    { value: "orbit", label: "Orbital Navy" },
    { value: "solar", label: "Solar Frost" },
    { value: "nebula", label: "Nebula Core" },
    { value: "pearl", label: "Pearl Moon" },
    { value: "red", label: "Mod Red" },
  ],
};
function createInitialValues() {
  return Object.fromEntries(allFields.map((field) => [field.key, field.recommended ?? ""])) as Record<string, string>;
}

function fieldLabel(field: FieldDefinition, language: Language) {
  return language === "ko" ? field.koLabel ?? field.label : field.label;
}

function validateField(field: FieldDefinition, rawValue: string, language: Language) {
  const issue = validateInput(field.kind, rawValue);
  return issue ? localizedText[language][issue] : "";
}

function groupLabel(group: FieldGroup, language: Language) {
  const text = localizedText[language];
  return group === "weights" ? text.weights : group === "player" ? text.playerProgress : text.shipProgress;
}

function tabLabel(tab: ActiveTab, language: Language) {
  const text = localizedText[language];
  if (tab === "shipInstall") return "Ship Install";
  if (tab === "settings") return text.settings;
  if (tab === "modTree") return language === "ko" ? "Mod Tree 추천" : "Mod Tree Recommendations";
  if (tab === "diamonds") return text.diamonds;
  if (tab === "tokens") return text.tokens;
  return text.inputManager;
}

const mobileTabs = [
  { key: "inputs", icon: <EditOutlined />, ko: "입력", en: "Inputs" },
  { key: "diamonds", icon: <SketchOutlined />, ko: "다이아", en: "Diamond" },
  { key: "tokens", icon: <DollarCircleOutlined />, ko: "토큰", en: "Token" },
  { key: "modTree", icon: <AppstoreOutlined />, ko: "모드", en: "Mod Tree" },
  { key: "shipInstall", icon: <RocketOutlined />, ko: "함선", en: "Ship" },
  { key: "settings", icon: <SettingOutlined />, ko: "설정", en: "Settings" },
] as const;

function InputManager() {
  const { message } = AntApp.useApp();
  const initialValues = useMemo(() => createInitialValues(), []);
  const [draft, setDraft] = useState<Record<string, string>>(initialValues);
  const [saved, setSaved] = useState<Record<string, string>>(initialValues);
  const [activeTab, setActiveTab] = useState<ActiveTab>("inputs");
  const switchTab = (tab: ActiveTab) => {
    const content = document.querySelector<HTMLElement>(".dashboard-main > .dashboard-content");
    if (content) content.scrollTop = 0;
    setActiveTab(tab);
  };
  const [ready, setReady] = useState(false);
  const [weightPresets, setWeightPresets] = useState<WeightPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(defaultPresetId);
  const profileRef = useRef({ draft: initialValues, saved: initialValues, presetId: defaultPresetId as string | null });
  const [inputSaveStatus, setInputSaveStatus] = useState<"loading" | "saved" | "failed">("loading");
  const [language, setLanguage] = useState<Language>("ko");
  const [theme, setTheme] = useState<DashboardTheme>("orbit");
  const [modRecommendationCount, setModRecommendationCount] = useState(DEFAULT_RECOMMENDATION_COUNT);
  const [optimizerSaveStatus, setOptimizerSaveStatus] = useState<"loading" | "saved" | "failed">("loading");
  const text = localizedText[language];
  const isOptimizerTab = activeTab === "diamonds" || activeTab === "tokens";
  const isModTreeTab = activeTab === "modTree";
  const headerTitle = activeTab === "settings" ? text.settings
    : isOptimizerTab ? `${tabLabel(activeTab, language)} ${text.upgradeOptimizer}`
    : tabLabel(activeTab, language);
  const headerDescription = activeTab === "settings" ? text.settingsDescription
    : isOptimizerTab ? text.optimizerDescription : isModTreeTab || activeTab === "shipInstall" ? null : text.profileDescription;

  useEffect(() => {
    const restored = { ...initialValues };
    let presets: WeightPreset[] = [];
    let restoredLanguage: Language = "ko";
    let restoredTheme: DashboardTheme = "orbit";
    let readFailed = false;
    let displayInputConflict = false;
    let softwareNeedsReview = false;
    const readStored = (key: string, json = false): unknown => {
      try {
        const raw = window.localStorage.getItem(key);
        return json && raw ? JSON.parse(raw) : raw;
      } catch { readFailed = true; return undefined; }
    };
      const parsed = readStored(inputStorageKey, true);
      if (isRecord(parsed) && isRecord(parsed.values)) {
        const inputValues = parsed.values;
        for (const field of allFields) {
          const value = inputValues[field.key];
          if (typeof value === "string") restored[field.key] = value;
        }
        const hasPerGeneratorSoftwareTech = generatorTechnologyFields.some((field) => field.tech === "software" && typeof inputValues[field.key] === "string");
        const legacySoftwareTech = inputValues.softwareTech;
        if (!hasPerGeneratorSoftwareTech && typeof legacySoftwareTech === "string") {
          for (const field of generatorTechnologyFields) if (field.tech === "software") restored[field.key] = legacySoftwareTech;
        }
        const migration = migrateGameDisplayInputs({ ...inputValues, ...Object.fromEntries(generatorTechnologyFields.filter(field => field.tech === "software").map(field => [field.key, restored[field.key]])) });
        Object.assign(restored, migration.values);
        displayInputConflict = migration.conflicts.length > 0;
        softwareNeedsReview = migration.softwareNeedsReview;
      }
      presets = restoreWeightPresets(readStored(presetStorageKey, true), weightFields.map((field) => field.key));
      const restoredSaved = restoreCalculationProfile(restored, isRecord(parsed) ? parsed.calculationValues : undefined, initialValues, allFields, recommendedWeights);
      const storedPresetId = isRecord(parsed) && typeof parsed.weightPresetId === "string" ? parsed.weightPresetId : null;
      // Keep the preset being edited even when its current weights differ.
      const restoredPresetId = storedPresetId === defaultPresetId || presets.some(preset => preset.id === storedPresetId)
        ? storedPresetId : matchingWeightPreset(restoredSaved, presets, recommendedWeights);
      const storedLanguage = readStored(languageStorageKey);
      if (storedLanguage === "ko" || storedLanguage === "en") restoredLanguage = storedLanguage;
      const storedTheme = readStored(themeStorageKey);
      const restoredModRecommendationCount = restoreRecommendationCount(readStored(MOD_RECOMMENDATION_COUNT_KEY));
      if (storedTheme === "abyss") {
        restoredTheme = "nebula";
      } else if (storedTheme === "command") {
        restoredTheme = "orbit";
      } else if (storedTheme === "orbit" || storedTheme === "solar" || storedTheme === "nebula" || storedTheme === "pearl" || storedTheme === "red") {
        restoredTheme = storedTheme;
      }
    if (readFailed) message.warning(localizedText[restoredLanguage].storageReadFailed);
    if (displayInputConflict) message.warning(localizedText[restoredLanguage].displayInputConflict);
    if (softwareNeedsReview) message.warning(localizedText[restoredLanguage].softwareNeedsReview);
    queueMicrotask(() => {
      setDraft(restored);
      setSaved(restoredSaved);
      profileRef.current = { draft: restored, saved: restoredSaved, presetId: restoredPresetId };
      setInputSaveStatus(readFailed ? "failed" : "saved");
      setWeightPresets(presets);
      setSelectedPresetId(restoredPresetId);
      setLanguage(restoredLanguage);
      setTheme(restoredTheme);
      setModRecommendationCount(restoredModRecommendationCount);
      setReady(true);
    });
  }, [initialValues, message]);

  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    for (const field of allFields) {
      const error = validateField(field, draft[field.key] ?? "", language);
      if (error) next[field.key] = error;
    }
    if (researchCountExceedsTotal(draft.completedResearches ?? "", draft.totalResearchLevels ?? "")) next.completedResearches = text.researchLimit;
    return next;
  }, [draft, language, text.researchLimit]);
  const activePresetId = useMemo(() => matchingWeightPreset(saved, weightPresets, recommendedWeights, selectedPresetId), [saved, weightPresets, selectedPresetId]);
  const selectedPreset = selectedPresetId === defaultPresetId ? undefined : weightPresets.find((preset) => preset.id === selectedPresetId);
  const acceptProfile = (next: { draft: Record<string, string>; saved: Record<string, string> }, presetId: string | null) => {
    profileRef.current = { ...next, presetId };
    setDraft(next.draft); setSaved(next.saved); setSelectedPresetId(presetId); setInputSaveStatus("saved");
  };
  const updateValue = (key: string, value: string) => {
    if (!ready) return;
    const current = profileRef.current;
    try {
      const next = commitInputEdit(current.draft, current.saved, key, value, allFields, recommendedWeights, current.presetId, payload => window.localStorage.setItem(inputStorageKey, JSON.stringify(payload)));
      acceptProfile(next, current.presetId);
    } catch {
      // Retain the edit on screen for retry, without claiming persistence.
      const nextDraft = { ...current.draft, [key]: value };
      profileRef.current = { ...current, draft: nextDraft };
      setDraft(nextDraft); setInputSaveStatus("failed");
    }
  };
  const persistCurrentProfile = (presetId: string | null) => {
    const current = profileRef.current;
    const next = { draft: current.draft, saved: calculationProfile(current.draft, current.saved, allFields, recommendedWeights) };
    window.localStorage.setItem(inputStorageKey, JSON.stringify(inputProfileSave(next.draft, next.saved, presetId)));
    acceptProfile(next, presetId);
  };
  const updateLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    try { window.localStorage.setItem(languageStorageKey, nextLanguage); } catch { /* language can remain session-only */ }
  };
  const updateTheme = (nextTheme: DashboardTheme) => {
    setTheme(nextTheme);
    try { window.localStorage.setItem(themeStorageKey, nextTheme); } catch { /* theme can remain session-only */ }
  };

  const applyPreset = (presetId = selectedPresetId) => {
    if (!ready) return;
    const presetValues = presetId === defaultPresetId ? recommendedWeights : weightPresets.find((preset) => preset.id === presetId)?.values;
    if (!presetValues || !presetId) return void message.error(text.missingPreset);
    try {
      const current = profileRef.current;
      const currentSaved = calculationProfile(current.draft, current.saved, allFields, recommendedWeights);
      const next = commitWeightPreset(current.draft, currentSaved, presetValues, recommendedWeights, presetId, payload => window.localStorage.setItem(inputStorageKey, JSON.stringify(payload)));
      acceptProfile(next, presetId);
    } catch { message.error(text.presetApplyFailed); }
  };
  const saveWeightPreset = (createNew = false) => {
    if (!ready) return;
    if (weightFields.some(field => Boolean(errors[field.key]))) return void message.error(text.validationFailed);
    if (!createNew && !selectedPreset) return void message.info(text.choosePresetToSave);
    const name = createNew ? presetName.trim() : selectedPreset!.name;
    if (!name) return void message.error(text.enterPresetName);
    if (createNew && weightPresets.some(preset => preset.name === name)) return void message.error(text.duplicatePreset);
    const id = createNew ? `weight-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` : selectedPreset!.id;
    try {
      const next = storeWeightPreset(weightPresets, id, name, profileRef.current.draft, recommendedWeights, new Date().toISOString(), rows => window.localStorage.setItem(presetStorageKey, JSON.stringify(rows)));
      setWeightPresets(next); setSelectedPresetId(id); setPresetName("");
      profileRef.current = { ...profileRef.current, presetId: id };
      message.success(`“${name}” ${text.presetSaved}`);
      // The library write is already complete. A separate profile failure must
      // not misreport that the weight preset itself was lost.
      try { persistCurrentProfile(id); }
      catch { setInputSaveStatus("failed"); message.warning(text.saveFailed); }
    } catch { message.error(text.presetSaveFailed); }
  };
  const deleteSelectedPreset = () => {
    if (!ready || !selectedPreset) return;
    const next = weightPresets.filter((preset) => preset.id !== selectedPreset.id);
    try {
      window.localStorage.setItem(presetStorageKey, JSON.stringify(next));
      const current = profileRef.current;
      const currentSaved = calculationProfile(current.draft, current.saved, allFields, recommendedWeights);
      const nextAppliedId = matchingWeightPreset(currentSaved, next, recommendedWeights);
      setWeightPresets(next); setSelectedPresetId(nextAppliedId);
      profileRef.current = { ...profileRef.current, presetId: nextAppliedId };
      try { persistCurrentProfile(nextAppliedId); }
      catch { setInputSaveStatus("failed"); }
      message.success(`“${selectedPreset.name}” ${text.presetDeleted}`);
    } catch { message.error(text.presetDeleteFailed); }
  };

  const resourceCardStyle = (palette: ResourcePalette) => ({
    "--resource-accent": palette.accent,
    "--resource-ink": palette.ink,
    "--resource-surface": palette.surface,
    "--resource-border": palette.border,
    "--resource-glow": palette.glow,
  }) as CSSProperties;
  const renderWeightField = (field: FieldDefinition) => {
    const error = errors[field.key];
    const palette = weightPalette[field.key];
    return <section className={`weight-input-card ${error ? "has-error" : ""}`} style={resourceCardStyle(palette)} key={field.key}>
      <div className="weight-card-heading"><span className="weight-card-dot" /><div><h4>{fieldLabel(field, language)}</h4><p>{text.recommended} {field.recommended}</p></div></div>
      <Tooltip title={getInputFieldHelp(field, language)}><Input aria-label={fieldLabel(field, language)} value={draft[field.key] ?? ""} onChange={(event) => updateValue(field.key, event.target.value)} status={error ? "error" : undefined} placeholder={text.inputValue} inputMode="numeric" /></Tooltip>
      {error && <small>{error}</small>}
    </section>;
  };
  const renderPlayerField = (field: FieldDefinition, matrixCell = false) => {
    const error = errors[field.key];
    const label = matrixCell && field.generator ? `MK${field.generator} ${fieldLabel(field, language)}` : fieldLabel(field, language);
    return <label className={`player-field ${matrixCell ? "generator-tech-matrix-field" : ""} ${error ? "has-error" : ""}`} key={field.key}>
      <span className={matrixCell ? "visually-hidden" : undefined}>{label}</span>
      <Tooltip title={getInputFieldHelp(field, language)}><Input aria-label={label} value={draft[field.key] ?? ""} onChange={(event) => updateValue(field.key, event.target.value)} status={error ? "error" : undefined} placeholder={text.inputValue} inputMode={field.kind === "short" ? "text" : field.kind === "integer" || field.kind === "bar" ? "numeric" : "decimal"} suffix={field.suffix} /></Tooltip>
      {error && <small>{error}</small>}
    </label>;
  };
  const updateModRecommendationCount = (value: number) => {
    const count = restoreRecommendationCount(value);
    setModRecommendationCount(count);
    try { window.localStorage.setItem(MOD_RECOMMENDATION_COUNT_KEY, String(count)); }
    catch { message.warning(recommendationCopy[language].countSaveFailed); }
  };
  const renderGeneratorTechCards = (fields: FieldDefinition[]) => <div className="generator-tech-grid">
    {Array.from({ length: 8 }, (_, index) => {
      const generator = index + 1;
      const techFields = [`hardwareTechMk${generator}`, `softwareTechMk${generator}`]
        .map((key) => fields.find((field) => field.key === key))
        .filter((field): field is FieldDefinition => Boolean(field));
      const filledCount = techFields.filter((field) => Boolean(draft[field.key]?.trim())).length;
      return <section className="generator-tech-card" key={generator}>
        <div className="generator-tech-heading"><strong>MK{generator}</strong><span>{filledCount} / {techFields.length}</span></div>
        <div className="generator-tech-fields">{techFields.map((field) => renderPlayerField(field))}</div>
      </section>;
    })}
  </div>;
  const renderGeneratorMatrix = (fields: FieldDefinition[]) => {
    const fieldFor = (generator: number) => fields.find((field) => field.generator === generator);
    return <div className="generator-matrix" aria-label={language === "ko" ? "MK별 Manual Generator 진행도" : "Manual Generator progress by MK"}>
      <div className="generator-matrix-corner" aria-hidden="true" />
      {Array.from({ length: 8 }, (_, index) => {
        const generator = index + 1;
        const field = fieldFor(generator);
        const filledCount = field && draft[field.key]?.trim() ? 1 : 0;
        return <div className="generator-matrix-heading" key={`heading-${generator}`}><strong>MK{generator}</strong><span>{filledCount}/1</span></div>;
      })}
      <div className="generator-matrix-row-label"><span>Manual</span><strong>MK</strong></div>
      {Array.from({ length: 8 }, (_, index) => {
        const field = fieldFor(index + 1);
        return field ? renderPlayerField(field, true) : null;
      })}
    </div>;
  };
  const renderGeneratorTechMatrix = (fields: FieldDefinition[]) => {
    const fieldsForMk = (generator: number) => [`hardwareTechMk${generator}`, `softwareTechMk${generator}`]
      .map((key) => fields.find((field) => field.key === key))
      .filter((field): field is FieldDefinition => Boolean(field));
    const fieldFor = (generator: number, tech: "hardware" | "software") => fields.find((field) => field.generator === generator && field.tech === tech);
    return <div className="generator-tech-matrix" aria-label={language === "ko" ? "MK별 Hardware Tech와 Software Tech" : "Hardware and Software Tech by MK"}>
      <div className="generator-tech-matrix-corner" aria-hidden="true" />
      {Array.from({ length: 8 }, (_, index) => {
        const generator = index + 1;
        const techFields = fieldsForMk(generator);
        const filledCount = techFields.filter((field) => Boolean(draft[field.key]?.trim())).length;
        return <div className="generator-tech-matrix-heading" key={`heading-${generator}`}><strong>MK{generator}</strong><span>{filledCount}/{techFields.length}</span></div>;
      })}
      {(["hardware", "software"] as const).flatMap((tech) => [
        <div className="generator-tech-matrix-row-label" key={`${tech}-label`} title={tech === "hardware" ? "Hardware Tech" : "Software Tech"}><span>{tech === "hardware" ? "Hardware" : "Software"}</span><strong>Tech</strong></div>,
        ...Array.from({ length: 8 }, (_, index) => {
          const field = fieldFor(index + 1, tech);
          return field ? renderPlayerField(field, true) : null;
        }),
      ])}
    </div>;
  };
  const fieldPanel = (fields: FieldDefinition[], group: Exclude<FieldGroup, "ship">) => (
    <div className={`field-panel field-panel-${group}`}>
      <div className="field-panel-heading">
        <div className={`panel-symbol panel-symbol-${group}`}>{group === "weights" ? "W" : "P"}</div>
        <div className="field-panel-copy"><Title level={3}>{groupLabel(group, language)}</Title><Paragraph>{group === "weights" ? text.weightsDescription : text.playerDescription}</Paragraph></div>
      </div>
      {group === "weights" ? <div className="weight-card-grid">{fields.map(renderWeightField)}</div> : group === "player" ? <><div className="player-card-grid">
        {playerResourceSections.map((section) => {
          const sectionFields = fields.filter((field) => section.keys.includes(field.key));
          const filledCount = sectionFields.filter((field) => Boolean(draft[field.key]?.trim())).length;
          return <section className={`player-input-card section-${section.key} ${section.wide ? "is-wide" : ""}`} style={resourceCardStyle(section.palette)} key={section.key}>
            <div className="player-card-heading"><span className="player-card-dot" /><div><h4>{language === "ko" ? section.title : section.enTitle}</h4><p>{language === "ko" ? section.description : section.enDescription}</p></div><Badge className="player-input-count" count={`${filledCount} / ${sectionFields.length}`} showZero /></div>
            {section.key === "generator" ? <><div className="generator-matrix-desktop">{renderGeneratorMatrix(sectionFields)}</div><div className="generator-matrix-mobile"><div className="player-field-grid generator-grid">{sectionFields.map((field) => renderPlayerField(field))}</div></div></> : section.key === "technology" ? <><div className="generator-tech-desktop">{renderGeneratorTechMatrix(sectionFields)}</div><div className="generator-tech-mobile">{renderGeneratorTechCards(sectionFields)}</div></> : <div className="player-field-grid">{sectionFields.map((field) => renderPlayerField(field))}</div>}
          </section>;
        })}
      </div></> : null}
    </div>
  );
  const settingsPanel = () => (
    <Card className="settings-card" variant="borderless">
      <div className="settings-option-grid">
        <section className="settings-option"><Text className="section-kicker">{text.appearance}</Text><Select className="settings-theme-select" aria-label={text.appearance} value={theme} onChange={updateTheme} options={themeOptions[language]} /></section>
        <section className="settings-option"><Text className="section-kicker">{text.displayLanguage}</Text><Space className="language-toggle settings-language-toggle" size={3}><Button type={language === "ko" ? "primary" : "default"} aria-pressed={language === "ko"} onClick={() => updateLanguage("ko")}>한국어</Button><Button type={language === "en" ? "primary" : "default"} aria-pressed={language === "en"} onClick={() => updateLanguage("en")}>EN</Button></Space></section>
        <section className="settings-option"><Text className="section-kicker">{recommendationCopy[language].countSetting}</Text><Select className="settings-theme-select" aria-label={recommendationCopy[language].countSetting} value={modRecommendationCount} disabled={!ready} onChange={updateModRecommendationCount} options={RECOMMENDATION_COUNTS.map(value => ({ value, label: language === "ko" ? `${value}개` : String(value) }))} /><Text type="secondary">{recommendationCopy[language].countHelp}</Text></section>
      </div>
    </Card>
  );
  return <Layout className={`dashboard-shell theme-${theme}`}>
    <Sider className="dashboard-sider" width={272} trigger={null}>
      <div className="sidebar-brand"><div className="brand-cell"><DatabaseOutlined /></div><div><strong>CIFI ULTIMATE</strong><span>OPTIMIZER · {APP_VERSION}</span></div></div>
      <div className="sidebar-caption">{text.workspace}</div>
      <Menu className="sidebar-menu" theme="dark" mode="inline" selectedKeys={[activeTab]} defaultOpenKeys={["upgrade-optimizer"]} onClick={({ key }) => { if (key !== "upgrade-optimizer") switchTab(key as ActiveTab); }} items={[
        { key: "inputs", icon: <EditOutlined />, label: text.inputManager },
        { key: "upgrade-optimizer", icon: <TrophyOutlined />, label: text.upgradeOptimizer, children: [
          { key: "diamonds", className: "optimizer-menu-diamond", icon: <SketchOutlined />, label: text.diamonds },
          { key: "tokens", className: "optimizer-menu-token", icon: <DollarCircleOutlined />, label: text.tokens },
        ] },
        { key: "modTree", icon: <AppstoreOutlined />, label: language === "ko" ? "Mod Tree 추천" : "Mod Tree Recommendations" },
        { key: "shipInstall", icon: <AppstoreOutlined />, label: "Ship Install" },
        { key: "settings", icon: <SettingOutlined />, label: text.settings },
      ]} />
      <div className="sidebar-foot"><div className="sidebar-foot-chip"><span className="sidebar-foot-dot" />{text.localProfile}</div><p>{text.localProfileNote}</p></div>
    </Sider>
    <Layout className="dashboard-main">
      <Header className="dashboard-header">
        <div className="dashboard-header-copy">
          <Text className="header-eyebrow">{isOptimizerTab ? "UPGRADE OPTIMIZER" : isModTreeTab ? "MOD TREE" : activeTab === "shipInstall" ? "SHIP AUTOMATION" : activeTab === "settings" ? "SETTINGS" : "PLAYER PROFILE"} / {tabLabel(activeTab, language).toUpperCase()}</Text>
          <Title level={1} className="dashboard-page-title">{headerTitle}</Title>
          {headerDescription && <Paragraph className="dashboard-header-description">{headerDescription}</Paragraph>}
        </div>
        <Space className="dashboard-header-actions" size={10} wrap><Tag className="app-version-tag">{APP_VERSION}</Tag>{isModTreeTab ? <Tag color="red" icon={<AppstoreOutlined />}>PRE-OUROBOROS</Tag> : isOptimizerTab ? <Tag color={optimizerSaveStatus === "failed" ? "red" : "blue"} icon={optimizerSaveStatus === "failed" ? <WarningFilled /> : <CheckCircleFilled />}>{optimizerSaveStatus === "failed" ? (language === "ko" ? "저장 실패" : "Not saved") : optimizerSaveStatus === "loading" ? (language === "ko" ? "불러오는 중" : "Loading") : text.autoSaved}</Tag> : <><Tag color={inputSaveStatus === "failed" ? "red" : "green"} icon={inputSaveStatus === "failed" ? <WarningFilled /> : <CheckCircleFilled />}>{!ready ? text.loading : inputSaveStatus === "failed" ? text.saveFailed : text.autoSaved}</Tag>{Object.keys(errors).length > 0 && <Text type="warning">{text.invalidCalculationNote}</Text>}</>}</Space>
      </Header>
      <Content className={`dashboard-content${isModTreeTab ? " is-mod-tree" : ""}${activeTab === "shipInstall" ? " is-ship-install" : ""}`}>{activeTab === "shipInstall" ? <ShipInstall language={language} profile={saved} draft={draft} errors={errors} ready={ready} onInput={updateValue} /> : isModTreeTab ? <ModTree language={language} profile={saved} recommendationCount={modRecommendationCount} /> : activeTab === "settings" ? <main className="settings-workspace"><section className="settings-primary">{settingsPanel()}</section></main> : isOptimizerTab ? <main className="optimizer-workspace">
        <UpgradeOptimizer currency={activeTab} language={language} profile={saved} onSaveStatusChange={setOptimizerSaveStatus} />
      </main> : <main className="input-management-workspace">
        <section className="input-workspace">
          <Card className="input-card" variant="borderless">
            <div className="weight-preset-toolbar">
              <div className="weight-preset-select-row">
                <label htmlFor="weight-preset-select">{text.weightPresets}</label>
                <Select id="weight-preset-select" aria-label={text.weightPresets} value={selectedPresetId} placeholder={text.customWeights} disabled={!ready} onChange={id => applyPreset(id)} options={[{ value: defaultPresetId, label: text.recommendedSet }, ...weightPresets.map(preset => ({ value: preset.id, label: preset.name }))]} />
                <Button type="primary" icon={<SaveOutlined />} onClick={() => saveWeightPreset()} disabled={!ready || !selectedPreset || weightFields.some(field => Boolean(errors[field.key]))}>{text.saveWeights}</Button>
                {selectedPreset && <Popconfirm title={text.deleteTitle} description={text.deleteDescription} okText={text.delete} cancelText={text.cancel} okButtonProps={{ danger: true }} onConfirm={deleteSelectedPreset}><Button danger icon={<DeleteOutlined />} aria-label={text.deletePreset} /></Popconfirm>}
                {activePresetId === selectedPresetId && activePresetId !== null ? <Tag>{text.presetApplied}</Tag> : <Text className="weight-preset-status">{text.presetEdited}</Text>}
              </div>
              <div className="weight-preset-create-row">
                <Input aria-label={text.newPreset} value={presetName} maxLength={32} placeholder={text.newPreset} onChange={event => setPresetName(event.target.value)} onPressEnter={() => saveWeightPreset(true)} disabled={!ready} />
                <Button onClick={() => saveWeightPreset(true)} disabled={!ready || !presetName.trim() || weightFields.some(field => Boolean(errors[field.key]))}>{text.createPreset}</Button>
                <Text type="secondary">{text.presetHelp}</Text>
              </div>
            </div>
            {fieldPanel(weightFields, "weights")}
          </Card>
          <Card className="input-card" variant="borderless">{fieldPanel(playerFields, "player")}</Card>
        </section>
      </main>}</Content>
      <nav className="mobile-workspace-nav" aria-label={language === "ko" ? "화면 이동" : "Workspace navigation"}>
        {mobileTabs.map(tab => <button key={tab.key} type="button" className={`mobile-workspace-tab${activeTab === tab.key ? " is-active" : ""}`} aria-label={tabLabel(tab.key, language)} aria-current={activeTab === tab.key ? "page" : undefined} onClick={() => switchTab(tab.key)}><span className="mobile-workspace-tab-icon" aria-hidden="true">{tab.icon}</span><span className="mobile-workspace-tab-label" aria-hidden="true">{language === "ko" ? tab.ko : tab.en}</span></button>)}
      </nav>
    </Layout>
  </Layout>;
}

export default function Home() {
  return <ConfigProvider locale={koKR} theme={{ token: { colorPrimary: "#3f6f4c", colorInfo: "#3f6f4c", colorSuccess: "#2d9a58", colorWarning: "#c98b22", colorError: "#d24a48", colorText: "#182334", colorTextSecondary: "#6e7886", colorBgLayout: "#f5f7fb", borderRadius: 10, fontFamily: "var(--font-geist-sans), Pretendard, sans-serif" }, components: { Button: { primaryShadow: "0 5px 14px rgba(47, 103, 73, .18)" }, Card: { headerBg: "#ffffff" }, Input: { activeBorderColor: "#7f9d62", hoverBorderColor: "#91a879" }, Menu: { darkItemBg: "#121d2d", darkItemSelectedBg: "#263b4a", darkSubMenuItemBg: "#121d2d", darkItemColor: "#aeb9c9", darkItemSelectedColor: "#ffffff" } } }}><AntApp><InputManager /></AntApp></ConfigProvider>;
}
