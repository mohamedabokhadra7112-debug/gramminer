import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import Dashboard from './pages/Dashboard';
import Miners from './pages/Miners';
import Tasks from './pages/Tasks';
import Friends from './pages/Friends';
import Profile from './pages/Profile';
import BottomNav from './components/BottomNav';
import { WalletProvider } from './context/WalletContext';
import { TelegramUserProvider } from './context/TelegramUserContext';

const queryClient = new QueryClient();

// Keeps a CSS var in sync with the *real* visible height inside Telegram's
// in-app browser. Telegram's own chrome (header, home-indicator, on-screen
// keyboard) makes plain 100dvh unreliable — it can report more height than
// is actually visible, which made the page look "frozen"/unscrollable on
// real phones even though it scrolled fine in a normal desktop browser.
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

function Router() {
  return (
    <div className="app-shell flex flex-col w-full max-w-[430px] mx-auto bg-background relative shadow-2xl overflow-hidden">
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
          <Route component={() => <div className="p-8 text-primary text-center pt-20">404 NOT FOUND</div>} />
        </Switch>
      </div>
      <BottomNav />
    </div>
  );
}

function App() {
  useAppHeight();

  return (
    <QueryClientProvider client={queryClient}>
      <TelegramUserProvider>
        <WalletProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <div className="min-h-screen bg-black flex items-center justify-center">
              <Router />
            </div>
          </WouterRouter>
        </WalletProvider>
      </TelegramUserProvider>
    </QueryClientProvider>
  );
}

export default App;
