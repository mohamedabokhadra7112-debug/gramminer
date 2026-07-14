import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import Dashboard from './pages/Dashboard';
import Miners from './pages/Miners';
import Tasks from './pages/Tasks';
import Friends from './pages/Friends';
import Profile from './pages/Profile';
import BottomNav from './components/BottomNav';
import { WalletProvider } from './context/WalletContext';

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-[430px] mx-auto bg-background relative shadow-2xl">
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 pb-[80px]">
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
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <div className="min-h-screen bg-black flex items-center justify-center">
            <Router />
          </div>
        </WouterRouter>
      </WalletProvider>
    </QueryClientProvider>
  );
}

export default App;
