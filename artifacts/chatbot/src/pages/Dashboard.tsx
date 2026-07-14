import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TerminalSquare } from 'lucide-react';
import ControlPanel from '@/components/dashboard/ControlPanel';
import EarningsTracker from '@/components/dashboard/EarningsTracker';
import HashrateGraph from '@/components/dashboard/HashrateGraph';
import PoolStats from '@/components/dashboard/PoolStats';
import HardwareStats from '@/components/dashboard/HardwareStats';
import LiveLog from '@/components/dashboard/LiveLog';
import PortfolioBalance from '@/components/dashboard/PortfolioBalance';
import { useState } from 'react';

export default function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 lg:p-6 overflow-hidden">
      <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-primary uppercase glow-text flex items-center gap-3">
            <TerminalSquare className="w-8 h-8" />
            Nexus_Core // Miner
          </h1>
          <p className="text-muted-foreground text-sm mt-1 uppercase tracking-widest">
            v9.4.2 [SECURE CONNECTION ESTABLISHED]
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-primary animate-pulse' : 'bg-destructive'}`}></div>
            <span className={isRunning ? 'text-primary' : 'text-destructive'}>
              {isRunning ? 'SYS_ONLINE' : 'SYS_OFFLINE'}
            </span>
          </div>
          <div className="text-muted-foreground border-l border-border pl-4">
            UPTIME: {isRunning ? '04:12:33:09' : '00:00:00:00'}
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="col-span-1 md:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="col-span-1 md:col-span-3">
            <ControlPanel isRunning={isRunning} setIsRunning={setIsRunning} />
          </div>
          <div className="col-span-1 md:col-span-3">
            <EarningsTracker isRunning={isRunning} />
          </div>
          <div className="col-span-1 md:col-span-3">
            <PortfolioBalance isRunning={isRunning} />
          </div>
          <div className="col-span-1 md:col-span-3">
            <PoolStats isRunning={isRunning} />
          </div>
        </div>

        <div className="col-span-1 md:col-span-8">
          <HashrateGraph isRunning={isRunning} />
        </div>
        
        <div className="col-span-1 md:col-span-4">
          <HardwareStats isRunning={isRunning} />
        </div>

        <div className="col-span-1 md:col-span-12">
          <LiveLog isRunning={isRunning} />
        </div>
      </main>
    </div>
  );
}
