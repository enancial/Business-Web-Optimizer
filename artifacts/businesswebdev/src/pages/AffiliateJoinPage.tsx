import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Copy, ExternalLink } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

interface JoinResult {
  success: boolean;
  code: string;
  name: string;
  links: { optimizer: string; optimizerPro: string };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
      title="Copy to clipboard"
    >
      {copied ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

export function AffiliateJoinPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    website: '',
    promotionMethod: '',
    paypalEmail: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JoinResult | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<JoinResult>('/affiliates/join', form);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b px-4 sm:px-6 py-4">
          <a href="/" className="font-bold text-[#1A3A7A] text-lg">Business Web Optimizer</a>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-12">
          {/* Success banner */}
          <div className="flex items-start gap-4 bg-green-50 border border-green-200 rounded-2xl p-6 mb-8">
            <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0 mt-0.5" />
            <div>
              <h1 className="text-xl font-bold text-green-800 mb-1">
                Welcome to the program, {result.name}!
              </h1>
              <p className="text-sm text-green-700">
                Your affiliate code is{' '}
                <span className="font-mono font-bold">{result.code}</span>. Share
                your unique links below to start earning 30% commissions.
              </p>
            </div>
          </div>

          {/* Unique links */}
          <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-semibold text-foreground mb-4">Your referral links</h2>
            <div className="space-y-3">
              {([
                { label: 'Optimizer ($29/mo)', href: result.links.optimizer },
                { label: 'Optimizer Pro ($79/mo)', href: result.links.optimizerPro },
              ] as const).map(({ label, href }) => (
                <div key={href}>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
                  <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2">
                    <span className="text-sm font-mono break-all flex-1 text-foreground">{href}</span>
                    <CopyButton text={href} />
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Promo copy */}
          <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-semibold text-foreground mb-3">Ready-to-use promo copy</h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Short paragraph</p>
                <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed relative">
                  <p>
                    {"If your website isn't ranking well, it could be a technical issue you haven't spotted yet. Business Web Optimizer runs a deep audit of your site and gives you a prioritised fix list — from missing meta tags to slow load times. Try it free, or grab the full report for $29/mo. I use it for my clients and highly recommend it."}
                  </p>
                  <p className="mt-2 font-medium">{result.links.optimizer}</p>
                  <CopyButton text={`If your website isn't ranking well, it could be a technical issue you haven't spotted yet. Business Web Optimizer runs a deep audit of your site and gives you a prioritised fix list — from missing meta tags to slow load times. Try it free, or grab the full report for $29/mo. ${result.links.optimizer}`} />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Short post / tweet</p>
                <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed relative">
                  <p>
                    {"🔍 Free tool: scan your site for SEO & performance issues in 30 seconds → "}
                    {result.links.optimizer}
                  </p>
                  <CopyButton text={`🔍 Free tool: scan your site for SEO & performance issues in 30 seconds → ${result.links.optimizer}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Dashboard link */}
          <div className="text-center">
            <Button asChild className="bg-[#1A3A7A] hover:bg-[#1565D6] text-white">
              <a href="/affiliates/dashboard">View your dashboard →</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 sm:px-6 py-4">
        <a href="/" className="font-bold text-[#1A3A7A] text-lg">Business Web Optimizer</a>
      </header>

      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Hero */}
        <div className="mb-8 text-center">
          <div className="inline-block bg-[#1A3A7A]/10 text-[#1A3A7A] text-xs font-semibold px-3 py-1 rounded-full mb-3">
            Affiliate Program
          </div>
          <h1 className="text-3xl font-bold mb-3">Earn 30% recurring commission</h1>
          <p className="text-muted-foreground">
            Refer customers to Business Web Optimizer and earn 30% of every invoice they
            pay — for the first 12 months of their subscription.
          </p>
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'Commission', value: '30%' },
            { label: 'Duration', value: '12 mo' },
            { label: 'Payout', value: 'Monthly' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#1A3A7A]">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="font-semibold text-foreground">Apply to join</h2>

          <div className="space-y-1">
            <Label htmlFor="name">Full name *</Label>
            <Input
              id="name"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Jane Smith"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Email address *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="jane@example.com"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="website">Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="website"
              name="website"
              type="url"
              value={form.website}
              onChange={handleChange}
              placeholder="https://yoursite.com"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="promotionMethod">How will you promote us? <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="promotionMethod"
              name="promotionMethod"
              value={form.promotionMethod}
              onChange={handleChange}
              placeholder="Blog, newsletter, social media, YouTube…"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="paypalEmail">PayPal email for payouts <span className="text-muted-foreground font-normal">(optional — update later)</span></Label>
            <Input
              id="paypalEmail"
              name="paypalEmail"
              type="email"
              value={form.paypalEmail}
              onChange={handleChange}
              placeholder="payments@example.com"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1A3A7A] hover:bg-[#1565D6] text-white"
          >
            {loading ? 'Joining…' : 'Join the affiliate program →'}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Already an affiliate?{' '}
            <a href="/affiliates/dashboard" className="text-[#1565D6] hover:underline">
              Log in to your dashboard
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
