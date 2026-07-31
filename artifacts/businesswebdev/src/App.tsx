import { useState } from 'react';
import { Router as WouterRouter, Route, Switch } from 'wouter';
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
import { CheckoutModal } from '@/components/CheckoutModal';
import { Success } from '@/pages/Success';
import { Cancel } from '@/pages/Cancel';

const queryClient = new QueryClient();

type CheckoutProduct = 'launch-package' | 'management-plan';

function HomePage({ onCheckout }: { onCheckout: (product: CheckoutProduct) => void }) {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <WhichDoINeed />
      <LaunchPackage onCheckout={() => onCheckout('launch-package')} />
      <ManagementPlan onCheckout={() => onCheckout('management-plan')} />
      <HowTheyWorkTogether />
      <HowItWorks />
      <FAQ />
      <Footer />
    </div>
  );
}

function App() {
  const [checkoutProduct, setCheckoutProduct] = useState<CheckoutProduct | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Switch>
            <Route path="/success" component={Success} />
            <Route path="/cancel" component={Cancel} />
            <Route path="/">
              <HomePage onCheckout={setCheckoutProduct} />
            </Route>
          </Switch>
        </WouterRouter>

        {checkoutProduct && (
          <CheckoutModal
            product={checkoutProduct}
            onClose={() => setCheckoutProduct(null)}
          />
        )}

        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
