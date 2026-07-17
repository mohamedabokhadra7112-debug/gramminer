/**
 * MinersContext — shared state for the Miners page and the Dashboard.
 *
 * Centralising the miners state in a context means:
 *   • The Dashboard's "ربح 24 ساعة" panel always reflects the current owned
 *     miners and updates the moment the user buys or upgrades a miner.
 *   • There is a single source of truth for localStorage reads/writes.
 */
import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import {
  MINERS_CONFIG, MAX_MINER_LEVEL, MS_24H,
  getDailyReward, getUpgradeCost,
  loadMinersState, saveMinersState,
  type MinersState,
} from '@/lib/miners';

// ─── Context shape ────────────────────────────────────────────────────────────

type MinersContextType = {
  state: MinersState;
  /** Level of a given miner id (0 = not purchased) */
  getLevel: (id: number) => number;
  /** True if the miner at `index` is locked (previous miner not yet at L1) */
  isLocked: (index: number) => boolean;
  /**
   * Projected gram income for the next 24 hours based on the user's currently
   * owned miners and their levels.  This is the value shown in "ربح 24 ساعة".
   */
  dailyProjection: number;
  /** Whether 24 h have elapsed since the last miners claim */
  canClaim: boolean;
  /** ms remaining until the next claim becomes available */
  remainingMs: number;
  /** Total gram ready to claim (> 0 only when canClaim is true) */
  totalPending: number;
  /**
   * Buy or upgrade a miner.  Deducts the upgrade cost via `spendCoins`; returns
   * true on success, false if insufficient coins or already maxed.
   */
  upgrade: (minerId: number, index: number, spendCoins: (n: number) => boolean) => boolean;
  /** Claim the 24 h miner cycle, adding gram to the wallet */
  claimAll: (addClickEarning: (n: number) => void) => void;
};

const MinersContext = createContext<MinersContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MinersProvider({ children }: { children: React.ReactNode }) {
  const [state, setState]   = useState<MinersState>(loadMinersState);
  const [now,   setNow]     = useState(() => Date.now());

  // Tick every second (countdown timer)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Persist whenever state changes (per-user key)
  useEffect(() => { saveMinersState(state); }, [state]);

  // ── Derived values ────────────────────────────────────────────────────────

  const getLevel  = useCallback((id: number)    => state.levels[id] ?? 0, [state.levels]);
  const isLocked  = useCallback((index: number) =>
    index > 0 && (state.levels[MINERS_CONFIG[index - 1].id] ?? 0) < 1,
  [state.levels]);

  /** Projected gram per 24 h from all active miners — re-computed on every purchase/upgrade */
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

  // ── Actions ───────────────────────────────────────────────────────────────

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
      state, getLevel, isLocked,
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
