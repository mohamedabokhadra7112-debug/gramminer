import { useState, useCallback, useEffect } from 'react';
import { X, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { useCoins } from '@/context/CoinsContext';
import { useWallet } from '@/context/WalletContext';
import { getInitData, API_BASE, telegramApiPost } from '@/lib/telegramApi';

// ─── Constants ────────────────────────────────────────────────────────────────
const COINS_PER_GRAM = 700;

// ─── Store packages (shown in grid) ──────────────────────────────────────────
interface Package {
  id: string;
  coins: number; // base coins (= gram × 700)
  gram: number;  // base gram price (1, 2, 3, ...)
}

const PACKAGES: Package[] = [
  { id: 'p1',  coins: 700,   gram: 1  },
  { id: 'p2',  coins: 1400,  gram: 2  },
  { id: 'p3',  coins: 2100,  gram: 3  },
  { id: 'p4',  coins: 3500,  gram: 5  },
  { id: 'p5',  coins: 7000,  gram: 10 },
  { id: 'p6',  coins: 14000, gram: 20 },
];

// ─── Duration options (scale by package multiplier) ───────────────────────────
interface Duration {
  id: string;
  label: string;
  dayIcon: string;
  // These are the BASE values (for 1× / 700-coin package)
  baseGram: number;
  baseCoins: number;
}

const DURATIONS: Duration[] = [
  { id: 'daily',   label: 'DAILY',    dayIcon: '',   baseGram: 0.05, baseCoins: 35   },
  { id: 'month1',  label: '1 MONTH',  dayIcon: '30', baseGram: 1.50, baseCoins: 1050 },
  { id: 'month3',  label: '3 MONTHS', dayIcon: '90', baseGram: 4.50, baseCoins: 3150 },
];

// ─── Swap history ─────────────────────────────────────────────────────────────
interface SwapRecord {
  id: number;
  gram_amount: number;
  coins_amount: number;
  created_at: string;
}

// ─── Package Card ─────────────────────────────────────────────────────────────
function PackageCard({ pkg, onClick }: { pkg: Package; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center rounded-2xl p-3 transition-all active:scale-95"
      style={{
        background: 'linear-gradient(160deg, #1a1205 0%, #0d0a04 100%)',
        border: '1px solid rgba(245,166,35,0.25)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        minHeight: 100,
      }}
    >
      {/* Coin icon */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
        style={{
          background: 'radial-gradient(circle at 38% 38%, #ffd96a 0%, #c8870a 55%, #7a4e00 100%)',
          boxShadow: '0 0 12px rgba(245,166,35,0.4)',
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>⛏️</span>
      </div>

      {/* Coin amount */}
      <div
        className="font-black leading-none mb-0.5"
        style={{
          fontSize: 22,
          background: 'linear-gradient(180deg, #FFE082 0%, #F5A623 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {pkg.coins.toLocaleString()}
      </div>
      <div className="text-[10px] font-black tracking-widest text-primary/60 mb-1.5">COIN</div>

      {/* Gram price */}
      <div
        className="rounded-lg px-2.5 py-0.5 text-[11px] font-bold"
        style={{ background: 'rgba(245,166,35,0.12)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.2)' }}
      >
        {pkg.gram} GRAM
      </div>
    </button>
  );
}

// ─── Package Modal (bottom sheet) ─────────────────────────────────────────────
function PackageModal({
  pkg,
  totalGram,
  onClose,
  onSuccess,
}: {
  pkg: Package;
  totalGram: number;
  onClose: () => void;
  onSuccess: (coins: number) => void;
}) {
  const multiplier = pkg.gram; // 1, 2, 3, 5, 10, 20
  const [selectedDur, setSelectedDur] = useState<string>('month1');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const dur = DURATIONS.find(d => d.id === selectedDur)!;
  const gram = +(dur.baseGram * multiplier).toFixed(2);
  const coinsGet = dur.baseCoins * multiplier;
  const canAfford = totalGram >= gram;

  const handlePay = async () => {
    if (!canAfford || status === 'loading') return;
    const initData = getInitData();
    if (!initData) {
      setErrMsg('افتح التطبيق من تيليجرام');
      setStatus('err');
      return;
    }
    setStatus('loading');
    try {
      await telegramApiPost<{ ok: boolean }>('/telegram/swap', {
        direction: 'gram_to_coins',
        amount: gram,
      });
      setStatus('ok');
      setTimeout(() => {
        onSuccess(coinsGet);
        onClose();
      }, 1500);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStatus('err');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Sheet */}
      <div
        className="w-full max-w-sm rounded-t-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #1c1508 0%, #0d0a04 60%, #120e06 100%)',
          border: '1px solid rgba(245,166,35,0.2)',
          borderBottom: 'none',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.8)',
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        }}
      >
        {/* Close button */}
        <div className="flex justify-end px-4 pt-3 pb-0">
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Coin icon + amount */}
        <div className="flex flex-col items-center pb-4 px-4">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-3"
            style={{
              background: 'radial-gradient(circle at 38% 38%, #ffd96a 0%, #c8870a 55%, #7a4e00 100%)',
              boxShadow: '0 0 30px rgba(245,166,35,0.55), inset 0 -3px 8px rgba(0,0,0,0.4)',
            }}
          >
            <span style={{ fontSize: 38, lineHeight: 1 }}>⛏️</span>
          </div>

          <div
            className="font-black leading-none"
            style={{
              fontSize: 64,
              background: 'linear-gradient(180deg, #FFE082 0%, #F5A623 55%, #C67E10 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-1px',
            }}
          >
            {pkg.coins.toLocaleString()}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div style={{ width: 32, height: 1, background: 'rgba(245,166,35,0.4)' }} />
            <span className="text-xs font-black tracking-[0.3em] text-primary/70">COIN</span>
            <div style={{ width: 32, height: 1, background: 'rgba(245,166,35,0.4)' }} />
          </div>
        </div>

        {/* Duration options */}
        <div className="mx-4 rounded-2xl overflow-hidden mb-3" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {DURATIONS.map((d, i) => {
            const dGram = +(d.baseGram * multiplier).toFixed(2);
            const dCoins = d.baseCoins * multiplier;
            const isSelected = selectedDur === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setSelectedDur(d.id)}
                className="w-full flex items-center justify-between px-4 py-3.5 transition-all active:scale-[0.98]"
                style={{
                  borderBottom: i < DURATIONS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  background: isSelected ? 'rgba(245,166,35,0.09)' : 'transparent',
                  outline: isSelected ? '1.5px solid rgba(245,166,35,0.3)' : 'none',
                  outlineOffset: '-1.5px',
                }}
              >
                {/* Left: icon + label */}
                <div className="flex items-center gap-3">
                  <div
                    className="flex-shrink-0 flex items-center justify-center rounded-lg"
                    style={{
                      width: 34, height: 34,
                      background: isSelected ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${isSelected ? 'rgba(245,166,35,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    }}
                  >
                    {d.dayIcon ? (
                      <span className="font-black" style={{ fontSize: 10, color: isSelected ? '#F5A623' : 'rgba(255,255,255,0.4)' }}>
                        {d.dayIcon}
                      </span>
                    ) : (
                      <span style={{ fontSize: 15, lineHeight: 1 }}>📅</span>
                    )}
                  </div>
                  <span className="font-black text-sm tracking-wide" style={{ color: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.5)' }}>
                    {d.label}
                  </span>
                </div>

                {/* Right: price */}
                <div className="text-right">
                  <div className="font-black text-base" style={{ color: isSelected ? '#F5A623' : 'rgba(245,166,35,0.5)' }}>
                    {dGram.toFixed(2)} Gram
                  </div>
                  <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {dCoins.toLocaleString()}.00 COIN
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Error / success */}
        {status === 'ok' && (
          <div className="mx-4 mb-2 rounded-xl p-2.5 text-center text-sm font-bold" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>
            ✅ تم الشراء! +{coinsGet.toLocaleString()} coin
          </div>
        )}
        {status === 'err' && (
          <div className="mx-4 mb-2 rounded-xl p-2.5 text-center text-sm font-bold" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
            ❌ {errMsg || 'حدث خطأ'}
          </div>
        )}
        {!canAfford && status === 'idle' && (
          <div className="mx-4 mb-2 text-center text-xs font-semibold" style={{ color: 'rgba(239,68,68,0.7)' }}>
            رصيدك {totalGram.toFixed(4)} gram · تحتاج {gram.toFixed(2)} gram
          </div>
        )}

        {/* PAY WITH GRAM button */}
        <div className="px-4 pb-4">
          <button
            onClick={handlePay}
            disabled={!canAfford || status === 'loading' || status === 'ok'}
            className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 transition-all active:scale-[0.98]"
            style={{
              background: canAfford && status === 'idle'
                ? 'linear-gradient(135deg, #F5A623 0%, #E8920D 100%)'
                : 'rgba(100,80,20,0.4)',
              boxShadow: canAfford && status === 'idle' ? '0 4px 24px rgba(245,166,35,0.4)' : 'none',
              cursor: canAfford && status === 'idle' ? 'pointer' : 'not-allowed',
            }}
          >
            <div
              className="flex-shrink-0 flex items-center justify-center rounded-full"
              style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.2)' }}
            >
              {status === 'loading'
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : status === 'ok'
                  ? <CheckCircle2 className="w-5 h-5 text-white" />
                  : <span style={{ fontSize: 20 }}>◈</span>
              }
            </div>
            <div className="text-left">
              <div className="text-black font-black text-base leading-tight">
                {status === 'loading' ? 'جارٍ الشراء...' : status === 'ok' ? 'تم!' : `${gram.toFixed(2)} GRAM`}
              </div>
              <div className="text-black/60 font-bold text-[11px] tracking-wider">
                {status === 'loading' ? 'يرجى الانتظار' : `PAY WITH GRAM`}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Store Page ──────────────────────────────────────────────────────────
export default function Store() {
  const { coins, refreshBalance } = useCoins();
  const { holdingWallet, sessionEarnings } = useWallet();
  const totalGram = holdingWallet + sessionEarnings;

  const [activePackage, setActivePackage] = useState<Package | null>(null);
  const [history, setHistory] = useState<SwapRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);

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

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSuccess = async (coinsAdded: number) => {
    setToast(`✅ +${coinsAdded.toLocaleString()} coin`);
    await refreshBalance();
    await loadHistory();
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="min-h-full flex flex-col relative w-full">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.72)' }} />

      <div className="relative z-10 w-full px-3 pt-3 pb-28">

        {/* ── Top row: title + coin balance ── */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-black text-white">🏪 المتجر</h1>
            <p className="text-[10px] text-white/40 mt-0.5">700 COIN = 1 GRAM</p>
          </div>
          <div className="flex items-center gap-1.5 bg-black/60 border border-primary/30 rounded-xl px-3 py-1.5">
            <span className="text-primary font-bold text-sm">{coins.toLocaleString()}</span>
            <span className="text-white/50 text-xs">coin</span>
          </div>
        </div>

        {/* ── Toast notification ── */}
        {toast && (
          <div
            className="mb-3 rounded-2xl p-3 text-center font-bold text-sm"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
          >
            {toast}
          </div>
        )}

        {/* ── Packages grid: 2 cols ── */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {PACKAGES.map(pkg => (
            <PackageCard key={pkg.id} pkg={pkg} onClick={() => setActivePackage(pkg)} />
          ))}
        </div>

        {/* ── Recent purchases ── */}
        {history.length > 0 && (
          <div>
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
      </div>

      {/* ── Package modal ── */}
      {activePackage && (
        <PackageModal
          pkg={activePackage}
          totalGram={totalGram}
          onClose={() => setActivePackage(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
