import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, CheckCircle2, Circle, ExternalLink, Loader2, Radio } from 'lucide-react';
import { telegramApiPost, getInitData, API_BASE } from '@/lib/telegramApi';
import { useWallet } from '@/context/WalletContext';

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
  completedAt: Date | null; // null = no timestamp (e.g. DB unavailable)
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

export default function Tasks() {
  const { holdingWallet } = useWallet();
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // Map of taskId → completion info (present = completed at least once)
  const [completions, setCompletions] = useState<Map<number, CompletionInfo>>(new Map());

  const [completing, setCompleting] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ id: number; msg: string; ok: boolean } | null>(null);

  // Live clock for countdown timers — updates every second only when daily tasks exist
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Load completed tasks from server ──────────────────────────────────────
  const loadCompleted = useCallback(async () => {
    const initData = getInitData();
    if (!initData) {
      try {
        const saved = localStorage.getItem('gm_tasks_done');
        if (saved) {
          const ids: number[] = JSON.parse(saved);
          const m = new Map<number, CompletionInfo>();
          ids.forEach(id => m.set(id, { completedAt: null, isDaily: false }));
          setCompletions(m);
        }
      } catch {}
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/tasks?action=completed`, {
        headers: { 'x-init-data': initData },
      });
      if (res.ok) {
        const data = await res.json();
        const m = new Map<number, CompletionInfo>();
        if (Array.isArray(data)) {
          data.forEach((item: any) => {
            // Support both old format (plain number) and new format (object)
            if (typeof item === 'number') {
              m.set(item, { completedAt: null, isDaily: false });
            } else {
              m.set(item.taskId, {
                completedAt: item.completedAt ? new Date(item.completedAt) : null,
                isDaily:     Boolean(item.isDaily),
              });
            }
          });
        }
        setCompletions(m);
      }
    } catch {
      try {
        const saved = localStorage.getItem('gm_tasks_done');
        if (saved) {
          const ids: number[] = JSON.parse(saved);
          const m = new Map<number, CompletionInfo>();
          ids.forEach(id => m.set(id, { completedAt: null, isDaily: false }));
          setCompletions(m);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    fetch(`${API}/api/tasks`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setTasks(data);
        else setError('تعذّر تحميل المهام');
      })
      .catch(() => setError('تعذّر الاتصال بالخادم'))
      .finally(() => setLoading(false));

    loadCompleted();
  }, [loadCompleted]);

  // ── Record a successful completion in state ────────────────────────────────
  const markCompleted = (taskId: number, completedAt: string | Date | null, isDaily: boolean) => {
    setCompletions(prev => {
      const next = new Map(prev);
      next.set(taskId, {
        completedAt: completedAt ? new Date(completedAt as string) : new Date(),
        isDaily,
      });
      return next;
    });
  };

  // ── Handle task completion attempt ────────────────────────────────────────
  const handleComplete = async (task: Task) => {
    const initData = getInitData();
    if (!initData) {
      markCompleted(task.id, null, task.isDaily);
      localStorage.setItem('gm_tasks_done', JSON.stringify([...completions.keys(), task.id]));
      return;
    }

    // Channel tasks: open channel first, prompt user to come back and verify
    if (task.channelUsername) {
      (window.Telegram?.WebApp as any)?.openLink?.(`https://t.me/${task.channelUsername}`);
      setFeedback({ id: task.id, msg: '⏳ انضم للقناة ثم اضغط مجدداً للتحقق', ok: true });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }

    setCompleting(task.id);
    try {
      const data = await telegramApiPost<{
        ok: boolean; reward: number; coins: number;
        completedAt?: string; isDaily?: boolean;
      }>('/tasks?action=complete', { taskId: task.id });

      if (data.ok) {
        markCompleted(task.id, data.completedAt ?? null, data.isDaily ?? task.isDaily);
        setFeedback({ id: task.id, msg: `✅ +${data.reward} coin`, ok: true });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('already_completed')) {
        // Treat as completed — completedAt unknown from this path, use now as fallback
        markCompleted(task.id, new Date(), task.isDaily);
      } else if (msg.includes('not_member')) {
        if (task.channelUsername) {
          (window.Telegram?.WebApp as any)?.openLink?.(`https://t.me/${task.channelUsername}`);
        }
        setFeedback({ id: task.id, msg: '❌ انضم للقناة أولاً ثم حاول مرة أخرى', ok: false });
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setFeedback({ id: task.id, msg: `❌ ${msg}`, ok: false });
        setTimeout(() => setFeedback(null), 3000);
      }
    } finally {
      setCompleting(null);
    }
  };

  // ── Handle channel membership verification (second press) ─────────────────
  const handleChannelVerify = async (task: Task) => {
    setCompleting(task.id);
    try {
      const data = await telegramApiPost<{
        ok: boolean; reward: number; coins: number;
        completedAt?: string; isDaily?: boolean;
      }>('/tasks?action=complete', { taskId: task.id });

      if (data.ok) {
        markCompleted(task.id, data.completedAt ?? null, data.isDaily ?? task.isDaily);
        setFeedback({ id: task.id, msg: `✅ +${data.reward} coin`, ok: true });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not_member')) {
        setFeedback({ id: task.id, msg: '❌ لم يتم التحقق من العضوية. انضم ثم حاول مرة أخرى.', ok: false });
      } else if (msg.includes('already_completed')) {
        markCompleted(task.id, new Date(), task.isDaily);
      } else {
        setFeedback({ id: task.id, msg: `❌ ${msg}`, ok: false });
      }
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setCompleting(null);
    }
  };

  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-6">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

      {/* Header */}
      <div className="relative z-10 mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-black text-white tracking-tight">المهام</h1>
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <ClipboardList className="text-primary w-6 h-6" />
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto space-y-3 pb-8">
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
          <div className="text-center py-12">
            <ClipboardList className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">لا توجد مهام حالياً</p>
          </div>
        )}

        {!loading && tasks.map(task => {
          const completion  = completions.get(task.id);
          const isCompleting = completing === task.id;
          const fb = feedback?.id === task.id ? feedback : null;
          const isChannel = Boolean(task.channelUsername);

          // Countdown logic for daily tasks
          const msLeft = (task.isDaily && completion?.completedAt)
            ? completion.completedAt.getTime() + DAILY_MS - now
            : 0;
          const isCountingDown = task.isDaily && completion !== undefined && msLeft > 0;

          // A daily task is "blocked" (show countdown) while msLeft > 0
          // A non-daily task is "done" permanently once completion exists
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
                  {/* Icon */}
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

                {/* Right-side action area */}
                <div className="flex flex-col gap-1 flex-shrink-0 items-end">
                  {isCountingDown ? (
                    /* 24h countdown — task available again when this reaches 00:00:00 */
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
                  ) : null /* isDone: no button */}
                </div>
              </div>

              {/* Feedback */}
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
