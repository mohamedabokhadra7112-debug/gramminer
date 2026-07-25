import { useState, useCallback } from 'react';
import { CheckCircle2, Loader2, Clock } from 'lucide-react';
import { useCoins } from '@/context/CoinsContext';
import { useWallet } from '@/context/WalletContext';
import { getInitData, API_BASE, telegramApiPost } from '@/lib/telegramApi';

// ─── Rate ─────────────────────────────────────────────────────────────────────
const COINS_PER_GRAM = 700; // 1 gram = 700 coin

// ─── Plan grid: 3 rows × 2 cols (original + ×2) ──────────────────────────────
interface Plan {
  id: string;
  label: string;
  dayIcon: string;
  gram: number;
  coins: number;
}

// Row pairs: [original, doubled]
const PLAN_ROWS: [Plan, Plan][] = [
  [
    { id: 'daily',    label: 'DAILY',    dayIcon: '',   gram: 0.05, coins: 35   },
    { id: 'daily2',   label: 'DAILY',    dayIcon: '',   gram: 0.10, coins: 70   },
  ],
  [
    { id: 'month1',   label: '1 MONTH',  dayIcon: '30', gram: 1.50, coins: 1050 },
    { id: 'month1x2', label: '1 MONTH',  dayIcon: '30', gram: 3.00, coins: 2100 },
  ],
  [
    { id: 'month3',   label: '3 MONTHS', dayIcon: '90', gram: 4.50, coins: 3150 },
    { id: 'month3x2', label: '3 MONTHS', dayIcon: '90', gram: 9.00, coins: 6300 },
  ],
];
const ALL_PLANS = PLAN_ROWS.flat();

// ─── Purchase history row ─────────────────────────────────────────────────────
interface SwapRecord {
  id: number;
  gram_amount: number;
  coins_amount: number;
  created_at: string;
}

// ─── Main Store Page ──────────────────────────────────────────────────────────
export default function Store() {
  const { coins, refreshBalance } = useCoins();
  const { holdingWallet, sessionEarnings } = useWallet();
  const totalGram = holdingWallet + sessionEarnings;

  const [selected, setSelected] = useState<string>('month1');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; msg: string }>({
    type: 'idle', msg: '',
  });
  const [history, setHistory] = useState<SwapRecord[]>([]);

  const plan = ALL_PLANS.find(p => p.id === selected)!;
  const canAfford = totalGram >= plan.gram;

  const loadHistory = useCallback(async () => {
    const initData = getInitData();
    if (!initData) return;
    try {
      const res = await fetch(`${API_BASE}/api/telegram/swap/history`, {
        headers: { 'x-init-data': initData },
      });
      if (res.ok) {
        const data = await res.json() as SwapRecord[];
        if (Array.isArray(data)) {
          setHistory(data.filter((h: SwapRecord) => h.gram_amount > 0).slice(0, 5));
        }
      }
    } catch { /* best-effort */ }
  }, []);

  const handlePay = async () => {
    if (!canAfford || status.type === 'loading') return;
    const initData = getInitData();
    if (!initData) {
      setStatus({ type: 'err', msg: '❌ افتح التطبيق من تيليجرام' });
      return;
    }
    setStatus({ type: 'loading', msg: '' });
    try {
      await telegramApiPost<{ ok: boolean }>('/telegram/swap', {
        direction: 'gram_to_coins',
        amount: plan.gram,
      });
      setStatus({ type: 'ok', msg: `✅ تم الشراء! +${plan.coins.toLocaleString()} coin` });
      await refreshBalance();
      await loadHistory();
      setTimeout(() => setStatus({ type: 'idle', msg: '' }), 3500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ type: 'err', msg: `❌ ${msg}` });
      setTimeout(() => setStatus({ type: 'idle', msg: '' }), 3000);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center relative w-full">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.72)' }} />

      <div className="relative z-10 w-full max-w-sm px-3 pt-3 pb-28 flex flex-col items-center">

        {/* ── Coin balance chip (top right) ── */}
        <div className="self-end mb-2 flex items-center gap-1.5 bg-black/60 border border-primary/30 rounded-xl px-3 py-1.5">
          <span className="text-primary font-bold text-sm">{coins.toLocaleString()}</span>
          <span className="text-white/50 text-xs">coin</span>
        </div>

        {/* ── Main card ── */}
        <div
          className="w-full rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #1a1205 0%, #0d0a04 60%, #120e06 100%)',
            border: '1px solid rgba(245,166,35,0.2)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
          }}
        >
          {/* ── Coin icon + exchange rate ── */}
          <div className="flex flex-col items-center pt-5 pb-4 px-4">
            {/* Smaller coin icon */}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
              style={{
                background: 'radial-gradient(circle at 38% 38%, #ffd96a 0%, #c8870a 55%, #7a4e00 100%)',
                boxShadow: '0 0 28px rgba(245,166,35,0.5), inset 0 -3px 8px rgba(0,0,0,0.4)',
              }}
            >
              <span style={{ fontSize: 32, lineHeight: 1 }}>⛏️</span>
            </div>

            {/* Exchange rate */}
            <div
              className="font-black leading-none"
              style={{
                fontSize: 58,
                background: 'linear-gradient(180deg, #FFE082 0%, #F5A623 55%, #C67E10 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-1px',
              }}
            >
              {COINS_PER_GRAM}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <div style={{ width: 32, height: 1, background: 'rgba(245,166,35,0.4)' }} />
              <span className="text-[11px] font-black tracking-[0.3em] text-primary/80">COIN</span>
              <div style={{ width: 32, height: 1, background: 'rgba(245,166,35,0.4)' }} />
            </div>
          </div>

          {/* ── Plans grid: 3 rows × 2 cols ── */}
          <div className="mx-3 mb-3 rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {PLAN_ROWS.map(([left, right], rowIdx) => (
              <div
                key={rowIdx}
                className="grid grid-cols-2"
                style={{ borderBottom: rowIdx < PLAN_ROWS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
              >
                {[left, right].map((p, colIdx) => {
                  const isSelected = selected === p.id;
                  const isRight = colIdx === 1;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p.id)}
                      className="flex flex-col px-3 py-3 transition-all active:scale-[0.97] text-left"
                      style={{
                        borderLeft: isRight ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        background: isSelected ? 'rgba(245,166,35,0.1)' : 'transparent',
                        outline: isSelected ? '1.5px solid rgba(245,166,35,0.35)' : 'none',
                        outlineOffset: '-1.5px',
                        borderRadius: 0,
                      }}
                    >
                      {/* Top row: icon + label */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <div
                          className="flex-shrink-0 flex items-center justify-center rounded-md"
                          style={{
                            width: 24, height: 24,
                            background: isSelected ? 'rgba(245,166,35,0.2)' : 'rgba(255,255,255,0.07)',
                            border: `1px solid ${isSelected ? 'rgba(245,166,35,0.5)' : 'rgba(255,255,255,0.1)'}`,
                          }}
                        >
                          {p.dayIcon ? (
                            <span className="font-black" style={{ fontSize: 8, color: isSelected ? '#F5A623' : 'rgba(255,255,255,0.4)' }}>
                              {p.dayIcon}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, lineHeight: 1 }}>📅</span>
                          )}
                        </div>
                        <span
                          className="font-black text-[11px] tracking-wide"
                          style={{ color: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.5)' }}
                        >
                          {p.label}
                        </span>
                      </div>

                      {/* Price */}
                      <div
                        className="font-black text-base leading-tight"
                        style={{ color: isSelected ? '#F5A623' : 'rgba(245,166,35,0.5)' }}
                      >
                        {p.gram.toFixed(2)}g
                      </div>
                      <div className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {p.coins.toLocaleString()} coin
                      </div>

                      {/* ×2 badge on right column */}
                      {isRight && (
                        <div
                          className="mt-1 self-start rounded px-1 text-[9px] font-black"
                          style={{ background: 'rgba(245,166,35,0.2)', color: '#F5A623' }}
                        >
                          ×2
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* ── Status ── */}
          {status.msg && (
            <div
              className="mx-3 mb-2 rounded-xl p-2.5 text-center text-sm font-bold"
              style={{
                background: status.type === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${status.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: status.type === 'ok' ? '#4ade80' : '#f87171',
              }}
            >
              {status.msg}
            </div>
          )}

          {/* ── Not enough gram ── */}
          {!canAfford && status.type === 'idle' && (
            <div className="mx-3 mb-2 text-center text-[11px] font-semibold" style={{ color: 'rgba(239,68,68,0.7)' }}>
              ❌ رصيدك {totalGram.toFixed(4)} gram · تحتاج {plan.gram.toFixed(2)} gram
            </div>
          )}

          {/* ── PAY WITH GRAM button ── */}
          <div className="px-3 pb-4">
            <button
              onClick={handlePay}
              disabled={!canAfford || status.type === 'loading'}
              className="w-full flex items-center justify-center gap-3 rounded-2xl py-3.5 transition-all active:scale-[0.98]"
              style={{
                background: canAfford && status.type !== 'loading'
                  ? 'linear-gradient(135deg, #F5A623 0%, #E8920D 100%)'
                  : 'rgba(100,80,20,0.4)',
                boxShadow: canAfford ? '0 4px 20px rgba(245,166,35,0.35)' : 'none',
                cursor: canAfford && status.type !== 'loading' ? 'pointer' : 'not-allowed',
              }}
            >
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-full"
                style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.2)' }}
              >
                {status.type === 'loading'
                  ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                  : <span style={{ fontSize: 16 }}>◈</span>
                }
              </div>
              <div className="text-left">
                <div className="text-black font-black text-sm leading-tight">
                  {status.type === 'loading' ? 'جارٍ الشراء...' : `${plan.gram.toFixed(2)} GRAM`}
                </div>
                <div className="text-black/60 font-bold text-[10px] tracking-wider">
                  {status.type === 'loading' ? 'يرجى الانتظار' : `PAY WITH GRAM · +${plan.coins.toLocaleString()} COIN`}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* ── Purchase history ── */}
        {history.length > 0 && (
          <div className="w-full mt-4">
            <p className="text-[10px] font-black text-white/40 mb-2 flex items-center gap-1.5 uppercase tracking-widest">
              <Clock className="w-3 h-3" /> آخر المشتريات
            </p>
            <div className="space-y-1.5">
              {history.map(h => (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div>
                    <div className="text-white font-bold text-xs">
                      {h.gram_amount.toFixed(2)} gram → <span className="text-primary">{h.coins_amount.toLocaleString()} coin</span>
                    </div>
                    <div className="text-white/30 text-[9px]">{new Date(h.created_at).toLocaleDateString('ar')}</div>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Rate note ── */}
        <div
          className="w-full mt-3 rounded-xl px-3 py-2.5 text-center"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p className="text-[10px] text-white/40 font-medium">
            معدل الثابت: <span className="text-primary font-bold">700 COIN = 1 Gram</span>
            <span className="mx-2 text-white/20">·</span>
            رصيد coin يحدد نسبة التعدين
          </p>
        </div>
      </div>
    </div>
  );
}
