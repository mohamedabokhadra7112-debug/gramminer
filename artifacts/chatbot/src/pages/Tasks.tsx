import CandlestickBg from '@/components/CandlestickBg';
import { ClipboardList, CheckCircle2, Circle } from 'lucide-react';

const tasks = [
  { id: 1, title: 'Join Telegram Channel', reward: 50, completed: true },
  { id: 2, title: 'Follow on Twitter', reward: 50, completed: false },
  { id: 3, title: 'Invite 3 Friends', reward: 200, completed: false },
  { id: 4, title: 'Reach Level 10', reward: 500, completed: true },
  { id: 5, title: 'Daily Login', reward: 10, completed: false },
];

export default function Tasks() {
  return (
    <div className="min-h-full flex flex-col relative w-full overflow-hidden px-4 pt-6">
      <CandlestickBg />
      
      <div className="relative z-10 mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-black text-white tracking-tight">TASKS</h1>
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <ClipboardList className="text-primary w-6 h-6" />
        </div>
      </div>
      
      <div className="relative z-10 flex-1 overflow-y-auto space-y-3 pb-8">
        {tasks.map(task => (
          <div key={task.id} className={`backdrop-blur-sm border rounded-2xl p-4 flex items-center justify-between ${task.completed ? 'bg-success/5 border-success/20' : 'bg-secondary/60 border-white/5'}`}>
            <div className="flex items-center gap-4">
              {task.completed ? (
                <CheckCircle2 className="w-6 h-6 text-success" />
              ) : (
                <Circle className="w-6 h-6 text-muted-foreground" />
              )}
              <div>
                <h3 className={`font-bold text-sm ${task.completed ? 'text-muted-foreground line-through' : 'text-white'}`}>{task.title}</h3>
                <div className={`text-xs font-black mt-0.5 ${task.completed ? 'text-muted-foreground' : 'text-primary'}`}>+{task.reward} ATF</div>
              </div>
            </div>
            
            {!task.completed && (
              <button className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors">
                GO
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
