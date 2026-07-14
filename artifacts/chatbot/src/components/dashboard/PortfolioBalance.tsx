import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';

interface PortfolioBalanceProps {
  isRunning: boolean;
}

export default function PortfolioBalance({ isRunning }: PortfolioBalanceProps) {
  const btcBalance = 0.45291032;
  const ethBalance = 12.89430100;
  
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle><Wallet className="w-4 h-4" /> ASSET_RESERVE</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-muted/20 border border-border/40 p-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-[#F7931A]/20 flex items-center justify-center border border-[#F7931A]/50 text-[#F7931A] text-[10px] font-bold">
              B
            </div>
            <div>
              <div className="font-bold text-sm leading-none">BTC</div>
              <div className="text-[10px] text-muted-foreground uppercase mt-1">Cold Storage</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm">{btcBalance.toFixed(8)}</div>
            <div className="text-xs text-muted-foreground">≈ $30,450.21</div>
          </div>
        </div>

        <div className="bg-muted/20 border border-border/40 p-3 flex justify-between items-center relative overflow-hidden">
          {isRunning && (
            <motion.div 
              className="absolute top-0 left-0 h-full w-[2px] bg-primary"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
          )}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-[#627EEA]/20 flex items-center justify-center border border-[#627EEA]/50 text-[#627EEA] text-[10px] font-bold">
              E
            </div>
            <div>
              <div className="font-bold text-sm leading-none">ETH</div>
              <div className="text-[10px] text-muted-foreground uppercase mt-1">Active Wallet</div>
            </div>
          </div>
          <div className="text-right">
            <div className={`font-mono text-sm ${isRunning ? 'text-primary glow-text' : ''}`}>
              {ethBalance.toFixed(8)}
            </div>
            <div className="text-xs text-muted-foreground">≈ $40,520.33</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
