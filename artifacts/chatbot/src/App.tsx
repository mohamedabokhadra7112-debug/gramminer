import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import Dashboard from './pages/Dashboard';
import Miners from './pages/Miners';
import Tasks from './pages/Tasks';
import Friends from './pages/Friends';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import BottomNav from './components/BottomNav';
import { WalletProvider } from './context/WalletContext';
import { TelegramUserProvider } from './context/TelegramUserContext';
import { useTelegramUser } from './context/TelegramUserContext';
import { LanguageProvider } from './context/LanguageContext';
import { CoinsProvider } from './context/CoinsContext';
import { MinersProvider } from './context/MinersContext';
import mineBgImg from '@assets/photo_2026-07-14_21-54-22_1784066077961.jpg';

const queryClient = new QueryClient();

// The TON Connect manifest is served dynamically from the API so the iconUrl
// is always built from the real origin (no broken Vercel redirect).
// API_BASE is '' in dev (Vite proxy forwards /api → port 8080).
const manifestUrl = typeof window !== 'undefined'
  ? `/api/tonconnect-manifest?origin=${encodeURIComponent(window.location.origin)}`
  : '/api/tonconnect-manifest';

// Keeps a CSS var in sync with the *real* visible height inside Telegram's
// in-app browser — plain 100dvh is unreliable inside Telegram's WebView.
function useAppHeight() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();

    const applyHeight = () => {
      const height = tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${height}px`);
    };

    applyHeight();
    tg?.onEvent?.('viewportChanged', applyHeight);
    window.addEventListener('resize', applyHeight);

    return () => {
      tg?.offEvent?.('viewportChanged', applyHeight);
      window.removeEventListener('resize', applyHeight);
    };
  }, []);
}

// Inner wrapper: reads userId so LanguageProvider can key storage per user
function AppWithLanguage({ children }: { children: React.ReactNode }) {
  const { user } = useTelegramUser();
  return <LanguageProvider userId={user?.id}>{children}</LanguageProvider>;
}

function LoadingScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full w-full gap-4"
      style={{ backgroundColor: '#0a0b14' }}
    >
      <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      <span className="text-primary font-bold text-lg tracking-widest animate-pulse">GramMiner</span>
    </div>
  );
}

function Router() {
  const { isAdmin, isLoading } = useTelegramUser();

  return (
    <div
      className="app-shell flex flex-col w-full max-w-[430px] mx-auto relative shadow-2xl overflow-hidden"
      style={{
        backgroundImage: `url(${mineBgImg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {isLoading ? (
        <LoadingScreen />
      ) : (
        <>
          <div
            className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain relative z-10 pb-[80px] [-webkit-overflow-scrolling:touch]"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/miners" component={Miners} />
              <Route path="/tasks" component={Tasks} />
              <Route path="/friends" component={Friends} />
              <Route path="/profile" component={Profile} />
              {isAdmin && <Route path="/admin" component={Admin} />}
              <Route component={() => <div className="p-8 text-primary text-center pt-20">404 NOT FOUND</div>} />
            </Switch>
          </div>
          <BottomNav showAdmin={isAdmin} />
        </>
      )}
    </div>
  );
}

function App() {
  useAppHeight();

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <QueryClientProvider client={queryClient}>
        <TelegramUserProvider>
          <AppWithLanguage>
            <CoinsProvider>
              <WalletProvider>
                <MinersProvider>
                  <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                    <div className="min-h-screen bg-black flex items-center justify-center">
                      <Router />
                    </div>
                  </WouterRouter>
                </MinersProvider>
              </WalletProvider>
            </CoinsProvider>
          </AppWithLanguage>
        </TelegramUserProvider>
      </QueryClientProvider>
    </TonConnectUIProvider>
  );
}

export default App;
