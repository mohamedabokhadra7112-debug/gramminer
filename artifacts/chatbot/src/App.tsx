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
import Combo from './pages/Combo';
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
// is always built from the real origin without relying on a hosted redirect.
// API_BASE is '' in dev (Vite proxy forwards /api → port 8080).
const manifestUrl = typeof window !== 'undefined'
  ? `/api/tonconnect-manifest?origin=${encodeURIComponent(window.location.origin)}`
  : '/api/tonconnect-manifest';

// Keeps a CSS var in sync with the *real* visible height inside Telegram's
// in-app browser — plain 100dvh is unreliable inside Telegram's WebView.
//
// Guard: only write --app-height when the value looks real (> 200px).
// On Android after a reload, viewportStableHeight often returns 0 in the
// first few milliseconds; writing 0px would override the CSS fallback (100dvh)
// and collapse the app-shell to nothing. We retry via rAF + timeouts until
// Telegram has settled the viewport.
function useAppHeight() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();

    const applyHeight = () => {
      const h =
        (tg?.viewportStableHeight && tg.viewportStableHeight > 200 ? tg.viewportStableHeight : 0) ||
        (tg?.viewportHeight       && tg.viewportHeight       > 200 ? tg.viewportHeight       : 0) ||
        (window.innerHeight       > 200 ? window.innerHeight                                  : 0);
      if (h > 200) {
        document.documentElement.style.setProperty('--app-height', `${h}px`);
      }
      // If h is still 0 here, the CSS :root fallback (100dvh) stays active —
      // which is correct until Telegram fires viewportChanged with a real value.
    };

    applyHeight();
    // Retry after first paint — rAF fires after the browser has done layout,
    // so Telegram's viewport is usually available by then.
    requestAnimationFrame(applyHeight);
    // Two extra safety retries for slow Android WebView initialisation.
    const t1 = setTimeout(applyHeight, 350);
    const t2 = setTimeout(applyHeight, 1000);

    tg?.onEvent?.('viewportChanged', applyHeight);
    window.addEventListener('resize', applyHeight);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
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

function ChannelGate() {
  const { notJoinedChannels, recheckChannels } = useTelegramUser();
  const [checking, setChecking] = React.useState(false);

  const handleRecheck = async () => {
    setChecking(true);
    try { await recheckChannels(); } finally { setChecking(false); }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full px-6 gap-5"
      style={{ backgroundColor: '#0a0b14' }}>
      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
        <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185z" />
        </svg>
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-white font-black text-xl mb-1">لازم تشترك في القنوات دي أولاً</h2>
        <p className="text-muted-foreground text-sm">اشترك في كل القنوات اللي تحت عشان تقدر تستخدم التطبيق</p>
      </div>

      {/* Channel list */}
      <div className="w-full space-y-2.5">
        {notJoinedChannels.map(ch => (
          <a
            key={ch.channelUsername}
            href={`https://t.me/${ch.channelUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 hover:border-primary/40 hover:bg-white/10 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.88 13.47l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.834.95-.001 0-.001.001-.002.001l.466-.002z"/>
                </svg>
              </div>
              <span className="text-white font-bold text-sm">
                {ch.channelName || `@${ch.channelUsername}`}
              </span>
            </div>
            <span className="text-primary text-xs font-bold group-hover:translate-x-0.5 transition-transform">
              اشترك ←
            </span>
          </a>
        ))}
      </div>

      {/* Recheck button */}
      <button
        onClick={handleRecheck}
        disabled={checking}
        className="w-full bg-primary text-black font-black rounded-2xl py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
      >
        {checking ? (
          <>
            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            جار التحقق...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            تحقق مرة أخرى
          </>
        )}
      </button>
    </div>
  );
}

function Router() {
  const { isAdmin, isLoading, notJoinedChannels } = useTelegramUser();

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
      ) : notJoinedChannels.length > 0 ? (
        <ChannelGate />
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
              <Route path="/combo" component={Combo} />
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
