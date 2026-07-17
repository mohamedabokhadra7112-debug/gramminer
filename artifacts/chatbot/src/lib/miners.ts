/**
 * Shared miner configuration and helpers used by both the Miners page
 * and the Dashboard (for the projected 24-hour earnings display).
 *
 * 1 gram = 700 coins.  Daily reward is in GRAM = (baseCost / 700) × dailyPct × level.
 *
 * Tier breakdown (dailyPct):
 *   Miners 1–2:   5%
 *   Miners 3–5:   6%
 *   Miners 6–7:   8%
 *   Miner  8:    10%
 *   Miner  9:    12%
 *   Miner 10:    15%
 *
 * Upgrade cost: baseCost × 1.1^currentLevel  (paid in coins)
 */

export const GRAM_PER_COIN = 700;

export const MINERS_CONFIG = [
  { id: 1,  name: 'Stone Collector',     baseCost: 10,    dailyPct: 0.05, row: 0, col: 0 },
  { id: 2,  name: 'Copper Miner',        baseCost: 50,    dailyPct: 0.05, row: 0, col: 1 },
  { id: 3,  name: 'Ore Cart',            baseCost: 250,   dailyPct: 0.06, row: 0, col: 2 },
  { id: 4,  name: 'Crystal Hunter',      baseCost: 500,   dailyPct: 0.06, row: 0, col: 3 },
  { id: 5,  name: 'Forge Master',        baseCost: 1000,  dailyPct: 0.06, row: 0, col: 4 },
  { id: 6,  name: 'Mining Drone',        baseCost: 2000,  dailyPct: 0.08, row: 1, col: 0 },
  { id: 7,  name: 'Quantum Excavator',   baseCost: 5000,  dailyPct: 0.08, row: 1, col: 1 },
  { id: 8,  name: 'Satellite Extractor', baseCost: 10000, dailyPct: 0.10, row: 1, col: 2 },
  { id: 9,  name: 'Planet Miner',        baseCost: 15000, dailyPct: 0.12, row: 1, col: 3 },
  { id: 10, name: 'Gram Core Reactor',   baseCost: 20000, dailyPct: 0.15, row: 1, col: 4 },
] as const;

export type MinerConfig = (typeof MINERS_CONFIG)[number];

export const MAX_MINER_LEVEL = 10;
export const MS_24H = 24 * 60 * 60 * 1000;

/** Cost to go from `level` → `level+1`: baseCost × 1.1^level */
export function getUpgradeCost(baseCost: number, level: number): number {
  return Math.round(baseCost * Math.pow(1.1, level));
}

/**
 * Daily GRAM reward for one miner at a given level.
 * Formula: baseCost × dailyPct × level  (result is in gram)
 * e.g. Stone Collector L4: 10 × 0.05 × 4 = 2.00 gram/day
 */
export function getDailyReward(baseCost: number, pct: number, level: number): number {
  return baseCost * pct * level;
}

/** Per-user localStorage key — prevents cross-account data bleed on shared devices */
export function getMinersStorageKey(): string {
  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return tgId ? `gram_miners_state_${tgId}` : 'gram_miners_state';
}

export type MinersState = {
  levels: Record<number, number>;
  lastClaimAt: number | null;
};

export function loadMinersState(): MinersState {
  try {
    // Check per-user key first; fall back to the old shared key for migration
    const key = getMinersStorageKey();
    const raw = localStorage.getItem(key) ?? localStorage.getItem('gram_miners_state');
    if (raw) return JSON.parse(raw) as MinersState;
  } catch { /* ignore */ }
  return { levels: {}, lastClaimAt: null };
}

export function saveMinersState(state: MinersState) {
  try { localStorage.setItem(getMinersStorageKey(), JSON.stringify(state)); } catch { /* ignore */ }
}

/** CSS background-position for the sprite sheet (5 cols × 2 rows) */
export function spriteStyle(col: number, row: number): React.CSSProperties {
  const x = col === 0 ? 0 : (col / 4) * 100;
  const y = row === 0 ? 0 : 100;
  return {
    backgroundImage: 'url(/miners-sheet.jpg)',
    backgroundSize: '500% 200%',
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: 'no-repeat',
  };
}

// React is only needed for the CSSProperties type — import it dynamically
// to keep this file usable as a plain utility module.
import type React from 'react';
