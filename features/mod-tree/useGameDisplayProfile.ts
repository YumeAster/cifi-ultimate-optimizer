import { useEffect, useMemo, useState } from "react";
import { GAME_DISPLAY_ANCHORS_KEY, deriveGameDisplayProfile, reconcileGameDisplayAnchors, restoreGameDisplayAnchors, type GameDisplayAnchors } from "../../lib/cifi/mod-tree/gameDisplayProfile";
import type { ModState, PlayerProfile } from "../../lib/cifi/mod-tree/recommendations";

export function useGameDisplayProfile(profile: PlayerProfile, state: ModState, ready: boolean) {
  const [anchors, setAnchors] = useState<GameDisplayAnchors | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try { setAnchors(restoreGameDisplayAnchors(JSON.parse(localStorage.getItem(GAME_DISPLAY_ANCHORS_KEY) ?? "{}"))); }
      catch { setAnchors({}); setStorageFailed(true); }
    });
    return () => { active = false; };
  }, []);
  const resolved = useMemo(() => ready && anchors !== null ? reconcileGameDisplayAnchors(anchors, profile, state) : null, [ready, anchors, profile, state]);
  useEffect(() => {
    if (resolved === null || JSON.stringify(resolved) === JSON.stringify(anchors)) return;
    let active = true;
    let failed = false;
    try { localStorage.setItem(GAME_DISPLAY_ANCHORS_KEY, JSON.stringify(resolved)); }
    catch { failed = true; }
    queueMicrotask(() => { if (active) { setAnchors(resolved); setStorageFailed(failed); } });
    return () => { active = false; };
  }, [resolved, anchors]);
  const displayProfile = useMemo(() => resolved === null ? profile : deriveGameDisplayProfile(profile, state, resolved), [profile, state, resolved]);
  return { displayProfile, storageFailed };
}
