import { useEffect, useMemo, useRef, useState } from "react";
import { addCifiDecimals, decimalToString, parseCifiDecimal } from "../../lib/cifi/upgrades/decimal";
import { blankModState, evaluateMods, MOD_STORAGE_KEY, purchaseMod, rankMods, restoreModState, simulateMods, type ModPlan, type ModState, type PlayerProfile } from "../../lib/cifi/mod-tree/recommendations";

export function useModRecommendations(profile: PlayerProfile) {
  const [state, setState] = useState<ModState>(blankModState);
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [plan, setPlan] = useState<ModPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<ModState | null>(null);
  const stateRef = useRef(state);
  const generation = useRef(0);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MOD_STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        stateRef.current = restoreModState(stored); setState(stateRef.current);
        if (stored.budget !== stateRef.current.budget) localStorage.setItem(MOD_STORAGE_KEY, JSON.stringify(stateRef.current));
      }
    } catch { setStorageFailed(true); }
    setReady(true);
    return () => { generation.current++; };
  }, []);
  useEffect(() => { generation.current++; setPlan(null); setBusy(false); setUndo(null); }, [profile]);
  const commit = (next: ModState, keepUndo = false) => {
    if (!ready) return;
    const validated = restoreModState(next);
    generation.current++;
    setPlan(null); setBusy(false);
    setUndo(keepUndo ? stateRef.current : null);
    stateRef.current = validated;
    setState(validated);
    try { localStorage.setItem(MOD_STORAGE_KEY, JSON.stringify(validated)); setStorageFailed(false); }
    catch { setStorageFailed(true); }
  };
  const evaluations = useMemo(() => evaluateMods(state, profile), [state, profile]);
  const ranked = useMemo(() => rankMods(evaluations), [evaluations]);
  const calculate = async (limit: number) => {
    if (!ready) return;
    const current = ++generation.current;
    setBusy(true); setPlan(null);
    let next = stateRef.current;
    let spent = parseCifiDecimal("0");
    const steps: ModPlan["steps"] = [];
    try {
      while (steps.length < limit) {
        // Yield between bounded batches so input changes/unmount can cancel.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (generation.current !== current) return;
        const part = simulateMods(next, profile, Math.min(5, limit - steps.length));
        steps.push(...part.steps); next = part.next;
        spent = addCifiDecimals(spent, parseCifiDecimal(part.spent));
        if (part.stopped === "no-candidate") break;
      }
      if (generation.current === current) setPlan({ next, steps, spent: decimalToString(spent), stopped: steps.length === limit ? "limit" : "no-candidate" });
    } finally { if (generation.current === current) setBusy(false); }
  };
  const applyOne = (code: string) => {
    if (!ready) return false;
    const next = purchaseMod(stateRef.current, profile, code);
    if (!next) return false;
    commit(next, true);
    return true;
  };
  const invalidate = () => { generation.current++; setPlan(null); setBusy(false); };
  const getRevision = () => generation.current;
  return { state, ready, storageFailed, evaluations, ranked, plan, busy, undo, commit, calculate, applyOne, invalidate, getRevision };
}
