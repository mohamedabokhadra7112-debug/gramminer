export default function CandlestickBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 z-0 flex items-center justify-center">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="candles" width="60" height="150" patternUnits="userSpaceOnUse">
            {/* Green candle */}
            <line x1="15" y1="20" x2="15" y2="80" stroke="#00ff88" strokeWidth="2" />
            <rect x="5" y="30" width="20" height="40" fill="#00ff88" opacity="0.8" rx="2" />
            
            {/* Red candle */}
            <line x1="45" y1="60" x2="45" y2="130" stroke="#ff3333" strokeWidth="2" />
            <rect x="35" y="80" width="20" height="30" fill="#ff3333" opacity="0.8" rx="2" />
            
            {/* Another green candle */}
            <line x1="25" y1="90" x2="25" y2="140" stroke="#00ff88" strokeWidth="2" opacity="0.5" />
            <rect x="15" y="100" width="20" height="20" fill="#00ff88" opacity="0.4" rx="2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#candles)" />
      </svg>
    </div>
  );
}
