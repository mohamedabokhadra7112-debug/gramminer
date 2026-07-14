import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import Dashboard from './pages/Dashboard';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route component={() => <div className="p-8 text-primary">404 NOT FOUND</div>} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <div className="crt-overlay"></div>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
