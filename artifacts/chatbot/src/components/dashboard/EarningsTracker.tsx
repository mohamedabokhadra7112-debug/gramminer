import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface EarningsTrackerProps {
  isRunning: boolean;
}

export default function EarningsTracker({ isRunning }: EarningsTrackerProps) {
  const [sessionEth, setSessionEth] = useState(0.00000000);
  const [rate, setRate] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        const increment = Math.random() * 0.00000050 + 0.00000010;
        setSessionEth(prev => prev + increment);
        setRate(increment * 3600); // estimated hourly
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const usdValue = sessionEth * 3142.50;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle><DollarSign className="w-4 h-4" /> SESSION_YIELD</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-3xl font-bold text-foreground font-mono tabular-nums tracking-tight">
            {sessionEth.toFixed(8)}
            <span className="text-sm text-primary ml-2">ETH</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1 tabular-nums">
            ≈ ${usdValue.toFixed(4)} USD
          </div>
        </div>

        <div className="pt-4 border-t border-border/50">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground uppercase">Est. Hourly</span>
            <span className="text-primary font-mono flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +{rate.toFixed(6)} ETH
            </span>
          </div>
          <div className="flex justify-between items-center text-xs mt-2">
            <span className="text-muted-foreground uppercase">Est. Daily</span>
            <span className="text-primary font-mono">
              +{(rate * 24).toFixed(6)} ETH
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
