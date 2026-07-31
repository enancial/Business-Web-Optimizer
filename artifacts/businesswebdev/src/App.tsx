import { Router as WouterRouter, Route, Switch, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { WhichDoINeed } from '@/components/WhichDoINeed';
import { LaunchPackage } from '@/components/LaunchPackage';
import { ManagementPlan } from '@/components/ManagementPlan';
import { HowTheyWorkTogether } from '@/components/HowTheyWorkTogether';
import { HowItWorks } from '@/components/HowItWorks';
import { FAQ } from '@/components/FAQ';
import { Footer } from '@/components/Footer';
import { Success } from '@/pages/Success';
import { Cancel } from '@/pages/Cancel';
import { CheckoutPage } from '@/pages/CheckoutPage';

const queryClient = new QueryClient();

function HomePage() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <WhichDoINeed />
      <LaunchPackage
        onCheckout={() => navigate('/checkout?product=launch-package')}
      />
      <ManagementPlan
        onCheckout={() => navigate('/checkout?product=management-plan')}
      />
      <HowTheyWorkTogether />
      <HowItWorks />
      <FAQ />
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Switch>
            <Route path="/success" component={Success} />
            <Route path="/cancel" component={Cancel} />
            <Route path="/checkout" component={CheckoutPage} />
            <Route path="/" component={HomePage} />
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
