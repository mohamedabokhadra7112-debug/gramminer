import { useState, useEffect } from 'react';
import { Lock, Clock, Zap } from 'lucide-react';
import { useCoins } from '@/context/CoinsContext';
import { useWallet } from '@/context/WalletContext';

// ─── Miners configuration ─────────────────────────────────────────────────────
// Miners 1-5: 5% daily ROI, Miners 6-10: 8% daily ROI
// Costs: 10 / 50 / 250 / 500 / 1000 / 2000 / 5000 / 10000 / 15000 / 20000
// Each level upgrade costs baseCost * 1.1^currentLevel
// Daily reward = baseCost * dailyPct * level  (scales with level)
// 700 GRAM = 1 TON

const MINERS_CONFIG = [
  { id: 1,  name: 'Stone Collector',     baseCost: 10,    dailyPct: 0.05, row: 0, col: 0 },
  { id: 2,  name: 'Copper Miner',        baseCost: 50,    dailyPct: 0.05, row: 0, col: 1 },
  { id: 3,  name: 'Ore Cart',            baseCost: 250,   dailyPct: 0.05, row: 0, col: 2 },
  { id: 4,  name: 'Crystal Hunter',      baseCost: 500,   dailyPct: 0.05, row: 0, col: 3 },
  { id: 5,  name: 'Forge Master',        baseCost: 1000,  dailyPct: 0.05, row: 0, col: 4 },
  { id: 6,  name: 'Mining Drone',        baseCost: 2000,  dailyPct: 0.08, row: 1, col: 0 },
  { id: 7,  name: 'Quantum Excavator',   baseCost: 5000,  dailyPct: 0.08, row: 1, col: 1 },
  { id: 8,  name: 'Satellite Extractor', baseCost: 10000, dailyPct: 0.08, row: 1, col: 2 },
  { id: 9,  name: 'Planet Miner',        baseCost: 15000, dailyPct: 0.08, row: 1, col: 3 },
  { id: 10, name: 'Gram Core Reactor',   baseCost: 20000, dailyPct: 0.08, row: 1, col: 4 },
] as const;

const MAX_LEVEL = 10;
const MS_24H = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'gram_miners_state';

// ─── Types ────────────────────────────────────────────────────────────────────
type MinersState = {
  levels: Record<number, number>;
  lastClaimAt: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadState(): MinersState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as MinersState;
  } catch { /* ignore */ }
  return { levels: {}, lastClaimAt: null };
}

function saveState(state: MinersState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

/** Cost to go from `level` → `level+1`: baseCost × 1.1^level */
function getUpgradeCost(baseCost: number, level: number): number {
  return Math.round(baseCost * Math.pow(1.1, level));
}

/** Daily GRAM reward = baseCost × pct × level (increases each level) */
function getDailyReward(baseCost: number, pct: number, level: number): number {
  return baseCost * pct * level;
}

/** CSS for the sprite sheet (5 cols × 2 rows) */
function spriteStyle(col: number, row: number): React.CSSProperties {
  const x = col === 0 ? 0 : (col / 4) * 100;
  const y = row === 0 ? 0 : 100;
  return {
    backgroundImage: 'url(/miners-sheet.jpg)',
    backgroundSize: '500% 200%',
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: 'no-repeat',
  };
}

function formatCountdown(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Miners() {
  const { coins, spendCoins } = useCoins();
  const { addClickEarning } = useWallet();

  const [state, setState] = useState<MinersState>(loadState);
  const [now, setNow] = useState(Date.now());

  // Tick every second for the countdown timer
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Persist whenever state changes
  useEffect(() => { saveState(state); }, [state]);

  const getLevel = (id: number) => state.levels[id] ?? 0;

  const isLocked = (index: number) =>
    index > 0 && getLevel(MINERS_CONFIG[index - 1].id) < 1;

  // Claim timing
  const elapsed = state.lastClaimAt ? now - state.lastClaimAt : MS_24H + 1;
  const canClaim = elapsed >= MS_24H;
  const remainingMs = canClaim ? 0 : MS_24H - elapsed;

  // Total GRAM ready to claim (only when 24 h cycle complete)
  const totalPending = canClaim
    ? MINERS_CONFIG.reduce((sum, m) => {
        const lvl = getLevel(m.id);
        return lvl > 0 ? sum + getDailyReward(m.baseCost, m.dailyPct, lvl) : sum;
      }, 0)
    : 0;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleUpgrade = (minerId: number, index: number) => {
    if (isLocked(index)) return;
    const level = getLevel(minerId);
    if (level >= MAX_LEVEL) return;
    const miner = MINERS_CONFIG[index];
    const cost = getUpgradeCost(miner.baseCost, level);
    if (!spendCoins(cost)) return;
    setState(prev => ({
      ...prev,
      levels: { ...prev.levels, [minerId]: level + 1 },
    }));
  };

  const handleClaimAll = () => {
    if (!canClaim || totalPending <= 0) return;
    addClickEarning(totalPending);
    setState(prev => ({ ...prev, lastClaimAt: Date.now() }));
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-5">
      {/* Dark overlay */}
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

      {/* ── Header ── */}
      <div className="relative z-10 mb-4">
        {/* Title + Coins */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-black text-white tracking-tight">⛏️ Gram Miners</h1>
          <div className="flex items-center gap-1.5 bg-black/50 border border-yellow-500/30 rounded-xl px-3 py-1.5">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-yellow-400 font-bold text-sm">{coins.toLocaleString()}</span>
          </div>
        </div>

        {/* Claim All panel */}
        <div className="bg-secondary/50 border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {canClaim ? (
              totalPending > 0 ? (
                <>
                  <div className="text-green-400 font-bold text-sm">
                    +{totalPending.toLocaleString(undefined, { maximumFractionDigits: 2 })} GRAM ready!
                  </div>
                  <div className="text-gray-400 text-xs mt-0.5">24h mining cycle complete</div>
                </>
              ) : (
                <>
                  <div className="text-gray-300 font-semibold text-sm">No active miners yet</div>
                  <div className="text-gray-500 text-xs">Buy a miner below to start earning</div>
                </>
              )
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-white font-bold text-sm">
                  <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="font-mono">{formatCountdown(remainingMs)}</span>
                </div>
                <div className="text-gray-400 text-xs mt-0.5">Until next mining cycle</div>
              </>
            )}
          </div>

          <button
            onClick={handleClaimAll}
            disabled={!canClaim || totalPending <= 0}
            className={`flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
              canClaim && totalPending > 0
                ? 'bg-green-500 text-black shadow-[0_0_12px_rgba(34,197,94,0.4)] hover:opacity-90 active:scale-95'
                : 'bg-gray-700/60 text-gray-500 cursor-not-allowed'
            }`}
          >
            Claim All
          </button>
        </div>
      </div>

      {/* ── Miners list ── */}
      <div className="relative z-10 flex-1 space-y-3 pb-6">
        {MINERS_CONFIG.map((miner, index) => {
          const locked  = isLocked(index);
          const level   = getLevel(miner.id);
          const maxed   = level >= MAX_LEVEL;
          const cost    = getUpgradeCost(miner.baseCost, level);
          const canAfford = coins >= cost;
          const daily   = getDailyReward(miner.baseCost, miner.dailyPct, level);

          return (
            <div
              key={miner.id}
              className={`bg-secondary/60 backdrop-blur-sm border rounded-2xl p-4 transition-all ${
                locked
                  ? 'border-white/5 opacity-50'
                  : maxed
                  ? 'border-yellow-500/30'
                  : level > 0
                  ? 'border-primary/30'
                  : 'border-white/10'
              }`}
            >
              <div className="flex items-center gap-3">

                {/* ── Miner image / lock ── */}
                <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 bg-black/50">
                  {locked ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                      <Lock className="w-5 h-5 text-gray-600" />
                      <span className="text-[9px] text-gray-600 font-bold">LOCKED</span>
                    </div>
                  ) : (
                    <div className="w-full h-full" style={spriteStyle(miner.col, miner.row)} />
                  )}
                </div>

                {/* ── Info ── */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-bold text-sm leading-tight">
                      {miner.id}. {miner.name}
                    </span>
                    {maxed && (
                      <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full px-1.5 py-0.5 font-bold flex-shrink-0">
                        MAX
                      </span>
                    )}
                  </div>

                  {locked ? (
                    <p className="text-red-400/80 text-xs">
                      Reach Level 1 on previous miner
                    </p>
                  ) : level === 0 ? (
                    <div>
                      <p className="text-gray-400 text-xs">Not purchased</p>
                      <p className="text-green-500/70 text-xs mt-0.5">
                        Earns {(miner.baseCost * miner.dailyPct).toLocaleString(undefined, { maximumFractionDigits: 2 })} GRAM/day at L1
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-green-400 text-xs font-semibold">
                        {daily.toLocaleString(undefined, { maximumFractionDigits: 2 })} GRAM / 24h
                      </p>
                      <p className="text-blue-400/80 text-xs">
                        {(miner.dailyPct * 100)}% daily · L{level}/{MAX_LEVEL}
                      </p>
                    </div>
                  )}

                  {/* Level progress bar */}
                  {level > 0 && (
                    <div className="mt-1.5 w-full bg-black/40 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${maxed ? 'bg-yellow-400' : 'bg-primary'}`}
                        style={{ width: `${(level / MAX_LEVEL) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* ── Buy / Upgrade button ── */}
                {!locked && (
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    {!maxed && (
                      <div className="text-yellow-400 text-xs font-bold text-right">
                        {cost.toLocaleString()} <span className="text-yellow-600">coins</span>
                      </div>
                    )}
                    <button
                      onClick={() => handleUpgrade(miner.id, index)}
                      disabled={locked || maxed || !canAfford}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                        maxed
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 cursor-default'
                          : !canAfford
                          ? 'bg-gray-700/60 text-gray-500 cursor-not-allowed'
                          : level === 0
                          ? 'bg-primary text-black shadow-[0_0_10px_rgba(245,166,35,0.3)] hover:opacity-90'
                          : 'bg-blue-500 text-white shadow-[0_0_8px_rgba(59,130,246,0.3)] hover:opacity-90'
                      }`}
                    >
                      {maxed ? 'MAX' : level === 0 ? '⛏ Buy' : '⬆ Upgrade'}
                    </button>
                    {!maxed && !canAfford && level === 0 && (
                      <span className="text-[10px] text-gray-500">Need {(cost - coins).toLocaleString()} more</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Info footer ── */}
      <div className="relative z-10 mb-4 rounded-2xl bg-black/50 border border-white/10 p-4">
        <div className="grid grid-cols-2 gap-y-2 text-xs text-gray-400">
          <span>Exchange Rate</span>
          <span className="text-right font-bold text-primary">700 GRAM = 1 TON</span>

          <span>Upgrade cost</span>
          <span className="text-right text-green-400">+10% per level</span>

          <span>Miners 1 – 5</span>
          <span className="text-right text-blue-400">5% daily ROI</span>

          <span>Miners 6 – 10</span>
          <span className="text-right text-purple-400">8% daily ROI</span>

          <span>Max level</span>
          <span className="text-right text-yellow-400">Level 10</span>

          <span>Mining cycle</span>
          <span className="text-right text-gray-300">Every 24 hours</span>
        </div>
      </div>
    </div>
  );
}
