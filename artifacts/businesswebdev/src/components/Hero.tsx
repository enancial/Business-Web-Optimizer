import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const bullets = [
  'Launch-ready in 30 days — no dragged-out projects',
  'Flat, transparent pricing — no hidden retainers',
  'Fully async — minimal meetings, maximum focus',
];

export function Hero() {
  return (
    // mt-16 clears the 64px fixed nav (h-16)
    <section
      id="top"
      className="relative mt-16 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0f2557 0%, #1A3A7A 35%, #1565D6 70%, #3b82f6 100%)',
        minHeight: 'calc(100vh - 64px)',
      }}
    >
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Light glow at bottom */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-64 rounded-full bg-blue-400/20 blur-3xl" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28 text-center text-white">

        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm font-medium text-white/90"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
          </span>
          Currently accepting new clients
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight mb-6"
          data-testid="text-hero-headline"
        >
          A professional website,{' '}
          <span className="text-orange-400">launched in 30 days</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg sm:text-xl text-white/75 max-w-2xl mx-auto mb-8"
          data-testid="text-hero-subhead"
        >
          Web design and ongoing management for founders who need results, not excuses. One flat price. No agencies. No mystery.
        </motion.p>

        {/* Bullet trust signals */}
        <motion.ul
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-3 justify-center mb-10 text-sm text-white/80"
        >
          {bullets.map((b) => (
            <li key={b} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
              {b}
            </li>
          ))}
        </motion.ul>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Button
            asChild
            size="lg"
            className="bg-orange-500 hover:bg-orange-600 text-white text-base px-8 shadow-lg shadow-orange-900/30 gap-2"
            data-testid="button-hero-launch-package"
          >
            <a href="#launch-package">
              See the Launch Package
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="text-white hover:bg-white/10 text-base px-8 border border-white/25"
            data-testid="button-hero-management-plan"
          >
            <a href="#management-plan">Monthly Management Plan</a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
