import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Power, Play, Square, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface ControlPanelProps {
  isRunning: boolean;
  setIsRunning: (val: boolean) => void;
}

export default function ControlPanel({ isRunning, setIsRunning }: ControlPanelProps) {
  return (
    <Card className="h-full flex flex-col justify-between">
      <CardHeader>
        <CardTitle><Power className="w-4 h-4" /> BOT_CONTROL</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center items-center gap-4">
        <div className="relative w-full">
          {isRunning && (
            <motion.div 
              className="absolute inset-0 bg-primary/20 blur-xl rounded-full"
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
          )}
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`w-full relative py-6 uppercase font-bold tracking-widest text-lg transition-all duration-300 border flex items-center justify-center gap-3
              ${isRunning 
                ? 'bg-destructive/10 text-destructive border-destructive hover:bg-destructive/20 glow-border-destructive' 
                : 'bg-primary/10 text-primary border-primary hover:bg-primary/20 glow-border'}`}
          >
            {isRunning ? <Square className="w-6 h-6" /> : <Play className="w-6 h-6 fill-primary" />}
            {isRunning ? 'HALT_OPERATIONS' : 'INITIATE_MINING'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full mt-2">
          <div className="bg-muted/30 p-2 text-xs border border-border/50 text-center">
            <span className="text-muted-foreground block mb-1">MODE</span>
            <span className="text-primary font-bold">MAX_YIELD</span>
          </div>
          <div className="bg-muted/30 p-2 text-xs border border-border/50 text-center">
            <span className="text-muted-foreground block mb-1">ALGO</span>
            <span className="text-primary font-bold">ETHASH</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
