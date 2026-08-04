import { Router as WouterRouter, Route, Switch, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { WhichDoINeed } from '@/components/WhichDoINeed';
import { PricingTiers } from '@/components/PricingTiers';
import { OptimizerTool } from '@/components/OptimizerTool';
import { HowItWorks } from '@/components/HowItWorks';
import { FAQ } from '@/components/FAQ';
import { Footer } from '@/components/Footer';
import { Success } from '@/pages/Success';
import { Cancel } from '@/pages/Cancel';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { AccountPage } from '@/pages/AccountPage';
import { AffiliateJoinPage } from '@/pages/AffiliateJoinPage';
import { AffiliateDashboardPage } from '@/pages/AffiliateDashboardPage';
import { AdminPayoutsPage } from '@/pages/AdminPayoutsPage';
import { AffiliatesPage } from '@/pages/AffiliatesPage';
import { PartnersPage } from '@/pages/PartnersPage';

const queryClient = new QueryClient();

function HomePage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <WhichDoINeed />
      <PricingTiers />
      <OptimizerTool />
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
            <Route path="/admin/affiliate-payouts" component={AdminPayoutsPage} />
            <Route path="/affiliates/dashboard" component={AffiliateDashboardPage} />
            <Route path="/affiliates/join" component={AffiliateJoinPage} />
            <Route path="/affiliates" component={AffiliatesPage} />
            <Route path="/partners" component={PartnersPage} />
            <Route path="/account" component={AccountPage} />
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
