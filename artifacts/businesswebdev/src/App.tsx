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

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen">
          <Nav />
          <Hero />
          <WhichDoINeed />
          <LaunchPackage />
          <ManagementPlan />
          <HowTheyWorkTogether />
          <HowItWorks />
          <FAQ />
          <Footer />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
