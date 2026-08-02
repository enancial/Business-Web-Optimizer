import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Mail,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirror the API's ScanResult shape)
// ---------------------------------------------------------------------------

interface Issue {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

interface ScanResult {
  url: string;
  score: number;
  issues: Issue[];
  fetchTimeMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type ScanState = 'idle' | 'scanning' | 'results' | 'error';
type EmailState = 'idle' | 'sending' | 'sent' | 'error';

export function OptimizerTool() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<ScanState>('idle');
  const [scanError, setScanError] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);

  const [emailState, setEmailState] = useState<EmailState>('idle');
  const [emailError, setEmailError] = useState('');

  // Fake progress bar that advances while the real fetch is in flight
  const [progress, setProgress] = useState(0);

  async function runProgressBar(signal: AbortSignal) {
    const ticks = [10, 22, 38, 54, 68, 80, 90];
    for (const pct of ticks) {
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, 380));
      setProgress(pct);
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setState('scanning');
    setProgress(0);
    setScanError('');
    setResult(null);
    setEmailState('idle');
    setEmailError('');

    const abort = new AbortController();

    // Kick off animated progress bar alongside the real fetch
    void runProgressBar(abort.signal);

    try {
      const res = await fetch(`${BASE}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      abort.abort(); // stop the fake progress bar
      const data = (await res.json()) as ScanResult & { error?: string };

      if (!res.ok) {
        setScanError(data.error ?? 'Scan failed. Please try again.');
        setState('error');
        return;
      }

      setProgress(100);
      await new Promise((r) => setTimeout(r, 300));
      setResult(data);
      setState('results');

      // Fire email if address was provided
      if (email.trim()) {
        void sendReport(email.trim(), data);
      }
    } catch (err) {
      abort.abort();
      setScanError(
        err instanceof Error ? err.message : 'Network error — please try again.',
      );
      setState('error');
    }
  }

  async function sendReport(toEmail: string, scanResult: ScanResult) {
    setEmailState('sending');
    try {
      const res = await fetch(`${BASE}/api/send-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: toEmail,
          url: scanResult.url,
          score: scanResult.score,
          issues: scanResult.issues,
        }),
      });
      const data = (await res.json()) as { sent?: boolean; error?: string };
      if (res.ok && data.sent) {
        setEmailState('sent');
      } else {
        setEmailState('error');
        setEmailError(data.error ?? 'Could not send email. Please try again.');
      }
    } catch {
      setEmailState('error');
      setEmailError('Network error — could not send email.');
    }
  }

  function handleReset() {
    setState('idle');
    setProgress(0);
    setUrl('');
    setEmail('');
    setResult(null);
    setScanError('');
    setEmailState('idle');
    setEmailError('');
  }

  const highCount = result?.issues.filter((i) => i.severity === 'high').length ?? 0;
  const medCount = result?.issues.filter((i) => i.severity === 'medium').length ?? 0;
  const lowCount = result?.issues.filter((i) => i.severity === 'low').length ?? 0;

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
            Enter your website URL and get a prioritized list of improvements — free, in under 60
            seconds.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* ── Idle: entry form ── */}
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
                      <span className="text-muted-foreground text-xs font-normal">
                        (optional — get your report by email)
                      </span>
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

          {/* ── Scanning: progress ── */}
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

          {/* ── Error ── */}
          {state === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-card border border-red-200 rounded-2xl p-8 shadow-sm text-center"
              data-testid="scan-error"
            >
              <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-red-700">Scan failed</h3>
              <p className="text-sm text-muted-foreground mb-6">{scanError}</p>
              <Button
                onClick={handleReset}
                variant="outline"
                className="gap-2"
              >
                Try again
              </Button>
            </motion.div>
          )}

          {/* ── Results ── */}
          {state === 'results' && result && (
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
                  <ScoreRing score={result.score} />
                  <div className="text-center sm:text-left">
                    <h3 className="text-2xl font-bold mb-1">
                      Optimization Score: {result.score}/100
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {result.issues.length === 0
                        ? 'Great work — no issues found on this page!'
                        : <>
                            We found{' '}
                            {highCount > 0 && <strong>{highCount} high-priority</strong>}
                            {highCount > 0 && medCount > 0 && ' and '}
                            {medCount > 0 && <strong>{medCount} medium-priority</strong>}
                            {highCount === 0 && medCount === 0 && `${lowCount} low-priority`}
                            {' '}issue{result.issues.length !== 1 ? 's' : ''} on{' '}
                            <span className="font-mono text-sm break-all">{result.url}</span>.
                          </>
                      }
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
                        {lowCount} Low
                      </span>
                    </div>
                  </div>
                </div>

                {/* Email delivery status */}
                <AnimatePresence>
                  {email && emailState !== 'idle' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      {emailState === 'sending' && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-3">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          Sending report to <strong>{email}</strong>…
                        </div>
                      )}
                      {emailState === 'sent' && (
                        <div
                          className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3"
                          data-testid="email-sent-confirmation"
                        >
                          <Mail className="h-4 w-4 shrink-0" />
                          Report sent to <strong>{email}</strong>. Check your inbox.
                        </div>
                      )}
                      {emailState === 'error' && (
                        <div
                          className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3"
                          data-testid="email-error"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          {emailError}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Issues list */}
              {result.issues.length > 0 && (
                <div className="space-y-3 mb-8">
                  {result.issues.map((issue, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04 }}
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
              )}

              {/* Upgrade CTA */}
              <div className="bg-[#1A3A7A] rounded-2xl p-8 text-white text-center">
                <h3 className="text-xl font-bold mb-2">Want monthly re-scans + the full report?</h3>
                <p className="text-blue-100 mb-6 text-sm">
                  Upgrade to Optimizer for a complete site audit, exportable PDF, and monthly
                  re-scans — so you can track progress over time.
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
