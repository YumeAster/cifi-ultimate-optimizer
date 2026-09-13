/**
 * Input Manager text source
 *
 * 화면에 보이는 제목, 안내문, 입력 필드 이름과 Hover 설명은 이 파일에서 편집한다.
 * `ko`는 한국어 UI, `en`은 English UI에 표시된다.
 */

import { GAME_DISPLAY_EXTRA_INPUTS as gameDisplayInputs, GAME_DISPLAY_INPUT_ALIASES } from "../../lib/cifi/mod-tree/gameDisplayInputs.ts";
export type InputLanguage = "ko" | "en";

type FieldForHelp = {
  key: string;
  label: string;
  koLabel?: string;
  group: "weights" | "player" | "ship";
  generator?: number;
  tech?: "hardware" | "software";
};

export const inputFieldLabels = {
  cells: { label: "Cells" },
  modPoints: { label: "Mod Points" },
  shards: { label: "Shards" },
  research: { label: "Research" },
  academyPoints: { label: "Academy Points" },
  materials: { label: "Materials" },
  costReduction: { label: "Cost Reduction" },
  rankPoints: { label: "Rank Points" },
  level: { label: "Level" },
  loopsFilled: { label: "Loop Filled", koLabel: "Loop Filled" },
  loopResets: { label: "Loop Resets Done", koLabel: "Loop Resets Done" },
  operationsDone: { label: "Operations Done", koLabel: "완료한 Operation" },
  studiesDone: { label: "Studies Done", koLabel: "완료한 Study" },
  lpDoublerBarFill: { label: "LP Doubler Bar Fill", koLabel: "LP Doubler 게이지" },
  shardTickspeed: { label: "Shard Tickspeed", koLabel: "Shard Tick 속도" },
  equipmentBought: { label: "Equipment Bought", koLabel: "구매한 Equipment" },
  totalResearchLevels: { label: "Total Research Levels", koLabel: "전체 Research 레벨" },
  completedResearches: { label: "Completed Researches", koLabel: "완료한 Research" },
} as const;

export const inputSectionCopy = {
  generator: { title: "Generator", enTitle: "Generator", description: "Manual mk 진행도입니다.", enDescription: "Manual mk progress." },
  level: { title: "레벨", enTitle: "Level", description: "Level과 LP 진행 상태입니다.", enDescription: "Current Level and LP progress." },
  technology: { title: "Tech", enTitle: "Tech", description: "MK별 Hardware Tech와 Software Tech입니다.", enDescription: "Hardware and Software Tech for each MK." },
  loop: { title: "Loop", enTitle: "Loop", description: "Loop 및 MP 진행 상태입니다.", enDescription: "Current Loop and MP progress." },
  shards: { title: "Shards", enTitle: "Shards", description: "Operation과 Shard 진행도입니다.", enDescription: "Operation and Shard progress." },
  research: { title: "Research", enTitle: "Research", description: "Equipment 및 Research 진행도입니다.", enDescription: "Equipment and Research progress." },
  academy: { title: "아카데미", enTitle: "Academy", description: "Academy Study 완료 기록입니다.", enDescription: "Completed Academy Study records." },
} as const;

export const localizedText = {
  ko: {
    saveWeights: "가중치 저장", createPreset: "프리셋 추가", presetEdited: "프리셋에 저장하지 않은 가중치", choosePresetToSave: "새 프리셋을 추가하거나 저장할 프리셋을 선택해 주세요.", loading: "불러오는 중", invalidCalculationNote: "입력은 보존되며, 오류 항목은 마지막 유효값으로 계산합니다.",
    presetApplied: "적용 중", customWeights: "현재 계산: 사용자 설정 가중치", presetApplyFailed: "프리셋을 적용하지 못했습니다. 기존 입력값과 적용 상태는 유지됩니다.",
    workspace: "작업 공간", inputManager: "입력값 관리", playerInput: "입력값 관리", weights: "가중치", playerProgress: "플레이어 진행도 입력", shipProgress: "함선 진행도", upgradeOptimizer: "업그레이드 옵티마이저", diamonds: "다이아몬드", tokens: "토큰", optimizerDescription: "현재 진행도와 자원 가중치를 기준으로 가장 효율적인 구매 순서를 계산합니다.", settings: "설정", settingsDescription: "화면 테마와 표시 언어를 관리합니다.", appearance: "화면 테마", displayLanguage: "표시 언어", localProfile: "로컬 프로필", localProfileNote: "현재 기기에만 저장됩니다.",
    saved: "저장됨", autoSaved: "자동 저장", changed: "개 변경됨", restore: "되돌리기", save: "입력값 저장", currentProfile: "현재 프로필", profileTitle: "Mod Tree Profile", profileDescription: "가중치와 플레이어 진행도를 관리합니다. 입력값은 변경 즉시 자동 저장됩니다.", theme: "테마",
    prioritySettings: "가중치 설정", playerProfile: "플레이어 진행도", shipProfile: "함선 진행도", weightsDescription: "각 자원의 우선순위를 설정합니다. 입력값은 자동 저장되고 계산에 바로 반영됩니다.", playerDescription: "현재 게임 수치를 입력하세요. 추천 계산과 효과 표시에서 함께 사용합니다.", shipDescription: "무료 보너스를 포함한 게임 화면의 현재 랭크와 승무원 수를 입력하세요.", rank: "랭크", crew: "승무원", rankAndCrew: "랭크 · 승무원",
    displayInputConflict: "기존 입력란의 값을 우선 사용합니다. 값이 다른 이전 별도 입력도 보존했습니다.", softwareNeedsReview: "이전 Software 총합은 보존했습니다. MK1~8 입력과 MK9~12 합계를 확인해 주세요.",
    inputValue: "값 입력", recommended: "권장값", weightLibrary: "가중치 라이브러리", weightPresets: "가중치 프리셋", presetHelp: "프리셋에는 가중치 8개만 저장됩니다. 선택 즉시 적용되며, 수정 후 ‘가중치 저장’을 누르세요. 빈칸은 기본값을 사용합니다.", newPreset: "새 가중치 프리셋 이름", savePreset: "저장", recommendedSet: "기본 권장값", recommendedWeightSet: "권장 가중치 세트", noPresets: "저장한 프리셋이 없습니다.", applyPreset: "선택한 프리셋 적용", deletePreset: "선택한 프리셋 삭제", deleteTitle: "이 프리셋을 삭제할까요?", deleteDescription: "삭제한 프리셋은 복구할 수 없습니다.", delete: "삭제", cancel: "취소", deviceStorage: "기기별 보관", deviceStorageNote: "프리셋과 입력값은 현재 브라우저에만 저장됩니다.",
    invalidShort: "숫자 또는 과학 표기 형식으로 입력하세요.", invalidNumber: "유효한 숫자를 입력하세요.", nonNegative: "0 이상의 값을 입력하세요.", positiveWeight: "가중치는 0보다 커야 합니다.", integer: "정수를 입력하세요.", barRange: "0부터 10 사이의 값을 입력하세요.", researchLimit: "완료 Research 수는 전체 Research 레벨보다 클 수 없습니다.",
    storageReadFailed: "저장된 설정을 읽지 못해 기본값으로 시작합니다.", validationFailed: "오류가 있는 입력값을 먼저 확인해 주세요.", savedValues: "입력값을 이 기기에 저장했습니다.", saveFailed: "입력값을 저장하지 못했습니다.", restored: "마지막 저장 상태로 되돌렸습니다.", missingPreset: "불러올 프리셋을 찾지 못했습니다.", appliedPreset: "프리셋의 가중치를 입력란과 추천 계산에 반영했습니다.", enterPresetName: "프리셋 이름을 입력해 주세요.", duplicatePreset: "같은 이름의 프리셋이 이미 있습니다.", presetSaved: "프리셋을 저장했습니다.", presetSaveFailed: "프리셋을 저장하지 못했습니다.", presetDeleted: "프리셋을 삭제했습니다.", presetDeleteFailed: "프리셋을 삭제하지 못했습니다.",
  },
  en: {
    saveWeights: "Save weights", createPreset: "Add preset", presetEdited: "Weights not saved to a preset", choosePresetToSave: "Add a new preset or select a saved preset to update.", loading: "Loading", invalidCalculationNote: "Edits are retained; invalid fields use their last valid value in calculations.",
    presetApplied: "Applied", customWeights: "Current calculations: custom weights", presetApplyFailed: "Could not apply the preset. Existing inputs and applied weights are unchanged.",
    workspace: "WORKSPACE", inputManager: "Input Manager", playerInput: "Input Management", weights: "Weights", playerProgress: "Player Progress Input", shipProgress: "Ship Progress", upgradeOptimizer: "Upgrade Optimizer", diamonds: "Diamonds", tokens: "Tokens", optimizerDescription: "Calculate the most efficient purchase order from your progress and resource weights.", settings: "Settings", settingsDescription: "Manage the dashboard theme and display language.", appearance: "Appearance", displayLanguage: "Display language", localProfile: "Local profile", localProfileNote: "Saved only in this browser.",
    saved: "Saved", autoSaved: "Auto-saved", changed: "changed", restore: "Restore", save: "Save inputs", currentProfile: "CURRENT PROFILE", profileTitle: "Mod Tree Profile", profileDescription: "Manage resource priorities and player progress. Inputs are auto-saved on every change.", theme: "Theme",
    prioritySettings: "WEIGHT SETTINGS", playerProfile: "PLAYER PROFILE", shipProfile: "SHIP PROFILE", weightsDescription: "Set each resource priority. Inputs are auto-saved and update calculations immediately.", playerDescription: "Enter current game values. Recommendations and effect previews share these inputs.", shipDescription: "Enter the current Rank and Crew shown in-game, including free bonuses.", rank: "Rank", crew: "Crew", rankAndCrew: "Rank & Crew",
    displayInputConflict: "Existing shared inputs take priority. Different legacy display values have also been preserved.", softwareNeedsReview: "The legacy Software total has been preserved. Check MK1–8 inputs and the MK9–12 subtotal.",
    inputValue: "Enter value", recommended: "Recommended", weightLibrary: "WEIGHT LIBRARY", weightPresets: "Weight presets", presetHelp: "Presets store only eight weights. Selection applies immediately; use Save weights after editing. Blanks use defaults.", newPreset: "New Weight preset name", savePreset: "Save", recommendedSet: "Recommended defaults", recommendedWeightSet: "Recommended Weight set", noPresets: "No saved presets.", applyPreset: "Apply selected preset", deletePreset: "Delete selected preset", deleteTitle: "Delete this preset?", deleteDescription: "Deleted presets cannot be recovered.", delete: "Delete", cancel: "Cancel", deviceStorage: "Device storage", deviceStorageNote: "Presets and inputs are stored in this browser only.",
    invalidShort: "Enter a number or scientific notation.", invalidNumber: "Enter a valid number.", nonNegative: "Enter 0 or more.", positiveWeight: "Weights must be greater than 0.", integer: "Enter a whole number.", barRange: "Enter a value from 0 to 10.", researchLimit: "Completed Researches cannot exceed total Research Levels.",
    storageReadFailed: "Saved settings could not be read. Starting with defaults.", validationFailed: "Fix invalid inputs first.", savedValues: "Inputs saved to this device.", saveFailed: "Could not save inputs.", restored: "Restored the last saved values.", missingPreset: "The preset could not be found.", appliedPreset: "Preset weights applied to inputs and recommendations.", enterPresetName: "Enter a preset name.", duplicatePreset: "A preset with that name already exists.", presetSaved: "Preset saved.", presetSaveFailed: "Could not save the preset.", presetDeleted: "Preset deleted.", presetDeleteFailed: "Could not delete the preset.",
  },
} satisfies Record<InputLanguage, Record<string, string>>;

const inputFieldHelp: Record<string, Record<InputLanguage, string>> = {
  cells: { ko: "Cells가 효율 점수에서 차지하는 우선순위 가중치를 입력하세요. 게임 내 보유량이 아니라 계산 우선순위입니다.", en: "Enter the priority weight for Cells in efficiency scoring, not the in-game amount." },
  modPoints: { ko: "Mod Points가 효율 점수에서 차지하는 우선순위 가중치를 입력하세요. 게임 내 보유량이 아니라 계산 우선순위입니다.", en: "Enter the priority weight for Mod Points in efficiency scoring, not the in-game amount." },
  shards: { ko: "Shards가 효율 점수에서 차지하는 우선순위 가중치를 입력하세요. 게임 내 보유량이 아니라 계산 우선순위입니다.", en: "Enter the priority weight for Shards in efficiency scoring, not the in-game amount." },
  research: { ko: "Research가 효율 점수에서 차지하는 우선순위 가중치를 입력하세요. 게임 내 보유량이 아니라 계산 우선순위입니다.", en: "Enter the priority weight for Research in efficiency scoring, not the in-game amount." },
  academyPoints: { ko: "Academy Points가 효율 점수에서 차지하는 우선순위 가중치를 입력하세요. 게임 내 보유량이 아니라 계산 우선순위입니다.", en: "Enter the priority weight for Academy Points in efficiency scoring, not the in-game amount." },
  materials: { ko: "Materials가 효율 점수에서 차지하는 우선순위 가중치를 입력하세요. 게임 내 보유량이 아니라 계산 우선순위입니다.", en: "Enter the priority weight for Materials in efficiency scoring, not the in-game amount." },
  costReduction: { ko: "Cost Reduction 효과의 중요도를 나타내는 가중치를 입력하세요. 게임 내 보유량이 아니라 계산 우선순위입니다.", en: "Enter the priority weight for Cost Reduction effects, not an in-game amount." },
  rankPoints: { ko: "Rank Points 효과의 중요도를 나타내는 가중치를 입력하세요. 게임 내 보유량이 아니라 계산 우선순위입니다.", en: "Enter the priority weight for Rank Points effects, not an in-game amount." },
  level: { ko: "현재 게임에서 표시되는 플레이어 Level을 입력하세요.", en: "Enter the current player Level shown in-game." },
  loopsFilled: { ko: "현재 Cell Loop + Tick Loop + 무료 Loops Filled를 합한 유효 횟수를 입력하세요. Loop Resets와는 별개이며, 과거 최고 기록이 아닌 현재 게임 수치입니다.", en: "Enter current Cell Loop + Tick Loop + free Loops Filled. This is not the Reset count or a past best-run record." },
  loopResets: { ko: "이번 Construction의 Loop Reset 수에 Temporal 1/4 무료 Reset 보너스를 포함한 유효 횟수를 입력하세요. 전체 플레이 누적 횟수나 Loop Filled가 아닙니다.", en: "Enter effective Loop Resets this Construction, including Temporal 1/4 free Reset bonuses. Not lifetime resets or Loops Filled." },
  operationsDone: { ko: "현재 Run의 Operation 수에 게임의 추가 Operation 보너스가 적용된 최종값을 입력하세요. 과거 Run의 최고 기록이나 전체 플레이 누적 횟수가 아닙니다.", en: "Enter the final Operations count this run after in-game Operation bonuses, not a past best run or lifetime count." },
  studiesDone: { ko: "이번 Loop에 완료한 Academy Study 수를 입력하세요. 과거 Loop의 최고 기록이나 전체 플레이 누적 횟수가 아닙니다.", en: "Enter Academy Studies completed this Loop, not a past best loop or lifetime count." },
  lpDoublerBarFill: { ko: "현재 LP Doubler 게이지 수치를 0부터 10 사이로 입력하세요.", en: "Enter the current LP Doubler bar value from 0 to 10." },
  shardTickspeed: { ko: "게임에 표시되는 Shard Tick 간격을 초 단위로 입력하세요. 예: 0.25", en: "Enter the Shard Tick interval shown in-game, in seconds. Example: 0.25." },
  equipmentBought: { ko: "현재까지 구매한 Equipment의 누적 수를 입력하세요.", en: "Enter the total number of Equipment purchases made." },
  totalResearchLevels: { ko: "모든 Research의 현재 레벨을 합친 총합을 입력하세요.", en: "Enter the sum of the current levels across all Research." },
  completedResearches: { ko: "최대 레벨까지 완료한 Research의 개수를 입력하세요. 전체 Research 레벨 합계보다 클 수 없습니다.", en: "Enter the number of Research items completed to their maximum level. It cannot exceed total Research Levels." },
};

export function getInputFieldHelp(field: FieldForHelp, language: InputLanguage) {
  const gameInput = gameDisplayInputs.find(input => input.key === field.key);
  if (gameInput) return language === "ko" ? gameInput.helpKo : gameInput.helpEn;
  if (field.generator && field.tech === "hardware") return language === "ko"
    ? `게임에서 표시되는 MK${field.generator} Hardware Tech 수치를 입력하세요. Generator 수량과는 별개의 Tech 값입니다.`
    : `Enter the Hardware Tech value shown in-game for MK${field.generator}. It is separate from the Generator amount.`;
  if (field.generator && field.tech === "software") return language === "ko"
    ? `현재 MK${field.generator} Software Tech 레벨을 입력하세요. Hardware Tech와는 별개이며, 효과 표시용 Software 합계에도 자동 반영합니다.`
    : `Enter the current MK${field.generator} Software Tech level, separate from Hardware Tech. It is also included automatically in game-effect totals.`;
  if (field.generator) return language === "ko"
    ? `현재 보유한 Manual mk${field.generator} Generator 수량을 입력하세요. 업그레이드 해금 판정에 사용됩니다.`
    : `Enter the current number of Manual mk${field.generator} Generators you own. This is used for upgrade unlock checks.`;
  if (field.group === "ship") {
    const ship = field.label.replace(/ (Rank|Crew)$/, "");
    const isRank = field.label.endsWith("Rank");
    return language === "ko"
      ? isRank ? `${ship}의 게임 화면에 표시되는 현재 Rank를 입력하세요. 무료 랭크 보너스가 포함된 최종값입니다.` : `${ship}의 게임 화면에 표시되는 현재 Crew 수를 입력하세요. 무료 승무원 보너스가 포함된 최종값입니다.`
      : isRank ? `Enter the current Rank shown in-game for ${ship}, including free ranks.` : `Enter the current Crew shown in-game for ${ship}, including free crew.`;
  }
  const visibleLabel = language === "ko" ? field.koLabel ?? field.label : field.label;
  return inputFieldHelp[field.key]?.[language] ?? (language === "ko" ? `${visibleLabel}의 현재 게임 내 수치를 입력하세요.` : `Enter the current in-game value for ${visibleLabel}.`);
}

export function getInputFieldLabel(inputKey: string, language: InputLanguage): string {
  const key = GAME_DISPLAY_INPUT_ALIASES[inputKey] ?? inputKey;
  const labels: Readonly<Record<string, { label: string; koLabel?: string }>> = inputFieldLabels;
  const field = labels[key] ?? gameDisplayInputs.find(input => input.key === key);
  if (field) return language === "ko" ? field.koLabel ?? field.label : field.label;
  const ship = /^(cradle|auxesia|zagreus|hephaestus|demeter|koios|zeus)(Rank|Crew)$/.exec(key);
  if (ship) return `${ship[1][0].toUpperCase()}${ship[1].slice(1)} ${language === "ko" ? ship[2] === "Rank" ? "랭크" : "승무원" : ship[2]}`;
  const software = /^softwareTechMk([1-8])$/.exec(key);
  if (software) return `MK${software[1]} Software Tech`;
  const manual = /^manualMk([1-8])$/.exec(key);
  if (manual) return `Manual mk${manual[1]}`;
  return key;
}
