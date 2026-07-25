import { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { useCoins } from '@/context/CoinsContext';
import { useWallet } from '@/context/WalletContext';
import { getInitData, API_BASE, telegramApiPost } from '@/lib/telegramApi';

// ─── Rate & Plans ─────────────────────────────────────────────────────────────
const COINS_PER_GRAM = 700; // 1 gram = 700 coin

interface Plan {
  id: string;
  label: string;
  sublabel: string;
  dayIcon: string;
  gram: number;
  coins: number;
}

const PLANS: Plan[] = [
  { id: 'daily',    label: 'DAILY',    sublabel: '',   dayIcon: '',   gram: 0.05, coins: 35   },
  { id: 'monthly',  label: '1 MONTH',  sublabel: '30', dayIcon: '30', gram: 1.50, coins: 1050 },
  { id: '3months',  label: '3 MONTHS', sublabel: '90', dayIcon: '90', gram: 4.50, coins: 3150 },
];

// ─── Purchase history row ─────────────────────────────────────────────────────
interface SwapRecord {
  id: number;
  gram_amount: number;
  coins_amount: number;
  created_at: string;
}

// ─── Main Store Page ──────────────────────────────────────────────────────────
export default function Store() {
  const { refreshBalance } = useCoins();
  const { holdingWallet, sessionEarnings } = useWallet();
  const totalGram = holdingWallet + sessionEarnings;

  const [selected, setSelected] = useState<string>('monthly');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; msg: string }>({
    type: 'idle', msg: '',
  });
  const [history, setHistory] = useState<SwapRecord[]>([]);

  const plan = PLANS.find(p => p.id === selected)!;
  const canAfford = totalGram >= plan.gram;

  // Load recent gram→coin swap history for the user
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
          setHistory(data.filter(h => h.gram_amount > 0).slice(0, 5));
        }
      }
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Pay with gram balance ─────────────────────────────────────────────────
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
      setStatus({ type: 'ok', msg: `✅ تم الشراء بنجاح! +${plan.coins.toLocaleString()} coin` });
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
    <div
      className="min-h-full flex flex-col items-center relative w-full"
      style={{ backgroundColor: 'transparent' }}
    >
      {/* ── Dark overlay ── */}
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.72)' }} />

      <div className="relative z-10 w-full max-w-sm px-4 pt-4 pb-28 flex flex-col items-center">

        {/* ── Gram balance chip ── */}
        <div className="self-end mb-2 flex items-center gap-1.5 bg-black/60 border border-primary/30 rounded-xl px-3 py-1.5">
          <span className="text-primary font-bold text-sm">{totalGram.toFixed(4)}</span>
          <span className="text-white/50 text-xs">gram</span>
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
          {/* ── Coin image + amount ── */}
          <div className="flex flex-col items-center pt-8 pb-5 px-6">
            {/* Coin icon */}
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center mb-5"
              style={{
                background: 'radial-gradient(circle at 38% 38%, #ffd96a 0%, #c8870a 55%, #7a4e00 100%)',
                boxShadow: '0 0 40px rgba(245,166,35,0.5), inset 0 -4px 10px rgba(0,0,0,0.4)',
              }}
            >
              <span style={{ fontSize: 52, lineHeight: 1 }}>⛏️</span>
            </div>

            {/* Amount */}
            <div
              className="font-black leading-none"
              style={{
                fontSize: 72,
                background: 'linear-gradient(180deg, #FFE082 0%, #F5A623 55%, #C67E10 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: 'none',
                letterSpacing: '-2px',
              }}
            >
              {COINS_PER_GRAM}
            </div>

            {/* COIN label with divider lines */}
            <div className="flex items-center gap-3 mt-1">
              <div style={{ width: 40, height: 1, background: 'rgba(245,166,35,0.4)' }} />
              <span className="text-xs font-black tracking-[0.3em] text-primary/80">COIN</span>
              <div style={{ width: 40, height: 1, background: 'rgba(245,166,35,0.4)' }} />
            </div>
          </div>

          {/* ── Plans list ── */}
          <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {PLANS.map((p, i) => {
              const isSelected = selected === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className="w-full flex items-center justify-between px-4 py-4 transition-all active:scale-[0.98]"
                  style={{
                    borderBottom: i < PLANS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    background: isSelected ? 'rgba(245,166,35,0.08)' : 'transparent',
                  }}
                >
                  {/* Left — icon + label */}
                  <div className="flex items-center gap-3">
                    {/* Calendar icon */}
                    <div
                      className="flex-shrink-0 flex flex-col items-center justify-center rounded-lg"
                      style={{
                        width: 36, height: 36,
                        background: isSelected ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${isSelected ? 'rgba(245,166,35,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      }}
                    >
                      {p.dayIcon ? (
                        <span
                          className="font-black leading-none"
                          style={{ fontSize: 11, color: isSelected ? '#F5A623' : 'rgba(255,255,255,0.5)' }}
                        >
                          {p.dayIcon}
                        </span>
                      ) : (
                        <span style={{ fontSize: 16, lineHeight: 1 }}>📅</span>
                      )}
                    </div>

                    {/* Label */}
                    <span
                      className="font-black text-sm tracking-wide"
                      style={{ color: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.55)' }}
                    >
                      {p.label}
                    </span>
                  </div>

                  {/* Right — price */}
                  <div className="text-right">
                    <div
                      className="font-black text-base leading-tight"
                      style={{
                        color: isSelected ? '#F5A623' : 'rgba(245,166,35,0.55)',
                      }}
                    >
                      {p.gram.toFixed(2)} Gram
                    </div>
                    <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {p.coins.toFixed(2)} COIN
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Status message ── */}
          {status.msg && (
            <div
              className="mx-4 mb-3 rounded-xl p-2.5 text-center text-sm font-bold"
              style={{
                background: status.type === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${status.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: status.type === 'ok' ? '#4ade80' : '#f87171',
              }}
            >
              {status.msg}
            </div>
          )}

          {/* ── Not enough gram notice ── */}
          {!canAfford && status.type === 'idle' && (
            <div className="mx-4 mb-3 text-center text-xs font-semibold" style={{ color: 'rgba(239,68,68,0.7)' }}>
              ❌ رصيدك {totalGram.toFixed(4)} gram · تحتاج {plan.gram.toFixed(2)} gram
            </div>
          )}

          {/* ── PAY WITH GRAM button ── */}
          <div className="px-4 pb-5">
            <button
              onClick={handlePay}
              disabled={!canAfford || status.type === 'loading'}
              className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 transition-all active:scale-[0.98]"
              style={{
                background: canAfford && status.type !== 'loading'
                  ? 'linear-gradient(135deg, #F5A623 0%, #E8920D 100%)'
                  : 'rgba(100,80,20,0.4)',
                boxShadow: canAfford ? '0 4px 20px rgba(245,166,35,0.35)' : 'none',
                cursor: canAfford && status.type !== 'loading' ? 'pointer' : 'not-allowed',
              }}
            >
              {/* TON-style icon */}
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-full"
                style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.2)' }}
              >
                {status.type === 'loading'
                  ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                  : <span style={{ fontSize: 18 }}>◈</span>
                }
              </div>

              {/* Label */}
              <div className="text-left">
                <div className="text-black font-black text-base leading-tight">
                  {status.type === 'loading' ? 'جارٍ الشراء...' : `${plan.gram.toFixed(2)} GRAM`}
                </div>
                <div className="text-black/60 font-bold text-[11px] tracking-wider">
                  {status.type === 'loading' ? 'يرجى الانتظار' : 'PAY WITH GRAM'}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* ── Purchase history ── */}
        {history.length > 0 && (
          <div className="w-full mt-5">
            <p className="text-xs font-black text-white/50 mb-2 flex items-center gap-1.5 uppercase tracking-widest">
              <Clock className="w-3.5 h-3.5" /> آخر المشتريات
            </p>
            <div className="space-y-2">
              {history.map(h => (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div>
                    <div className="text-white font-bold text-sm">
                      {h.gram_amount.toFixed(2)} gram → <span className="text-primary">{h.coins_amount.toLocaleString()} coin</span>
                    </div>
                    <div className="text-white/30 text-[10px]">
                      {new Date(h.created_at).toLocaleDateString('ar')}
                    </div>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-primary/60 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Info note ── */}
        <div
          className="w-full mt-4 rounded-xl px-4 py-3 text-center"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p className="text-xs text-white/40 font-medium">
            معدل التحويل الثابت: <span className="text-primary font-bold">700 COIN = 1 Gram</span>
          </p>
        </div>
      </div>
    </div>
  );
}
