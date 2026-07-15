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
import mineBgImg from '@assets/photo_2026-07-14_21-54-22_1784066077961.jpg';

const queryClient = new QueryClient();

// The TON Connect manifest lives in /public so Vite serves it at the origin root.
const manifestUrl = typeof window !== 'undefined'
  ? `${window.location.origin}/tonconnect-manifest.json`
  : '/tonconnect-manifest.json';

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

function Router() {
  const { isAdmin } = useTelegramUser();

  return (
    <div
      className="app-shell flex flex-col w-full max-w-[430px] mx-auto relative shadow-2xl overflow-hidden"
      style={{
        backgroundImage: `url(${mineBgImg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
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
            <WalletProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <div className="min-h-screen bg-black flex items-center justify-center">
                  <Router />
                </div>
              </WouterRouter>
            </WalletProvider>
          </AppWithLanguage>
        </TelegramUserProvider>
      </QueryClientProvider>
    </TonConnectUIProvider>
  );
}

export default App;
