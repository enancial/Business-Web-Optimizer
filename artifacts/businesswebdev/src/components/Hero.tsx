import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const annotations = [
  { label: 'Scan time', value: 'Under 60 seconds', note: 'From pasting the URL' },
  { label: 'Output', value: 'Prioritized fixes', note: 'Not a raw data dump' },
  { label: 'Report', value: 'Full report by email', note: 'On paid plans' },
];

export function Hero() {
  return (
    <section id="top" className="bwg-hero mt-16">
      <div className="bwg-wrap">
        <div className="bwg-hero-grid">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bwg-eyebrow">Automated website optimization</div>

            <h1 data-testid="text-hero-headline">
              Paste your URL. Get a{' '}
              <span style={{ color: 'var(--bwg-blue)' }}>prioritized optimization plan</span>{' '}
              in minutes.
            </h1>

            <p data-testid="text-hero-subhead">
              Automated scans that show you exactly what to fix on your site to improve
              clarity, UX, and conversions — built for founders and businesses across the U.S.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mt-8">
              <Button asChild size="lg" className="text-base px-8 gap-2" data-testid="button-hero-try-free">
                <a href="#optimizer-tool">
                  Try free
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="text-base px-8"
                data-testid="button-hero-see-pricing"
              >
                <a href="#pricing">See pricing</a>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="bwg-panel-navy p-8 sm:p-10">
              <div className="bwg-eyebrow" style={{ color: 'var(--bwg-blue-on-navy)' }}>
                What you get
              </div>
              <p className="mt-5 text-xl sm:text-2xl font-extrabold leading-snug tracking-tight text-white">
                A scan that tells you what to fix first, and why it matters.
              </p>
              <p className="bwg-panel-sub mt-4 text-sm leading-relaxed">
                Paste a URL and the optimizer checks the page, then ranks what it finds
                so the first thing on the list is the thing worth doing first.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              {annotations.map((a) => (
                <div key={a.label} className="bwg-annotation">
                  <div className="bwg-annotation-label">{a.label}</div>
                  <div className="bwg-annotation-value">{a.value}</div>
                  <div className="mt-1 text-xs text-[var(--bwg-muted)]">{a.note}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
