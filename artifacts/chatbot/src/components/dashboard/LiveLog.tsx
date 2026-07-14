import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TerminalSquare } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface LiveLogProps {
  isRunning: boolean;
}

interface LogEntry {
  id: number;
  time: string;
  level: 'info' | 'warn' | 'success' | 'error';
  message: string;
}

export default function LiveLog({ isRunning }: LiveLogProps) {
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, time: new Date().toLocaleTimeString(), level: 'info', message: 'NEXUS_CORE v9.4.2 initialized' },
    { id: 2, time: new Date().toLocaleTimeString(), level: 'info', message: 'Waiting for operator command...' }
  ]);
  const logCounter = useRef(3);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addLog = (level: LogEntry['level'], message: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => {
      const newLogs = [...prev, { id: logCounter.current++, time, level, message }];
      if (newLogs.length > 50) return newLogs.slice(newLogs.length - 50);
      return newLogs;
    });
  };

  useEffect(() => {
    if (isRunning) {
      addLog('info', 'Executing boot sequence...');
      setTimeout(() => addLog('info', 'Connecting to pool us1.ethermine.org:4444'), 500);
      setTimeout(() => addLog('success', 'Connected to stratrum node'), 1200);
      setTimeout(() => addLog('info', 'Generating DAG file for epoch #442'), 1800);
      setTimeout(() => addLog('success', 'DAG successfully generated (3254ms)'), 5000);
      setTimeout(() => addLog('info', 'Commencing hashing operations across 4 nodes'), 5200);
    } else if (logCounter.current > 3) {
      addLog('warn', 'SIGINT received. Halting hashing processes...');
      setTimeout(() => addLog('info', 'Connection to pool severed.'), 500);
      setTimeout(() => addLog('error', 'SYSTEM OFFLINE'), 1000);
    }
  }, [isRunning]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        const rand = Math.random();
        if (rand > 0.8) {
          const shareId = Math.floor(Math.random() * 10000000).toString(16);
          const diff = (Math.random() * 4 + 1).toFixed(2);
          addLog('success', `[GPU${Math.floor(Math.random() * 4)}] Valid share accepted (diff: ${diff}G, id: ${shareId})`);
        } else if (rand > 0.78) {
          addLog('warn', `[GPU${Math.floor(Math.random() * 4)}] Temperature spike detected. Adjusting fan curve.`);
        } else if (rand > 0.98) {
          addLog('error', `[NETWORK] Stale share rejected by pool (timeout)`);
        } else if (rand > 0.95) {
          addLog('info', 'New job received from pool: 0x' + Math.floor(Math.random() * 10000000000).toString(16));
        }
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'info': return 'text-foreground/80';
      case 'warn': return 'text-chart-4';
      case 'success': return 'text-primary';
      case 'error': return 'text-destructive';
      default: return 'text-foreground';
    }
  };

  return (
    <Card className="h-[250px] flex flex-col bg-black border-border">
      <CardHeader className="py-2 bg-muted/20 border-b border-border/50">
        <CardTitle className="text-xs"><TerminalSquare className="w-3 h-3" /> SYS_STDOUT</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none crt-overlay opacity-20"></div>
        <div 
          ref={scrollRef}
          className="h-full overflow-y-auto p-3 font-mono text-xs leading-relaxed space-y-1"
        >
          {logs.map((log) => (
            <div key={log.id} className="flex gap-3 hover:bg-white/5 transition-colors">
              <span className="text-muted-foreground shrink-0 select-none">[{log.time}]</span>
              <span className={`shrink-0 uppercase w-[60px] select-none ${getLevelColor(log.level)}`}>
                {log.level}
              </span>
              <span className={`${getLevelColor(log.level)} break-all`}>
                {log.message}
              </span>
            </div>
          ))}
          {isRunning && (
            <div className="flex gap-3 mt-1">
              <span className="text-muted-foreground shrink-0">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
              <span className="text-primary animate-pulse">_</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
