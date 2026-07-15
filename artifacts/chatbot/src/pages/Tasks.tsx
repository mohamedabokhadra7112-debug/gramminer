import { ClipboardList, CheckCircle2, Circle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

// Task title keys map to locale strings; in production these come from the server.
const tasks = [
  { id: 1, titleKey: 'tasks_join_channel',  reward: 50,  completed: true  },
  { id: 2, titleKey: 'tasks_follow_twitter', reward: 50,  completed: false },
  { id: 3, titleKey: 'tasks_invite_friends', reward: 200, completed: false },
  { id: 4, titleKey: 'tasks_reach_level',    reward: 500, completed: true  },
  { id: 5, titleKey: 'tasks_daily_login',    reward: 10,  completed: false },
];

export default function Tasks() {
  const { t } = useLanguage();

  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-6">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

      <div className="relative z-10 mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-black text-white tracking-tight">{t('tasks_title')}</h1>
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <ClipboardList className="text-primary w-6 h-6" />
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto space-y-3 pb-8">
        {tasks.map(task => (
          <div
            key={task.id}
            className={`backdrop-blur-sm border rounded-2xl p-4 flex items-center justify-between ${
              task.completed ? 'bg-success/5 border-success/20' : 'bg-secondary/60 border-white/5'
            }`}
          >
            <div className="flex items-center gap-4">
              {task.completed
                ? <CheckCircle2 className="w-6 h-6 text-success" />
                : <Circle className="w-6 h-6 text-muted-foreground" />}
              <div>
                <h3 className={`font-bold text-sm ${task.completed ? 'text-muted-foreground line-through' : 'text-white'}`}>
                  {t(task.titleKey)}
                </h3>
                <div className={`text-xs font-black mt-0.5 ${task.completed ? 'text-muted-foreground' : 'text-primary'}`}>
                  +{task.reward} GMR
                </div>
              </div>
            </div>

            {!task.completed && (
              <button className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors">
                {t('tasks_go')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
