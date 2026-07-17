import { useEffect, useState } from 'react';
import { ClipboardList, CheckCircle2, Circle, ExternalLink, Loader2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? '';

interface Task {
  id: number;
  title: string;
  description: string;
  reward: number;
  isDaily: boolean;
}

export default function Tasks() {
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('gm_tasks_done');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    fetch(`${API}/api/tasks`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setTasks(data);
        else setError('تعذّر تحميل المهام');
      })
      .catch(() => setError('تعذّر الاتصال بالخادم'))
      .finally(() => setLoading(false));
  }, []);

  const markDone = (id: number) => {
    setDone(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('gm_tasks_done', JSON.stringify([...next]));
      return next;
    });
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
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && tasks.length === 0 && (
          <div className="text-center py-12">
            <ClipboardList className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">لا توجد مهام حالياً</p>
          </div>
        )}

        {/* Task list */}
        {!loading && tasks.map(task => {
          const completed = done.has(task.id);
          return (
            <div
              key={task.id}
              className={`backdrop-blur-sm border rounded-2xl p-4 flex items-center justify-between ${
                completed ? 'bg-success/5 border-success/20' : 'bg-secondary/60 border-white/5'
              }`}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {completed
                  ? <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0" />
                  : <Circle className="w-6 h-6 text-muted-foreground flex-shrink-0" />}
                <div className="min-w-0">
                  <h3 className={`font-bold text-sm truncate ${completed ? 'text-muted-foreground line-through' : 'text-white'}`}>
                    {task.title}
                  </h3>
                  {task.description && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{task.description}</p>
                  )}
                  <div className={`text-xs font-black mt-0.5 ${completed ? 'text-muted-foreground' : 'text-primary'}`}>
                    +{task.reward} GMR{task.isDaily ? ' · يومية' : ''}
                  </div>
                </div>
              </div>

              {!completed && (
                <button
                  onClick={() => markDone(task.id)}
                  className="flex-shrink-0 ml-3 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3 h-3" />
                  انجاز
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
