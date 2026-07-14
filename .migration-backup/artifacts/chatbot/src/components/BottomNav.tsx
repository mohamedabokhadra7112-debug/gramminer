import { Link, useLocation } from 'wouter';
import { Pickaxe, Zap, ClipboardList, Users, User } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Mine', icon: Pickaxe },
  { path: '/miners', label: 'Miners', icon: Zap },
  { path: '/tasks', label: 'Tasks', icon: ClipboardList },
  { path: '/friends', label: 'Friends', icon: Users },
  { path: '/profile', label: 'Profile', icon: User },
];

export default function BottomNav() {
  const [location] = useLocation();

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[80px] bg-[#0a0a0f]/95 backdrop-blur-md border-t border-white/5 flex items-center justify-around px-2 z-50">
      {navItems.map((item) => {
        const isActive = location === item.path;
        const Icon = item.icon;
        
        return (
          <Link key={item.path} href={item.path} className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2 cursor-pointer touch-manipulation">
            <div className={`p-2 rounded-xl transition-colors duration-200 ${isActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}>
              <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
            </div>
            <span className={`text-[10px] font-semibold tracking-wider ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
