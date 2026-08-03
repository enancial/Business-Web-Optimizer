import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const AFFILIATE_TOKEN_KEY = 'bwo_affiliate_token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

function getStoredToken(): string | null {
  const raw = localStorage.getItem(AFFILIATE_TOKEN_KEY);
  if (!raw) return null;
  try {
    const parts = raw.split('.');
    const p = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: string;
      exp?: number;
    };
    if (p.role !== 'affiliate') return null;
    if (typeof p.exp === 'number' && p.exp < Math.floor(Date.now() / 1000)) {
      localStorage.removeItem(AFFILIATE_TOKEN_KEY);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
      title="Copy"
    >
      {copied ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// OTP Login flow
// ---------------------------------------------------------------------------

function LoginFlow({ onAuth }: { onAuth: (token: string) => void }) {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/affiliates/send-code', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await apiFetch<{ token: string }>('/affiliates/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email, code: otp }),
      });
      localStorage.setItem(AFFILIATE_TOKEN_KEY, token);
      onAuth(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        {step === 'email' ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <h2 className="font-semibold text-lg mb-1">Log in to your dashboard</h2>
              <p className="text-sm text-muted-foreground">
                Enter your affiliate email to receive a one-time login code.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="aff-email">Email address</Label>
              <Input
                id="aff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
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
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send login code →'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <h2 className="font-semibold text-lg mb-1">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit code to <strong>{email}</strong>. Enter it below.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="aff-otp">Login code</Label>
              <Input
                id="aff-otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                required
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
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify code →'}
            </Button>
            <button
              type="button"
              onClick={() => { setStep('email'); setError(null); setOtp(''); }}
              className="w-full text-sm text-muted-foreground hover:text-foreground underline"
            >
              Use a different email
            </button>
          </form>
        )}
        <p className="text-xs text-center text-muted-foreground mt-4">
          Not an affiliate yet?{' '}
          <a href="/affiliates/join" className="text-[#1565D6] hover:underline">
            Apply here
          </a>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Authenticated dashboard
// ---------------------------------------------------------------------------

interface DashboardData {
  affiliate: {
    id: number;
    name: string;
    email: string;
    code: string;
    website: string | null;
    paypalEmail: string | null;
    createdAt: string;
  };
  links: { optimizer: string; optimizerPro: string };
  stats: {
    activeConversions: number;
    totalEarningsCents: number;
    currentMonthCents: number;
    paidCents: number;
    unpaidCents: number;
  };
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardData>('/affiliates/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#1A3A7A]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-sm mx-auto text-center py-12">
        <p className="text-red-600 mb-4">{error ?? 'Failed to load dashboard.'}</p>
        <Button variant="outline" onClick={onLogout}>Log out and try again</Button>
      </div>
    );
  }

  const { affiliate, links, stats } = data;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {affiliate.name}</h1>
          <p className="text-muted-foreground text-sm">
            Your affiliate code:{' '}
            <span className="font-mono font-bold text-[#1A3A7A]">{affiliate.code}</span>
          </p>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Log out
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active referrals', value: stats.activeConversions.toString() },
          { label: 'Total earned', value: formatCents(stats.totalEarningsCents) },
          { label: 'This month', value: formatCents(stats.currentMonthCents) },
          { label: 'Unpaid', value: formatCents(stats.unpaidCents) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-[#1A3A7A]">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Referral links */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold mb-4">Your referral links</h2>
        <div className="space-y-3">
          {([
            { label: 'Optimizer ($29/mo)', href: links.optimizer },
            { label: 'Optimizer Pro ($79/mo)', href: links.optimizerPro },
          ] as const).map(({ label, href }) => (
            <div key={href}>
              <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
              <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2">
                <span className="text-sm font-mono break-all flex-1">{href}</span>
                <CopyButton text={href} />
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Promo materials */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold mb-3">Promo materials</h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Short tweet / post</p>
            <div className="relative bg-muted/40 rounded-lg p-4 pr-10 text-sm text-muted-foreground">
              🔍 Free tool: scan your website for SEO & performance issues in 30 seconds → {links.optimizer}
              <div className="absolute top-3 right-3">
                <CopyButton text={`🔍 Free tool: scan your website for SEO & performance issues in 30 seconds → ${links.optimizer}`} />
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Email / blog paragraph</p>
            <div className="relative bg-muted/40 rounded-lg p-4 pr-10 text-sm text-muted-foreground leading-relaxed">
              {`If your website isn't ranking well, Business Web Optimizer can show you exactly why — it scans your site and gives you a prioritised list of fixes. Try it free or get the full report for $29/mo. → `}{links.optimizer}
              <div className="absolute top-3 right-3">
                <CopyButton text={`If your website isn't ranking well, Business Web Optimizer can show you exactly why — it scans your site and gives you a prioritised list of fixes. Try it free or get the full report for $29/mo. → ${links.optimizer}`} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Commission info + PayPal payout email */}
      <div className="bg-[#1A3A7A]/5 border border-[#1A3A7A]/20 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-[#1A3A7A] mb-2">Commission details</h2>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• <strong>30%</strong> of each invoice paid by your referrals</li>
            <li>• Applies for the <strong>first 12 months</strong> of each referred subscription</li>
            <li>• Payouts are processed monthly via PayPal — minimum $50 threshold</li>
          </ul>
        </div>

        <PayPalEmailForm
          token={token}
          initialEmail={affiliate.paypalEmail}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PayPal payout email inline edit form
// ---------------------------------------------------------------------------

function PayPalEmailForm({
  token,
  initialEmail,
}: {
  token: string;
  initialEmail: string | null;
}) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      await apiFetch('/affiliates/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paypalEmail: email }),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-2">
      <Label htmlFor="paypal-email" className="text-sm font-medium text-[#1A3A7A]">
        Payout email (PayPal)
      </Label>
      {!initialEmail && (
        <p className="text-xs text-amber-600">
          ⚠ No payout email set — add your PayPal email below so we can pay you.
        </p>
      )}
      <div className="flex gap-2">
        <Input
          id="paypal-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="payments@example.com"
          className="bg-white/70 text-sm"
          required
        />
        <Button
          type="submit"
          disabled={saving}
          size="sm"
          className="bg-[#1A3A7A] hover:bg-[#1565D6] text-white shrink-0"
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {success && (
        <p className="text-xs text-green-700 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Payout email updated.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export function AffiliateDashboardPage() {
  const [token, setToken] = useState<string | null>(() => getStoredToken());

  function handleAuth(newToken: string) {
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem(AFFILIATE_TOKEN_KEY);
    setToken(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 sm:px-6 py-4 flex items-center justify-between">
        <a href="/" className="font-bold text-[#1A3A7A] text-lg">Business Web Optimizer</a>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Affiliate Dashboard</span>
      </header>

      <div className="px-4 py-12">
        {token ? (
          <Dashboard token={token} onLogout={handleLogout} />
        ) : (
          <LoginFlow onAuth={handleAuth} />
        )}
      </div>
    </div>
  );
}
