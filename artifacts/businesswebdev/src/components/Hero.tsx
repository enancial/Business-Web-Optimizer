import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, BarChart2, FileText } from 'lucide-react';

const bullets = [
  { icon: Zap, text: 'Instant scan — results in under 60 seconds' },
  { icon: BarChart2, text: 'Prioritized fixes, not a raw data dump' },
  { icon: FileText, text: 'Exportable PDF report (paid plans)' },
];

export function Hero() {
  return (
    <section
      id="top"
      className="relative mt-16 overflow-hidden"
      style={{
        background: 'linear-gradient(150deg, #f0f4ff 0%, #e8effe 40%, #ddeaff 70%, #cfd9f7 100%)',
        minHeight: 'calc(100vh - 64px)',
      }}
    >
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: 'radial-gradient(circle, #1A3A7A 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Soft glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full bg-blue-400/10 blur-3xl pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28 text-center">

        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-[#1A3A7A]/10 border border-[#1A3A7A]/20 text-sm font-medium text-[#1A3A7A]"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Automated website optimization for founders
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight mb-6 text-[#0f2557]"
          data-testid="text-hero-headline"
        >
          Paste your URL.{' '}
          <span className="text-[#1565D6]">Get a prioritized<br className="hidden sm:block" /> optimization plan</span>{' '}
          in minutes.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10"
          data-testid="text-hero-subhead"
        >
          Automated scans that show you exactly what to fix on your site to improve clarity, UX, and conversions — built for founders and businesses across the U.S.
        </motion.p>

        {/* Bullet trust signals */}
        <motion.ul
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
        >
          {bullets.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2 text-sm text-gray-600 bg-white/70 border border-gray-200 rounded-full px-4 py-2 shadow-sm">
              <Icon className="h-4 w-4 text-[#1565D6] flex-shrink-0" />
              {text}
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
            className="bg-[#1565D6] hover:bg-[#1A3A7A] text-white text-base px-8 shadow-lg shadow-blue-900/20 gap-2"
            data-testid="button-hero-try-free"
          >
            <a href="#optimizer-tool">
              Try Free
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="text-[#1A3A7A] hover:bg-[#1A3A7A]/10 text-base px-8 border border-[#1A3A7A]/30"
            data-testid="button-hero-see-pricing"
          >
            <a href="#pricing">See Pricing</a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
