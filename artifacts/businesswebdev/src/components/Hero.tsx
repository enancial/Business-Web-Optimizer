import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export function Hero() {
  return (
    <section
      id="top"
      className="relative min-h-[90vh] flex items-center justify-center bg-gradient-to-br from-primary via-primary to-[hsl(234,56%,32%)] text-white overflow-hidden"
    >
      {/* Background subtle pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{ 
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6"
          data-testid="text-hero-headline"
        >
          Launch-ready sites and ongoing management for founders who want clarity, not chaos.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto mb-10"
          data-testid="text-hero-subhead"
        >
          Two simple ways to work together: a 30-day project to build or overhaul your site, or ongoing monthly management. Fully async, minimal meetings, maximum impact.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Button
            asChild
            size="lg"
            className="bg-accent hover:bg-accent/90 text-accent-foreground text-base px-8"
            data-testid="button-hero-launch-package"
          >
            <a href="#launch-package">See the 30-Day Launch Package</a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="bg-white/10 hover:bg-white/20 text-white border-white/30 text-base px-8"
            data-testid="button-hero-management-plan"
          >
            <a href="#management-plan">See the Website Management Plan</a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
