import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight, AlertCircle, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface Issue {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

const MOCK_ISSUES: Issue[] = [
  {
    severity: 'high',
    title: 'No clear above-the-fold value proposition',
    detail: "Your hero doesn't immediately answer 'what do you do and who is it for.' Visitors leave within 5 seconds if they can't figure this out.",
  },
  {
    severity: 'high',
    title: 'Missing primary CTA on homepage',
    detail: 'No prominent call-to-action button is visible without scrolling. You\'re losing conversions from warm visitors.',
  },
  {
    severity: 'high',
    title: 'Page load speed exceeds 4 seconds',
    detail: 'Slow load times directly reduce conversion rates and hurt organic search rankings. Likely causes: unoptimized images, render-blocking scripts.',
  },
  {
    severity: 'medium',
    title: 'Meta description missing or too short',
    detail: 'Your meta description is blank or under 80 characters, reducing click-through rates from search results.',
  },
  {
    severity: 'medium',
    title: 'No social proof visible on key landing pages',
    detail: 'Testimonials, case studies, or logos are absent. Social proof significantly increases trust for first-time visitors.',
  },
  {
    severity: 'medium',
    title: 'Heading structure is broken (H1 → H4 skip)',
    detail: 'Skipping heading levels confuses screen readers and weakens SEO. Use a logical H1 → H2 → H3 hierarchy.',
  },
  {
    severity: 'low',
    title: 'Open Graph tags not configured',
    detail: 'Sharing your site on LinkedIn or Twitter will show a blank preview. Add og:title, og:description, and og:image tags.',
  },
  {
    severity: 'low',
    title: 'Contact form has no confirmation message',
    detail: 'After submission, users see a blank page. Add a thank-you message to reduce confusion and repeat submissions.',
  },
];

const SCORE = 42;

function SeverityBadge({ severity }: { severity: Issue['severity'] }) {
  const styles = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  const labels = { high: 'High', medium: 'Medium', low: 'Low' };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${styles[severity]}`}>
      {labels[severity]}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score < 40 ? '#ef4444' : score < 70 ? '#f59e0b' : '#22c55e';

  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground">{score}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

type ScanState = 'idle' | 'scanning' | 'results';

export function OptimizerTool() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<ScanState>('idle');
  const [progress, setProgress] = useState(0);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setState('scanning');
    setProgress(0);

    // Simulate progressive scan
    const steps = [15, 35, 55, 72, 88, 100];
    for (const step of steps) {
      await new Promise((r) => setTimeout(r, 420));
      setProgress(step);
    }

    await new Promise((r) => setTimeout(r, 300));
    setState('results');
  }

  function handleReset() {
    setState('idle');
    setProgress(0);
    setUrl('');
    setEmail('');
  }

  const highCount = MOCK_ISSUES.filter((i) => i.severity === 'high').length;
  const medCount = MOCK_ISSUES.filter((i) => i.severity === 'medium').length;

  return (
    <section id="optimizer-tool" className="py-20 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2
            className="text-3xl sm:text-4xl font-bold mb-4"
            data-testid="text-optimizer-tool-headline"
          >
            Run Your Optimization Scan
          </h2>
          <p className="text-lg text-muted-foreground">
            Enter your website URL and get a prioritized list of improvements — free, in under 60 seconds.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
            >
              <form
                onSubmit={handleScan}
                className="bg-card border border-border rounded-2xl p-8 shadow-sm"
                data-testid="form-optimizer"
              >
                <div className="space-y-4">
                  <div>
                    <label htmlFor="website-url" className="block text-sm font-medium mb-1.5">
                      Website URL <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="website-url"
                      type="url"
                      placeholder="https://yoursite.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                      className="h-11"
                      data-testid="input-website-url"
                    />
                  </div>
                  <div>
                    <label htmlFor="scan-email" className="block text-sm font-medium mb-1.5">
                      Email{' '}
                      <span className="text-muted-foreground text-xs font-normal">(optional — get your report by email)</span>
                    </label>
                    <Input
                      id="scan-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11"
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full mt-6 bg-[#1565D6] hover:bg-[#1A3A7A] text-white text-base gap-2"
                  data-testid="button-run-scan"
                >
                  Run Scan — It's Free
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-3">
                  No credit card. No sign-up required. Instant results.
                </p>
              </form>
            </motion.div>
          )}

          {state === 'scanning' && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="bg-card border border-border rounded-2xl p-10 shadow-sm text-center"
              data-testid="scanning-state"
            >
              <Loader2 className="h-12 w-12 text-[#1565D6] mx-auto mb-6 animate-spin" />
              <h3 className="text-xl font-semibold mb-2">Scanning your site…</h3>
              <p className="text-muted-foreground text-sm mb-8 font-mono">{url}</p>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-2 rounded-full bg-[#1565D6]"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-3">{progress}% complete</p>
            </motion.div>
          )}

          {state === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              data-testid="scan-results"
            >
              {/* Score header */}
              <div className="bg-card border border-border rounded-2xl p-8 mb-6 shadow-sm">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ScoreRing score={SCORE} />
                  <div className="text-center sm:text-left">
                    <h3 className="text-2xl font-bold mb-1">Optimization Score: {SCORE}/100</h3>
                    <p className="text-muted-foreground mb-4">
                      Your site has significant room for improvement. We found{' '}
                      <strong>{highCount} high-priority</strong> and{' '}
                      <strong>{medCount} medium-priority</strong> issues.
                    </p>
                    <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                      <span className="flex items-center gap-1.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {highCount} High
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {medCount} Medium
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {MOCK_ISSUES.length - highCount - medCount} Low
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Issues list */}
              <div className="space-y-3 mb-8">
                {MOCK_ISSUES.map((issue, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="bg-card border border-border rounded-xl p-5"
                    data-testid={`issue-${i}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h4 className="font-semibold text-foreground text-sm">{issue.title}</h4>
                      <SeverityBadge severity={issue.severity} />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{issue.detail}</p>
                  </motion.div>
                ))}
              </div>

              {/* Upgrade CTA */}
              <div className="bg-[#1A3A7A] rounded-2xl p-8 text-white text-center">
                <h3 className="text-xl font-bold mb-2">Want the full report + monthly re-scans?</h3>
                <p className="text-blue-100 mb-6 text-sm">
                  Upgrade to Optimizer for a complete site audit, exportable PDF, and monthly re-scans — so you can track progress over time.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    asChild
                    size="lg"
                    className="bg-white text-[#1A3A7A] hover:bg-blue-50 font-semibold"
                    data-testid="button-upgrade-optimizer"
                  >
                    <a href="/checkout?product=optimizer">Get Optimizer — $29/mo</a>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-white hover:bg-white/10 border border-white/30"
                    data-testid="button-upgrade-pro"
                  >
                    <a href="/checkout?product=optimizer-pro">Get Optimizer Pro — $79/mo</a>
                  </Button>
                </div>
              </div>

              <div className="text-center mt-6">
                <button
                  onClick={handleReset}
                  className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
                  data-testid="button-scan-another"
                >
                  Scan another URL
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
