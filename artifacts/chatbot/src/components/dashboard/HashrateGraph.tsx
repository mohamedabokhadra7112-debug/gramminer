import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface HashrateGraphProps {
  isRunning: boolean;
}

export default function HashrateGraph({ isRunning }: HashrateGraphProps) {
  const [data, setData] = useState<{ time: string; hashrate: number }[]>([]);
  const [currentHashrate, setCurrentHashrate] = useState(0);

  useEffect(() => {
    // Initialize data
    const initialData = [];
    const now = new Date();
    for (let i = 30; i > 0; i--) {
      initialData.push({
        time: new Date(now.getTime() - i * 1000).toLocaleTimeString('en-US', { hour12: false, second: '2-digit', minute: '2-digit' }),
        hashrate: 0
      });
    }
    setData(initialData);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, second: '2-digit', minute: '2-digit' });
        const baseHashrate = 845.5; // GH/s
        const jitter = (Math.random() - 0.5) * 15;
        const newHashrate = baseHashrate + jitter;
        
        setCurrentHashrate(newHashrate);
        
        setData(prev => {
          const newData = [...prev.slice(1), { time, hashrate: newHashrate }];
          return newData;
        });
      }, 1000);
    } else {
      interval = setInterval(() => {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, second: '2-digit', minute: '2-digit' });
        
        // Decay to zero
        setCurrentHashrate(prev => {
          const newRate = prev * 0.8;
          return newRate < 1 ? 0 : newRate;
        });
        
        setData(prev => {
          const lastRate = prev[prev.length - 1].hashrate;
          const newRate = lastRate * 0.8 < 1 ? 0 : lastRate * 0.8;
          return [...prev.slice(1), { time, hashrate: newRate }];
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  return (
    <Card className="h-[350px] flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle><Activity className="w-4 h-4" /> TELEMETRY_STREAM // HASHRATE</CardTitle>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">Current Output</span>
            <span className={`font-mono text-xl font-bold ${isRunning ? 'text-primary glow-text' : 'text-muted-foreground'}`}>
              {currentHashrate.toFixed(2)} <span className="text-sm">GH/s</span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 pt-4 overflow-hidden relative">
        {isRunning && (
          <div className="absolute inset-0 bg-primary/5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(175, 255, 240, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(175, 255, 240, 0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        )}
        <div className="w-full h-full pb-4 pr-4 pl-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorHashrate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="hsl(var(--muted-foreground))" 
                fontSize={10} 
                tickMargin={10}
                tickFormatter={(value, index) => index % 5 === 0 ? value : ''}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))" 
                fontSize={10} 
                tickFormatter={(value) => `${value}`}
                domain={[0, 900]}
                width={40}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  borderColor: 'hsl(var(--border))',
                  borderRadius: 0,
                  fontFamily: 'var(--app-font-mono)'
                }}
                itemStyle={{ color: 'hsl(var(--primary))' }}
                labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
              />
              <Area 
                type="monotone" 
                dataKey="hashrate" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorHashrate)" 
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
