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

export default function Tasks() {
  const { holdingWallet } = useWallet();
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState<Set<number>>(new Set());
  const [completing, setCompleting] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ id: number; msg: string; ok: boolean } | null>(null);

  // Load completed tasks from server
  const loadCompleted = useCallback(async () => {
    const initData = getInitData();
    if (!initData) {
      // Fallback to localStorage
      try {
        const saved = localStorage.getItem('gm_tasks_done');
        if (saved) setDone(new Set(JSON.parse(saved)));
      } catch {}
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/tasks/completed`, {
        headers: { 'x-init-data': initData },
      });
      if (res.ok) {
        const ids = await res.json() as number[];
        setDone(new Set(ids));
      }
    } catch {
      // Fallback to localStorage
      try {
        const saved = localStorage.getItem('gm_tasks_done');
        if (saved) setDone(new Set(JSON.parse(saved)));
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

  const handleComplete = async (task: Task) => {
    const initData = getInitData();
    if (!initData) {
      // No Telegram context — just mark locally
      setDone(prev => {
        const next = new Set(prev);
        next.add(task.id);
        localStorage.setItem('gm_tasks_done', JSON.stringify([...next]));
        return next;
      });
      return;
    }

    // If channel task, open the channel first then try to complete
    if (task.channelUsername) {
      (window.Telegram?.WebApp as any)?.openLink?.(`https://t.me/${task.channelUsername}`);
      // Give user a moment to join, then attempt completion
      setFeedback({ id: task.id, msg: '⏳ انضم للقناة ثم اضغط مجدداً للتحقق', ok: true });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }

    setCompleting(task.id);
    try {
      const data = await telegramApiPost<{ ok: boolean; reward: number; balance: number }>('/tasks/complete', { taskId: task.id });
      if (data.ok) {
        setDone(prev => new Set(prev).add(task.id));
        setFeedback({ id: task.id, msg: `✅ +${data.reward} gram`, ok: true });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('already_completed')) {
        setDone(prev => new Set(prev).add(task.id));
      } else if (msg.includes('not_member')) {
        // Channel task but not a member yet
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

  const handleChannelVerify = async (task: Task) => {
    // Second press on a channel task — try to verify membership
    setCompleting(task.id);
    try {
      const data = await telegramApiPost<{ ok: boolean; reward: number; balance: number }>('/tasks/complete', { taskId: task.id });
      if (data.ok) {
        setDone(prev => new Set(prev).add(task.id));
        setFeedback({ id: task.id, msg: `✅ +${data.reward} gram`, ok: true });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not_member')) {
        setFeedback({ id: task.id, msg: '❌ لم يتم التحقق من العضوية. انضم ثم حاول مرة أخرى.', ok: false });
      } else if (msg.includes('already_completed')) {
        setDone(prev => new Set(prev).add(task.id));
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
          const completed = done.has(task.id);
          const isChannel = Boolean(task.channelUsername);
          const isCompleting = completing === task.id;
          const fb = feedback?.id === task.id ? feedback : null;

          return (
            <div
              key={task.id}
              className={`backdrop-blur-sm border rounded-2xl p-4 ${
                completed ? 'bg-success/5 border-success/20' : 'bg-secondary/60 border-white/5'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {completed
                    ? <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0" />
                    : isChannel
                      ? <Radio className="w-6 h-6 text-primary flex-shrink-0" />
                      : <Circle className="w-6 h-6 text-muted-foreground flex-shrink-0" />}
                  <div className="min-w-0">
                    <h3 className={`font-bold text-sm truncate ${completed ? 'text-muted-foreground line-through' : 'text-white'}`}>
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{task.description}</p>
                    )}
                    {isChannel && task.channelUsername && !completed && (
                      <p className="text-xs text-primary/70 mt-0.5">📢 @{task.channelUsername}</p>
                    )}
                    <div className={`text-xs font-black mt-0.5 ${completed ? 'text-muted-foreground' : 'text-primary'}`}>
                      +{task.reward} gram{task.isDaily ? ' · يومية' : ''}
                    </div>
                  </div>
                </div>

                {!completed && (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {isChannel ? (
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
                    )}
                  </div>
                )}
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
