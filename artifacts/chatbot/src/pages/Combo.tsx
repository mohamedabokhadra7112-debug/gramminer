import { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, XCircle, Loader2, Trophy, Clock } from 'lucide-react';
import { useCoins } from '@/context/CoinsContext';

const API = import.meta.env.VITE_API_URL ?? '';
function getInitData(): string { return window.Telegram?.WebApp?.initData ?? ''; }

// ─── Item definitions ────────────────────────────────────────────────────────
const ITEMS = [
  {
    id: 1, name: 'Crystal Core',
    emoji: '💎',
    gradient: 'from-blue-600/30 to-blue-400/10',
    border: 'border-blue-500/40',
    glow: 'shadow-blue-500/20',
  },
  {
    id: 2, name: 'Mining\nPickaxe',
    emoji: '⛏️',
    gradient: 'from-violet-600/30 to-violet-400/10',
    border: 'border-violet-500/40',
    glow: 'shadow-violet-500/20',
  },
  {
    id: 3, name: 'Mining Rig',
    emoji: '🖥️',
    gradient: 'from-cyan-600/30 to-cyan-400/10',
    border: 'border-cyan-500/40',
    glow: 'shadow-cyan-500/20',
  },
  {
    id: 4, name: 'Server\nNode',
    emoji: '🗄️',
    gradient: 'from-emerald-600/30 to-emerald-400/10',
    border: 'border-emerald-500/40',
    glow: 'shadow-emerald-500/20',
  },
  {
    id: 5, name: 'Treasure\nVault',
    emoji: '🪙',
    gradient: 'from-amber-600/30 to-amber-400/10',
    border: 'border-amber-500/40',
    glow: 'shadow-amber-500/20',
  },
];

type ComboResult = { ok: boolean; success: boolean; reward: number };

export default function Combo() {
  const { addCoins } = useCoins();

  const [loading, setLoading]           = useState(true);
  const [attemptedToday, setAttempted]  = useState(false);
  const [prevSuccess, setPrevSuccess]   = useState<boolean | null>(null);
  const [prevReward, setPrevReward]     = useState<number | null>(null);

  const [selected, setSelected]         = useState<number[]>([]);
  const [submitting, setSubmitting]     = useState(false);
  const [result, setResult]             = useState<ComboResult | null>(null);
  const [error, setError]               = useState('');

  // ── Load today's status ──────────────────────────────────────────────────
  useEffect(() => {
    const initData = getInitData();
    if (!initData) { setLoading(false); return; }

    fetch(`${API}/api/tasks?type=combo`, {
      headers: { 'x-telegram-initdata': initData },
    })
      .then(r => r.json())
      .then(data => {
        setAttempted(data.attemptedToday ?? false);
        setPrevSuccess(data.success ?? null);
        setPrevReward(data.reward ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Toggle card selection (max 3) ────────────────────────────────────────
  function toggleSelect(id: number) {
    if (attemptedToday || result) return;
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3)  return prev; // already at max
      return [...prev, id];
    });
  }

  // ── Submit attempt ───────────────────────────────────────────────────────
  async function handleSubmit() {
    if (selected.length !== 3 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/tasks?type=combo&action=submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-initdata': getInitData(),
        },
        body: JSON.stringify({ selectedIds: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'already_attempted') {
          setAttempted(true);
          setError('لقد استخدمت محاولتك اليوم بالفعل');
        } else {
          setError(data.error || 'حدث خطأ');
        }
        return;
      }
      setResult(data);
      setAttempted(true);
      if (data.success && data.reward > 0) addCoins(data.reward);
    } catch (e: any) {
      setError(e.message || 'تعذر الإرسال');
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  const isDone = attemptedToday && !result; // done in a previous session
  const showSuccess = result ? result.success : (isDone ? prevSuccess : null);
  const showReward  = result ? result.reward  : (isDone ? prevReward  : null);

  return (
    <div className="min-h-full flex flex-col relative w-full">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.80)' }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black text-white">الكومبو اليومي</h1>
          <p className="text-[10px] text-muted-foreground">اختر 3 عناصر صح واكسب coins</p>
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-5">

        {loading ? (
          <div className="flex justify-center pt-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <>
            {/* Result banner (after submit or re-open) */}
            {(result || isDone) && showSuccess !== null && (
              <div className={`rounded-2xl border p-4 flex flex-col items-center gap-2 text-center
                ${showSuccess
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-destructive/10 border-destructive/30'}`}
              >
                {showSuccess ? (
                  <>
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                    <p className="text-white font-black text-lg">🎉 صح! اخترت الكومبو الصح</p>
                    <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-400 font-black text-base">+{showReward} coin</span>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="w-10 h-10 text-destructive" />
                    <p className="text-white font-black text-lg">❌ غلط! حظ أوفر بكره</p>
                  </>
                )}
              </div>
            )}

            {/* Already used today (and no fresh result yet) */}
            {isDone && showSuccess === null && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <p className="text-muted-foreground text-sm">استخدمت محاولتك اليوم. تعالى تاني بكره!</p>
              </div>
            )}

            {/* Instructions */}
            {!isDone && !result && (
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3 text-center">
                <p className="text-primary text-sm font-bold">
                  اختر <span className="text-white font-black">3 عناصر</span> من الـ 5 — لو اخترت الصح هتاخد من 1 لـ 10 coins
                </p>
                <p className="text-muted-foreground text-xs mt-1">محاولة واحدة كل 24 ساعة</p>
              </div>
            )}

            {/* Cards grid */}
            <div className="grid grid-cols-3 gap-3">
              {ITEMS.slice(0, 3).map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  selected={selected.includes(item.id)}
                  disabled={isDone || !!result}
                  onTap={() => toggleSelect(item.id)}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 px-8">
              {ITEMS.slice(3).map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  selected={selected.includes(item.id)}
                  disabled={isDone || !!result}
                  onTap={() => toggleSelect(item.id)}
                />
              ))}
            </div>

            {/* Selection counter */}
            {!isDone && !result && (
              <div className="flex justify-center gap-2">
                {[1, 2, 3].map(n => (
                  <div
                    key={n}
                    className={`w-3 h-3 rounded-full transition-all duration-200
                      ${selected.length >= n ? 'bg-primary scale-110' : 'bg-white/20'}`}
                  />
                ))}
              </div>
            )}

            {/* Submit button */}
            {!isDone && !result && (
              <button
                onClick={handleSubmit}
                disabled={selected.length !== 3 || submitting}
                className="w-full bg-primary text-black font-black rounded-2xl py-3.5 text-sm
                           flex items-center justify-center gap-2
                           disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جار التحقق...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> تحقق من الكومبو</>
                )}
              </button>
            )}

            {error && (
              <p className="text-center text-destructive text-sm">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Item Card ───────────────────────────────────────────────────────────────
function ItemCard({
  item, selected, disabled, onTap,
}: {
  item: typeof ITEMS[number];
  selected: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      disabled={disabled}
      className={`
        relative flex flex-col items-center justify-center gap-2
        rounded-2xl border p-3 min-h-[110px]
        bg-gradient-to-b ${item.gradient} ${item.border}
        transition-all duration-200 touch-manipulation
        ${selected ? `ring-2 ring-primary shadow-lg ${item.glow}` : 'opacity-80'}
        ${disabled ? 'cursor-default' : 'active:scale-95'}
      `}
    >
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <CheckCircle2 className="w-3.5 h-3.5 text-black" />
        </div>
      )}
      <span className="text-3xl leading-none">{item.emoji}</span>
      <span className="text-white text-[11px] font-bold text-center leading-tight whitespace-pre-line">
        {item.name}
      </span>
    </button>
  );
}
