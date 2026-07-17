/**
 * MinersContext — shared state for the Miners page and the Dashboard.
 *
 * State is persisted in TWO places:
 *   1. localStorage  — instant, offline, device-local cache
 *   2. Server / DB   — source of truth shared across ALL devices
 *
 * On mount:  load from localStorage immediately (fast), then fetch the
 *            server state and MERGE (keep the higher level per miner).
 * On change: write to localStorage immediately, then debounce-save to
 *            the server (1 s) so a rapid buy → upgrade → upgrade is a
 *            single request.
 *
 * This means the same Telegram account always sees the same miners on
 * mobile, desktop, and web — not just on the device where they bought them.
 */
import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo, useRef,
} from 'react';
import {
  MINERS_CONFIG, MAX_MINER_LEVEL, MS_24H,
  getDailyReward, getUpgradeCost,
  loadMinersState, saveMinersState,
  type MinersState,
} from '@/lib/miners';
import { telegramApiPost, getInitData } from '@/lib/telegramApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type MinersContextType = {
  state: MinersState;
  /** True while the initial server state is still loading */
  isLoading: boolean;
  getLevel:  (id: number) => number;
  isLocked:  (index: number) => boolean;
  dailyProjection: number;
  canClaim:    boolean;
  remainingMs: number;
  totalPending: number;
  upgrade:  (minerId: number, index: number, spendCoins: (n: number) => boolean) => boolean;
  claimAll: (addClickEarning: (n: number) => void) => void;
};

const MinersContext = createContext<MinersContextType | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Merge two levels maps — keep the HIGHER level for each miner */
function mergeMaxLevels(
  a: Record<number, number>,
  b: Record<number, number>,
): Record<number, number> {
  const result = { ...a };
  for (const [id, lvl] of Object.entries(b)) {
    const num = Number(id);
    result[num] = Math.max(result[num] ?? 0, lvl);
  }
  return result;
}

type ServerMinersPayload = {
  levels: Record<number, number>;
  lastClaimAt: number | null;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MinersProvider({ children }: { children: React.ReactNode }) {
  const [state,     setState]   = useState<MinersState>(loadMinersState);
  const [now,       setNow]     = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(false);

  // Is this session running inside Telegram? (initData available)
  const inTelegram = Boolean(getInitData());

  // Debounce ref for server saves
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 1. Tick ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // ── 2. Initial server load & merge ────────────────────────────────────────
  useEffect(() => {
    if (!inTelegram) return; // browser preview — localStorage only

    setIsLoading(true);
    telegramApiPost<ServerMinersPayload>('/telegram/miners/load', {})
      .then(server => {
        setState(prev => ({
          // Take the higher level for every miner to avoid accidental downgrade
          levels: mergeMaxLevels(prev.levels, server.levels),
          // Take the more-recent claim timestamp
          lastClaimAt:
            server.lastClaimAt != null && (prev.lastClaimAt ?? 0) < server.lastClaimAt
              ? server.lastClaimAt
              : prev.lastClaimAt,
        }));
      })
      .catch(() => { /* offline or no BOT_TOKEN — localStorage stays */ })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ── 3. Persist on every state change ──────────────────────────────────────
  useEffect(() => {
    // Always write to localStorage immediately
    saveMinersState(state);

    // Debounce the server write to avoid a flood of requests during rapid upgrades
    if (!inTelegram) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      telegramApiPost('/telegram/miners/save', {
        levels:      state.levels,
        lastClaimAt: state.lastClaimAt,
      }).catch(() => {}); // fire-and-forget; localStorage already has it
    }, 1_000);
  }, [state, inTelegram]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const getLevel = useCallback((id: number) => state.levels[id] ?? 0, [state.levels]);

  const isLocked = useCallback((index: number) =>
    index > 0 && (state.levels[MINERS_CONFIG[index - 1].id] ?? 0) < 1,
  [state.levels]);

  const dailyProjection = useMemo(() => MINERS_CONFIG.reduce((sum, m) => {
    const lvl = state.levels[m.id] ?? 0;
    return lvl > 0 ? sum + getDailyReward(m.baseCost, m.dailyPct, lvl) : sum;
  }, 0), [state.levels]);

  const elapsed     = state.lastClaimAt ? now - state.lastClaimAt : MS_24H + 1;
  const canClaim    = elapsed >= MS_24H;
  const remainingMs = canClaim ? 0 : MS_24H - elapsed;

  const totalPending = useMemo(() => canClaim
    ? MINERS_CONFIG.reduce((sum, m) => {
        const lvl = state.levels[m.id] ?? 0;
        return lvl > 0 ? sum + getDailyReward(m.baseCost, m.dailyPct, lvl) : sum;
      }, 0)
    : 0,
  [canClaim, state.levels]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const upgrade = useCallback((
    minerId: number,
    index: number,
    spendCoins: (n: number) => boolean,
  ): boolean => {
    if (index > 0 && (state.levels[MINERS_CONFIG[index - 1].id] ?? 0) < 1) return false;
    const level = state.levels[minerId] ?? 0;
    if (level >= MAX_MINER_LEVEL) return false;
    const cost = getUpgradeCost(MINERS_CONFIG[index].baseCost, level);
    if (!spendCoins(cost)) return false;
    setState(prev => ({
      ...prev,
      levels: { ...prev.levels, [minerId]: level + 1 },
    }));
    return true;
  }, [state.levels]);

  const claimAll = useCallback((addClickEarning: (n: number) => void) => {
    const pending = MINERS_CONFIG.reduce((sum, m) => {
      const lvl = state.levels[m.id] ?? 0;
      return lvl > 0 ? sum + getDailyReward(m.baseCost, m.dailyPct, lvl) : sum;
    }, 0);
    if (pending <= 0) return;
    addClickEarning(pending);
    setState(prev => ({ ...prev, lastClaimAt: Date.now() }));
  }, [state.levels]);

  return (
    <MinersContext.Provider value={{
      state, isLoading, getLevel, isLocked,
      dailyProjection, canClaim, remainingMs, totalPending,
      upgrade, claimAll,
    }}>
      {children}
    </MinersContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMiners() {
  const ctx = useContext(MinersContext);
  if (!ctx) throw new Error('useMiners must be used within MinersProvider');
  return ctx;
}
