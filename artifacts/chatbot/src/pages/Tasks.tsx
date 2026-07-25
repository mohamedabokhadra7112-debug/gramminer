import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, CheckCircle2, Circle, ExternalLink, Loader2, Radio, PlayCircle } from 'lucide-react';
import { telegramApiPost, getInitData, API_BASE } from '@/lib/telegramApi';
import { useWallet } from '@/context/WalletContext';
import { useCoins } from '@/context/CoinsContext';
import { useAdsGram } from '@/lib/adsgram';

const API = import.meta.env.VITE_API_URL ?? '';

interface Task {
  id: number;
  title: string;
  description: string;
  reward: number;
  isDaily: boolean;
  channelUsername?: string | null;
}

interface CompletionInfo {
  completedAt: Date | null;
  isDaily: boolean;
}

/** Format milliseconds as HH:MM:SS */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const DAILY_MS = 24 * 60 * 60 * 1000;

// ─── Watch Ad Card ────────────────────────────────────────────────────────────
interface AdStatus {
  watchedToday: number;
  remainingToday: number;
  rewardCoins: number;
  dailyLimit: number;
}

function WatchAdCard({ onCoinsEarned }: { onCoinsEarned: (n: number) => void }) {
  const { showAd, configured } = useAdsGram();
  const [adStatus, setAdStatus] = useState<AdStatus | null>(null);
  const [watching, setWatching] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadStatus = useCallback(async () => {
    const initData = getInitData();
    try {
      const res = await fetch(`${API_BASE}/api/ads/status`, {
        headers: initData ? { 'x-init-data': initData } : {},
      });
      if (res.ok) setAdStatus(await res.json() as AdStatus);
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleWatch = async () => {
    if (watching) return;
    const initData = getInitData();

    setWatching(true);
    setFeedback(null);

    try {
      // Show the actual AdsGram ad (or simulate in dev)
      if (configured) {
        await showAd();
      }

      // Report to backend regardless (backend validates BOT_TOKEN)
      const data = await telegramApiPost<{
        ok: boolean; coinsEarned: number; remainingToday: number; dailyLimit: number;
      }>('/ads/watched', {});

      setFeedback({ ok: true, msg: `✅ +${data.coinsEarned} coin` });
      onCoinsEarned(data.coinsEarned);
      await loadStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('skipped') || msg.includes('closed') || msg.includes('reject')) {
        setFeedback({ ok: false, msg: '⚠️ لم تكتمل مشاهدة الإعلان' });
      } else if (msg.includes('limit')) {
        setFeedback({ ok: false, msg: '⏰ وصلت للحد اليومي' });
      } else {
        setFeedback({ ok: false, msg: `❌ ${msg}` });
      }
    } finally {
      setWatching(false);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const exhausted = adStatus !== null && adStatus.remainingToday <= 0;
  const reward = adStatus?.rewardCoins ?? 10;
  const watched = adStatus?.watchedToday ?? 0;
  const limit = adStatus?.dailyLimit ?? 10;

  return (
    <div
      className="rounded-2xl p-4 mb-1"
      style={{
        background: 'linear-gradient(135deg, rgba(245,166,35,0.1) 0%, rgba(0,0,0,0.6) 100%)',
        border: '1px solid rgba(245,166,35,0.25)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: exhausted ? 'rgba(255,255,255,0.05)' : 'rgba(245,166,35,0.15)', border: '1px solid rgba(245,166,35,0.2)' }}
          >
            <PlayCircle className={`w-6 h-6 ${exhausted ? 'text-white/30' : 'text-primary'}`} />
          </div>
          <div className="min-w-0">
            <div className={`font-bold text-sm ${exhausted ? 'text-white/40 line-through' : 'text-white'}`}>
              شاهد إعلان واكسب
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              +{reward} coin لكل إعلان
            </div>
            {/* Progress dots */}
            <div className="flex items-center gap-1 mt-1.5">
              {Array.from({ length: limit }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: 6, height: 6,
                    background: i < watched ? '#F5A623' : 'rgba(255,255,255,0.15)',
                  }}
                />
              ))}
              <span className="text-[9px] text-white/30 ml-1 font-mono">
                {watched}/{limit}
              </span>
            </div>
          </div>
        </div>

        {/* Right button */}
        <button
          onClick={handleWatch}
          disabled={watching || exhausted}
          className="flex-shrink-0 px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5"
          style={{
            background: exhausted
              ? 'rgba(255,255,255,0.06)'
              : 'linear-gradient(135deg, #F5A623 0%, #E8920D 100%)',
            color: exhausted ? 'rgba(255,255,255,0.25)' : '#000',
            boxShadow: exhausted ? 'none' : '0 2px 10px rgba(245,166,35,0.3)',
            cursor: exhausted ? 'not-allowed' : 'pointer',
          }}
        >
          {watching
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : exhausted
              ? 'انتهى اليوم'
              : <><PlayCircle className="w-3.5 h-3.5" /> شاهد</>
          }
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className="mt-2 text-xs font-medium px-2 py-1 rounded-lg"
          style={{
            background: feedback.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: feedback.ok ? '#4ade80' : '#f87171',
          }}
        >
          {feedback.msg}
        </div>
      )}
    </div>
  );
}

// ─── Main Tasks Page ──────────────────────────────────────────────────────────
export default function Tasks() {
  const { holdingWallet } = useWallet();
  const { addCoins } = useCoins();
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [completions, setCompletions] = useState<Map<number, CompletionInfo>>(new Map());
  const [completing, setCompleting]   = useState<number | null>(null);
  const [feedback, setFeedback]       = useState<{ id: number; msg: string; ok: boolean } | null>(null);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Load completed tasks ───────────────────────────────────────────────────
  const loadCompleted = useCallback(async () => {
    const initData = getInitData();
    if (!initData) {
      try {
        const saved = localStorage.getItem('gm_tasks_done');
        if (saved) {
          const ids: number[] = JSON.parse(saved);
          setCompletions(new Map(ids.map(id => [id, { completedAt: null, isDaily: false }])));
        }
      } catch { /* ignore */ }
      return;
    }

    try {
      const res = await fetch(`${API}/api/tasks/completed`, {
        headers: { 'x-init-data': initData },
      });
      if (!res.ok) return;
      const data = await res.json() as Array<{ taskId: number; completedAt: string | null; isDaily: boolean }>;
      const map = new Map<number, CompletionInfo>();
      for (const item of data) {
        map.set(item.taskId, {
          completedAt: item.completedAt ? new Date(item.completedAt) : null,
          isDaily: item.isDaily,
        });
      }
      setCompletions(map);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/api/tasks`).then(r => r.json()),
      loadCompleted(),
    ]).then(([taskData]) => {
      if (Array.isArray(taskData)) setTasks(taskData as Task[]);
    }).catch(() => setError('تعذّر تحميل المهام'))
      .finally(() => setLoading(false));
  }, [loadCompleted]);

  // ── Complete a task ────────────────────────────────────────────────────────
  const handleComplete = async (task: Task) => {
    if (completing !== null) return;
    setCompleting(task.id);

    const initData = getInitData();
    if (!initData) {
      // Offline fallback
      try {
        const saved = localStorage.getItem('gm_tasks_done');
        const ids: number[] = saved ? JSON.parse(saved) : [];
        if (!ids.includes(task.id)) {
          ids.push(task.id);
          localStorage.setItem('gm_tasks_done', JSON.stringify(ids));
        }
      } catch { /* ignore */ }
      setCompletions(prev => new Map(prev).set(task.id, { completedAt: new Date(), isDaily: task.isDaily }));
      addCoins(task.reward);
      setFeedback({ id: task.id, msg: `✅ +${task.reward} coin`, ok: true });
      setTimeout(() => setFeedback(null), 3000);
      setCompleting(null);
      return;
    }

    // Channel tasks: open link first
    if (task.channelUsername && task.channelUsername.trim()) {
      const link = `https://t.me/${task.channelUsername.replace('@', '')}`;
      window.open(link, '_blank');
      setCompleting(null);
      return;
    }

    try {
      const data = await telegramApiPost<{ ok: boolean; coins?: number; message?: string }>(
        '/tasks/complete',
        { taskId: task.id },
      );
      if (data.ok) {
        setCompletions(prev => new Map(prev).set(task.id, { completedAt: new Date(), isDaily: task.isDaily }));
        addCoins(task.reward);
        setFeedback({ id: task.id, msg: `✅ +${task.reward} coin`, ok: true });
      } else {
        setFeedback({ id: task.id, msg: `❌ ${data.message ?? 'خطأ'}`, ok: false });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setFeedback({ id: task.id, msg: `❌ ${msg}`, ok: false });
    } finally {
      setCompleting(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // ── Verify channel membership ──────────────────────────────────────────────
  const handleChannelVerify = async (task: Task) => {
    if (completing !== null) return;
    setCompleting(task.id);
    try {
      const data = await telegramApiPost<{ ok: boolean; message?: string }>(
        '/tasks/verify-channel',
        { taskId: task.id },
      );
      if (data.ok) {
        setCompletions(prev => new Map(prev).set(task.id, { completedAt: new Date(), isDaily: task.isDaily }));
        addCoins(task.reward);
        setFeedback({ id: task.id, msg: `✅ +${task.reward} coin`, ok: true });
      } else {
        setFeedback({ id: task.id, msg: `❌ ${data.message ?? 'لم يتم التحقق'}`, ok: false });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setFeedback({ id: task.id, msg: `❌ ${msg}`, ok: false });
    } finally {
      setCompleting(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-6">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

      {/* Header */}
      <div className="relative z-10 mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-black text-white tracking-tight">المهام</h1>
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <ClipboardList className="text-primary w-6 h-6" />
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto space-y-3 pb-8">

        {/* ── Watch Ad card (always visible at top) ── */}
        <WatchAdCard onCoinsEarned={n => addCoins(n)} />

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div className="text-center py-8">
            <ClipboardList className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">لا توجد مهام حالياً</p>
          </div>
        )}

        {!loading && tasks.map(task => {
          const completion  = completions.get(task.id);
          const isCompleting = completing === task.id;
          const fb = feedback?.id === task.id ? feedback : null;
          const isChannel = Boolean(task.channelUsername);

          const msLeft = (task.isDaily && completion?.completedAt)
            ? completion.completedAt.getTime() + DAILY_MS - now
            : 0;
          const isCountingDown = task.isDaily && completion !== undefined && msLeft > 0;
          const isDone = completion !== undefined && !isCountingDown;

          return (
            <div
              key={task.id}
              className={`backdrop-blur-sm border rounded-2xl p-4 ${
                isDone
                  ? 'bg-success/5 border-success/20'
                  : isCountingDown
                    ? 'bg-yellow-500/5 border-yellow-500/20'
                    : 'bg-secondary/60 border-white/5'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {isDone
                    ? <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0" />
                    : isChannel
                      ? <Radio className="w-6 h-6 text-primary flex-shrink-0" />
                      : <Circle className="w-6 h-6 text-muted-foreground flex-shrink-0" />}

                  <div className="min-w-0">
                    <h3 className={`font-bold text-sm truncate ${isDone ? 'text-muted-foreground line-through' : 'text-white'}`}>
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{task.description}</p>
                    )}
                    {isChannel && task.channelUsername && !isDone && !isCountingDown && (
                      <p className="text-xs text-primary/70 mt-0.5">📢 @{task.channelUsername}</p>
                    )}
                    <div className={`text-xs font-black mt-0.5 ${isDone ? 'text-muted-foreground' : 'text-primary'}`}>
                      +{task.reward} coin{task.isDaily ? ' · يومية' : ''}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 flex-shrink-0 items-end">
                  {isCountingDown ? (
                    <div className="px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-mono font-bold">
                      ⏱ {formatCountdown(msLeft)}
                    </div>
                  ) : !isDone ? (
                    isChannel ? (
                      <>
                        <button
                          onClick={() => handleComplete(task)}
                          disabled={isCompleting}
                          className="px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-bold transition-colors hover:bg-primary/30 flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" /> انضم
                        </button>
                        <button
                          onClick={() => handleChannelVerify(task)}
                          disabled={isCompleting}
                          className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
                        >
                          {isCompleting ? '...' : 'تحقق'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleComplete(task)}
                        disabled={isCompleting}
                        className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isCompleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                        انجاز
                      </button>
                    )
                  ) : null}
                </div>
              </div>

              {fb && (
                <div className={`mt-2 text-xs font-medium px-2 py-1 rounded-lg ${
                  fb.ok ? 'text-success bg-success/10' : 'text-red-400 bg-red-500/10'
                }`}>
                  {fb.msg}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
