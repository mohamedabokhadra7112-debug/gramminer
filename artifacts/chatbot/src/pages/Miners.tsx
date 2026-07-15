import { Zap, ChevronRight, Lock } from 'lucide-react';

const miners = [
  { id: 1, name: 'Basic Rig', hash: '10 TH/s', cost: 100, level: 1, locked: false },
  { id: 2, name: 'Advanced GPU', hash: '45 TH/s', cost: 500, level: 0, locked: false },
  { id: 3, name: 'ASIC Miner', hash: '120 TH/s', cost: 1500, level: 0, locked: true },
  { id: 4, name: 'Quantum Core', hash: '500 TH/s', cost: 8000, level: 0, locked: true },
];

export default function Miners() {
  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-6">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

      <div className="relative z-10 mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-black text-white tracking-tight">UPGRADES</h1>
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <Zap className="text-primary w-6 h-6" />
        </div>
      </div>
      
      <div className="relative z-10 flex-1 overflow-y-auto space-y-3 pb-8">
        {miners.map(miner => (
          <div key={miner.id} className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${miner.locked ? 'bg-muted' : 'bg-primary/20'}`}>
                {miner.locked ? <Lock className="w-5 h-5 text-muted-foreground" /> : <Zap className="w-6 h-6 text-primary" />}
              </div>
              <div>
                <h3 className={`font-bold ${miner.locked ? 'text-muted-foreground' : 'text-white'}`}>{miner.name}</h3>
                <div className="text-xs text-success font-mono font-medium">{miner.hash}</div>
              </div>
            </div>
            
            <div className="flex flex-col items-end">
              <div className="text-[10px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">LVL {miner.level}</div>
              <button className={`px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-1 ${miner.locked ? 'bg-muted text-muted-foreground' : 'bg-primary text-black shadow-[0_0_10px_rgba(245,166,35,0.3)]'}`}>
                {miner.cost} GMR <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
