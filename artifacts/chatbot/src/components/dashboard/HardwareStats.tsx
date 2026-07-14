import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HardDrive, Fan, Thermometer } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface HardwareStatsProps {
  isRunning: boolean;
}

export default function HardwareStats({ isRunning }: HardwareStatsProps) {
  const [gpus, setGpus] = useState([
    { id: 'GPU0', name: 'RTX 4090', temp: 35, load: 0, fan: 30, pwr: 25 },
    { id: 'GPU1', name: 'RTX 4090', temp: 34, load: 0, fan: 30, pwr: 24 },
    { id: 'GPU2', name: 'RTX 4090', temp: 36, load: 0, fan: 30, pwr: 26 },
    { id: 'GPU3', name: 'RTX 4090', temp: 35, load: 0, fan: 30, pwr: 25 },
  ]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setGpus(prev => prev.map(gpu => ({
          ...gpu,
          temp: Math.min(85, Math.max(65, gpu.temp + (Math.random() > 0.5 ? 1 : -1))),
          load: 99 + Math.random() * 1, // Almost pinned at 100%
          fan: Math.min(100, Math.max(70, gpu.fan + (Math.random() > 0.5 ? 2 : -2))),
          pwr: 380 + Math.floor(Math.random() * 40)
        })));
      }, 2000);
    } else {
      interval = setInterval(() => {
        setGpus(prev => prev.map(gpu => ({
          ...gpu,
          temp: Math.max(35, gpu.temp - 2),
          load: 0,
          fan: Math.max(30, gpu.fan - 5),
          pwr: Math.max(25, gpu.pwr - 20)
        })));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  return (
    <Card className="h-full">
      <CardHeader className="py-3">
        <CardTitle><HardDrive className="w-4 h-4" /> RIG_SENSORS // ARRAY_STATUS</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/50">
          {gpus.map((gpu) => (
            <div key={gpu.id} className="p-3 hover:bg-muted/10 transition-colors relative">
              {isRunning && gpu.temp > 80 && (
                <div className="absolute inset-0 border border-chart-4/50 bg-chart-4/5 pointer-events-none z-10 animate-pulse"></div>
              )}
              
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{gpu.id}</span>
                  <span className="text-xs text-muted-foreground">{gpu.name}</span>
                </div>
                <div className="text-xs font-mono">
                  {gpu.load.toFixed(1)}% <span className="text-muted-foreground">LOAD</span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                {/* Temp */}
                <div className="bg-muted/30 p-2 flex items-center justify-between border border-border/40">
                  <Thermometer className="w-3 h-3 text-muted-foreground" />
                  <span className={`font-mono text-xs font-bold ${gpu.temp > 80 ? 'text-chart-4 glow-text' : gpu.temp > 70 ? 'text-chart-4' : 'text-primary'}`}>
                    {gpu.temp}°C
                  </span>
                </div>
                
                {/* Fan */}
                <div className="bg-muted/30 p-2 flex items-center justify-between border border-border/40 overflow-hidden relative">
                  <motion.div 
                    animate={isRunning ? { rotate: 360 } : { rotate: 0 }}
                    transition={isRunning ? { repeat: Infinity, duration: 100 / gpu.fan, ease: "linear" } : { duration: 2 }}
                  >
                    <Fan className={`w-3 h-3 ${isRunning ? 'text-primary' : 'text-muted-foreground'}`} />
                  </motion.div>
                  <span className="font-mono text-xs">{gpu.fan}%</span>
                </div>
                
                {/* Power */}
                <div className="bg-muted/30 p-2 flex items-center justify-between border border-border/40">
                  <span className="text-[10px] text-muted-foreground">PWR</span>
                  <span className="font-mono text-xs">{gpu.pwr}W</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-3 bg-muted/20 border-t border-border flex justify-between items-center text-xs">
          <span className="text-muted-foreground uppercase">Total Draw</span>
          <span className="font-mono font-bold text-chart-4">
            {gpus.reduce((acc, gpu) => acc + gpu.pwr, 0)}W
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
