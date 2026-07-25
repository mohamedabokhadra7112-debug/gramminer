import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import { X, CheckCircle2, Loader2, Clock, TrendingUp, Download } from 'lucide-react';
import { useCoins } from '@/context/CoinsContext';
import { useWallet } from '@/context/WalletContext';
import { getInitData, API_BASE, telegramApiPost } from '@/lib/telegramApi';

// ─── Store settings (fetched from backend, overridable by admin) ───────────────
interface StoreSettings {
  coinsPerGram: number;
  dailyGram:    number;
  monthlyGram:  number;
}

const DEFAULT_SETTINGS: StoreSettings = {
  coinsPerGram: 700,
  dailyGram:    0.05,
  monthlyGram:  1.50,
};

async function fetchStoreSettings(): Promise<StoreSettings> {
  try {
    const res = await fetch(`${API_BASE}/api/store/settings`);
    if (res.ok) return await res.json() as StoreSettings;
  } catch { /* use defaults */ }
  return DEFAULT_SETTINGS;
}

// ─── Package grid ─────────────────────────────────────────────────────────────
interface Package {
  id: string;
  gram: number;   // base gram price (also = multiplier since 1g = base)
}

const PACKAGES: Package[] = [
  { id: 'p1',  gram: 1  },
  { id: 'p2',  gram: 2  },
  { id: 'p3',  gram: 3  },
  { id: 'p4',  gram: 5  },
  { id: 'p5',  gram: 10 },
  { id: 'p6',  gram: 20 },
];

// ─── Two durations only (DAILY + 1 MONTH) ─────────────────────────────────────
interface Duration {
  id: string;
  label: string;
  dayIcon: string;
  getGram:  (s: StoreSettings, multiplier: number) => number;
  getCoins: (s: StoreSettings, multiplier: number) => number;
}

const DURATIONS: Duration[] = [
  {
    id: 'daily',
    label: 'DAILY',
    dayIcon: '',
    getGram:  (s, m) => +(s.dailyGram   * m).toFixed(4),
    getCoins: (s, m) => Math.round(s.dailyGram   * m * s.coinsPerGram),
  },
  {
    id: 'month1',
    label: '1 MONTH',
    dayIcon: '30',
    getGram:  (s, m) => +(s.monthlyGram * m).toFixed(4),
    getCoins: (s, m) => Math.round(s.monthlyGram * m * s.coinsPerGram),
  },
];

// ─── Swap history ─────────────────────────────────────────────────────────────
interface SwapRecord {
  id: number;
  gram_amount: number;
  coins_amount: number;
  created_at: string;
}

// ─── Daily mining income from a coin balance ──────────────────────────────────
// Formula: coins × 5% / coinsPerGram = gram/day
function dailyIncomeGram(coins: number, coinsPerGram: number): number {
  return Math.round((coins * 0.05 / coinsPerGram) * 100_000) / 100_000;
}

// ─── Package Card ─────────────────────────────────────────────────────────────
function PackageCard({
  pkg, settings, onClick,
}: { pkg: Package; settings: StoreSettings; onClick: () => void }) {
  const coins = Math.round(pkg.gram * settings.coinsPerGram);
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
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
        style={{
          background: 'radial-gradient(circle at 38% 38%, #ffd96a 0%, #c8870a 55%, #7a4e00 100%)',
          boxShadow: '0 0 12px rgba(245,166,35,0.4)',
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>⛏️</span>
      </div>
      <div
        className="font-black leading-none mb-0.5"
        style={{
          fontSize: 22,
          background: 'linear-gradient(180deg, #FFE082 0%, #F5A623 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {coins.toLocaleString()}
      </div>
      <div className="text-[10px] font-black tracking-widest text-primary/60 mb-1.5">COIN</div>
      <div
        className="rounded-lg px-2.5 py-0.5 text-[11px] font-bold"
        style={{ background: 'rgba(245,166,35,0.12)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.2)' }}
      >
        {pkg.gram} GRAM
      </div>
    </button>
  );
}

// ─── Package Modal ─────────────────────────────────────────────────────────────
function PackageModal({
  pkg, settings, totalGram, onClose, onSuccess,
}: {
  pkg: Package;
  settings: StoreSettings;
  totalGram: number;
  onClose: () => void;
  onSuccess: (coins: number) => void;
}) {
  const multiplier = pkg.gram;
  const totalCoins = Math.round(multiplier * settings.coinsPerGram);

  const [selectedDur, setSelectedDur] = useState<string>('month1');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const dur    = DURATIONS.find(d => d.id === selectedDur)!;
  const gram   = dur.getGram(settings, multiplier);
  const coins  = dur.getCoins(settings, multiplier);
  const canAfford = totalGram >= gram;

  // Daily mining income the user will earn after this purchase
  const dailyIncome = dailyIncomeGram(coins, settings.coinsPerGram);

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
      setTimeout(() => { onSuccess(coins); onClose(); }, 1500);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStatus('err');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
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
        {/* Close */}
        <div className="flex justify-end px-4 pt-3">
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Coin icon + total coins */}
        <div className="flex flex-col items-center pb-3 px-4">
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
            {totalCoins.toLocaleString()}
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
            const dGram  = d.getGram(settings, multiplier);
            const dCoins = d.getCoins(settings, multiplier);
            const dDaily = dailyIncomeGram(dCoins, settings.coinsPerGram);
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
                {/* Left: icon + label + daily rate */}
                <div className="flex items-center gap-3">
                  <div
                    className="flex-shrink-0 flex items-center justify-center rounded-lg"
                    style={{
                      width: 34, height: 34,
                      background: isSelected ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${isSelected ? 'rgba(245,166,35,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    }}
                  >
                    {d.dayIcon
                      ? <span className="font-black" style={{ fontSize: 10, color: isSelected ? '#F5A623' : 'rgba(255,255,255,0.4)' }}>{d.dayIcon}</span>
                      : <span style={{ fontSize: 15, lineHeight: 1 }}>📅</span>
                    }
                  </div>
                  <div className="text-left">
                    <div className="font-black text-sm tracking-wide" style={{ color: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.5)' }}>
                      {d.label}
                    </div>
                    {/* Daily mining income */}
                    <div className="flex items-center gap-1 mt-0.5">
                      <TrendingUp className="w-2.5 h-2.5" style={{ color: isSelected ? '#4ade80' : 'rgba(74,222,128,0.4)' }} />
                      <span className="text-[10px] font-bold" style={{ color: isSelected ? '#4ade80' : 'rgba(74,222,128,0.4)' }}>
                        +{dDaily} gram/يوم
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: price */}
                <div className="text-right">
                  <div className="font-black text-base" style={{ color: isSelected ? '#F5A623' : 'rgba(245,166,35,0.5)' }}>
                    {dGram.toFixed(2)} Gram
                  </div>
                  <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {dCoins.toLocaleString()} COIN
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Payment summary — always visible (replaces red error) */}
        <div
          className="mx-4 mb-3 rounded-xl px-4 py-3 flex items-center justify-between"
          style={{
            background: canAfford ? 'rgba(34,197,94,0.08)' : 'rgba(245,166,35,0.08)',
            border: `1px solid ${canAfford ? 'rgba(34,197,94,0.2)' : 'rgba(245,166,35,0.2)'}`,
          }}
        >
          <div>
            <div className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>ستدفع</div>
            <div className="font-black text-lg leading-none" style={{ color: canAfford ? '#F5A623' : '#fbbf24' }}>
              {gram.toFixed(2)} GRAM
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>رصيدك</div>
            <div
              className="font-bold text-sm"
              style={{ color: canAfford ? '#4ade80' : '#f87171' }}
            >
              {totalGram.toFixed(4)}
              {!canAfford && <span className="text-xs ml-1 opacity-70">(غير كافٍ)</span>}
            </div>
          </div>
        </div>

        {/* Error */}
        {status === 'err' && (
          <div className="mx-4 mb-2 rounded-xl p-2.5 text-center text-sm font-bold" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
            ❌ {errMsg || 'حدث خطأ'}
          </div>
        )}
        {status === 'ok' && (
          <div className="mx-4 mb-2 rounded-xl p-2.5 text-center text-sm font-bold" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>
            ✅ تم الشراء! +{coins.toLocaleString()} coin
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
              {status === 'loading' ? <Loader2 className="w-5 h-5 text-white animate-spin" />
               : status === 'ok'    ? <CheckCircle2 className="w-5 h-5 text-white" />
               : <span style={{ fontSize: 20 }}>◈</span>}
            </div>
            <div className="text-left">
              <div className="text-black font-black text-base leading-tight">
                {status === 'loading' ? 'جارٍ الشراء...' : status === 'ok' ? 'تم!' : `${gram.toFixed(2)} GRAM`}
              </div>
              <div className="text-black/60 font-bold text-[11px] tracking-wider">PAY WITH GRAM</div>
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
  const [, navigate] = useLocation();

  const [settings, setSettings]           = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [activePackage, setActivePackage] = useState<Package | null>(null);
  const [history, setHistory]             = useState<SwapRecord[]>([]);
  const [toast, setToast]                 = useState<string | null>(null);

  useEffect(() => {
    fetchStoreSettings().then(setSettings);
  }, []);

  const loadHistory = useCallback(async () => {
    const initData = getInitData();
    if (!initData) return;
    try {
      const res = await fetch(`${API_BASE}/api/telegram/swap/history`, {
        headers: { 'x-init-data': initData },
      });
      if (res.ok) {
        const data = await res.json() as SwapRecord[];
        if (Array.isArray(data)) setHistory(data.filter(h => h.gram_amount > 0).slice(0, 5));
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
        {/* Top row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-black text-white">🏪 المتجر</h1>
            <p className="text-[10px] text-white/40 mt-0.5">
              {settings.coinsPerGram} COIN = 1 GRAM
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-black/60 border border-primary/30 rounded-xl px-3 py-1.5">
            <span className="text-primary font-bold text-sm">{coins.toLocaleString()}</span>
            <span className="text-white/50 text-xs">coin</span>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="mb-3 rounded-2xl p-3 text-center font-bold text-sm"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>
            {toast}
          </div>
        )}

        {/* Deposit-to-buy hint */}
        <div
          className="flex items-center gap-2 mb-3 rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.15)' }}
        >
          <Download className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
          <p className="text-[10px] text-white/40 leading-tight">
            اضغط على أي باقة للإيداع المباشر عبر TON — سيُضاف الرصيد تلقائياً
          </p>
        </div>

        {/* Packages grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {PACKAGES.map(pkg => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              settings={settings}
              onClick={() => {
                // Store deposit amount in sessionStorage then navigate to Profile's deposit panel
                const gramNeeded = pkg.gram;
                sessionStorage.setItem('deposit_amount', String(gramNeeded));
                navigate('/profile');
              }}
            />
          ))}
        </div>

        {/* Purchase history */}
        {history.length > 0 && (
          <div>
            <p className="text-[10px] font-black text-white/40 mb-2 flex items-center gap-1.5 uppercase tracking-widest">
              <Clock className="w-3 h-3" /> آخر المشتريات
            </p>
            <div className="space-y-1.5">
              {history.map(h => (
                <div key={h.id} className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}>
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

      {/* Package modal */}
      {activePackage && (
        <PackageModal
          pkg={activePackage}
          settings={settings}
          totalGram={totalGram}
          onClose={() => setActivePackage(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
