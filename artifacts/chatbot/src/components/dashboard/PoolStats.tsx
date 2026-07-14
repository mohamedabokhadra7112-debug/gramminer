import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Server, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';

interface PoolStatsProps {
  isRunning: boolean;
}

export default function PoolStats({ isRunning }: PoolStatsProps) {
  const [ping, setPing] = useState(24);
  const [shares, setShares] = useState(14392);
  const [rejected, setRejected] = useState(21);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setPing(20 + Math.floor(Math.random() * 15));
        if (Math.random() > 0.3) setShares(s => s + 1);
        if (Math.random() > 0.95) setRejected(r => r + 1);
      }, 2000);
    } else {
      setPing(0);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle><Server className="w-4 h-4" /> UPLINK_NODE</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-start border-b border-border/50 pb-3">
          <div>
            <div className="text-sm font-bold text-foreground">us1.ethermine.org:4444</div>
            <div className="text-xs text-primary uppercase mt-1 flex items-center gap-1">
              <Zap className="w-3 h-3" /> stratum+tcp
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase">Latency</div>
            <div className={`font-mono font-bold ${ping > 30 ? 'text-chart-4' : 'text-primary'}`}>
              {ping}ms
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground uppercase mb-1">Valid Shares</div>
            <div className="font-mono text-lg text-foreground">{shares.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase mb-1">Rejected</div>
            <div className="font-mono text-lg text-destructive">{rejected.toLocaleString()}</div>
          </div>
        </div>

        <div className="w-full bg-muted/30 h-1.5 mt-2 overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(shares / (shares + rejected)) * 100}%` }}
          />
        </div>
        <div className="text-[10px] text-right text-muted-foreground uppercase">
          Success Rate: {((shares / (shares + rejected)) * 100).toFixed(2)}%
        </div>
      </CardContent>
    </Card>
  );
}